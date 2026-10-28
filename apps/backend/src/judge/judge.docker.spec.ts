import { CompareMode, Verdict, type IProblemSignature } from '@concurso/shared-types'
import type { ConfigService } from '@nestjs/config'
import type { Language } from '../languages/entities/language.entity.js'
import { CpuPool, parseJudgeCpus } from './cpu-pool.js'
import { DockerRunnerService } from './docker-runner.service.js'
import { JudgeService, type JudgeCase } from './judge.service.js'

// Compila y ejecuta de verdad en Docker (las imágenes de judge-evaluation.md deben estar descargadas).
// Tarda ~1 min, por eso no corre con `pnpm test`:
//   JUDGE_DOCKER=1 pnpm vitest run src/judge/judge.docker.spec.ts

const LANGUAGES: Record<string, Pick<Language, 'code' | 'image_ref' | 'flags'>> = {
    c: { code: 'c', image_ref: 'gcc:14', flags: '-O2 -std=gnu17 -lm' },
    cpp: { code: 'cpp', image_ref: 'gcc:14', flags: '-O2 -std=gnu++20' },
    csharp: { code: 'csharp', image_ref: 'mcr.microsoft.com/dotnet/sdk:8.0', flags: '' },
    java: { code: 'java', image_ref: 'eclipse-temurin:21-jdk', flags: '' },
    javascript: { code: 'javascript', image_ref: 'node:24-slim', flags: '' },
    typescript: { code: 'typescript', image_ref: 'node:24-slim', flags: '' },
    python: { code: 'python', image_ref: 'python:3.12-slim', flags: '' },
}

const int = { type: 'int' } as const
const long = { type: 'long' } as const
const float = { type: 'float' } as const
const bool = { type: 'bool' } as const
const string = { type: 'string' } as const

// int[] y long grandes → long[] (valores arriba de 2^53)
const SCALE: IProblemSignature = {
    functionName: 'scale',
    params: [{ name: 'nums', type: { type: 'array', items: int } }, { name: 'k', type: long }],
    returns: { type: 'array', items: long },
}
const SCALE_CASES: JudgeCase[] = [
    { ordinal: 1, input: '{"nums":[1,-2,3],"k":9007199254740993}', expected: '[9007199254740993,-18014398509481986,27021597764222979]' },
    { ordinal: 2, input: '{"nums":[],"k":5}', expected: '[]' },
]

// float[][] y bool → float[]
const ROW_SUMS: IProblemSignature = {
    functionName: 'rowSums',
    params: [{ name: 'rows', type: { type: 'array', items: { type: 'array', items: float } } }, { name: 'loud', type: bool }],
    returns: { type: 'array', items: float },
}
const ROW_SUMS_CASES: JudgeCase[] = [
    { ordinal: 1, input: '{"rows":[[0.5,0.25],[],[10000000000.0,1.5]],"loud":true}', expected: '[0.75,0.0,10000000001.5]' },
    { ordinal: 2, input: '{"rows":[[0.5,0.25],[]],"loud":false}', expected: '[-0.75,0.0]' },
]

// string con escapes y Unicode fuera del BMP → string
const GREET: IProblemSignature = {
    functionName: 'greet',
    params: [{ name: 'name', type: string }, { name: 'times', type: int }],
    returns: string,
}
const GREET_NAME = 'Ñandú "x"\n\\😀'
const GREET_CASES: JudgeCase[] = [
    { ordinal: 1, input: JSON.stringify({ name: GREET_NAME, times: 2 }), expected: JSON.stringify(GREET_NAME.repeat(2)) },
    { ordinal: 2, input: '{"name":"","times":3}', expected: '""' },
]

const SOLUTIONS: Record<string, Record<'scale' | 'rowSums' | 'greet', string>> = {
    python: {
        scale: 'def scale(nums, k):\n    print("debug: se descarta")\n    return [x * k for x in nums]\n',
        rowSums: 'def rowSums(rows, loud):\n    return [sum(r) if loud else -sum(r) for r in rows]\n',
        greet: 'def greet(name, times):\n    return name * times\n',
    },
    javascript: {
        scale: 'function scale(nums, k) {\n  console.log("debug")\n  return nums.map((x) => BigInt(x) * k)\n}\n',
        rowSums: 'function rowSums(rows, loud) {\n  return rows.map((r) => { const s = r.reduce((a, b) => a + b, 0); return loud ? s : -s })\n}\n',
        greet: 'function greet(name, times) {\n  return name.repeat(times)\n}\n',
    },
    typescript: {
        scale: 'function scale(nums: number[], k: bigint): bigint[] {\n  return nums.map((x) => BigInt(x) * k)\n}\n',
        rowSums: 'function rowSums(rows: number[][], loud: boolean): number[] {\n  return rows.map((r) => { const s = r.reduce((a, b) => a + b, 0); return loud ? s : -s })\n}\n',
        greet: 'export function greet(name: string, times: number): string {\n  return name.repeat(times)\n}\n',
    },
    java: {
        scale: 'class Main {\n  static long[] scale(int[] nums, long k) {\n    System.out.println("debug");\n    long[] r = new long[nums.length];\n    for (int i = 0; i < nums.length; i++) r[i] = nums[i] * k;\n    return r;\n  }\n}\n',
        rowSums: 'class Main {\n  static double[] rowSums(double[][] rows, boolean loud) {\n    double[] r = new double[rows.length];\n    for (int i = 0; i < rows.length; i++) { double s = 0; for (double v : rows[i]) s += v; r[i] = loud ? s : -s; }\n    return r;\n  }\n}\n',
        greet: 'public class Main {\n  public static void main(String[] args) {}\n  static String greet(String name, int times) { return name.repeat(times); }\n}\n',
    },
    csharp: {
        scale: 'public class Main\n{\n  public static long[] scale(int[] nums, long k) => nums.Select(x => x * k).ToArray();\n}\n',
        rowSums: 'public class Main\n{\n  public static double[] rowSums(double[][] rows, bool loud) => rows.Select(r => loud ? r.Sum() : -r.Sum()).ToArray();\n}\n',
        greet: 'public class Main\n{\n  public static string greet(string name, int times) => string.Concat(Enumerable.Repeat(name, times));\n}\n',
    },
    c: {
        scale: '#include "judge.h"\n\nLongArray scale(IntArray nums, long long k) {\n  LongArray r = { malloc(sizeof(long long) * (nums.len + 1)), nums.len };\n  for (int i = 0; i < nums.len; i++) r.data[i] = nums.data[i] * k;\n  printf("debug\\n");\n  return r;\n}\n',
        rowSums: '#include "judge.h"\n\nDoubleArray rowSums(DoubleArray2D rows, bool loud) {\n  DoubleArray r = { malloc(sizeof(double) * (rows.len + 1)), rows.len };\n  for (int i = 0; i < rows.len; i++) {\n    double s = 0;\n    for (int j = 0; j < rows.data[i].len; j++) s += rows.data[i].data[j];\n    r.data[i] = loud ? s : -s;\n  }\n  return r;\n}\n\nint main(void) { return 0; }\n',
        greet: '#include <stdlib.h>\n#include <string.h>\n\nchar *greet(char *name, int times) {\n  size_t n = strlen(name);\n  char *r = malloc(n * times + 1);\n  for (int i = 0; i < times; i++) memcpy(r + n * i, name, n);\n  r[n * times] = 0;\n  return r;\n}\n',
    },
    cpp: {
        scale: '#include <bits/stdc++.h>\nusing namespace std;\n\nvector<long long> scale(const vector<int>& nums, long long k) {\n  vector<long long> r;\n  for (int x : nums) r.push_back(x * k);\n  cout << "debug" << endl;\n  return r;\n}\n',
        rowSums: '#include <bits/stdc++.h>\nusing namespace std;\n\nvector<double> rowSums(vector<vector<double>> rows, bool loud) {\n  vector<double> r;\n  for (auto& row : rows) { double s = accumulate(row.begin(), row.end(), 0.0); r.push_back(loud ? s : -s); }\n  return r;\n}\n\nint main() { return 0; }\n',
        greet: '#include <bits/stdc++.h>\n#define int long long\nusing namespace std;\n\nstring greet(string name, int times) {\n  string r;\n  while (times-- > 0) r += name;\n  return r;\n}\n',
    },
}

const config = { get: (key: string) => process.env[key] } as unknown as ConfigService

describe.skipIf(!process.env.JUDGE_DOCKER)('JudgeService en Docker', () => {
    let judge: JudgeService

    beforeAll(async () => {
        const runner = new DockerRunnerService(config)
        await runner.onModuleInit()
        judge = new JudgeService(runner, new CpuPool(parseJudgeCpus(process.env.JUDGE_CPUS, 4)))
    }, 120_000)

    const run = (language: string, signature: IProblemSignature, source: string, cases: JudgeCase[], overrides: { timeLimitMs?: number, memoryLimitMb?: number } = {}) =>
        judge.judge({
            language: LANGUAGES[language] as Language,
            signature,
            source,
            cases,
            timeLimitMs: overrides.timeLimitMs ?? 2000,
            memoryLimitMb: overrides.memoryLimitMb ?? 256,
            compareMode: CompareMode.EXACT,
            floatTolerance: null,
        })

    describe.concurrent.each(Object.keys(SOLUTIONS))('%s', (language) => {
        it.each([
            ['scale', SCALE, SCALE_CASES],
            ['rowSums', ROW_SUMS, ROW_SUMS_CASES],
            ['greet', GREET, GREET_CASES],
        ] as const)('%s da AC', async (name, signature, cases) => {
            const result = await run(language, signature, SOLUTIONS[language][name], cases)
            if(result.verdict === Verdict.CE) throw new Error('CE:\n' + result.compileLog)
            expect(result.cases.map((testCase) => [testCase.verdict, testCase.output, testCase.message]))
                .toEqual(cases.map((testCase) => [Verdict.AC, testCase.expected, null]))
            expect(result.verdict).toBe(Verdict.AC)
        }, 120_000)
    })

    describe.concurrent('veredictos', () => {
        it('WA cuando la salida no coincide', async () => {
            const result = await run('python', GREET, 'def greet(name, times):\n    return name\n', GREET_CASES)
            expect(result.verdict).toBe(Verdict.WA)
            // El WA lo decide el worker, así que se ejecutan todos los casos
            expect(result.cases).toHaveLength(2)
        }, 60_000)

        it('WA con mensaje cuando el tipo de retorno no es el de la firma', async () => {
            const result = await run('python', SCALE, 'def scale(nums, k):\n    return "hola"\n', SCALE_CASES)
            expect(result.verdict).toBe(Verdict.WA)
            expect(result.cases[0].message).toMatch(/expected long\[\]/)
        }, 60_000)

        it('TLE y se detiene en ese caso', async () => {
            const result = await run('c', GREET, 'char *greet(char *name, int times) { for (;;) {} }\n', GREET_CASES, { timeLimitMs: 500 })
            expect(result.verdict).toBe(Verdict.TLE)
            expect(result.cases).toHaveLength(1)
        }, 60_000)

        it('RE con el stderr del programa', async () => {
            const result = await run('python', GREET, 'def greet(name, times):\n    raise ValueError("se rompió")\n', GREET_CASES)
            expect(result.verdict).toBe(Verdict.RE)
            expect(result.cases[0].message).toMatch(/ValueError: se rompió/)
        }, 60_000)

        it('MLE al pasar el límite de memoria', async () => {
            const source = '#include <bits/stdc++.h>\nstd::string greet(std::string name, int times) {\n  std::vector<char> v(512u << 20, 1);\n  return std::string(1, v[times]);\n}\n'
            const result = await run('cpp', GREET, source, GREET_CASES, { memoryLimitMb: 128 })
            expect(result.verdict).toBe(Verdict.MLE)
        }, 60_000)

        it('CE con el log del compilador', async () => {
            const result = await run('java', GREET, 'class Main { static String greet(String name, int times) { return name } }\n', GREET_CASES)
            expect(result.verdict).toBe(Verdict.CE)
            expect(result.compileLog).toMatch(/';' expected/)
            expect(result.cases).toEqual([])
        }, 60_000)

        it('recursión profunda en Node y C no truena el stack', async () => {
            const js = 'function greet(name, times) {\n  const f = (n) => (n === 0 ? 0 : 1 + f(n - 1))\n  return String(f(200000))\n}\n'
            const c = '#include <stdio.h>\nstatic int f(int n) { volatile char pad[64]; pad[0] = 0; return n == 0 ? pad[0] : 1 + f(n - 1); }\nchar *greet(char *name, int times) { static char b[16]; sprintf(b, "%d", f(1000000)); return b; }\n'
            const cases = [{ ordinal: 1, input: '{"name":"","times":1}', expected: null }]
            const [jsResult, cResult] = await Promise.all([run('javascript', GREET, js, cases), run('c', GREET, c, cases)])
            expect([jsResult.verdict, jsResult.cases[0].output, jsResult.cases[0].message]).toEqual([Verdict.AC, '"200000"', null])
            expect([cResult.verdict, cResult.cases[0].output]).toEqual([Verdict.AC, '"1000000"'])
        }, 60_000)
    })
})
