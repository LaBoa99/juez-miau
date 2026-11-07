// Firma de la función que implementa el participante (judge-evaluation.md §1).
// Por ahora solo tipos simples y arrays anidables; enum y object llegan con los drivers completos.

export type ScalarType = 'int' | 'long' | 'float' | 'bool' | 'string'

export type TypeRef =
    | { type: ScalarType }
    | { type: 'array', items: TypeRef }

export interface ISignatureParam {
    name: string
    type: TypeRef
}

export interface IProblemSignature {
    functionName: string
    params: ISignatureParam[]
    returns: TypeRef
}

// Firma leída de la solución oficial (POST /testsets/:id/signature-detect). Un tipo null es uno que
// el detector no entendió (o JavaScript, que no tiene tipos): el juez lo elige a mano
export interface IDetectedSignature {
    functionName: string
    params: { name: string, type: TypeRef | null }[]
    returns: TypeRef | null
}

export interface IDetectSignature {
    languageId: string
    source: string
    // Si la solución tiene varias funciones candidatas, cuál es la del problema
    functionName?: string
}

export interface ISignatureDetection {
    id: string
    status: 'queued' | 'running' | 'done' | 'failed'
    candidates: IDetectedSignature[]
    // Índice en `candidates` de la firma elegida: la única, o la que se llama `functionName`
    chosen: number | null
    // Resultado de compilar la solución con el driver de la elegida; null si no se pudo probar
    // (varias candidatas, tipos sin resolver o un lenguaje sin compilador)
    compiles: boolean | null
    compileLog: string | null
    error: string | null
}
