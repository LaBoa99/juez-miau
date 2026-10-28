import { Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common'
import { FlagType, type IFlag, type IHeartbeatResponse } from '@concurso/shared-types'
import { AllowTeam, ANY_EDITION_ROLE, RequireEditionRole } from '../auth/decorators/access.decorators.js'
import { AccessTokenType } from '../auth/factories/access-token-payload.factory.js'
import type { AuthenticatedRequest } from '../auth/guards/jwt-auth.guard.js'
import { EditionStaffService } from '../editions/services/edition-staff.service.js'
import { CreateFlagDto, FlagFiltersDto, ResolveFlagDto } from '../flags/dto/flag.dto.js'
import { FlagsService, toFlagDto } from '../flags/flags.service.js'
import { HeartbeatDto } from './dto/heartbeat.dto.js'
import { IntegrityService } from './integrity.service.js'

@Controller()
export class IntegrityController {

    constructor(
        private readonly integrity: IntegrityService,
        private readonly flagsService: FlagsService,
        private readonly editionStaffService: EditionStaffService,
    ) {}

    @Post('contest/heartbeat')
    @AllowTeam()
    @HttpCode(HttpStatus.OK)
    heartbeat(@Req() req: AuthenticatedRequest, @Body() dto: HeartbeatDto): Promise<IHeartbeatResponse> {
        if(req.user.type !== AccessTokenType.TEAM) throw new ForbiddenException('only teams can do this')
        return this.integrity.heartbeat(req.user.sub, dto)
    }

    @Get('editions/:editionId/flags')
    @RequireEditionRole(ANY_EDITION_ROLE)
    findFlags(@Param('editionId', ParseIntPipe) editionId: number, @Query() filters: FlagFiltersDto): Promise<IFlag[]> {
        return this.flagsService.findForEdition(editionId, filters)
    }

    // Un observador o juez que ve algo en la sala lo deja registrado
    @Post('editions/:editionId/flags')
    @RequireEditionRole(ANY_EDITION_ROLE)
    async createFlag(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Req() req: AuthenticatedRequest,
        @Body() dto: CreateFlagDto,
    ): Promise<IFlag> {
        // Las manuales nunca se deduplican: raise siempre la crea
        const flag = await this.flagsService.raise(dto.teamId, FlagType.MANUAL, dto.details + ' (staff #' + req.user.sub + ')', '', editionId)
        return toFlagDto(flag!)
    }

    @Post('flags/:id/resolve')
    @HttpCode(HttpStatus.OK)
    async resolve(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest, @Body() dto: ResolveFlagDto): Promise<IFlag> {
        await this.editionStaffService.assertRole(req.user.sub, await this.flagsService.getEditionId(id), ANY_EDITION_ROLE)
        return this.flagsService.resolve(id, req.user.sub, dto.note)
    }
}
