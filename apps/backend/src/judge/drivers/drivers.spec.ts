import type { IProblemSignature } from '@concurso/shared-types'
import { buildProgram, starterCode, SUPPORTED_LANGUAGES } from './index.js'
import { collectTypes, typeKey } from './driver.types.js'

const signature: IProblemSignature = {
    functionName: 'solve',
    params: [
        { name: 'grid', type: { type: 'array', items: { type: 'array', items: { type: 'int' } } } },
        { name: 'name', type: { type: 'string' } },
    ],
    returns: { type: 'array', items: { type: 'long' } },
}

describe('drivers', () => {
    it('cubre los 7 lenguajes del seeder', () => {
        expect(SUPPORTED_LANGUAGES.sort()).toEqual(['c', 'cpp', 'csharp', 'java', 'javascript', 'python', 'typescript'])
    })

    it('recolecta los tipos internos antes que los que los contienen', () => {
        expect(collectTypes(signature).map(typeKey)).toEqual(['I', 'AI', 'AAI', 'S', 'L', 'AL'])
    })

    it.each(SUPPORTED_LANGUAGES)('%s incluye el código del participante y lee los parámetros en orden', (language) => {
        const program = buildProgram(language, { signature, source: '/* código del participante */', flags: '-O2' })
        const files = Object.values(program.files).join('\n')
        expect(files).toContain('/* código del participante */')
        expect(files.indexOf('"grid"')).toBeLessThan(files.indexOf('"name"'))
        expect(program.compileCmd).not.toBe('')
        expect(program.runCmd).not.toBe('')
    })

    it('agrega Language.flags al compilar C y C++', () => {
        expect(buildProgram('c', { signature, source: '', flags: '-O2 -lm' }).compileCmd).toBe('gcc driver.c -o main -O2 -lm')
        expect(buildProgram('cpp', { signature, source: '', flags: '' }).compileCmd).toBe('g++ driver.cpp -o main')
    })

    it('genera el código de inicio con los tipos de cada lenguaje', () => {
        expect(starterCode('python', signature)).toContain('def solve(grid: list[list[int]], name: str) -> list[int]:')
        expect(starterCode('typescript', signature)).toContain('function solve(grid: number[][], name: string): bigint[]')
        expect(starterCode('java', signature)).toContain('static long[] solve(int[][] grid, String name)')
        expect(starterCode('csharp', signature)).toContain('public static long[] solve(int[][] grid, string name)')
        expect(starterCode('c', signature)).toContain('LongArray solve(IntArray2D grid, char *name)')
        expect(starterCode('cpp', signature)).toContain('vector<long long> solve(vector<vector<int>> grid, string name)')
        expect(starterCode('cobol', signature)).toBeNull()
    })
})
