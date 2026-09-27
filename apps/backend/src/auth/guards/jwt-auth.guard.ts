import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import type { AccessTokenPayload } from '../factories/access-token-payload.factory.js'

export type AuthenticatedRequest = Request & { user: AccessTokenPayload }

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
        const [scheme, token] = req.headers.authorization?.split(' ') ?? []

        if (scheme !== 'Bearer' || !token) {
            throw new UnauthorizedException('Falta el token de acceso')
        }

        try {
            req.user = await this.jwtService.verifyAsync<AccessTokenPayload>(token)
        } catch {
            throw new UnauthorizedException('Token de acceso inválido o expirado')
        }
        return true
    }
}
