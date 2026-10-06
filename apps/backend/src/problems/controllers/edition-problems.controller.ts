import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { ICreateProblemResponse, IProblemListItem } from '@concurso/shared-types';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard.js';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard.js';
import { ProblemsService } from '../services/problems.service.js';
import { CreateProblemDto } from '../dto/create-problem.dto.js';
import { ProblemFiltersDto } from '../dto/problem-filters.dto.js';

@Controller('editions/:editionId/problems')
@UseGuards(StaffAuthGuard)
export class EditionProblemsController {

    constructor(
        private readonly problemsService: ProblemsService,
    ) {}

    @Get()
    getAllProblemsOfEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Query() filters: ProblemFiltersDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemListItem[]> {
        return this.problemsService.findAllByEdition(editionId, filters, req.user.sub);
    }

    @Post()
    createProblemForEdition(
        @Param('editionId', ParseIntPipe) editionId: number,
        @Body() dto: CreateProblemDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ICreateProblemResponse> {
        return this.problemsService.create(editionId, dto, req.user.sub);
    }

}
