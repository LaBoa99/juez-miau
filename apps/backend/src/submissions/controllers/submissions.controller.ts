import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common'
import type { ISubmission, ISubmissionDetail, IStaffSubmission, IStaffSubmissionDetail } from '@concurso/shared-types'
import { AllowTeam, ANY_EDITION_ROLE, RequireEditionRole } from '../../auth/decorators/access.decorators.js'
import { AccessTokenType } from '../../auth/factories/access-token-payload.factory.js'
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard.js'
import { CreateSubmissionDto } from '../dto/create-submission.dto.js'
import { SubmissionFiltersDto } from '../dto/submission-filters.dto.js'
import { SubmissionsService } from '../services/submissions.service.js'

@Controller()
export class SubmissionsController {

    constructor(private readonly submissionsService: SubmissionsService) {}

    // 202: queda en cola; el veredicto llega por socket (submission:update)
    @Post('submissions')
    @AllowTeam()
    @HttpCode(HttpStatus.ACCEPTED)
    create(@Req() req: AuthenticatedRequest, @Body() dto: CreateSubmissionDto): Promise<ISubmission> {
        return this.submissionsService.create(this.teamId(req), dto)
    }

    // Los envíos del propio equipo
    @Get('submissions')
    @AllowTeam()
    findMine(@Req() req: AuthenticatedRequest): Promise<ISubmission[]> {
        return this.submissionsService.findForTeam(this.teamId(req))
    }

    // Un equipo solo ve los suyos; el staff, los de sus ediciones con el detalle por caso
    @Get('submissions/:id')
    @AllowTeam()
    findOne(@Req() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<ISubmissionDetail | IStaffSubmissionDetail> {
        return req.user.type === AccessTokenType.TEAM
            ? this.submissionsService.findOneForTeam(req.user.sub, id)
            : this.submissionsService.findOneForStaff(req.user.sub, id)
    }

    @Get('editions/:editionId/submissions')
    @RequireEditionRole(ANY_EDITION_ROLE)
    findForEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Query() filters: SubmissionFiltersDto,
    ): Promise<IStaffSubmission[]> {
        return this.submissionsService.findForEdition(editionId, filters)
    }

    private teamId(req: AuthenticatedRequest): number {
        if(req.user.type !== AccessTokenType.TEAM) throw new ForbiddenException('only teams can do this')
        return req.user.sub
    }
}
