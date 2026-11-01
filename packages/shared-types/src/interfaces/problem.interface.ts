import { ProblemStatus } from "../enums/problem-status.enum.js"
import { CompareMode, TestsetStatus } from "../enums/testset-status.enum.js"
import type { IProblemSignature } from "./signature.interface.js"
import type { IGeneratorGroup, ITestCase, ITestsetSchema } from "./testset.interface.js"

// ─── Requests ────────────────────────────────────────────────

export interface IProblemFilters {
    categoryId?: number
}

export interface ICreateProblem {
    categoryId: number
    // La asigna el sistema (siguiente libre de la categoría) si no se manda
    letter?: string
    title: string
    statement: string // markdown
    // Opcionales: la firma y los ejemplos ya dicen qué entra y qué sale
    inputFormat?: string
    outputFormat?: string
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
    signature: IProblemSignature | null
}

export interface IProblemTestset {
    id: number
    version: number
    status: TestsetStatus
    timeLimitMs: number
    memoryLimitMb: number
    compareMode: CompareMode
    floatTolerance: number | null
    schema: ITestsetSchema | null
    manualReview: boolean
    reviewInstructions: string | null
    refSolutionId: number | null
    generatorId: number | null
    // Grupos y semillas con que corre el generador en código
    generatorGroups: IGeneratorGroup[] | null
    checkerId: number | null
    seed: number | null
    generatedCount: number | null
    refMaxTimeMs: number | null
    buildLog: string | null
    authorId: number
    reason: string | null
    createdAt: string | Date
}

export interface ITestsetDetail extends IProblemTestset {
    problemId: number
    cases: ITestCase[]
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
    // Quien lo creó (null en problemas anteriores a guardar el autor)
    author: { id: number, name: string } | null
    // Si quien pide puede editarlo: su autor, un admin de la edición o un superadmin
    canEdit: boolean
}

// JSON canónico
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
    signature: IProblemSignature | null
    limits: {
        timeLimitMs: number
        memoryLimitMb: number
    } | null
    samples: IProblemSample[]
}

export interface IPublishProblemResponse {
    status: ProblemStatus
}
