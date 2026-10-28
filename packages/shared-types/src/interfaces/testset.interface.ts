import { CompareMode, TestCaseOrigin, TestCaseVisibility, TestsetStatus } from "../enums/testset-status.enum.js"

// ─── Esquema declarativo (judge-evaluation.md §3) ────────────
// Los nodos del esquema base pueden ir incompletos: cada grupo los completa con `overrides`.
// Lo que se valida es el nodo ya combinado de cada grupo.

// `long` acepta strings para valores fuera de ±2^53
export interface IIntegerSchemaNode {
    type: 'int' | 'long'
    min?: number | string
    max?: number | string
}

export interface IFloatSchemaNode {
    type: 'float'
    min?: number
    max?: number
    // Redondea a esta cantidad de decimales
    decimals?: number
}

export interface IBoolSchemaNode {
    type: 'bool'
}

export interface IStringSchemaNode {
    type: 'string'
    length?: [number, number]
    // Caracteres permitidos; acepta rangos como "a-z0-9"
    charset?: string
}

export interface IArraySchemaNode {
    type: 'array'
    length?: [number, number]
    items?: SchemaNode
    unique?: boolean
    sorted?: 'asc' | 'desc'
}

export type SchemaNode = IIntegerSchemaNode | IFloatSchemaNode | IBoolSchemaNode | IStringSchemaNode | IArraySchemaNode

export interface ISchemaGroup {
    name: string
    // Un caso por semilla
    seeds: number[]
    // Por parámetro: se combina recursivamente con el nodo base
    overrides?: Record<string, Partial<SchemaNode> & Record<string, unknown>>
}

export interface ITestsetSchema {
    params: Record<string, SchemaNode>
    groups: ISchemaGroup[]
}

// ─── Requests ────────────────────────────────────────────────

export interface IUpdateTestset {
    timeLimitMs?: number
    memoryLimitMb?: number
    compareMode?: CompareMode
    floatTolerance?: number | null
    schema?: ITestsetSchema | null
}

// `input` es un objeto con una llave por parámetro de la firma.
// Los `long` fuera de ±2^53 se mandan como string.
export interface ICreateTestCase {
    input: Record<string, unknown>
    visibility?: TestCaseVisibility
}

export type IUpdateTestCase = Partial<ICreateTestCase>

export interface ISetRefSolution {
    languageId: string
    source: string
}

export interface ICreateTestsetVersion {
    reason: string
}

// ─── Responses ───────────────────────────────────────────────

export interface ITestCase {
    id: number
    ordinal: number
    visibility: TestCaseVisibility
    origin: TestCaseOrigin
    group: string | null
    seed: number | null
    inputSha: string
    outputSha: string | null
    inputBytes: number
    outputBytes: number | null
    refTimeMs: number | null
    // JSON canónico; null si el input pasa de 64 KB (se pide completo por caso)
    inputPreview: string | null
}

export interface ITestCaseContent {
    id: number
    // JSON canónico
    input: string
    output: string | null
}

export interface ITestsetSummary {
    id: number
    problemId: number
    version: number
    status: TestsetStatus
}

export interface IGenerateTestsetResponse {
    generatedCount: number
}
