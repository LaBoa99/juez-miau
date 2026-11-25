import type { IProblemSignature, ScalarType, TypeRef } from '@concurso/shared-types'
import { parseJsonPreservingIntegers } from '../testsets/generation/canonical-json.js'
import { normalizeInput, normalizeValue } from '../testsets/generation/signature.js'
import { DEFAULT_FLOAT_TOLERANCE } from './compare.js'
import { RESULT_PATH, type DriverProgram } from './drivers/driver.types.js'

// Categoría especial de programa completo (docs/design/programa-completo.md): el participante manda un
// programa que lee de stdin y escribe en stdout, sin driver. La solución oficial sigue siendo una función.

// ─── Programa ───────────────────────────────────────────────

// Python: input() sin mensaje, para que input("Ingresa un número: ") no ensucie la salida
const PYTHON_RUNNER = [
    'import builtins, runpy, sys',
    'def _judge_input(prompt=""):',
    '    line = sys.stdin.readline()',
    '    if not line:',
    '        raise EOFError("EOF when reading a line")',
    '    return line[:-1] if line.endswith("\\n") else line',
    'builtins.input = _judge_input',
    'runpy.run_path("Main.py", run_name="__main__")',
    '',
].join('\n')

export interface FullProgramLanguage {
    code: string
    file_ext: string
    compile_cmd: string
    run_cmd: string
    flags: string
}

// Los comandos de stdin/stdout de Language; la salida estándar va al archivo de resultado
export function buildFullProgram(language: FullProgramLanguage, source: string): DriverProgram {
    const files: Record<string, string> = { ['Main.' + language.file_ext]: source }
    let runCmd = language.run_cmd
    if(language.code === 'python'){
        files['_judge_run.py'] = PYTHON_RUNNER
        runCmd = 'python3 _judge_run.py'
    }
    return {
        files,
        compileCmd: (language.compile_cmd + ' ' + language.flags).trim(),
        runCmd: runCmd + ' > ' + RESULT_PATH,
    }
}

// ─── Entrada: JSON canónico → texto ─────────────────────────

function scalarText(type: ScalarType, value: unknown): string {
    switch(type){
        case 'long': return (value as bigint).toString()
        case 'bool': return value ? 'true' : 'false'
        case 'string': return value as string
        default: return String(value)
    }
}

// Un array es su cantidad y luego sus elementos: los números en una línea, los string y los arrays uno tras otro
function inputLines(type: TypeRef, value: unknown): string[] {
    if(type.type !== 'array') return [scalarText(type.type, value)]
    const items = value as unknown[]
    if(type.items.type === 'array' || type.items.type === 'string'){
        return [String(items.length), ...items.flatMap((item) => inputLines(type.items, item))]
    }
    const scalar = type.items.type
    return [String(items.length), items.map((item) => scalarText(scalar, item)).join(' ')]
}

export function programInput(signature: IProblemSignature, inputJson: string): string {
    const { value, errors } = normalizeInput(signature, parseJsonPreservingIntegers(inputJson))
    if(errors.length > 0) throw new Error('invalid case input: ' + errors.join('; '))
    // Una lista con `size` no repite su cantidad: ese int ya se escribió antes ("6" y luego "3 5 2 7 7 9")
    return signature.params.flatMap((param) => inputLines(param.type, value[param.name]).slice(param.size ? 1 : 0)).join('\n') + '\n'
}

// Respuesta como texto para el enunciado: un array de números en una línea; de string o de arrays, uno por línea
function outputLines(type: TypeRef, value: unknown): string[] {
    if(type.type !== 'array') return [scalarText(type.type, value)]
    const items = value as unknown[]
    if(type.items.type === 'array' || type.items.type === 'string') return items.flatMap((item) => outputLines(type.items, item))
    const scalar = type.items.type
    return [items.map((item) => scalarText(scalar, item)).join(' ')]
}

export function programOutput(returns: TypeRef, outputJson: string): string {
    const errors: string[] = []
    const value = normalizeValue(returns, parseJsonPreservingIntegers(outputJson), 'output', errors)
    if(errors.length > 0) throw new Error('invalid output: ' + errors.join('; '))
    return outputLines(returns, value).join('\n')
}

// ─── Salida: termina con la respuesta ───────────────────────

interface AnswerToken {
    type: ScalarType
    text: string
}

function answerTokens(type: TypeRef, value: unknown): AnswerToken[] {
    if(type.type === 'array') return (value as unknown[]).flatMap((item) => answerTokens(type.items, item))
    const text = scalarText(type.type, value)
    if(type.type === 'string') return words(text).map((word) => ({ type: 'string', text: word }))
    return [{ type: type.type, text }]
}

function words(text: string): string[] {
    return text.split(/\s+/).filter((word) => word.length > 0)
}

// Entero escrito como entero o con decimales en cero (8 o 8.0)
const INTEGER_TOKEN = /^([+-]?\d+)(?:\.0*)?$/

function tokenMatches(expected: AnswerToken, actual: string): boolean {
    switch(expected.type){
        case 'int':
        case 'long': {
            const match = INTEGER_TOKEN.exec(actual)
            return match !== null && BigInt(match[1]) === BigInt(expected.text)
        }
        case 'float': {
            if(!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(actual)) return false
            const a = Number(actual)
            const b = Number(expected.text)
            const diff = Math.abs(a - b)
            return diff <= DEFAULT_FLOAT_TOLERANCE || diff <= DEFAULT_FLOAT_TOLERANCE * Math.abs(b)
        }
        case 'bool':
            return actual.toLowerCase() === expected.text
        case 'string':
            return actual === expected.text
    }
}

// Las últimas palabras de la salida deben ser las de la respuesta; lo de antes (mensajes) se ignora
export function programOutputMatches(returns: TypeRef, stdout: string, expectedJson: string): boolean {
    const errors: string[] = []
    const expected = normalizeValue(returns, parseJsonPreservingIntegers(expectedJson), 'expected', errors)
    if(errors.length > 0) throw new Error('invalid expected output: ' + errors.join('; '))

    const want = answerTokens(returns, expected)
    const got = words(stdout)
    if(want.length > got.length) return false
    const tail = got.slice(got.length - want.length)
    return want.every((token, index) => tokenMatches(token, tail[index]))
}
