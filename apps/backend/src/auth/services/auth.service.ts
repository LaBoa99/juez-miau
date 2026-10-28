import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService, type JwtSignOptions } from '@nestjs/jwt'
import type { Team } from '../../teams/entities/team.entity.js'
import { StaffService } from '../../staff/services/staff.service.js'
import { PasswordService } from '../../utils/services/password.service.js'
import { TeamSessionsService } from '../../teams/services/team-sessions.service.js'
import { TeamsService } from '../../teams/services/teams.service.js'
import { EditionStaffService } from '../../editions/services/edition-staff.service.js'
import { RefreshTokensService } from './refresh-tokens.service.js'
import { FlagsService } from '../../flags/flags.service.js'
import { FlagType } from '@concurso/shared-types'
import { StaffLoginDto } from '../dto/staff-login.dto.js'
import { TeamLoginDto } from '../dto/team-login.dto.js'
import { AccessTokenPayloadFactory, AccessTokenType, type AccessTokenPayload } from '../factories/access-token-payload.factory.js'

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name)

    constructor(
        private readonly staffService: StaffService,
        private readonly passwordService: PasswordService,
        private readonly jwtService: JwtService,
        private readonly refreshTokensService: RefreshTokensService,
        private readonly teamSessionsService: TeamSessionsService,
        private readonly editionStaffService: EditionStaffService,
        private readonly teamsService: TeamsService,
        private readonly flagsService: FlagsService,
        private readonly config: ConfigService,
    ) {}

    async staffLogin(dto: StaffLoginDto) {
        const user = await this.staffService.findByEmailWithPassword(dto.email)

        // Mismo mensaje para email inexistente, contraseña incorrecta o usuario inactivo,
        // para no revelar qué emails están registrados
        const valid = user?.active && await this.passwordService.comparePassword(dto.password, user.password_hash)
        if (!user || !valid) {
            throw new UnauthorizedException('Credenciales inválidas')
        }

        return {
            accessToken: await this.jwtService.signAsync(AccessTokenPayloadFactory.forStaff(user)),
            refreshToken: await this.refreshTokensService.issue(user.id),
            user: {
                id: user.id,
                name: user.name,
                roles: await this.findStaffRoles(user.id),
            },
        }
    }

    async teamLogin(dto: TeamLoginDto) {
        // Puede haber el mismo username en ediciones distintas; vale el que coincida con la contraseña
        let team = null
        for (const candidate of await this.teamsService.findForLogin(dto.username)) {
            if (await this.passwordService.comparePassword(dto.password, candidate.password_hash)) {
                team = candidate
                break
            }
        }
        if (!team) {
            throw new UnauthorizedException('Credenciales inválidas')
        }

        const { session, replaced } = await this.teamSessionsService.start(team.id, dto.machineId)
        if (replaced && replaced.machine_id !== dto.machineId) {
            await this.flagsService.raise(
                team.id,
                FlagType.SESSION_REPLACED,
                `Inició sesión en otra máquina: ${replaced.machine_id} → ${dto.machineId}`,
                `${replaced.machine_id}→${dto.machineId}`,
            )
        }

        // El token dura todo el concurso: se invalida cerrando o reemplazando la sesión
        const accessToken = await this.jwtService.signAsync(
            AccessTokenPayloadFactory.forTeam(team, session.session_id!),
            { expiresIn: (this.config.get<string>('JWT_TEAM_EXPIRES_IN') ?? '12h') as JwtSignOptions['expiresIn'] },
        )

        return { accessToken, sessionId: session.session_id, team: this.toTeamInfo(team) }
    }

    async refresh(refreshToken: string | undefined) {
        const stored = refreshToken ? await this.refreshTokensService.findActive(refreshToken) : null

        if (!stored || !stored.user.active) {
            throw new UnauthorizedException('Sesión expirada, vuelve a iniciar sesión')
        }

        return { accessToken: await this.jwtService.signAsync(AccessTokenPayloadFactory.forStaff(stored.user)) }
    }

    // payload: token de acceso si llegó uno válido (para cerrar la sesión del equipo)
    async logout(refreshToken: string | undefined, payload?: AccessTokenPayload) {
        if (payload?.type === AccessTokenType.TEAM) {
            await this.teamSessionsService.revoke(payload.sub, 'logout', payload.sid)
        }

        if (refreshToken) {
            await this.refreshTokensService.revoke(refreshToken)
        }
    }

    async me(payload: AccessTokenPayload) {
        if (payload.type === AccessTokenType.TEAM) {
            const team = await this.teamsService.getById(payload.sub)
            return { type: AccessTokenType.TEAM, id: team.id, name: team.name, team: this.toTeamInfo(team) }
        }

        const user = await this.staffService.findById(payload.sub)
        if (!user?.active) {
            throw new UnauthorizedException('Usuario inactivo o inexistente')
        }

        return { type: AccessTokenType.STAFF, id: user.id, name: user.name, roles: await this.findStaffRoles(user.id) }
    }

    private toTeamInfo(team: Team) {
        return { id: team.id, name: team.name, categoryId: team.category_id, editionId: team.edition_id, roomId: team.room_id }
    }

    private async findStaffRoles(userId: number) {
        const assignments = await this.editionStaffService.findAllByStaffUser(userId)
        return assignments.map((a) => ({ editionId: a.edition_id, role: a.role }))
    }
}
