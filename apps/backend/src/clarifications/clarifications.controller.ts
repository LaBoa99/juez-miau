import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Req } from '@nestjs/common'
import { StaffRole, type IClarification, type IStaffClarification } from '@concurso/shared-types'
import { AllowTeam, ANY_EDITION_ROLE, RequireEditionRole } from '../auth/decorators/access.decorators.js'
import { AccessTokenType } from '../auth/factories/access-token-payload.factory.js'
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js'
import { ClarificationsService } from './clarifications.service.js'
import { AnswerClarificationDto, CreateClarificationDto } from './dto/clarification.dto.js'

@Controller()
export class ClarificationsController {

    constructor(private readonly clarificationsService: ClarificationsService) {}

    @Post('contest/clarifications')
    @AllowTeam()
    ask(@Req() req: AuthenticatedRequest, @Body() dto: CreateClarificationDto): Promise<IClarification> {
        if(req.user.type !== AccessTokenType.TEAM) throw new ForbiddenException('only teams can do this')
        return this.clarificationsService.ask(req.user.sub, dto)
    }

    @Get('contest/clarifications')
    @AllowTeam()
    listForTeam(@Req() req: AuthenticatedRequest): Promise<IClarification[]> {
        if(req.user.type !== AccessTokenType.TEAM) throw new ForbiddenException('only teams can do this')
        return this.clarificationsService.listForTeam(req.user.sub)
    }

    @Get('editions/:editionId/clarifications')
    @RequireEditionRole(ANY_EDITION_ROLE)
    listForStaff(@Param('editionId', ParseIntPipe) editionId: number): Promise<IStaffClarification[]> {
        return this.clarificationsService.listForStaff(editionId)
    }

    @Post('editions/:editionId/clarifications/:id/answer')
    @RequireEditionRole([StaffRole.ADMIN, StaffRole.JUDGE])
    @HttpCode(HttpStatus.OK)
    answer(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
        @Body() dto: AnswerClarificationDto,
    ): Promise<IStaffClarification> {
        return this.clarificationsService.answer(editionId, id, req.user.sub, dto)
    }

    @Post('editions/:editionId/clarifications/:id/reject')
    @RequireEditionRole([StaffRole.ADMIN, StaffRole.JUDGE])
    @HttpCode(HttpStatus.OK)
    reject(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IStaffClarification> {
        return this.clarificationsService.reject(editionId, id, req.user.sub)
    }

    @Delete('editions/:editionId/clarifications/:id')
    @RequireEditionRole([StaffRole.ADMIN, StaffRole.JUDGE])
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Param('id', ParseIntPipe) id: number,
    ): Promise<void> {
        return this.clarificationsService.remove(editionId, id)
    }
}
