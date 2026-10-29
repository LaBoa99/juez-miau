import type { EditionStatus } from "../enums/edition-status.enum.js"
import type { Verdict } from "../enums/verdict.enum.js"
import type { IProblemPreview } from "./problem.interface.js"

export enum SubmissionStatus {
    QUEUED = "QUEUED",
    JUDGING = "JUDGING",
    DONE = "DONE",
    // Falló el sistema (no el programa) después de los reintentos; un juez debe re-juzgarlo
    ERROR = "ERROR",
}

// ─── Reloj del concurso ──────────────────────────────────────

export interface IContestClock {
    editionId: number
    status: EditionStatus
    // Tiempo de concurso transcurrido (sin contar pausas) al momento de `serverTime`
    elapsedMs: number
    durationMs: number
    // El marcador público se congela desde `durationMs - freezeDurationMs`
    freezeDurationMs: number
    frozen: boolean
    // Para que el cliente corrija la diferencia con su propio reloj
    serverTime: string
}

// ─── Envíos ──────────────────────────────────────────────────

export interface ICreateSubmission {
    problemId: number
    languageId: string
    source: string
}

// Lo que ve el equipo: sin detalle de casos ocultos
export interface ISubmission {
    id: number
    problemId: number
    languageId: string
    status: SubmissionStatus
    verdict: Verdict | null
    // Minuto de concurso del envío (ICPC), en ms
    contestMs: number
    maxTimeMs: number | null
    maxMemoryKb: number | null
    // Solo si el veredicto es CE
    compileLog: string | null
    // Comentario del juez al revisar a mano (aceptado o rechazado)
    reviewComment: string | null
    createdAt: Date
    judgedAt: Date | null
}

export interface ISubmissionCase {
    ordinal: number
    verdict: Verdict
    cpuMs: number
    wallMs: number
    memoryKb: number
    message: string | null
}

// Lo que ve el staff
export interface IStaffSubmission extends ISubmission {
    teamId: number
    testsetId: number
    // Cuántas veces se ha re-juzgado
    judgeRound: number
    reviewedBy: number | null
    reviewedAt: Date | null
    cases: ISubmissionCase[]
}

// ─── Rejudge y revisión manual ───────────────────────────────

export interface IRejudge {
    reason: string
}

export interface IRejudgeProblem extends IRejudge {
    // Solo los envíos con estos veredictos; vacío o ausente = todos
    verdicts?: Verdict[]
}

export interface IRejudgeResponse {
    submissionIds: number[]
}

// Veredicto anterior de un envío re-juzgado
export interface ISubmissionHistoryEntry {
    judgeRound: number
    testsetId: number
    status: SubmissionStatus
    verdict: Verdict | null
    maxTimeMs: number | null
    judgedAt: Date | null
    reason: string
    // null: re-juicio automático por una versión nueva del testset
    rejudgedBy: number | null
    createdAt: Date
}

export interface IReviewSubmission {
    accept: boolean
    comment?: string
}

export interface ISubmissionDetail extends ISubmission {
    source: string
}

export interface IStaffSubmissionDetail extends IStaffSubmission {
    source: string
}

// ─── Vista del equipo durante el concurso ────────────────────

export interface IContestLanguage {
    id: string
    code: string
    compilerVersion: string
}

export interface IContestProblem extends IProblemPreview {
    id: number
    letter: string
    points: number
    // Plantilla con la firma, por código de lenguaje
    starterCode: Record<string, string>
}

export interface IContestView {
    edition: { id: number, name: string }
    clock: IContestClock
    languages: IContestLanguage[]
    // Vacío mientras el concurso no ha iniciado
    problems: IContestProblem[]
}

// ─── Tiempo real (Socket.io, namespace /ws) ──────────────────

export const SOCKET_EVENTS = {
    // cliente → servidor
    JOIN_EDITION: "edition:join",
    JOIN_PUBLIC: "public:join",
    // servidor → cliente
    SUBMISSION_UPDATE: "submission:update",
    SUBMISSION_PROGRESS: "submission:progress",
    CLOCK_UPDATE: "clock:update",
    STANDINGS_UPDATE: "standings:update",
    // Solo staff: alerta nueva o resuelta (IFlag)
    FLAG_UPDATE: "flag:update",
    // Staff: pregunta nueva (IStaffClarification). Equipos: respuesta publicada (IClarification)
    CLARIFICATION_UPDATE: "clarification:update",
} as const

export interface IJoinEdition {
    editionId: number
}

export interface ISubmissionProgress {
    submissionId: number
    judged: number
    total: number
}
