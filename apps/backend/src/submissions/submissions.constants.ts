// Cola que consume el worker: un trabajo por ronda de cada envío, con jobId fijo para que sea idempotente
export const SUBMISSIONS_QUEUE = 'submissions'

export interface SubmissionJob {
    submissionId: number
    // Submission.judge_round al encolar: un rejudge encola otra ronda con otro jobId
    round: number
}

export const submissionJobId = (submissionId: number, round: number) => 'submission-' + submissionId + '-r' + round

export function submissionIdFromJob(jobId: string | undefined): number | null {
    const match = /^submission-(\d+)-r\d+$/.exec(jobId ?? '')
    return match ? Number(match[1]) : null
}

// Reintentos solo para errores del sistema (Docker caído...); un veredicto nunca se reintenta
export const SUBMISSION_JOB_ATTEMPTS = 3

export const MAX_SOURCE_BYTES = 64 * 1024

// Entre dos envíos del mismo equipo
export const SUBMISSION_COOLDOWN_MS = 5_000
