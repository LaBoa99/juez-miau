import { Body, Controller, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import type { IProblem, ITestsetSummary } from '@concurso/shared-types';
import type { AuthenticatedRequest } from '../../auth/guards/jwt-auth.guard.js';
import { TestsetsService } from '../services/testsets.service.js';
import { UpdateSignatureDto } from '../dto/update-signature.dto.js';
import { CreateTestsetVersionDto } from '../dto/create-testset-version.dto.js';

// Rutas de un problema que dependen de sus testsets. Viven aquí para que TestsetsModule
// no dependa de ProblemsModule (que ya importa este módulo)
@Controller('problems/:problemId')
export class ProblemTestsetsController {

    constructor(
        private readonly testsetsService: TestsetsService,
    ) {}

    @Patch('signature')
    updateSignature(
        @Param('problemId', ParseIntPipe) problemId: number,
        @Body() dto: UpdateSignatureDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<IProblem> {
        return this.testsetsService.updateSignature(problemId, dto, req.user.sub);
    }

    @Post('testsets')
    createTestsetVersion(
        @Param('problemId', ParseIntPipe) problemId: number,
        @Body() dto: CreateTestsetVersionDto,
        @Req() req: AuthenticatedRequest,
    ): Promise<ITestsetSummary> {
        return this.testsetsService.createVersion(problemId, dto, req.user.sub);
    }
}
