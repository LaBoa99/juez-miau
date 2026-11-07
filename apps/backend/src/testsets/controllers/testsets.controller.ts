import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Req } from '@nestjs/common';
import type { ISignatureDetection, ITestRun, IGenerateTestsetResponse, IProblemSource, IProblemTestset, ITestCase, ITestCaseContent, ITestsetDetail, ITestsetSummary } from '@concurso/shared-types';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard.js';
import { TestsetsService } from '../services/testsets.service.js';
import { UpdateTestsetDto } from '../dto/update-testset.dto.js';
import { CreateTestCaseDto, CreateTestCasesDto } from '../dto/create-test-case.dto.js';
import { UpdateCasesVisibilityDto, UpdateTestCaseDto } from '../dto/update-test-case.dto.js';
import { GenerateTestsetDto } from '../dto/generate-testset.dto.js';
import { SetCheckerDto, SetGeneratorDto } from '../dto/set-generator.dto.js';
import { SetRefSolutionDto } from '../dto/set-ref-solution.dto.js';
import { CreateTestRunDto } from '../dto/create-test-run.dto.js';
import { DetectSignatureDto } from '../dto/detect-signature.dto.js';

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
        @Body() dto: GenerateTestsetDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IGenerateTestsetResponse> {
        return this.testsetsService.generate(id, req.user.sub, dto.schema);
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

    // Prueba una solución (o la oficial) contra el testset construido; 202 y se consulta con el GET
    @Post(':id/test-runs')
    @HttpCode(HttpStatus.ACCEPTED)
    startTestRun(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateTestRunDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestRun> {
        return this.testsetsService.startTestRun(id, dto, req.user.sub);
    }

    @Get(':id/test-runs/:runId')
    getTestRun(
        @Param('id', ParseIntPipe) id: number,
        @Param('runId') runId: string,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestRun> {
        return this.testsetsService.getTestRun(id, runId, req.user.sub);
    }

    // Lee la firma de la solución y la confirma compilando en el worker; 202 y se consulta con el GET
    @Post(':id/signature-detect')
    @HttpCode(HttpStatus.ACCEPTED)
    startSignatureDetection(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: DetectSignatureDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ISignatureDetection> {
        return this.testsetsService.startSignatureDetection(id, dto, req.user.sub);
    }

    @Get(':id/signature-detect/:jobId')
    getSignatureDetection(
        @Param('id', ParseIntPipe) id: number,
        @Param('jobId') jobId: string,
        @Req() req: AuthenticatedRequest,
    ): Promise<ISignatureDetection> {
        return this.testsetsService.getSignatureDetection(id, jobId, req.user.sub);
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

    @Post(':id/cases/bulk')
    addCases(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateTestCasesDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestCase[]> {
        return this.testsetsService.addCases(id, dto, req.user.sub);
    }

    @Post(':id/cases/:caseId/pin')
    @HttpCode(HttpStatus.OK)
    pinCase(
        @Param('id', ParseIntPipe) id: number,
        @Param('caseId', ParseIntPipe) caseId: number,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestCase> {
        return this.testsetsService.pinCase(id, caseId, req.user.sub);
    }

    // Va antes de ':id/cases/:caseId' para que 'visibility' no se tome como caseId
    @Patch(':id/cases/visibility')
    updateCasesVisibility(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCasesVisibilityDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<{ updated: number }> {
        return this.testsetsService.updateCasesVisibility(id, dto, req.user.sub);
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
