import type { IProblemSignature } from '@concurso/shared-types'

// El checker y el generador en código son funciones como las del participante: corren con los
// mismos drivers, solo cambia la firma

export const CHECKER_EXPECTED = 'expectedOutput'
export const CHECKER_ACTUAL = 'actualOutput'

// check(<parámetros del problema>, expectedOutput, actualOutput) -> bool
export function checkerSignature(problem: IProblemSignature): IProblemSignature {
    return {
        functionName: 'check',
        params: [
            ...problem.params,
            { name: CHECKER_EXPECTED, type: problem.returns },
            { name: CHECKER_ACTUAL, type: problem.returns },
        ],
        returns: { type: 'bool' },
    }
}

export function checkerNameCollisions(problem: IProblemSignature): string[] {
    const names = [CHECKER_EXPECTED, CHECKER_ACTUAL, 'check']
    return problem.params
        .filter((param) => names.includes(param.name))
        .map((param) => 'parameter "' + param.name + '" is reserved for the checker; rename it')
}

// El input canónico es un objeto con los parámetros en orden: se le agregan los dos campos
export function checkerInput(input: string, expected: string, actual: string): string {
    const inner = input.trim().slice(1, -1)
    return '{' + inner + (inner ? ',' : '') + JSON.stringify(CHECKER_EXPECTED) + ':' + expected + ',' + JSON.stringify(CHECKER_ACTUAL) + ':' + actual + '}'
}

// generate(seed: long, group: string, index: int) -> string con el JSON del input
export const GENERATOR_SIGNATURE: IProblemSignature = {
    functionName: 'generate',
    params: [
        { name: 'seed', type: { type: 'long' } },
        { name: 'group', type: { type: 'string' } },
        { name: 'index', type: { type: 'int' } },
    ],
    returns: { type: 'string' },
}

export function generatorInput(seed: number, group: string, index: number): string {
    return '{"seed":' + Math.trunc(seed) + ',"group":' + JSON.stringify(group) + ',"index":' + index + '}'
}
