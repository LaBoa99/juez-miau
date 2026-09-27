import { Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { StaffService } from '../../staff/services/staff.service.js'
import { PasswordService } from '../../utils/services/password.service.js'
import { TeamSessionsService } from '../../teams/services/team-sessions.service.js'
import { EditionStaffService } from '../../editions/services/edition-staff.service.js'
import { RefreshTokensService } from './refresh-tokens.service.js'
import { StaffLoginDto } from '../dto/staff-login.dto.js'
import { TeamLoginDto } from '../dto/team-login.dto.js'
import { AccessTokenPayloadFactory, AccessTokenType, type AccessTokenPayload } from '../factories/access-token-payload.factory.js'

@Injectable()
export class AuthService {
    constructor(
        private readonly staffService: StaffService,
        private readonly passwordService: PasswordService,
        private readonly jwtService: JwtService,
        private readonly refreshTokensService: RefreshTokensService,
        private readonly teamSessionsService: TeamSessionsService,
        private readonly editionStaffService: EditionStaffService,
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
        // TODO: buscar equipo por username, verificar con argon2, 401 si falla.
        // Si tiene sesión activa: cerrarla (end_reason 'replaced') y, si machine_id
        // es distinto, generar alerta. Crear team_session nueva y firmar JWT.
        // Responde: { accessToken, sessionId, team: { id, name, categoryId, editionId, roomId } }
        throw new NotImplementedException()
    }

    async refresh(refreshToken: string | undefined) {
        const stored = refreshToken ? await this.refreshTokensService.findActive(refreshToken) : null

        if (!stored || !stored.user.active) {
            throw new UnauthorizedException('Sesión expirada, vuelve a iniciar sesión')
        }

        return { accessToken: await this.jwtService.signAsync(AccessTokenPayloadFactory.forStaff(stored.user)) }
    }

    async logout(refreshToken: string | undefined) {
        // TODO: equipo → ended_at = ahora y end_reason = 'logout' en su team_session.
        if (!refreshToken) return

        await this.refreshTokensService.revoke(refreshToken)
    }

    async me(payload: AccessTokenPayload) {
        if (payload.type !== AccessTokenType.STAFF) {
            // TODO: equipo → { type: 'team', id, name, team }
            throw new NotImplementedException()
        }

        const user = await this.staffService.findById(payload.sub)
        if (!user?.active) {
            throw new UnauthorizedException('Usuario inactivo o inexistente')
        }

        return { type: AccessTokenType.STAFF, id: user.id, name: user.name, roles: await this.findStaffRoles(user.id) }
    }

    private async findStaffRoles(userId: number) {
        const assignments = await this.editionStaffService.findAllByStaffUser(userId)
        return assignments.map((a) => ({ editionId: a.edition_id, role: a.role }))
    }
}
