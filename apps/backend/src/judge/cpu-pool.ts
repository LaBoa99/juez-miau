import { availableParallelism } from 'node:os'

// Un contenedor a la vez por núcleo (judge-evaluation.md §2): si dos comparten núcleo, cada uno
// corre a la mitad y un envío correcto puede dar TLE. Las colas comparten este pool, así que un
// build y un envío nunca usan el mismo núcleo al mismo tiempo
export class CpuPool {
    private readonly free: number[]
    private readonly waiting: ((cpu: number) => void)[] = []

    constructor(readonly cpus: readonly number[]) {
        if(cpus.length === 0) throw new Error('the CPU pool needs at least one CPU')
        this.free = [...cpus]
    }

    get size(): number {
        return this.cpus.length
    }

    async use<T>(task: (cpu: number) => Promise<T>): Promise<T> {
        const cpu = await this.acquire()
        try {
            return await task(cpu)
        } finally {
            this.release(cpu)
        }
    }

    private acquire(): Promise<number> {
        const cpu = this.free.shift()
        if(cpu !== undefined) return Promise.resolve(cpu)
        return new Promise((resolve) => this.waiting.push(resolve))
    }

    private release(cpu: number): void {
        const next = this.waiting.shift()
        if(next) next(cpu)
        else this.free.push(cpu)
    }
}

// JUDGE_CPUS="2,3,4": CPUs lógicas para juzgar, una por núcleo físico (ver `lscpu -e`).
// Sin definir, se usan las últimas WORKER_CONCURRENCY CPUs (por defecto una): suficiente para
// desarrollo, pero en producción conviene fijarlas para dejar libres las de la API y Postgres
export function parseJudgeCpus(value: string | undefined, concurrency: number): number[] {
    if(value?.trim()){
        const cpus = value.split(',').map((part) => Number(part.trim()))
        if(cpus.some((cpu) => !Number.isInteger(cpu) || cpu < 0)){
            throw new Error('JUDGE_CPUS must be a comma-separated list of CPU numbers, got "' + value + '"')
        }
        return [...new Set(cpus)]
    }

    const total = availableParallelism()
    const count = Math.max(1, Math.min(concurrency, total))
    return Array.from({ length: count }, (_, index) => total - count + index)
}
