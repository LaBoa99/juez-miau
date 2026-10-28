import { availableParallelism } from 'node:os'

interface Waiter {
    exclusive: boolean
    resolve: (cpus: number[]) => void
}

// Un contenedor a la vez por núcleo (judge-evaluation.md §2): si dos comparten núcleo, cada uno
// corre a la mitad y un envío correcto puede dar TLE. Las colas comparten este pool, así que un
// build y un envío nunca usan el mismo núcleo al mismo tiempo.
// Fila FIFO: quien espera el pool entero no se queda esperando para siempre detrás de los que
// llegan después
export class CpuPool {
    private readonly free: number[]
    private readonly waiting: Waiter[] = []

    constructor(readonly cpus: readonly number[]) {
        if(cpus.length === 0) throw new Error('the CPU pool needs at least one CPU')
        this.free = [...cpus]
    }

    get size(): number {
        return this.cpus.length
    }

    async use<T>(task: (cpu: number) => Promise<T>): Promise<T> {
        const [cpu] = await this.acquire(false)
        try {
            return await task(cpu)
        } finally {
            this.release([cpu])
        }
    }

    // Reserva todos los núcleos y corre en uno: nadie más usa caché L3 ni ancho de banda de
    // memoria mientras tanto. Para confirmar un TLE (server-specs.md#contención-de-memoria)
    async useExclusive<T>(task: (cpu: number) => Promise<T>): Promise<T> {
        const cpus = await this.acquire(true)
        try {
            return await task(cpus[0])
        } finally {
            this.release(cpus)
        }
    }

    private acquire(exclusive: boolean): Promise<number[]> {
        return new Promise((resolve) => {
            this.waiting.push({ exclusive, resolve })
            this.dispatch()
        })
    }

    private release(cpus: number[]): void {
        this.free.push(...cpus)
        this.dispatch()
    }

    private dispatch(): void {
        while(this.waiting.length > 0){
            const next = this.waiting[0]
            if(next.exclusive){
                if(this.free.length < this.cpus.length) return
                this.waiting.shift()
                next.resolve(this.free.splice(0))
            } else {
                if(this.free.length === 0) return
                this.waiting.shift()
                next.resolve([this.free.shift()!])
            }
        }
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
