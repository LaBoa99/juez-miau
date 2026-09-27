import { Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { StaffService } from '../../staff/services/staff.service.js'
import { RefreshToken } from '../entities/refresh-token.entity.js'
import { TeamSession } from '../entities/team-session.entity.js'
import { EditionStaff } from '../../editions/entities/edition-staff.entity.js'
import { StaffLoginDto } from '../dto/staff-login.dto.js'
import { TeamLoginDto } from '../dto/team-login.dto.js'
import { RefreshDto } from '../dto/refresh.dto.js'
import { Team } from '../../teams/entities/team.entity.js'
import { PasswordService } from '../../utils/services/password.service.js'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(RefreshToken) private readonly refreshRepo: Repository<RefreshToken>,
        @InjectRepository(TeamSession) private readonly sessionRepo: Repository<TeamSession>,
        @InjectRepository(Team) private readonly teamRepo: Repository<Team>,
        @InjectRepository(EditionStaff) private readonly editionStaffRepo: Repository<EditionStaff>,
        private readonly staffService: StaffService,
        private readonly passwordService: PasswordService,
        private readonly jwtService: JwtService,
    ) {}

    async staffLogin(dto: StaffLoginDto) {
        // TODO: buscar staff por email (con password_hash), verificar con argon2,
        const staffUser = await this.staffService.findByEmail(dto.email)
        const isUserValided = await this.passwordService.comparePassword(dto.password, staffUser.password_hash)
        // 401 si falla o está inactivo
        if(!isUserValided) throw new UnauthorizedException('');

        // crear staff_refresh_token, firmar JWT.
        const payload =  {sub: staffUser.id, username: staffUser.email} 
        const accesToken = await this.jwtService.signAsync(payload)

        // Responde: { accessToken, refreshToken, user: { id, name, roles: [{ editionId, role }] } }
        return {accesToken, user: staffUser}
    }

    async teamLogin(dto: TeamLoginDto) {
        // TODO: buscar equipo por username, verificar con argon2, 401 si falla.
        // Si tiene sesión activa: cerrarla (end_reason 'replaced') y, si machine_id
        // es distinto, generar alerta. Crear team_session nueva y firmar JWT.
        // Responde: { accessToken, sessionId, team: { id, name, categoryId, editionId, roomId } }
        throw new NotImplementedException()
    }

    async refresh(dto: RefreshDto) {
        // TODO: buscar el refresh token por su hash; 401 si no existe, está revocado,
        // expiró o el usuario está inactivo. Firmar un access token nuevo.
        // Responde: { accessToken }
        throw new NotImplementedException()
    }

    async logout() {
        // TODO: staff → revoked_at = ahora en su refresh token.
        // Equipo → ended_at = ahora y end_reason = 'logout' en su team_session.
        // Responde: 204 sin contenido
        throw new NotImplementedException()
    }

    async me() {
        // TODO: staff → { type: 'staff', id, name, roles }
        // Equipo → { type: 'team', id, name, team }
        throw new NotImplementedException()
    }
}