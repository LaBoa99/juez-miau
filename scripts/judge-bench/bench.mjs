#!/usr/bin/env node
// Prueba de carga del juez: simula al worker (cola + un contenedor a la vez por núcleo) sin
// levantar el backend. Mide tiempos, memoria por caso y memoria del host durante una ráfaga.
//
// Problema de prueba: contar los primos <= N. Cada lenguaje tiene una solución por veredicto
// esperado (solutions/<lenguaje>/<ac|wa|tle|mle|ce>.<ext>), así también valida que los
// comandos del seeder y los límites den el veredicto correcto.
//
// uso: node scripts/judge-bench/bench.mjs [--subs 60] [--cpus 1,2,3,4,5] [--mem 256] [--tl 1000] [--seed 7]
//   --subs  envíos en la ráfaga (los primeros 30 cubren cada lenguaje × veredicto)
//   --cpus  CPUs lógicas para juzgar, una por núcleo físico (ver `lscpu -e`)
//   --mem   límite de memoria del programa en MB
//   --tl    límite de tiempo base en ms (se multiplica por el time_multiplier del lenguaje)
//   --only  solo estos veredictos esperados, p. ej. --only ac
import { spawn } from 'node:child_process'
import { copyFileSync, chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

const HERE = dirname(new URL(import.meta.url).pathname)

const { values: args } = parseArgs({
    options: {
        subs: { type: 'string', default: '60' },
        cpus: { type: 'string', default: '1,2,3,4,5' },
        mem: { type: 'string', default: '256' },
        tl: { type: 'string', default: '1000' },
        seed: { type: 'string', default: '7' },
        only: { type: 'string' },
    },
})
const SUBS = Number(args.subs)
const CPUS = args.cpus.split(',').map(Number)
const MEM_MB = Number(args.mem)
const BASE_TL = Number(args.tl)

// Mismos valores que src/database/seeds/base/language.seeder.ts (compile_cmd + flags)
const LANGS = {
    c: { ext: 'c', image: 'gcc:14', compile: 'gcc Main.c -o main -O2 -std=gnu17 -lm', run: './main', mult: 1 },
    cpp: { ext: 'cpp', image: 'gcc:14', compile: 'g++ Main.cpp -o main -O2 -std=gnu++20', run: './main', mult: 1 },
    csharp: {
        ext: 'cs', image: 'mcr.microsoft.com/dotnet/sdk:8.0', mult: 2, run: 'dotnet out/Main.dll',
        compile: `printf '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><AssemblyName>Main</AssemblyName></PropertyGroup></Project>' > Main.csproj && dotnet build Main.csproj -c Release -o out --nologo -v q`,
    },
    java: { ext: 'java', image: 'eclipse-temurin:21-jdk', compile: 'javac -encoding UTF-8 Main.java', run: 'java -Xss64m -XX:+UseSerialGC -XX:MaxRAMPercentage=75 Main', mult: 2 },
    javascript: { ext: 'js', image: 'node:24-slim', compile: 'node --check Main.js', run: 'node Main.js', mult: 2 },
    typescript: {
        ext: 'ts', image: 'node:24-slim', mult: 2, run: 'node Main.ts',
        compile: `node --disable-warning=ExperimentalWarning -e "require('node:module').stripTypeScriptTypes(require('node:fs').readFileSync('Main.ts', 'utf8'))"`,
    },
}
const VERDICTS = args.only ? args.only.split(',') : ['ac', 'wa', 'tle', 'mle', 'ce']
// Mezcla de la parte aleatoria de la ráfaga: la mayoría correctos o casi correctos
const WEIGHTS = { ac: 0.4, wa: 0.2, tle: 0.15, mle: 0.1, ce: 0.15 }

// 1000003 es primo: ahí falla la solución WA (cuenta hasta n - 1)
const TEST_NS = [1, 2, 10, 100, 1000, 100000, 1000003, 10000000, 30000000, 50000000]

const DOCKER_ENV = {
    HOME: '/tmp', DOTNET_CLI_HOME: '/tmp', DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    // Sin esto .NET crea un archivo de memoria compartida > 1 MB y el límite de salida lo mata (SIGXFSZ)
    DOTNET_EnableWriteXorExecute: '0',
}

// ---------- utilidades ----------

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
const rand = mulberry32(Number(args.seed))

function run(cmd, argv, { timeoutMs, name } = {}) {
    return new Promise((resolve) => {
        const p = spawn(cmd, argv)
        let out = ''
        p.stdout.on('data', (d) => (out += d))
        p.stderr.on('data', (d) => (out += d))
        const timer = timeoutMs && setTimeout(() => {
            if (name) spawn('docker', ['kill', name])
            p.kill('SIGKILL')
        }, timeoutMs)
        p.on('close', (code) => { clearTimeout(timer); resolve({ code, out }) })
    })
}

const mb = (bytes) => Math.round(bytes / 1048576)
const pct = (xs, p) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0
}
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pad = (v, n) => String(v).padEnd(n)

function countPrimes(n) {
    const c = new Uint8Array(n + 1); let k = 0
    for (let i = 2; i <= n; i++) if (!c[i]) { k++; for (let j = i * i; j <= n; j += i) c[j] = 1 }
    return k
}

// ---------- muestreo de memoria del host ----------

const CGROUP_DIR = '/sys/fs/cgroup/system.slice'
const dockerScopes = () => readdirSync(CGROUP_DIR).filter((d) => d.startsWith('docker-') && d.endsWith('.scope'))
const memAvailable = () => Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024

function startSampler() {
    const baselineScopes = new Set(dockerScopes()) // contenedores que ya corrían (Postgres, Redis, ...)
    const baselineAvail = memAvailable()
    const peak = { hostUsed: 0, containers: 0, running: 0 }
    const timer = setInterval(() => {
        let sum = 0, running = 0
        for (const scope of dockerScopes()) {
            if (baselineScopes.has(scope)) continue
            try {
                sum += Number(readFileSync(join(CGROUP_DIR, scope, 'memory.current'), 'utf8'))
                running++
            } catch { /* el contenedor terminó entre readdir y read */ }
        }
        peak.hostUsed = Math.max(peak.hostUsed, baselineAvail - memAvailable())
        peak.containers = Math.max(peak.containers, sum)
        peak.running = Math.max(peak.running, running)
    }, 200)
    return { peak, stop: () => clearInterval(timer) }
}

// ---------- juez ----------

function dockerArgs({ name, cpu, memMb, image, mounts, env = {} }) {
    const a = ['run', '--rm', '--name', name, '--network', 'none', '--read-only',
        '--tmpfs', '/tmp:size=64m,exec', '--user', `${process.getuid()}:${process.getgid()}`,
        '--cpuset-cpus', String(cpu), '--cpus', '1', '--pids-limit', '256',
        '--memory', `${memMb}m`, '--memory-swap', `${memMb}m`, '-w', '/box']
    for (const [k, v] of Object.entries({ ...DOCKER_ENV, ...env })) a.push('-e', `${k}=${v}`)
    for (const m of mounts) a.push('-v', m)
    a.push(image)
    return a
}

const RUN_SCRIPT = `
for f in /tests/*.in; do
  i=\${f##*/}; i=\${i%.in}
  r=$(/judge/runner "$TL" 1048576 "$f" /tmp/out -- sh -c "exec $RUN_CMD 2>/tmp/err")
  # Java, .NET y Node abortan por su cuenta al llenar el heap, antes que el OOM killer del cgroup
  if [ "\${r#status=RE}" != "$r" ] && grep -qE 'OutOfMemoryError|Out of memory|OutOfMemoryException|heap out of memory' /tmp/err; then
    r="status=MLE\${r#status=RE}"
  fi
  if [ "\${r#status=OK}" != "$r" ] && [ "$(cat /tmp/out)" != "$(cat /tests/$i.ans)" ]; then
    r="status=WA\${r#status=OK}"
  fi
  echo "CASE $i $r"
  case "$r" in status=OK*) ;; *) break ;; esac
done
echo "__PEAK=$(cat /sys/fs/cgroup/memory.peak)"
`

async function judge(sub, cpu, ctx) {
    const lang = LANGS[sub.lang]
    const box = mkdtempSync(join(ctx.work, `sub-${sub.id}-`))
    copyFileSync(join(HERE, 'solutions', sub.lang, `${sub.expected}.${lang.ext}`), join(box, `Main.${lang.ext}`))
    chmodSync(box, 0o777)
    sub.cpu = cpu
    sub.startedAt = performance.now() - ctx.t0

    // Compilación: directorio de trabajo con escritura, memoria holgada (no cuenta para el participante)
    let t = performance.now()
    const cname = `jb-${ctx.runId}-${sub.id}-c`
    const compile = await run('docker', [
        ...dockerArgs({ name: cname, cpu, memMb: 1024, image: lang.image, mounts: [`${box}:/box`] }),
        'sh', '-c', `${lang.compile}\ne=$?; echo __PEAK=$(cat /sys/fs/cgroup/memory.peak); exit $e`,
    ], { timeoutMs: 60000, name: cname })
    sub.compileMs = performance.now() - t
    sub.compilePeak = Number(/__PEAK=(\d+)/.exec(compile.out)?.[1] ?? 0)

    if (compile.code !== 0) {
        sub.verdict = 'ce'
    } else {
        // Ejecución: todo en solo lectura, un contenedor para todos los casos
        const tl = BASE_TL * lang.mult
        const casesTimeout = TEST_NS.length * (tl * 2 + 1000) + 15000
        t = performance.now()
        const rname = `jb-${ctx.runId}-${sub.id}-r`
        const exec = await run('docker', [
            ...dockerArgs({
                name: rname, cpu, memMb: MEM_MB, image: lang.image,
                mounts: [`${box}:/box:ro`, `${ctx.tests}:/tests:ro`, `${ctx.runner}:/judge/runner:ro`],
                env: { TL: String(tl), RUN_CMD: lang.run },
            }),
            'sh', '-c', RUN_SCRIPT,
        ], { timeoutMs: casesTimeout, name: rname })
        sub.runMs = performance.now() - t
        sub.runPeak = Number(/__PEAK=(\d+)/.exec(exec.out)?.[1] ?? 0)
        sub.cases = [...exec.out.matchAll(/CASE (\d+) status=(\w+) cpu_ms=(\d+) wall_ms=(\d+) rss_kb=(\d+) exit=(-?\d+) sig=(\d+)/g)]
            .map(([, i, status, cpuMs, wallMs, rssKb, exit, sig]) => ({
                i: Number(i), status, cpuMs: Number(cpuMs), wallMs: Number(wallMs), rssKb: Number(rssKb), exit: Number(exit), sig: Number(sig),
            }))
        const failed = sub.cases.find((c) => c.status !== 'OK')
        sub.verdict = failed ? failed.status.toLowerCase() : sub.cases.length === TEST_NS.length ? 'ac' : 'error'
        if (sub.verdict === 'error') sub.log = exec.out.slice(-500)
    }
    sub.finishedAt = performance.now() - ctx.t0
}

// ---------- ráfaga ----------

function buildSubmissions() {
    const subs = []
    for (const lang of Object.keys(LANGS)) for (const expected of VERDICTS) subs.push({ lang, expected })
    const langs = Object.keys(LANGS)
    while (subs.length < SUBS) {
        let r = rand() * VERDICTS.reduce((t, v) => t + WEIGHTS[v], 0), expected = VERDICTS[0]
        for (const v of VERDICTS) { if ((r -= WEIGHTS[v]) < 0) { expected = v; break } }
        subs.push({ lang: langs[Math.floor(rand() * langs.length)], expected })
    }
    // Orden aleatorio: en un concurso real llegan mezclados
    for (let i = subs.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1)); [subs[i], subs[j]] = [subs[j], subs[i]]
    }
    return subs.slice(0, SUBS).map((s, id) => ({ id, ...s }))
}

async function prepare() {
    const work = mkdtempSync(join(tmpdir(), 'judge-bench-'))
    const tests = join(work, 'tests')
    mkdirSync(tests)
    TEST_NS.forEach((n, idx) => {
        const i = String(idx + 1).padStart(2, '0')
        writeFileSync(join(tests, `${i}.in`), `${n}\n`)
        writeFileSync(join(tests, `${i}.ans`), `${countPrimes(n)}\n`)
    })

    const build = await run('docker', ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`,
        '-v', `${HERE}:/src:ro`, '-v', `${work}:/w`, 'gcc:14', 'gcc', '-O2', '-static', '/src/runner.c', '-o', '/w/runner'])
    if (build.code !== 0) throw new Error(`no se pudo compilar runner.c:\n${build.out}`)
    return { work, tests, runner: join(work, 'runner') }
}

function report(subs, sampler, totalMs) {
    const line = (s = '') => console.log(s)
    line(`\n=== Ráfaga: ${subs.length} envíos, ${CPUS.length} núcleos (CPUs ${CPUS.join(',')}), memoria ${MEM_MB} MB, TL base ${BASE_TL} ms ===`)
    const latency = subs.map((s) => s.finishedAt / 1000)
    line(`Duración total:        ${(totalMs / 1000).toFixed(1)} s  →  ${(subs.length / (totalMs / 60000)).toFixed(1)} envíos/min`)
    line(`Latencia (cola+juicio) p50 ${pct(latency, 50).toFixed(1)} s · p95 ${pct(latency, 95).toFixed(1)} s · máx ${Math.max(...latency).toFixed(1)} s`)
    line(`Juicio por envío       p50 ${pct(subs.map((s) => (s.finishedAt - s.startedAt) / 1000), 50).toFixed(1)} s · máx ${Math.max(...subs.map((s) => (s.finishedAt - s.startedAt) / 1000)).toFixed(1)} s`)
    line(`RAM del host (pico)    +${mb(sampler.peak.hostUsed)} MB sobre la línea base`)
    line(`Contenedores (pico)    ${mb(sampler.peak.containers)} MB sumados · ${sampler.peak.running} a la vez`)

    line('\n--- Por lenguaje (envíos AC) ---')
    line(`${pad('lenguaje', 11)}${pad('compilar', 18)}${pad('mem compilar', 14)}${pad('ejecutar 10 casos', 19)}${pad('caso mayor cpu/reloj', 22)}${pad('RSS caso mayor', 16)}pico contenedor`)
    for (const lang of Object.keys(LANGS)) {
        const all = subs.filter((s) => s.lang === lang && s.compileMs)
        const ac = subs.filter((s) => s.lang === lang && s.verdict === 'ac')
        const last = ac.map((s) => s.cases.at(-1))
        line(pad(lang, 11)
            + pad(`${(avg(all.filter((s) => s.verdict !== 'ce').map((s) => s.compileMs)) / 1000).toFixed(2)} s (máx ${(Math.max(...all.map((s) => s.compileMs)) / 1000).toFixed(1)})`, 18)
            + pad(`${mb(Math.max(...all.map((s) => s.compilePeak)))} MB`, 14)
            + pad(`${(avg(ac.map((s) => s.runMs)) / 1000).toFixed(2)} s`, 19)
            + pad(`${Math.round(avg(last.map((c) => c.cpuMs)))} / ${Math.round(avg(last.map((c) => c.wallMs)))} ms`, 22)
            + pad(`${Math.round(Math.max(...last.map((c) => c.rssKb)) / 1024)} MB`, 16)
            + `${mb(Math.max(...ac.map((s) => s.runPeak)))} MB`)
    }

    line('\n--- Veredictos: esperado → obtenido ---')
    const bad = subs.filter((s) => s.verdict !== s.expected)
    for (const lang of Object.keys(LANGS)) {
        const cells = VERDICTS.map((v) => {
            const got = [...new Set(subs.filter((s) => s.lang === lang && s.expected === v).map((s) => s.verdict))]
            return `${v}→${got.join('/') || '-'}`
        })
        line(`${pad(lang, 11)}${cells.map((c) => pad(c, 14)).join('')}`)
    }
    if (bad.length) {
        line(`\n${bad.length} envíos con veredicto distinto al esperado. Ejemplos:`)
        const seen = new Set()
        for (const s of bad) {
            const key = `${s.lang}/${s.expected}/${s.verdict}`
            if (seen.has(key)) continue
            seen.add(key)
            const c = s.cases?.find((x) => x.status !== 'OK')
            line(`  ${key}: ${c ? `caso ${c.i} cpu=${c.cpuMs}ms reloj=${c.wallMs}ms rss=${Math.round(c.rssKb / 1024)}MB exit=${c.exit} sig=${c.sig}` : s.log ?? ''}`)
        }
    }
    const tle = subs.filter((s) => s.verdict === 'tle' || s.verdict === 'mle')
    if (tle.length) line(`\nEnvíos TLE/MLE: ${tle.length}, ocuparon ${(avg(tle.map((s) => s.finishedAt - s.startedAt)) / 1000).toFixed(1)} s de núcleo en promedio`)
}

// ---------- main ----------

const ctx = await prepare()
ctx.runId = Date.now().toString(36)
const subs = buildSubmissions()
console.log(`preparado en ${ctx.work}; juzgando ${subs.length} envíos...`)

const sampler = startSampler()
ctx.t0 = performance.now()
const queue = [...subs]
let done = 0
await Promise.all(CPUS.map(async (cpu) => {
    for (let sub = queue.shift(); sub; sub = queue.shift()) {
        await judge(sub, cpu, ctx)
        process.stdout.write(`\r${++done}/${subs.length}`)
    }
}))
const totalMs = performance.now() - ctx.t0
sampler.stop()

report(subs, sampler, totalMs)
writeFileSync(join(ctx.work, 'results.json'), JSON.stringify({ args, sampler: sampler.peak, totalMs, subs }, null, 2))
console.log(`\nDetalle por envío: ${join(ctx.work, 'results.json')}`)
