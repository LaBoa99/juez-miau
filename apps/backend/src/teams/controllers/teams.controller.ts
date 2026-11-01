import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { TeamsService } from '../services/teams.service.js';
import { UpdateTeamDto } from '../dtos/update-team.dto.js';
import { RequireEditionRole, ANY_EDITION_ROLE, EditionScope } from '../../auth/decorators/access.decorators.js';
import { StaffRole } from '@concurso/shared-types';

@Controller('teams')
export class TeamsController {

    constructor(
        private readonly teamsService: TeamsService,
    ){}


    @Get(':id')
    @RequireEditionRole(ANY_EDITION_ROLE, EditionScope.TEAM, 'id')
    getTeam(
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.teamsService.getById(id)
    }

    @Patch(':id')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.TEAM, 'id')
    updateTeam(
        @Param('id', ParseIntPipe) id: number,
        @Body() body : UpdateTeamDto,
    ) {
        return this.teamsService.update(id, body)
    }

    @Get(':id/credentials')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.TEAM, 'id')
    getCredentialsOfTeam(
        @Param('id', ParseIntPipe) id: number
    ){
        return this.teamsService.getCredentials(id)
    }

    @Post(':id/reset-password')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.TEAM, 'id')
    resetPasswordOfTeam(
        @Param('id', ParseIntPipe) id: number
    ){
        return this.teamsService.resetPassword(id)
    }

    @Delete(':id')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.TEAM, 'id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteTeam(
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.teamsService.remove(id)
    }

    @Delete(':id/sessions')
    @RequireEditionRole([StaffRole.ADMIN], EditionScope.TEAM, 'id')
    @HttpCode(HttpStatus.NO_CONTENT)
    closeSessionsOfTeam(
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.teamsService.closeSessions(id)
    }

}
