import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { AccessTokenType } from '../factories/access-token-payload.factory.js'
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard.js'

// Token válido y además de staff: los equipos reciben 403
@Injectable()
export class StaffAuthGuard extends JwtAuthGuard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        await super.canActivate(context)

        const req = context.switchToHttp().getRequest<AuthenticatedRequest>()
        if (req.user.type !== AccessTokenType.STAFF) {
            throw new ForbiddenException('Solo el staff puede acceder a este recurso')
        }
        return true
    }
}
