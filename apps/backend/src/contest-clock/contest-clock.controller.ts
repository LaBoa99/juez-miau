import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common'
import { StaffRole, type IContestClock } from '@concurso/shared-types'
import { ANY_EDITION_ROLE, Public, RequireEditionRole, SuperadminOnly } from '../auth/decorators/access.decorators.js'
import { ContestClockService } from './contest-clock.service.js'

@Controller()
export class ContestClockController {

    constructor(private readonly clock: ContestClockService) {}

    @Get('editions/:editionId/clock')
    @RequireEditionRole(ANY_EDITION_ROLE)
    getClock(@Param('editionId', ParseIntPipe) editionId: number): Promise<IContestClock> {
        return this.clock.getClock(editionId)
    }

    // Para el proyector, sin sesión
    @Get('public/editions/:editionId/clock')
    @Public()
    getPublicClock(@Param('editionId', ParseIntPipe) editionId: number): Promise<IContestClock> {
        return this.clock.getClock(editionId)
    }

    @Post('editions/:editionId/clock/start')
    @RequireEditionRole([StaffRole.ADMIN])
    @HttpCode(HttpStatus.OK)
    start(@Param('editionId', ParseIntPipe) editionId: number): Promise<IContestClock> {
        return this.clock.start(editionId)
    }

    @Post('editions/:editionId/clock/pause')
    @RequireEditionRole([StaffRole.ADMIN])
    @HttpCode(HttpStatus.OK)
    pause(@Param('editionId', ParseIntPipe) editionId: number): Promise<IContestClock> {
        return this.clock.pause(editionId)
    }

    @Post('editions/:editionId/clock/resume')
    @RequireEditionRole([StaffRole.ADMIN])
    @HttpCode(HttpStatus.OK)
    resume(@Param('editionId', ParseIntPipe) editionId: number): Promise<IContestClock> {
        return this.clock.resume(editionId)
    }

    @Post('editions/:editionId/clock/finish')
    @RequireEditionRole([StaffRole.ADMIN])
    @HttpCode(HttpStatus.OK)
    finish(@Param('editionId', ParseIntPipe) editionId: number): Promise<IContestClock> {
        return this.clock.finish(editionId)
    }

    @Post('editions/:editionId/clock/reset')
    @SuperadminOnly()
    @HttpCode(HttpStatus.OK)
    reset(@Param('editionId', ParseIntPipe) editionId: number): Promise<IContestClock> {
        return this.clock.reset(editionId)
    }
}
