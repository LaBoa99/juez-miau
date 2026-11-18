import { describe, expect, it, vi } from 'vitest'
import { TeamsService } from './teams.service.js'

// Equipo creado sin salón: hereda el salón solo si su categoría tiene uno solo en la edición
function serviceWithRooms(rooms: { id: number }[]) {
    const teamRepository = { create: () => ({}), save: vi.fn() }
    const passwordService = { generatePassword: () => 'pw', encryptPassword: async () => 'enc', hashPassword: async () => 'hash' }
    const find = vi.fn(async () => rooms)
    const dataSource = { manager: { getRepository: () => ({ find }) } }
    const service = new TeamsService(teamRepository as any, {} as any, passwordService as any, {} as any, dataSource as any)
    return { service, find }
}

const create = (service: TeamsService) =>
    service.create({ id: 1 } as any, { id: 7 } as any, null, { name: 'Gatos', category_id: 7, members: [] }, { username: 'gatos' })

describe('TeamsService.create sin salón', () => {
    it('toma el único salón de su categoría', async () => {
        const { service, find } = serviceWithRooms([{ id: 3 }])
        const { team } = await create(service)
        expect(team.room).toEqual({ id: 3 })
        expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { edition_id: 1, category_id: 7 } }))
    })

    it('queda sin salón si la categoría tiene varios', async () => {
        const { service } = serviceWithRooms([{ id: 3 }, { id: 4 }])
        expect((await create(service)).team.room).toBeNull()
    })
})
