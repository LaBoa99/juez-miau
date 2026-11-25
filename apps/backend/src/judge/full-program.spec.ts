import type { IProblemSignature, TypeRef } from '@concurso/shared-types'
import { buildFullProgram, programInput, programOutput, programOutputMatches } from './full-program.js'

const int: TypeRef = { type: 'int' }

describe('programInput', () => {
    it('writes one parameter per line, in signature order', () => {
        const signature: IProblemSignature = {
            functionName: 'suma',
            params: [{ name: 'num1', type: int }, { name: 'num2', type: int }],
            returns: int,
        }
        expect(programInput(signature, '{"num1":5,"num2":3}')).toBe('5\n3\n')
    })

    it('writes arrays as a count followed by their items', () => {
        const signature: IProblemSignature = {
            functionName: 'f',
            params: [
                { name: 'nums', type: { type: 'array', items: int } },
                { name: 'names', type: { type: 'array', items: { type: 'string' } } },
                { name: 'grid', type: { type: 'array', items: { type: 'array', items: int } } },
                { name: 'empty', type: { type: 'array', items: { type: 'float' } } },
                { name: 'ok', type: { type: 'bool' } },
                { name: 'big', type: { type: 'long' } },
            ],
            returns: int,
        }
        const input = '{"nums":[3,5,7],"names":["ana maría","luis"],"grid":[[1,2],[3,4]],"empty":[],"ok":true,"big":"9007199254740993"}'
        expect(programInput(signature, input)).toBe([
            '3', '3 5 7',
            '2', 'ana maría', 'luis',
            '2', '2', '1 2', '2', '3 4',
            '0', '',
            'true',
            '9007199254740993',
            '',
        ].join('\n'))
    })
})

describe('programOutputMatches', () => {
    it('ignores the text before the answer', () => {
        expect(programOutputMatches(int, 'La suma es: 8\n', '8')).toBe(true)
        expect(programOutputMatches(int, 'Ingresa el primer número: Ingresa el segundo: La suma es: 8', '8')).toBe(true)
    })

    it('requires the answer at the end', () => {
        expect(programOutputMatches(int, '8 y listo', '8')).toBe(false)
        expect(programOutputMatches(int, 'La suma es: 8,', '8')).toBe(false)
        expect(programOutputMatches(int, '', '8')).toBe(false)
    })

    it('compares numbers as numbers', () => {
        expect(programOutputMatches(int, '8.0', '8')).toBe(true)
        expect(programOutputMatches(int, 'La suma es: 8.', '8')).toBe(true)
        expect(programOutputMatches(int, '9', '8')).toBe(false)
        expect(programOutputMatches({ type: 'float' }, '0.3333333', '0.333333333')).toBe(true)
        expect(programOutputMatches({ type: 'float' }, '0.33', '0.333333333')).toBe(false)
        expect(programOutputMatches({ type: 'long' }, '9007199254740993', '9007199254740993')).toBe(true)
        expect(programOutputMatches({ type: 'long' }, '9007199254740992', '9007199254740993')).toBe(false)
    })

    it('accepts bools in any case and strings word by word', () => {
        expect(programOutputMatches({ type: 'bool' }, 'Resultado: True', 'true')).toBe(true)
        expect(programOutputMatches({ type: 'string' }, 'Saludo:\nhola   mundo\n', '"hola mundo"')).toBe(true)
        expect(programOutputMatches({ type: 'string' }, 'Hola mundo', '"hola mundo"')).toBe(false)
    })

    it('accepts arrays on one line or many', () => {
        const matrix: TypeRef = { type: 'array', items: { type: 'array', items: int } }
        expect(programOutputMatches(matrix, '1 2\n3 4\n', '[[1,2],[3,4]]')).toBe(true)
        expect(programOutputMatches(matrix, '[1, 2]\n[3, 4]', '[[1,2],[3,4]]')).toBe(false)
    })
})

describe('buildFullProgram', () => {
    const language = { code: 'c', file_ext: 'c', compile_cmd: 'gcc Main.c -o main', run_cmd: './main', flags: '-O2 -lm' }

    it('uses the language commands and sends stdout to the result file', () => {
        expect(buildFullProgram(language, 'int main(){}')).toEqual({
            files: { 'Main.c': 'int main(){}' },
            compileCmd: 'gcc Main.c -o main -O2 -lm',
            runCmd: './main > /tmp/result.json',
        })
    })

    it('wraps Python so input() does not print its prompt', () => {
        const program = buildFullProgram({ code: 'python', file_ext: 'py', compile_cmd: 'python3 -m py_compile Main.py', run_cmd: 'python3 Main.py', flags: '' }, 'print(1)')
        expect(program.files['Main.py']).toBe('print(1)')
        expect(program.files['_judge_run.py']).toContain('builtins.input = _judge_input')
        expect(program.runCmd).toBe('python3 _judge_run.py > /tmp/result.json')
    })
})

describe('programOutput', () => {
    it('writes the answer as the program should print it', () => {
        expect(programOutput(int, '8')).toBe('8')
        expect(programOutput({ type: 'string' }, '"hola mundo"')).toBe('hola mundo')
        expect(programOutput({ type: 'array', items: int }, '[1,2,3]')).toBe('1 2 3')
        expect(programOutput({ type: 'array', items: { type: 'array', items: int } }, '[[1,2],[3,4]]')).toBe('1 2\n3 4')
        expect(programOutput({ type: 'array', items: { type: 'string' } }, '["ana","luis"]')).toBe('ana\nluis')
    })
})

describe('programInput con tamaño marcado', () => {
    it('la lista con size no repite su cantidad', () => {
        const signature: IProblemSignature = {
            functionName: 'dias',
            params: [{ name: 'n', type: int }, { name: 'a', type: { type: 'array', items: int }, size: 'n' }],
            returns: int,
        }
        expect(programInput(signature, '{"n":6,"a":[3,5,2,7,7,9]}')).toBe('6\n3 5 2 7 7 9\n')
        expect(programInput(signature, '{"n":0,"a":[]}')).toBe('0\n\n')
    })
})
