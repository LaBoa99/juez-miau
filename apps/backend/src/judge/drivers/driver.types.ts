import type { IProblemSignature, ScalarType, TypeRef } from '@concurso/shared-types'

// Programa listo para compilar y ejecutar en el contenedor del lenguaje.
// Contrato con el script de ejecución (docker-runner.service.ts):
// - la entrada del caso llega por stdin como JSON canónico (un objeto con un campo por parámetro)
// - el driver escribe el valor de retorno en RESULT_PATH como JSON; la salida estándar del
//   participante se descarta, así sus print no afectan la comparación
// - el JSON del resultado no tiene que ser canónico: el worker lo normaliza antes de comparar
export interface DriverProgram {
    // Archivos del directorio de trabajo, relativos a /box
    files: Record<string, string>
    compileCmd: string
    runCmd: string
}

export interface DriverInput {
    signature: IProblemSignature
    source: string
    // `Language.flags`: se agregan al compilador en C y C++
    flags: string
    // Solo para el generador: la firma del problema. El driver agrega `caso(...)` (Caso.de en Java,
    // Caso.De en C#) con esos parámetros tipados, que arma el JSON del caso por el juez
    caseSignature?: IProblemSignature
}

export type DriverBuilder = (input: DriverInput) => DriverProgram

export const RESULT_PATH = '/tmp/result.json'

// Llave corta por tipo para nombrar funciones generadas: int[][] → AAI
export function typeKey(type: TypeRef): string {
    if(type.type === 'array') return 'A' + typeKey(type.items)
    return SCALAR_KEYS[type.type]
}

const SCALAR_KEYS: Record<ScalarType, string> = {
    int: 'I',
    long: 'L',
    float: 'D',
    bool: 'B',
    string: 'S',
}

export function arrayDepth(type: TypeRef): number {
    return type.type === 'array' ? 1 + arrayDepth(type.items) : 0
}

export function baseType(type: TypeRef): ScalarType {
    return type.type === 'array' ? baseType(type.items) : type.type
}

// Bloque "solo local" de la plantilla del generador: un caso(...) de prueba para el IDE del juez.
// Al ejecutarse en el juez se quita y queda el caso(...) del driver.
//   // ---- solo local: inicio ----   (o con # en Python)
//   ...
//   // ---- solo local: fin ----
export const LOCAL_BLOCK_START = '---- solo local: inicio ----'
export const LOCAL_BLOCK_END = '---- solo local: fin ----'
const LOCAL_BLOCK = /^[ \t]*(?:\/\/|#)[ \t]*---- solo local: inicio ----[\s\S]*?^[ \t]*(?:\/\/|#)[ \t]*---- solo local: fin ----[^\n]*\n?/gm

export function stripLocalBlocks(source: string): string {
    return source.replace(LOCAL_BLOCK, '')
}

// Firma con los tipos de la del problema agregados, para generar también sus lectores y escritores
export function withCaseTypes(signature: IProblemSignature, caseSignature?: IProblemSignature): IProblemSignature {
    return caseSignature ? { ...signature, params: [...signature.params, ...caseSignature.params] } : signature
}

// Todos los tipos que aparecen en la firma, incluidos los de los elementos de los arrays,
// sin repetir y con los internos antes que los que los contienen
export function collectTypes(signature: IProblemSignature): TypeRef[] {
    const seen = new Map<string, TypeRef>()
    const visit = (type: TypeRef) => {
        if(type.type === 'array') visit(type.items)
        if(!seen.has(typeKey(type))) seen.set(typeKey(type), type)
    }
    signature.params.forEach((param) => visit(param.type))
    visit(signature.returns)
    return [...seen.values()]
}

export function containsType(type: TypeRef, scalar: ScalarType): boolean {
    return baseType(type) === scalar
}

// Literal de string seguro para C, C++, Java, C#, JS y Python (los nombres ya son identificadores)
export function quote(text: string): string {
    return JSON.stringify(text)
}
