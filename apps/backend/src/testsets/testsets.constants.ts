// Cola que consume el worker (fase 3): ejecuta la solución oficial y deja el testset READY o FAILED
export const TESTSET_BUILD_QUEUE = 'testset-build'

export interface TestsetBuildJob {
    testsetId: number
}

// Pruebas del staff (una solución contra un testset construido). No guardan nada en la base:
// el resultado vive en el trabajo de la cola mientras no se limpie
export const TEST_RUN_QUEUE = 'test-run'
export const TEST_RUN_KEEP_SECONDS = 60 * 60

export interface TestRunJob {
    testsetId: number
    languageId: string
    source: string
    // Verificar: sin salidas esperadas, límite holgado como al construir, regresa entradas y salidas
    verify?: boolean
}

// Lo que regresa el worker; la API lo convierte en ITestRun
export interface TestRunResult {
    verdict: string
    compileLog: string | null
    cases: { ordinal: number, verdict: string, timeMs: number, memoryKb: number, message: string | null, input?: string, output?: string | null }[]
}

// Detectar la firma desde la solución oficial: el worker la lee y compila la solución con el
// driver de esa firma para confirmarla. Tampoco guarda nada
export const SIGNATURE_QUEUE = 'signature-detect'

export interface SignatureJob {
    testsetId: number
    languageId: string
    source: string
    functionName?: string
}
