import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import type { IStandings } from '@concurso/shared-types'
import { ANY_EDITION_ROLE, Public, RequireEditionRole } from '../auth/decorators/access.decorators.js'
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
}
