import { CompareMode, Verdict, type IProblemSignature } from '@concurso/shared-types'
import type { ConfigService } from '@nestjs/config'
import type { Language } from '../languages/entities/language.entity.js'
import { CpuPool, parseJudgeCpus } from './cpu-pool.js'
import { DockerRunnerService } from './docker-runner.service.js'
import { JudgeService, type JudgeCase } from './judge.service.js'
import { GENERATOR_SIGNATURE, generatorInput } from './special-programs.js'
import { generatorTemplate } from './drivers/index.js'
import { parseJsonPreservingIntegers, serializeInput } from '../testsets/generation/canonical-json.js'
import { normalizeInput } from '../testsets/generation/signature.js'
import { detectSignatures } from '../testsets/generation/detect-signature.js'
import { programStarterCode } from './drivers/program-starter.js'
import { starterCode } from './drivers/index.js'
import { LANGUAGES as SEEDED_LANGUAGES } from '../database/seeds/base/language.seeder.js'

// Compila y ejecuta de verdad en Docker (las imágenes de judge-evaluation.md deben estar descargadas).
// Tarda ~1 min, por eso no corre con `pnpm test`:
//   JUDGE_DOCKER=1 pnpm vitest run src/judge/judge.docker.spec.ts

const LANGUAGES: Record<string, Pick<Language, 'code' | 'image_ref' | 'flags'>> = {
    c: { code: 'c', image_ref: 'gcc:14', flags: '-O2 -std=gnu17 -lm' },
    cpp: { code: 'cpp', image_ref: 'gcc:14', flags: '-O2 -std=gnu++20' },
    csharp: { code: 'csharp', image_ref: 'mcr.microsoft.com/dotnet/sdk:8.0.425', flags: '' },
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

// Generador con caso(...): int, long[] con un valor arriba de 2^53, string con comillas y float
const CASE_SIGNATURE: IProblemSignature = {
    functionName: 'resolver',
    params: [
        { name: 'n', type: int },
        { name: 'nums', type: { type: 'array', items: long } },
        { name: 's', type: string },
        { name: 'x', type: float },
    ],
    returns: int,
}
const CASE_EXPECTED = '{"n":2,"nums":[7,9007199254740993],"s":"g\\"x","x":0.5}'
const GENERATORS: Record<string, string> = {
    python: 'def generate(seed, group, index):\n    return caso(index, [seed, 9007199254740993], s=group + \'"x\', x=0.5)\n',
    javascript: 'function generate(seed, group, index) {\n  return caso(index, [seed, 9007199254740993n], group + \'"x\', 0.5)\n}\n',
    typescript: 'function generate(seed: bigint, group: string, index: number): string {\n  return caso(index, [seed, 9007199254740993n], group + \'"x\', 0.5)\n}\n',
    java: 'class Main {\n  static String generate(long seed, String group, int index) {\n    return Caso.de(index, new long[]{seed, 9007199254740993L}, group + "\\"x", 0.5);\n  }\n}\n',
    csharp: 'public class Main\n{\n  public static string generate(long seed, string group, int index) => Caso.De(index, new long[] { seed, 9007199254740993L }, group + "\\"x", 0.5);\n}\n',
    c: '#include "judge.h"\n\nchar *generate(long long seed, char *group, int index) {\n  static long long d[2];\n  d[0] = seed; d[1] = 9007199254740993LL;\n  LongArray a = { d, 2 };\n  char s[64];\n  snprintf(s, sizeof s, "%s\\"x", group);\n  return caso(index, a, s, 0.5);\n}\n',
    cpp: '#include <bits/stdc++.h>\n\nstd::string generate(long long seed, std::string group, int index) {\n  return caso(index, {seed, 9007199254740993LL}, group + "\\"x", 0.5);\n}\n',
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
        // La plantilla del participante trae un return de ejemplo: tal cual debe compilar (WA, no CE)
        it.each([['scale', SCALE, SCALE_CASES], ['rowSums', ROW_SUMS, ROW_SUMS_CASES], ['greet', GREET, GREET_CASES]] as const)('la plantilla de %s compila tal cual', async (_, signature, cases) => {
            const result = await run(language, signature, starterCode(language, signature)!, cases)
            expect(result.verdict, result.compileLog ?? '').not.toBe(Verdict.CE)
        }, 120_000)

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

    describe.concurrent.each(Object.keys(GENERATORS))('generador con caso(...) en %s', (language) => {
        it('arma el JSON del caso con los tipos del problema', async () => {
            const result = await judge.judge({
                language: LANGUAGES[language] as Language,
                signature: GENERATOR_SIGNATURE,
                caseSignature: CASE_SIGNATURE,
                source: GENERATORS[language],
                cases: [{ ordinal: 1, input: generatorInput(7, 'g', 2), expected: null }],
                timeLimitMs: 5000,
                memoryLimitMb: 256,
                compareMode: CompareMode.EXACT,
                floatTolerance: null,
            })
            if(result.verdict === Verdict.CE) throw new Error('CE:\n' + result.compileLog)
            expect([result.cases[0].verdict, result.cases[0].message]).toEqual([Verdict.AC, null])
            // Lo mismo que hace el build: el texto regresado es el input del caso
            const text = JSON.parse(result.cases[0].output!) as string
            const { value, errors } = normalizeInput(CASE_SIGNATURE, parseJsonPreservingIntegers(text))
            expect(errors).toEqual([])
            expect(serializeInput(CASE_SIGNATURE, value as Record<string, unknown>)).toBe(CASE_EXPECTED)
        }, 120_000)
    })

    describe.concurrent.each(Object.keys(GENERATORS))('plantilla del generador en %s', (language) => {
        it('compila y corre tal cual, con valores de ejemplo', async () => {
            const result = await judge.judge({
                language: LANGUAGES[language] as Language,
                signature: GENERATOR_SIGNATURE,
                caseSignature: CASE_SIGNATURE,
                source: generatorTemplate(language, CASE_SIGNATURE)!,
                cases: [{ ordinal: 1, input: generatorInput(1, 'g', 0), expected: null }],
                timeLimitMs: 5000,
                memoryLimitMb: 256,
                compareMode: CompareMode.EXACT,
                floatTolerance: null,
            })
            if(result.verdict === Verdict.CE) throw new Error('CE:\n' + result.compileLog)
            expect([result.cases[0].verdict, result.cases[0].message]).toEqual([Verdict.AC, null])
            const { errors } = normalizeInput(CASE_SIGNATURE, parseJsonPreservingIntegers(JSON.parse(result.cases[0].output!) as string))
            expect(errors).toEqual([])
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

        // JavaScript no tiene tipos: ahí solo se detectan los nombres
        it.each(Object.keys(SOLUTIONS).filter((language) => language !== 'javascript'))('detecta la firma de scale en %s y compila con su driver', async (language) => {
            const [detected] = detectSignatures(language, SOLUTIONS[language].scale)
            // Python y TS no traen todos los tipos en estas soluciones: se completan como lo haría el juez
            const signature = { ...SCALE, functionName: detected.functionName, params: detected.params.map((param, i) => ({ name: param.name, type: param.type ?? SCALE.params[i].type })) }
            expect(signature.params.map((param) => param.name)).toEqual(['nums', 'k'])
            if (detected.params.every((param) => param.type !== null)) expect(detected.params).toEqual(SCALE.params)
            const compiled = await judge.compileCheck(LANGUAGES[language] as Language, signature, SOLUTIONS[language].scale)
            expect(compiled.log).toBe(compiled.ok ? compiled.log : 'compila')
        }, 120_000)

        it('una firma que no coincide con la solución no compila', async () => {
            const wrong = { ...SCALE, params: [{ name: 'nums', type: string }, SCALE.params[1]] }
            const [java, cpp] = await Promise.all([
                judge.compileCheck(LANGUAGES.java as Language, wrong, SOLUTIONS.java.scale),
                judge.compileCheck(LANGUAGES.cpp as Language, wrong, SOLUTIONS.cpp.scale),
            ])
            expect([java.ok, cpp.ok]).toEqual([false, false])
        }, 120_000)

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

// ─── Programa completo (programa-completo.md) ───────────────

// Todos los tipos que lee la plantilla; el participante imprime la suma con un mensaje antes
const MIX: IProblemSignature = {
    functionName: 'total',
    params: [
        { name: 'nombre', type: string },
        { name: 'nums', type: { type: 'array', items: int } },
        // Un string tras un array (vacío en los casos 2 y 3): C y C++ deben saltar el fin de línea correcto
        { name: 'apodo', type: string },
        { name: 'grid', type: { type: 'array', items: { type: 'array', items: int } } },
        { name: 'ok', type: bool },
        { name: 'k', type: long },
        { name: 'f', type: float },
    ],
    returns: long,
}
const MIX_CASES: JudgeCase[] = [
    { ordinal: 1, input: '{"nombre":"ana maria","nums":[1,2,3],"apodo":"  pepe ","grid":[[1,2],[3]],"ok":true,"k":10000000000,"f":2.5}', expected: '10000000031' },
    { ordinal: 2, input: '{"nombre":"x","nums":[],"apodo":"","grid":[],"ok":false,"k":0,"f":-1.5}', expected: '-1' },
    // Strings vacío y con espacios al inicio: antes C y C++ se los saltaban y descuadraban todo lo demás
    { ordinal: 3, input: '{"nombre":"","nums":[],"apodo":"  a b","grid":[[],[4]],"ok":true,"k":-5,"f":0.0}', expected: '5' },
]

// La lógica que escribe el participante debajo de "Escribe tu solución aquí"
const MIX_LOGIC: Record<string, string> = {
    python: 'total = len(nombre) + len(apodo) + sum(nums) + sum(sum(fila) for fila in grid) + (1 if ok else 0) + k + int(f // 1)\nprint("Total:", total)',
    javascript: "const total = BigInt(nombre.length + apodo.length + nums.reduce((a, b) => a + b, 0) + grid.flat().reduce((a, b) => a + b, 0) + (ok ? 1 : 0) + Math.floor(f)) + k\nconsole.log('Total:', total.toString())",
    typescript: "const total = BigInt(nombre.length + apodo.length + nums.reduce((a, b) => a + b, 0) + grid.flat().reduce((a, b) => a + b, 0) + (ok ? 1 : 0) + Math.floor(f)) + k\nconsole.log('Total:', total.toString())",
    java: 'long total = nombre.length() + apodo.length() + k + (ok ? 1 : 0) + (long) Math.floor(f);\nfor (int x : nums) total += x;\nfor (int[] fila : grid) for (int x : fila) total += x;\nSystem.out.println("Total: " + total);',
    csharp: 'long total = nombre.Length + apodo.Length + k + (ok ? 1 : 0) + (long) Math.Floor(f);\nforeach (int x in nums) total += x;\nforeach (int[] fila in grid) foreach (int x in fila) total += x;\nConsole.WriteLine("Total: " + total);',
    cpp: 'long long total = (long long) nombre.size() + (long long) apodo.size() + k + (ok ? 1 : 0) + (long long) floor(f);\nfor (int x : nums) total += x;\nfor (auto &fila : grid) for (int x : fila) total += x;\ncout << "Total: " << total << endl;',
    c: 'long long piso = (long long) f;\nif (piso > f) piso--;\nlong long total = (long long) strlen(nombre) + (long long) strlen(apodo) + k + ok + piso;\nfor (int i = 0; i < numsCantidad; i++) total += nums[i];\nfor (int i = 0; i < gridCantidad; i++) for (int j = 0; j < gridCantidades[i]; j++) total += grid[i][j];\nprintf("Total: %lld\\n", total);',
}

// Mete la lógica debajo del comentario de la plantilla, con su sangría
function fillTemplate(template: string, logic: string): string {
    const lines = template.split('\n')
    const at = lines.findIndex((line) => line.includes('Escribe tu solución aquí'))
    const indent = /^\s*/.exec(lines[at])![0]
    lines.splice(at + 1, 0, ...logic.split('\n').map((line) => indent + line))
    return lines.join('\n')
}

describe.skipIf(!process.env.JUDGE_DOCKER)('programa completo en Docker', () => {
    let judge: JudgeService

    beforeAll(async () => {
        const runner = new DockerRunnerService(config)
        await runner.onModuleInit()
        judge = new JudgeService(runner, new CpuPool(parseJudgeCpus(process.env.JUDGE_CPUS, 4)))
    }, 120_000)

    const language = (code: string) => ({ ...SEEDED_LANGUAGES.find((seeded) => seeded.code === code)!, image_ref: LANGUAGES[code].image_ref }) as unknown as Language
    const run = (code: string, signature: IProblemSignature, source: string, cases: JudgeCase[]) => judge.judge({
        language: language(code),
        signature,
        source,
        cases,
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        compareMode: CompareMode.PROGRAM,
        floatTolerance: null,
    })

    it.concurrent.each(Object.keys(MIX_LOGIC))('la plantilla de %s lee todos los tipos y da AC', async (code) => {
        const source = fillTemplate(programStarterCode(code, MIX)!, MIX_LOGIC[code])
        const result = await run(code, MIX, source, MIX_CASES)
        if(result.verdict === Verdict.CE) throw new Error('CE:\n' + result.compileLog + '\n' + source)
        expect(result.cases.map((testCase) => [testCase.verdict, testCase.message])).toEqual([[Verdict.AC, null], [Verdict.AC, null], [Verdict.AC, null]])
    }, 120_000)

    const SUMA: IProblemSignature = { functionName: 'suma', params: [{ name: 'num1', type: int }, { name: 'num2', type: int }], returns: int }
    const SUMA_CASES: JudgeCase[] = [
        { ordinal: 1, input: '{"num1":5,"num2":3}', expected: '8' },
        { ordinal: 2, input: '{"num1":-4,"num2":10}', expected: '6' },
    ]

    it.concurrent('acepta un programa de principiante con mensajes en input()', async () => {
        const source = 'num1 = int(input("Ingresa el primer número: "))\nnum2 = int(input("Ingresa el segundo número: "))\n\nsuma = num1 + num2\n\nprint("La suma es:", suma)\n'
        const result = await run('python', SUMA, source, SUMA_CASES)
        expect(result.verdict).toBe(Verdict.AC)
        expect(result.cases[0].output).toBe('La suma es: 8\n')
    }, 60_000)

    it.concurrent('en C los mensajes quedan antes de la respuesta y también pasa', async () => {
        const source = '#include <stdio.h>\nint main() {\n  int a, b;\n  printf("Ingresa el primer numero: ");\n  scanf("%d", &a);\n  printf("Ingresa el segundo numero: ");\n  scanf("%d", &b);\n  printf("La suma es: %d\\n", a + b);\n  return 0;\n}\n'
        const result = await run('c', SUMA, source, SUMA_CASES)
        expect(result.verdict).toBe(Verdict.AC)
    }, 60_000)

    it.concurrent('WA si la salida no termina con la respuesta', async () => {
        const result = await run('python', SUMA, 'a = int(input())\nb = int(input())\nprint(a + b, "es la suma")\n', SUMA_CASES)
        expect(result.verdict).toBe(Verdict.WA)
        expect(result.cases[0].message).toBe('the output does not end with the expected answer')
    }, 60_000)
})
