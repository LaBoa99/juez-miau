import { afterEach, describe, expect, it } from 'vitest'
import type { EntityManager } from 'typeorm'
import type { SeedContext } from '../seeder.interface.js'
import { languageSeeder } from './language.seeder.js'

type Row = { id: string, code: string, image_ref: string, active: boolean }

// EntityManager mínimo en memoria: solo lo que usa el seeder
function fakeManager(rows: Row[]) {
    const manager = {
        findOneBy: async (_: unknown, where: { code: string }) => rows.find((row) => row.code === where.code) ?? null,
        insert: async (_: unknown, row: Omit<Row, 'id' | 'active'>) => { rows.push({ id: String(rows.length + 1), active: true, ...row }) },
        update: async (_: unknown, where: { id: string }, changes: Partial<Row>) => {
            Object.assign(rows.find((row) => row.id === where.id)!, changes)
        },
    }
    return { manager: manager as unknown as EntityManager } as SeedContext
}

describe('languageSeeder', () => {
    afterEach(() => { delete process.env.JUDGE_IMAGE_PYTHON })

    it('crea los 7 lenguajes base una sola vez', async () => {
        const rows: Row[] = []
        await languageSeeder.run(fakeManager(rows))
        await languageSeeder.run(fakeManager(rows))
        expect(rows).toHaveLength(7)
        expect(rows.find((row) => row.code === 'python')?.image_ref).toBe('python:3.12-slim')
    })

    it('sincroniza la imagen con JUDGE_IMAGE_* sin tocar active', async () => {
        const rows: Row[] = []
        await languageSeeder.run(fakeManager(rows))
        const python = rows.find((row) => row.code === 'python')!
        python.active = false

        process.env.JUDGE_IMAGE_PYTHON = 'python:3.13-slim'
        await languageSeeder.run(fakeManager(rows))

        expect(python.image_ref).toBe('python:3.13-slim')
        expect(python.active).toBe(false)
        expect(rows.find((row) => row.code === 'c')?.image_ref).toBe('gcc:14')
    })
})
