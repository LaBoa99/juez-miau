import { Controller, ForbiddenException, Get, Req } from '@nestjs/common'
import type { IContestView } from '@concurso/shared-types'
import { AllowTeam } from '../auth/decorators/access.decorators.js'
import { AccessTokenType } from '../auth/factories/access-token-payload.factory.js'
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js'
import { ContestService } from './contest.service.js'

// Lo que ve el equipo durante el concurso: reloj, lenguajes y problemas de su categoría
@Controller('contest')
export class ContestController {

    constructor(private readonly contestService: ContestService) {}

    @Get()
    @AllowTeam()
    getView(@Req() req: AuthenticatedRequest): Promise<IContestView> {
        if(req.user.type !== AccessTokenType.TEAM) throw new ForbiddenException('only teams can do this')
        return this.contestService.getView(req.user.sub)
    }
}
