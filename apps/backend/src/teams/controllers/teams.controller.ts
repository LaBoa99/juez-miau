import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { TeamsService } from '../services/teams.service.js';
import { UpdateTeamDto } from '../dtos/update-team.dto.js';

@Controller('teams')
export class TeamsController {

    constructor(
        private readonly teamsService: TeamsService,
    ){}


    @Get(':id')
    getTeam(
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.teamsService.getById(id)
    }

    @Patch(':id')
    updateTeam(
        @Param('id', ParseIntPipe) id: number,
        @Body() body : UpdateTeamDto,
    ) {
        return this.teamsService.update(id, body)
    }

    @Post(':id/reset-password')
    resetPasswordOfTeam(
        @Param('id', ParseIntPipe) id: number
    ){
        return this.teamsService.resetPassword(id)
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteTeam(
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.teamsService.remove(id)
    }

    @Delete(':id/sessions')
    @HttpCode(HttpStatus.NO_CONTENT)
    closeSessionsOfTeam(
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.teamsService.closeSessions(id)
    }

}
