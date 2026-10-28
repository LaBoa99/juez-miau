import { spawn } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

// Ejecuta programas en contenedores de un solo uso, como scripts/judge-bench/bench.mjs:
// compilación y ejecución van en contenedores separados para no contar la compilación, y la
// ejecución corre todos los casos dentro de un mismo contenedor, uno tras otro, con /judge/runner
// midiendo tiempo de CPU y memoria de cada uno

export interface Workspace {
    root: string
    box: string
    tests: string
    out: string
}

export interface CompileResult {
    ok: boolean
    log: string
}

export type RunnerStatus = 'OK' | 'TLE' | 'MLE' | 'RE'

export interface RawCaseResult {
    // Posición del caso (0, 1, ...) en el orden en que se escribieron
    index: number
    status: RunnerStatus
    cpuMs: number
    wallMs: number
    memoryKb: number
    exitCode: number
    signal: number
    // stderr del programa (los últimos bytes), solo si el caso falló
    stderr: string | null
}

export interface RunOptions {
    image: string
    runCmd: string
    cpu: number
    timeLimitMs: number
    memoryLimitMb: number
    caseCount: number
    onCase?: (result: RawCaseResult) => void
}

// Error del sistema (Docker caído, imagen faltante...): no es culpa del programa, el trabajo se reintenta
export class JudgeInfrastructureError extends Error {}

// Tope para el archivo de resultado y para stderr de cada caso (RLIMIT_FSIZE en el runner)
export const MAX_RESULT_BYTES = 8 * 1024 * 1024

const COMPILE_MEMORY_MB = 1024
const COMPILE_TIMEOUT_MS = 60_000
const MAX_CAPTURED_OUTPUT = 64 * 1024
const MAX_COMPILE_LOG = 8 * 1024

const DOCKER_ENV: Record<string, string> = {
    HOME: '/tmp',
    PYTHONDONTWRITEBYTECODE: '1',
    DOTNET_CLI_HOME: '/tmp',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    // Sin esto .NET crea un archivo de memoria compartida > 1 MB y el límite de salida lo mata (SIGXFSZ)
    DOTNET_EnableWriteXorExecute: '0',
}

// Java, .NET y Node abortan por su cuenta al llenar el heap, antes que el OOM killer del cgroup
const RUN_SCRIPT = `
for f in /tests/*.in; do
  i=\${f##*/}; i=\${i%.in}
  rm -f /tmp/result.json /tmp/err
  r=$(/judge/runner "$TL" "$MAXOUT" "$f" /dev/null -- sh -c "exec $RUN_CMD 2>/tmp/err")
  if [ "\${r#status=RE}" != "$r" ] && grep -qE 'OutOfMemoryError|Out of memory|OutOfMemoryException|heap out of memory' /tmp/err 2>/dev/null; then
    r="status=MLE\${r#status=RE}"
  fi
  if [ "\${r#status=OK}" != "$r" ] && [ -f /tmp/result.json ]; then
    cp /tmp/result.json "/out/$i.json"
  fi
  echo "CASE $i $r"
  case "$r" in
    status=OK*) ;;
    *) echo "__ERR_BEGIN"; tail -c 2048 /tmp/err 2>/dev/null; echo; echo "__ERR_END"; break ;;
  esac
done
echo "__DONE"
`

const CASE_LINE = /^CASE (\d+) status=(OK|TLE|MLE|RE) cpu_ms=(\d+) wall_ms=(\d+) rss_kb=(\d+) exit=(-?\d+) sig=(\d+)$/

@Injectable()
export class DockerRunnerService implements OnModuleInit {
    private readonly logger = new Logger(DockerRunnerService.name)
    private readonly workRoot: string
    private runnerPath = ''
    private sequence = 0

    constructor(private readonly config: ConfigService) {
        // Debe ser la misma ruta en el host y en el contenedor del worker (ver deploy/docker-compose.yml):
        // los contenedores de los envíos los crea el Docker del host
        this.workRoot = config.get<string>('DOCKER_TMP_DIR') || join(tmpdir(), 'concurso-judge')
    }

    async onModuleInit(): Promise<void> {
        await mkdir(this.workRoot, { recursive: true })
        this.runnerPath = await this.prepareRunner()
    }

    async createWorkspace(): Promise<Workspace> {
        const root = await mkdtemp(join(this.workRoot, 'job-'))
        const workspace = { root, box: join(root, 'box'), tests: join(root, 'tests'), out: join(root, 'out') }
        for(const dir of [workspace.box, workspace.tests, workspace.out]){
            await mkdir(dir)
            // El contenedor corre con el mismo uid, pero con Docker rootless el uid cambia
            await chmod(dir, 0o777)
        }
        return workspace
    }

    async removeWorkspace(workspace: Workspace): Promise<void> {
        await rm(workspace.root, { recursive: true, force: true }).catch((error: unknown) => {
            this.logger.warn('could not remove ' + workspace.root + ': ' + String(error))
        })
    }

    async writeFiles(dir: string, files: Record<string, string>): Promise<void> {
        await Promise.all(Object.entries(files).map(([name, content]) => writeFile(join(dir, name), content)))
    }

    // Nombre del archivo de cada caso: 000.in, 001.in... (el glob del script los recorre en orden)
    caseName(index: number): string {
        return String(index).padStart(3, '0')
    }

    async readResult(workspace: Workspace, index: number): Promise<string | null> {
        try {
            return await readFile(join(workspace.out, this.caseName(index) + '.json'), 'utf8')
        } catch {
            return null
        }
    }

    // Directorio de trabajo con escritura y memoria holgada: no cuenta para el participante
    async compile(workspace: Workspace, image: string, compileCmd: string, cpu: number): Promise<CompileResult> {
        const name = this.containerName('c')
        const result = await this.run('docker', [
            ...this.dockerArgs({ name, cpu, memoryMb: COMPILE_MEMORY_MB, image, mounts: [workspace.box + ':/box'] }),
            'sh', '-c', compileCmd,
        ], { timeoutMs: COMPILE_TIMEOUT_MS, container: name })

        if(result.timedOut){
            return { ok: false, log: 'compilation timed out after ' + COMPILE_TIMEOUT_MS / 1000 + ' s' }
        }
        // 125: falló `docker run`; 126/127: el comando del compilador no existe en la imagen
        if(result.code !== null && result.code >= 125){
            throw new JudgeInfrastructureError('could not run the compiler (exit ' + result.code + '): ' + result.output.slice(-2000))
        }
        return { ok: result.code === 0, log: result.output.slice(0, MAX_COMPILE_LOG) }
    }

    // Todo en solo lectura salvo /out (resultados) y /tmp (tmpfs con tope)
    async runCases(workspace: Workspace, options: RunOptions): Promise<RawCaseResult[]> {
        const name = this.containerName('r')
        const results: RawCaseResult[] = []
        let pendingError: RawCaseResult | null = null
        let errorLines: string[] | null = null

        const onLine = (line: string) => {
            if(errorLines !== null){
                if(line === '__ERR_END'){
                    if(pendingError) pendingError.stderr = errorLines.join('\n').trim() || null
                    errorLines = null
                } else {
                    errorLines.push(line)
                }
                return
            }
            if(line === '__ERR_BEGIN'){
                errorLines = []
                return
            }
            const match = CASE_LINE.exec(line)
            if(!match) return
            const result: RawCaseResult = {
                index: Number(match[1]),
                status: match[2] as RunnerStatus,
                cpuMs: Number(match[3]),
                wallMs: Number(match[4]),
                memoryKb: Number(match[5]),
                exitCode: Number(match[6]),
                signal: Number(match[7]),
                stderr: null,
            }
            results.push(result)
            if(result.status !== 'OK') pendingError = result
            options.onCase?.(result)
        }

        const timeoutMs = options.caseCount * (options.timeLimitMs * 2 + 1000) + 15_000
        const result = await this.run('docker', [
            ...this.dockerArgs({
                name,
                cpu: options.cpu,
                memoryMb: options.memoryLimitMb,
                image: options.image,
                readOnly: true,
                mounts: [
                    workspace.box + ':/box:ro',
                    workspace.tests + ':/tests:ro',
                    workspace.out + ':/out',
                    this.runnerPath + ':/judge/runner:ro',
                ],
                env: { TL: String(options.timeLimitMs), MAXOUT: String(MAX_RESULT_BYTES), RUN_CMD: options.runCmd },
            }),
            'sh', '-c', RUN_SCRIPT,
        ], { timeoutMs, container: name, onLine })

        if(result.timedOut || !result.output.includes('__DONE')){
            throw new JudgeInfrastructureError(
                'the run container ' + (result.timedOut ? 'timed out' : 'failed (exit ' + result.code + ')') + ': ' + result.output.slice(-2000),
            )
        }
        return results
    }

    private containerName(kind: 'c' | 'r'): string {
        return 'judge-' + process.pid + '-' + (++this.sequence) + '-' + kind
    }

    private dockerArgs(options: {
        name: string,
        cpu: number,
        memoryMb: number,
        image: string,
        mounts: string[],
        readOnly?: boolean,
        env?: Record<string, string>,
    }): string[] {
        const args = [
            'run', '--rm', '--name', options.name,
            '--network', 'none',
            '--tmpfs', '/tmp:size=64m,exec',
            '--user', process.getuid!() + ':' + process.getgid!(),
            '--cpuset-cpus', String(options.cpu), '--cpus', '1',
            '--pids-limit', '256',
            '--memory', options.memoryMb + 'm', '--memory-swap', options.memoryMb + 'm',
            '-w', '/box',
        ]
        // La compilación necesita escribir en /box; la ejecución no
        if(options.readOnly) args.push('--read-only')
        for(const [key, value] of Object.entries({ ...DOCKER_ENV, ...options.env })) args.push('-e', key + '=' + value)
        for(const mount of options.mounts) args.push('-v', mount)
        args.push(options.image)
        return args
    }

    private run(
        command: string,
        args: string[],
        options: { timeoutMs: number, container?: string, onLine?: (line: string) => void },
    ): Promise<{ code: number | null, output: string, timedOut: boolean }> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args)
            let output = ''
            let pending = ''
            let timedOut = false

            const collect = (chunk: Buffer) => {
                const text = chunk.toString('utf8')
                if(output.length < MAX_CAPTURED_OUTPUT) output += text.slice(0, MAX_CAPTURED_OUTPUT - output.length)
                if(!options.onLine) return
                pending += text
                const lines = pending.split('\n')
                pending = lines.pop() ?? ''
                lines.forEach((line) => options.onLine!(line))
            }
            child.stdout.on('data', collect)
            child.stderr.on('data', collect)

            const timer = setTimeout(() => {
                timedOut = true
                if(options.container) spawn('docker', ['kill', options.container]).on('error', () => undefined)
                child.kill('SIGKILL')
            }, options.timeoutMs)

            child.on('error', (error) => {
                clearTimeout(timer)
                reject(new JudgeInfrastructureError('could not start ' + command + ': ' + error.message))
            })
            child.on('close', (code) => {
                clearTimeout(timer)
                if(pending && options.onLine) options.onLine(pending)
                resolve({ code, output, timedOut })
            })
        })
    }

    // El binario tiene que estar en una ruta del host para montarlo en los contenedores.
    // En la imagen viene compilado (JUDGE_RUNNER_BIN) y se copia; en desarrollo se compila con gcc:14
    private async prepareRunner(): Promise<string> {
        const target = join(this.workRoot, 'judge-runner')
        const prebuilt = this.config.get<string>('JUDGE_RUNNER_BIN')
        if(prebuilt){
            await copyFile(prebuilt, target)
            await chmod(target, 0o755)
            return target
        }

        const source = this.config.get<string>('JUDGE_RUNNER_SRC') || join(process.cwd(), 'judge', 'runner.c')
        const [sourceStat, targetStat] = await Promise.all([stat(source), stat(target).catch(() => null)])
        if(targetStat && targetStat.mtimeMs >= sourceStat.mtimeMs) return target

        this.logger.log('compiling ' + source)
        const temporary = target + '.' + process.pid
        const result = await this.run('docker', [
            'run', '--rm', '--user', process.getuid!() + ':' + process.getgid!(),
            '-v', dirname(source) + ':/src:ro', '-v', this.workRoot + ':/w',
            'gcc:14', 'gcc', '-O2', '-static', '/src/' + basename(source), '-o', '/w/' + temporary.slice(this.workRoot.length + 1),
        ], { timeoutMs: 120_000 })
        if(result.code !== 0){
            throw new JudgeInfrastructureError('could not compile the runner: ' + result.output)
        }
        await rename(temporary, target)
        return target
    }
}
