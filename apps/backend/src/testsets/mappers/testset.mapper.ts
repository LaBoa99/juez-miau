import type { IProblemSource, IProblemTestset, ITestCase, ITestsetSummary } from '@concurso/shared-types';
import type { Testset } from '../entities/testset.entity.js';
import type { TestCase } from '../entities/test-case.entity.js';
import type { RefSolution } from '../entities/ref-solution.entity.js';
import type { Generator } from '../entities/generator.entity.js';
import type { Checker } from '../entities/checker.entity.js';

export function toTestsetDto(testset: Testset): IProblemTestset {
    return {
        id: testset.id,
        version: testset.version,
        status: testset.status,
        timeLimitMs: testset.time_limit_ms,
        memoryLimitMb: testset.memory_limit_mb,
        compareMode: testset.compare_mode,
        floatTolerance: testset.float_tolerance,
        schema: testset.schema,
        manualReview: testset.manual_review,
        reviewInstructions: testset.review_instructions,
        refSolutionId: testset.ref_solution_id,
        generatorId: testset.generator_id,
        generatorGroups: testset.generator_groups,
        checkerId: testset.checker_id,
        seed: testset.seed,
        generatedCount: testset.generated_count,
        refMaxTimeMs: testset.ref_max_time_ms,
        buildLog: testset.build_log,
        authorId: testset.author_id,
        reason: testset.reason,
        createdAt: testset.created_at,
    }
}

export function toTestsetSummary(testset: Testset): ITestsetSummary {
    return {
        id: testset.id,
        problemId: testset.problem_id,
        version: testset.version,
        status: testset.status,
    }
}

export function toTestCaseDto(testCase: TestCase, inputPreview: string | null = null): ITestCase {
    return {
        id: testCase.id,
        ordinal: testCase.ordinal,
        visibility: testCase.visibility,
        origin: testCase.origin,
        group: testCase.group_name,
        seed: testCase.seed,
        inputSha: testCase.input_sha,
        outputSha: testCase.output_sha,
        inputBytes: testCase.input_bytes,
        outputBytes: testCase.output_bytes,
        refTimeMs: testCase.ref_time_ms,
        inputPreview,
    }
}

// Solución de referencia o generador: mismo formato
export function toSourceDto(source: RefSolution | Generator | Checker | null | undefined): IProblemSource | null {
    if(!source) return null

    return {
        id: source.id,
        languageId: source.language_id,
        source: source.source.toString('utf8'),
        sourceSha: source.source_sha,
        createdBy: source.created_by,
        createdAt: source.created_at,
    }
}
