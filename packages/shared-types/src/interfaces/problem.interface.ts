import { ProblemStatus } from "../enums/problem-status.enum.js"
import { TestsetStatus } from "../enums/testset-status.enum.js"

// ─── Requests ────────────────────────────────────────────────

export interface IProblemFilters {
    categoryId?: number
}

export interface ICreateProblem {
    categoryId: number
    letter: string
    title: string
    statement: string // markdown
    inputFormat: string
    outputFormat: string
    points?: number
}

export type IUpdateProblem = Partial<Pick<ICreateProblem, 'title' | 'statement' | 'inputFormat' | 'outputFormat' | 'letter'>>

// ─── Responses ───────────────────────────────────────────────

export interface IProblemListItem {
    id: number
    letter: string
    title: string
    categoryId: number
    status: ProblemStatus
    currentTestsetVersion: number | null
}

export interface ICreateProblemResponse {
    id: number
    status: ProblemStatus
    testsetId: number
}

export interface IProblem {
    id: number
    editionId: number
    categoryId: number
    letter: string
    title: string
    statement: string
    inputFormat: string
    outputFormat: string
    points: number
    status: ProblemStatus
    currentTestsetId: number | null
}

export interface IProblemTestset {
    id: number
    version: number
    status: TestsetStatus
    timeLimitMs: number
    memoryLimitMb: number
    refSolutionId: number | null
    generatorId: number | null
    seed: number | null
    generatedCount: number | null
    refMaxTimeMs: number | null
    buildLog: string | null
    authorId: number
    reason: string | null
    createdAt: string | Date
}

// Solución de referencia o generador: mismo formato
export interface IProblemSource {
    id: number
    languageId: string
    source: string
    sourceSha: string
    createdBy: number
    createdAt: string | Date
}

// DTO de staff: incluye referencias internas que el equipo nunca ve
export interface IProblemDetail extends IProblem {
    testsets: IProblemTestset[]
    refSolution: IProblemSource | null
    generator: IProblemSource | null
}

export interface IProblemSample {
    input: string
    output: string
}

// DTO de equipo: sin solución, generador, semilla ni casos ocultos (RNF-10, RNF-11)
export interface IProblemPreview {
    title: string
    statement: string
    inputFormat: string
    outputFormat: string
    limits: {
        timeLimitMs: number
        memoryLimitMb: number
    } | null
    samples: IProblemSample[]
}

export interface IPublishProblemResponse {
    status: ProblemStatus
}
