import { Inject, Injectable } from '@nestjs/common'
import { CompareMode, Verdict, type IProblemSignature } from '@concurso/shared-types'
import { Language } from '../languages/entities/language.entity.js'
import { buildProgram } from './drivers/index.js'
import { normalizeOutput, outputsMatch } from './compare.js'
import { CpuPool } from './cpu-pool.js'
import { DockerRunnerService, JudgeInfrastructureError, type RawCaseResult } from './docker-runner.service.js'
import { CPU_POOL } from './judge.constants.js'

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
        return request.exclusive ? this.pool.useExclusive(run) : this.pool.use(run)
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

        const accepted = testCase.expected === null || outputsMatch(
            request.signature.returns,
            normalized.canonical,
            testCase.expected,
            request.compareMode,
            request.floatTolerance,
        )
        return { ...base, verdict: accepted ? Verdict.AC : Verdict.WA, output: normalized.canonical, message: null }
    }
}
