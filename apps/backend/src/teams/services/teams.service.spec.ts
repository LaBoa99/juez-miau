import { describe, expect, it, vi } from 'vitest'
import { TeamsService } from './teams.service.js'
import { Room } from '../../editions/entities/room.entity.js'

type FakeRoom = { id: number, categories: { id: number }[] }

// Equipo creado sin salón: el único de la edición; si hay varios, el de su categoría con menos equipos
function serviceWithRooms(rooms: FakeRoom[], teamsPerRoom: Record<number, number> = {}) {
    const teamRepository = { create: () => ({}), save: vi.fn() }
    const passwordService = { generatePassword: () => 'pw', encryptPassword: async () => 'enc', hashPassword: async () => 'hash' }
    const find = vi.fn(async () => rooms)
    const counts = Object.entries(teamsPerRoom).map(([room_id, n]) => ({ room_id, n: String(n) }))
    const queryBuilder = { select: () => queryBuilder, addSelect: () => queryBuilder, where: () => queryBuilder, groupBy: () => queryBuilder, getRawMany: async () => counts }
    const getRepository = (entity: unknown) => entity === Room ? { find } : { createQueryBuilder: () => queryBuilder }
    const dataSource = { manager: { getRepository } }
    const service = new TeamsService(teamRepository as any, {} as any, passwordService as any, {} as any, dataSource as any)
    return { service, find }
}

// El equipo es de la categoría 7
const roomOf = async (service: TeamsService) =>
    (await service.create({ id: 1 } as any, { id: 7 } as any, null, { name: 'Gatos', category_id: 7, members: [] }, { username: 'gatos' })).team.room?.id ?? null

describe('TeamsService.create sin salón', () => {
    it('toma el único salón de la edición aunque no tenga su categoría', async () => {
        const { service, find } = serviceWithRooms([{ id: 3, categories: [] }])
        expect(await roomOf(service)).toBe(3)
        expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: { edition_id: 1 } }))
    })

    it('queda sin salón si ninguno de varios tiene su categoría', async () => {
        const { service } = serviceWithRooms([{ id: 3, categories: [{ id: 8 }] }, { id: 4, categories: [] }])
        expect(await roomOf(service)).toBeNull()
    })

    it('va al único salón que tiene su categoría', async () => {
        const { service } = serviceWithRooms([{ id: 3, categories: [{ id: 8 }] }, { id: 4, categories: [{ id: 7 }] }])
        expect(await roomOf(service)).toBe(4)
    })

    it('reparte parejo: el salón de su categoría con menos equipos; empate, el primero', async () => {
        const rooms = [{ id: 3, categories: [{ id: 7 }] }, { id: 4, categories: [{ id: 7 }] }, { id: 5, categories: [{ id: 7 }] }]
        expect(await roomOf(serviceWithRooms(rooms, { 3: 5, 4: 2, 5: 9 }).service)).toBe(4)
        expect(await roomOf(serviceWithRooms(rooms, { 3: 2, 5: 2 }).service)).toBe(4)
        expect(await roomOf(serviceWithRooms(rooms).service)).toBe(3)
    })
})
