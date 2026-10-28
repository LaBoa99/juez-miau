import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Req } from '@nestjs/common';
import type { IGenerateTestsetResponse, IProblemSource, IProblemTestset, ITestCase, ITestCaseContent, ITestsetDetail, ITestsetSummary } from '@concurso/shared-types';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard.js';
import { TestsetsService } from '../services/testsets.service.js';
import { UpdateTestsetDto } from '../dto/update-testset.dto.js';
import { CreateTestCaseDto } from '../dto/create-test-case.dto.js';
import { UpdateTestCaseDto } from '../dto/update-test-case.dto.js';
import { SetCheckerDto, SetGeneratorDto } from '../dto/set-generator.dto.js';
import { SetRefSolutionDto } from '../dto/set-ref-solution.dto.js';

// Juez o admin de la edición del problema; se revisa en el servicio
@Controller('testsets')
export class TestsetsController {

    constructor(
        private readonly testsetsService: TestsetsService,
    ) {}

    @Get(':id')
    getTestset(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestsetDetail> {
        return this.testsetsService.getDetail(id, req.user.sub);
    }

    @Patch(':id')
    updateTestset(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTestsetDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemTestset> {
        return this.testsetsService.update(id, dto, req.user.sub);
    }

    @Post(':id/generate')
    @HttpCode(HttpStatus.OK)
    generateCases(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<IGenerateTestsetResponse> {
        return this.testsetsService.generate(id, req.user.sub);
    }

    @Put(':id/ref-solution')
    setRefSolution(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: SetRefSolutionDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemSource> {
        return this.testsetsService.setRefSolution(id, dto, req.user.sub);
    }

    @Put(':id/checker')
    setChecker(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: SetCheckerDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemSource> {
        return this.testsetsService.setChecker(id, dto, req.user.sub);
    }

    @Delete(':id/checker')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeChecker(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<void> {
        return this.testsetsService.removeChecker(id, req.user.sub);
    }

    @Put(':id/generator')
    setGenerator(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: SetGeneratorDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblemSource> {
        return this.testsetsService.setGenerator(id, dto, req.user.sub);
    }

    @Delete(':id/generator')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeGenerator(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<void> {
        return this.testsetsService.removeGenerator(id, req.user.sub);
    }

    @Post(':id/build')
    @HttpCode(HttpStatus.ACCEPTED)
    buildTestset(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestsetSummary> {
        return this.testsetsService.build(id, req.user.sub);
    }

    @Post(':id/cases')
    addCase(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateTestCaseDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestCase> {
        return this.testsetsService.addCase(id, dto, req.user.sub);
    }

    @Get(':id/cases/:caseId')
    getCase(
        @Param('id', ParseIntPipe) id: number,
        @Param('caseId', ParseIntPipe) caseId: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestCaseContent> {
        return this.testsetsService.getCase(id, caseId, req.user.sub);
    }

    @Patch(':id/cases/:caseId')
    updateCase(
        @Param('id', ParseIntPipe) id: number,
        @Param('caseId', ParseIntPipe) caseId: number,
        @Body() dto: UpdateTestCaseDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestCase> {
        return this.testsetsService.updateCase(id, caseId, dto, req.user.sub);
    }

    @Delete(':id/cases/:caseId')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeCase(
        @Param('id', ParseIntPipe) id: number,
        @Param('caseId', ParseIntPipe) caseId: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<void> {
        return this.testsetsService.removeCase(id, caseId, req.user.sub);
    }
}
