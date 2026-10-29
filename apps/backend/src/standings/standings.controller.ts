import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Put } from '@nestjs/common'
import { StaffRole, type IStandings } from '@concurso/shared-types'
import { ANY_EDITION_ROLE, Public, RequireEditionRole } from '../auth/decorators/access.decorators.js'
import { TeamSuspensionDto } from './dto/team-suspension.dto.js'
import { StandingsService } from './standings.service.js'

@Controller()
export class StandingsController {

    constructor(private readonly standingsService: StandingsService) {}

    // Proyector y equipos: congelado en los últimos minutos
    @Get('public/editions/:editionId/standings')
    @Public()
    getPublic(@Param('editionId', ParseIntPipe) editionId: number): Promise<IStandings> {
        return this.standingsService.getPublic(editionId)
    }

    // Staff: siempre completo
    @Get('editions/:editionId/standings')
    @RequireEditionRole(ANY_EDITION_ROLE)
    getForStaff(@Param('editionId', ParseIntPipe) editionId: number): Promise<IStandings> {
        return this.standingsService.getForStaff(editionId)
    }

    // Suspender o reactivar un equipo: tachado y al final del marcador, sin lugar
    @Put('editions/:editionId/teams/:teamId/suspension')
    @RequireEditionRole([StaffRole.ADMIN])
    @HttpCode(HttpStatus.NO_CONTENT)
    setSuspension(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Param('teamId', ParseIntPipe) teamId: number,
        @Body() dto: TeamSuspensionDto,
    ): Promise<void> {
        return this.standingsService.setSuspended(editionId, teamId, dto.suspended)
    }
}
