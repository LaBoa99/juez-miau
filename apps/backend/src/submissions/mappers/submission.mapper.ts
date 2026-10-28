import { Verdict, type ISubmission, type IStaffSubmission } from '@concurso/shared-types'
import type { Submission } from '../entities/submission.entity.js'

export function toSubmissionDto(submission: Submission): ISubmission {
    return {
        id: submission.id,
        problemId: submission.problem_id,
        languageId: submission.language_id,
        status: submission.status,
        verdict: submission.verdict,
        contestMs: submission.contest_ms,
        maxTimeMs: submission.max_time_ms,
        maxMemoryKb: submission.max_memory_kb,
        // Es el código del propio equipo: el log del compilador no revela nada de los casos
        compileLog: submission.verdict === Verdict.CE ? submission.compile_log : null,
        createdAt: submission.created_at,
        judgedAt: submission.judged_at,
    }
}

// `cases` debe venir cargado para ver el detalle por caso
export function toStaffSubmissionDto(submission: Submission): IStaffSubmission {
    return {
        ...toSubmissionDto(submission),
        teamId: submission.team_id,
        testsetId: submission.testset_id,
        cases: [...(submission.cases ?? [])]
            .sort((a, b) => a.ordinal - b.ordinal)
            .map((submissionCase) => ({
                ordinal: submissionCase.ordinal,
                verdict: submissionCase.verdict,
                cpuMs: submissionCase.cpu_ms,
                wallMs: submissionCase.wall_ms,
                memoryKb: submissionCase.memory_kb,
                message: submissionCase.message,
            })),
    }
}
