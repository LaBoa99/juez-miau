import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { AccessTokenType, type AccessTokenPayload } from '../factories/access-token-payload.factory.js'
import { ALLOW_TEAM_KEY, IS_PUBLIC_KEY } from '../decorators/access.decorators.js'
import { TeamSessionsService } from '../../teams/services/team-sessions.service.js'

export type AuthenticatedRequest = Request & { user: AccessTokenPayload }

// Guard global (APP_GUARD): toda ruta HTTP exige token de staff, salvo @Public() o @AllowTeam()
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
        private readonly teamSessionsService: TeamSessionsService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Los gateways de WebSocket autentican en el handshake
        if (context.getType() !== 'http') return true

        const targets = [context.getHandler(), context.getClass()]
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
        const token = this.extractToken(req)

        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
            if (token) {
                const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token).catch(() => null)
                if (payload) req.user = payload
            }
            return true
        }

        if (!token) {
            throw new UnauthorizedException('Falta el token de acceso')
        }

        let payload: AccessTokenPayload
        try {
            payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token)
        } catch {
            throw new UnauthorizedException('Token de acceso inválido o expirado')
        }

        if (payload.type === AccessTokenType.TEAM) {
            if (!this.reflector.getAllAndOverride<boolean>(ALLOW_TEAM_KEY, targets)) {
                throw new ForbiddenException('Solo el staff puede acceder a este recurso')
            }
            // El token de equipo dura todo el concurso; se invalida cerrando o reemplazando la sesión
            await this.teamSessionsService.assertActive(payload.sub, payload.sid)
        }

        req.user = payload
        return true
    }

    private extractToken(req: Request): string | undefined {
        const [scheme, token] = req.headers.authorization?.split(' ') ?? []
        return scheme === 'Bearer' && token ? token : undefined
    }
}
