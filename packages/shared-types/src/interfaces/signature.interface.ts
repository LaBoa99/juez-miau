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
