import { CompareMode, TestCaseOrigin, TestCaseVisibility, TestsetStatus } from "../enums/testset-status.enum.js"
import { Verdict } from "../enums/verdict.enum.js"

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
    // Los AC quedan en PENDING_REVIEW hasta que un juez los revise (judge-evaluation.md §5)
    manualReview?: boolean
    // Qué debe revisar el juez, p. ej. "no usar sorted()"; null la quita
    reviewInstructions?: string | null
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

// ─── Checker y generador en código (judge-evaluation.md §3 y §5) ─
// Ambos se escriben en cualquier lenguaje soportado, como una función:
//   check(<parámetros del problema>, expectedOutput, actualOutput) -> bool
//   generate(seed: long, group: string, index: int) -> string (JSON del input, un campo por parámetro).
//   El driver agrega caso(...) (Caso.de en Java, Caso.De en C#) con los parámetros tipados del
//   problema, que arma ese JSON; regresar el texto JSON a mano sigue funcionando

export type ISetChecker = ISetRefSolution

export interface IGeneratorGroup {
    name: string
    // Un caso por semilla
    seeds: number[]
}

export interface ISetGenerator extends ISetRefSolution {
    groups: IGeneratorGroup[]
}

export interface ICreateTestsetVersion {
    reason: string
}

// Prueba del staff: juzga una solución contra un testset construido sin crear un envío.
// Con useRefSolution se prueba la solución oficial del testset (languageId y source se ignoran)
export interface ICreateTestRun {
    languageId?: string
    source?: string
    useRefSolution?: boolean
    // Verificar casos antes de construir: corre la solución oficial sin comparar y regresa
    // la entrada y la salida de cada caso para revisarlas. No necesita el testset construido
    verify?: boolean
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

export type TestRunStatus = 'queued' | 'running' | 'done' | 'failed'

export interface ITestRunCase {
    ordinal: number
    verdict: Verdict
    timeMs: number
    memoryKb: number
    // Por qué falló (stderr del RE, tipo de resultado incorrecto...)
    message: string | null
    // Solo al verificar: entrada y salida del caso como JSON canónico (el panel las presenta)
    input?: string
    output?: string | null
}

export interface ITestRun {
    id: string
    status: TestRunStatus
    // Casos juzgados hasta ahora y total del testset (para la barra de avance)
    judged: number
    total: number
    // Con status done
    verdict: Verdict | null
    compileLog: string | null
    // Solo los casos que se ejecutaron: se detiene en el primer TLE, MLE o RE
    cases: ITestRunCase[]
    // Con status failed: error del sistema, no de la solución
    error: string | null
}

// Plantilla para escribir el generador en un lenguaje: generate(seed, group, index) -> JSON del input
export interface IGeneratorTemplate {
    fileName: string
    source: string
}
