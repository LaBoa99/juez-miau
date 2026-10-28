import { CpuPool, parseJudgeCpus } from './cpu-pool.js'

describe('CpuPool', () => {
    it('nunca da el mismo núcleo a dos tareas a la vez', async () => {
        const pool = new CpuPool([2, 3])
        const busy = new Set<number>()
        let maxBusy = 0

        await Promise.all(Array.from({ length: 6 }, () => pool.use(async (cpu) => {
            expect(busy.has(cpu)).toBe(false)
            busy.add(cpu)
            maxBusy = Math.max(maxBusy, busy.size)
            await new Promise((resolve) => setTimeout(resolve, 5))
            busy.delete(cpu)
        })))

        expect(maxBusy).toBe(2)
    })

    it('libera el núcleo aunque la tarea falle', async () => {
        const pool = new CpuPool([0])
        await expect(pool.use(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
        await expect(pool.use((cpu) => Promise.resolve(cpu))).resolves.toBe(0)
    })
})

describe('parseJudgeCpus', () => {
    it('lee la lista de JUDGE_CPUS', () => {
        expect(parseJudgeCpus('2, 3,3,5', 1)).toEqual([2, 3, 5])
        expect(() => parseJudgeCpus('2,a', 1)).toThrow(/JUDGE_CPUS/)
    })

    it('sin lista usa las últimas CPUs', () => {
        const cpus = parseJudgeCpus(undefined, 1)
        expect(cpus).toHaveLength(1)
        expect(cpus[0]).toBeGreaterThanOrEqual(0)
    })
})
