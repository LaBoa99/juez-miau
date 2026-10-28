import { Inject, Injectable } from '@nestjs/common'
import { CompareMode, Verdict, type IProblemSignature } from '@concurso/shared-types'
import { Language } from '../languages/entities/language.entity.js'
import { buildProgram, type DriverProgram } from './drivers/index.js'
import { normalizeOutput, outputsMatch } from './compare.js'
import { CpuPool } from './cpu-pool.js'
import { DockerRunnerService, JudgeInfrastructureError, type RawCaseResult } from './docker-runner.service.js'
import { CPU_POOL } from './judge.constants.js'
import { checkerInput, checkerSignature } from './special-programs.js'

const CHECKER_TIME_LIMIT_MS = 10_000
const CHECKER_MEMORY_MB = 512

// El checker del juez truena o no regresa bool: es un problema de configuración, no del participante
export class CheckerError extends Error {}

export type CaseVerdict = Verdict.AC | Verdict.WA | Verdict.TLE | Verdict.MLE | Verdict.RE

export interface JudgeCase {
    ordinal: number
    // JSON canónico de la entrada
    input: string
    // JSON canónico esperado; null al construir el testset (todavía no hay salidas)
    expected: string | null
}

export interface JudgeRequest {
    language: Language
    signature: IProblemSignature
    source: string
    cases: JudgeCase[]
    // Ya multiplicado por Language.time_multiplier
    timeLimitMs: number
    memoryLimitMb: number
    compareMode: CompareMode
    floatTolerance: number | null
    // Con todos los núcleos reservados (para confirmar un TLE)
    exclusive?: boolean
    // Obligatorio con compareMode = checker
    checker?: { language: Language, source: string } | null
    onProgress?: (judged: number, total: number) => void
}

export interface JudgeCaseResult {
    ordinal: number
    verdict: CaseVerdict
    cpuMs: number
    wallMs: number
    memoryKb: number
    exitCode: number
    signal: number
    // Salida canónica del programa, si terminó bien y su resultado era del tipo correcto
    output: string | null
    // Por qué falló: tipo de resultado incorrecto, stderr del RE... (solo para staff)
    message: string | null
}

export interface JudgeResult {
    verdict: Verdict
    compileLog: string | null
    // Solo los casos que se ejecutaron: la ejecución se detiene en el primer TLE, MLE o RE
    cases: JudgeCaseResult[]
    maxTimeMs: number
    maxMemoryKb: number
}

@Injectable()
export class JudgeService {

    constructor(
        private readonly runner: DockerRunnerService,
        @Inject(CPU_POOL)
        private readonly pool: CpuPool,
    ) {}

    get concurrency(): number {
        return this.pool.size
    }

    judge(request: JudgeRequest): Promise<JudgeResult> {
        const program = buildProgram(request.language.code, {
            signature: request.signature,
            source: request.source,
            flags: request.language.flags,
        })

        const run = async (cpu: number): Promise<JudgeResult> => {
            const result = await this.execute(cpu, request, program)
            if(request.compareMode !== CompareMode.CHECKER || result.verdict === Verdict.CE) return result
            return this.applyChecker(cpu, request, result)
        }
        return request.exclusive ? this.pool.useExclusive(run) : this.pool.use(run)
    }

    private async execute(cpu: number, request: JudgeRequest, program: DriverProgram): Promise<JudgeResult> {
        const workspace = await this.runner.createWorkspace()
        try {
            await this.runner.writeFiles(workspace.box, program.files)
            const compiled = await this.runner.compile(workspace, request.language.image_ref, program.compileCmd, cpu)
            if(!compiled.ok){
                return { verdict: Verdict.CE, compileLog: compiled.log, cases: [], maxTimeMs: 0, maxMemoryKb: 0 }
            }

            await this.runner.writeFiles(workspace.tests, Object.fromEntries(
                request.cases.map((testCase, index) => [this.runner.caseName(index) + '.in', testCase.input]),
            ))

            let judged = 0
            const raw = await this.runner.runCases(workspace, {
                image: request.language.image_ref,
                runCmd: program.runCmd,
                cpu,
                timeLimitMs: request.timeLimitMs,
                memoryLimitMb: request.memoryLimitMb,
                caseCount: request.cases.length,
                onCase: () => request.onProgress?.(++judged, request.cases.length),
            })

            const cases: JudgeCaseResult[] = []
            for(const result of raw){
                cases.push(this.evaluateCase(request, result, await this.runner.readResult(workspace, result.index)))
            }

            const failed = cases.find((result) => result.verdict !== Verdict.AC)
            if(!failed && cases.length !== request.cases.length){
                throw new JudgeInfrastructureError('only ' + cases.length + ' of ' + request.cases.length + ' cases ran')
            }

            return {
                verdict: failed?.verdict ?? Verdict.AC,
                compileLog: compiled.log || null,
                cases,
                maxTimeMs: Math.max(0, ...cases.map((result) => result.cpuMs)),
                maxMemoryKb: Math.max(0, ...cases.map((result) => result.memoryKb)),
            }
        } finally {
            await this.runner.removeWorkspace(workspace)
        }
    }

    // Corre el checker sobre los casos que terminaron bien (con salida del tipo correcto), todos
    // en un contenedor, en el mismo núcleo
    private async applyChecker(cpu: number, request: JudgeRequest, result: JudgeResult): Promise<JudgeResult> {
        const byOrdinal = new Map(request.cases.map((testCase) => [testCase.ordinal, testCase]))
        const pending = result.cases.filter((testCase) =>
            testCase.verdict === Verdict.AC && testCase.output !== null && byOrdinal.get(testCase.ordinal)?.expected != null)
        if(pending.length === 0) return result
        if(!request.checker) throw new CheckerError('compareMode is checker but there is no checker')

        const checkerRequest: JudgeRequest = {
            language: request.checker.language,
            signature: checkerSignature(request.signature),
            source: request.checker.source,
            cases: pending.map((testCase) => {
                const original = byOrdinal.get(testCase.ordinal)!
                return { ordinal: testCase.ordinal, input: checkerInput(original.input, original.expected!, testCase.output!), expected: null }
            }),
            timeLimitMs: CHECKER_TIME_LIMIT_MS,
            memoryLimitMb: CHECKER_MEMORY_MB,
            compareMode: CompareMode.EXACT,
            floatTolerance: null,
        }
        const checked = await this.execute(cpu, checkerRequest, buildProgram(checkerRequest.language.code, {
            signature: checkerRequest.signature,
            source: checkerRequest.source,
            flags: checkerRequest.language.flags,
        }))

        if(checked.verdict === Verdict.CE) throw new CheckerError('the checker does not compile:\n' + (checked.compileLog ?? ''))
        const failed = checked.cases.find((testCase) => testCase.verdict !== Verdict.AC)
        if(failed){
            throw new CheckerError('the checker got ' + failed.verdict + ' on case #' + failed.ordinal + (failed.message ? ': ' + failed.message : ''))
        }

        const decisions = new Map(checked.cases.map((testCase) => [testCase.ordinal, testCase.output === 'true']))
        const cases = result.cases.map((testCase) => {
            if(!decisions.has(testCase.ordinal) || decisions.get(testCase.ordinal)) return testCase
            return { ...testCase, verdict: Verdict.WA as CaseVerdict, message: 'rejected by the checker' }
        })
        return { ...result, cases, verdict: cases.find((testCase) => testCase.verdict !== Verdict.AC)?.verdict ?? Verdict.AC }
    }

    private evaluateCase(request: JudgeRequest, raw: RawCaseResult, resultText: string | null): JudgeCaseResult {
        const testCase = request.cases[raw.index]
        const base = {
            ordinal: testCase.ordinal,
            cpuMs: raw.cpuMs,
            wallMs: raw.wallMs,
            memoryKb: raw.memoryKb,
            exitCode: raw.exitCode,
            signal: raw.signal,
        }

        if(raw.status !== 'OK'){
            return { ...base, verdict: Verdict[raw.status], output: null, message: raw.stderr }
        }
        if(resultText === null){
            return { ...base, verdict: Verdict.WA, output: null, message: 'the program ended without returning a result' }
        }

        const normalized = normalizeOutput(request.signature.returns, resultText)
        if(!normalized.ok){
            return { ...base, verdict: Verdict.WA, output: null, message: normalized.message }
        }

        // Con checker, lo decide el checker después (applyChecker)
        const accepted = testCase.expected === null || request.compareMode === CompareMode.CHECKER || outputsMatch(
            request.signature.returns,
            normalized.canonical,
            testCase.expected,
            request.compareMode,
            request.floatTolerance,
        )
        return { ...base, verdict: accepted ? Verdict.AC : Verdict.WA, output: normalized.canonical, message: null }
    }
}
