import type { ScalarType, TypeRef } from '@concurso/shared-types'

// Textos de las plantillas del participante: qué regresa o imprime, dicho en español

const ONE: Record<Exclude<ScalarType, 'bool'>, string> = {
    int: 'un número entero',
    long: 'un número entero (puede ser muy grande)',
    float: 'un número con decimales',
    string: 'un texto',
}
const MANY: Record<ScalarType, string> = {
    int: 'números enteros',
    long: 'números enteros',
    float: 'números con decimales',
    bool: 'valores verdadero o falso',
    string: 'textos',
}

export function describeType(type: TypeRef, languageCode: string): string {
    if(type.type === 'bool') return languageCode === 'python' ? 'True o False' : 'true o false'
    if(type.type !== 'array') return ONE[type.type]
    const many = (t: TypeRef): string => t.type === 'array' ? 'listas de ' + many(t.items) : MANY[t.type]
    return 'una lista de ' + many(type.items)
}

// Programa completo: cómo imprimir la respuesta (full-program.ts compara las últimas palabras de la salida)
export function outputHint(type: TypeRef, languageCode: string): string {
    // En C y C++ un bool se imprime como 1 o 0: el juez espera el texto
    if(type.type === 'bool' && (languageCode === 'c' || languageCode === 'cpp')) return 'Al final imprime el texto true o false (no 1 ni 0).'
    if(type.type !== 'array') return 'Al final imprime ' + describeType(type, languageCode) + '.'
    if(type.items.type === 'array') return 'Al final imprime una fila por línea, con sus elementos separados por espacios.'
    if(type.items.type === 'string') return 'Al final imprime cada texto en su propia línea, en orden.'
    return 'Al final imprime los elementos en orden, separados por espacios (en una línea o en varias).'
}
