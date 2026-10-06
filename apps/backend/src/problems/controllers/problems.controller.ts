import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { IProblem, IProblemDetail, IProblemPreview, IPublishProblemResponse } from '@concurso/shared-types';
import { StaffAuthGuard } from '../../auth/guards/staff-auth.guard.js';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard.js';
import { ProblemsService } from '../services/problems.service.js';
import { UpdateProblemDto } from '../dto/update-problem.dto.js';

@Controller('problems')
@UseGuards(StaffAuthGuard)
export class ProblemsController {

    constructor(
        private readonly problemsService: ProblemsService,
    ) {}

    @Get(':id')
    getProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemDetail> {
        return this.problemsService.getDetail(id, req.user.sub);
    }

    @Patch(':id')
    updateProblem(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateProblemDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblem> {
        return this.problemsService.update(id, dto, req.user.sub);
    }

    @Get(':id/preview')
    previewProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemPreview> {
        return this.problemsService.preview(id, req.user.sub);
    }

    @Post(':id/publish')
    @HttpCode(HttpStatus.OK)
    publishProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IPublishProblemResponse> {
        return this.problemsService.publish(id, req.user.sub);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteProblem(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<void> {
        return this.problemsService.remove(id, req.user.sub);
    }
}
