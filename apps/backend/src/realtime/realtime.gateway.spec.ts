import { describe, expect, it, vi } from 'vitest'
import { AccessTokenType } from '../auth/factories/access-token-payload.factory.js'
import { TeamSessionsService } from '../teams/services/team-sessions.service.js'
import { RealtimeGateway } from './realtime.gateway.js'
import { teamRoom } from './rooms.js'

function socket(sid: string) {
    return { data: { user: { sub: 7, type: AccessTokenType.TEAM, sid } }, disconnect: vi.fn() }
}

describe('RealtimeGateway: sesiones de equipo', () => {
    it('al reemplazar la sesión desconecta solo los sockets de la sesión vieja', async () => {
        const sessions = new TeamSessionsService(undefined as never)
        const gateway = new RealtimeGateway(undefined as never, sessions, undefined as never, undefined as never)
        const old = socket('vieja')
        const current = socket('nueva')
        const fetchSockets = vi.fn().mockResolvedValue([old, current])
        const into = vi.fn().mockReturnValue({ fetchSockets })
        gateway.server = { in: into } as never

        await gateway.closeStaleTeamSockets({ teamId: 7, activeSessionId: 'nueva' })

        expect(into).toHaveBeenCalledWith(teamRoom(7))
        expect(old.disconnect).toHaveBeenCalledWith(true)
        expect(current.disconnect).not.toHaveBeenCalled()
    })

    it('al cerrar la sesión desconecta todos los sockets del equipo', async () => {
        const sessions = new TeamSessionsService(undefined as never)
        const gateway = new RealtimeGateway(undefined as never, sessions, undefined as never, undefined as never)
        const one = socket('a')
        gateway.server = { in: () => ({ fetchSockets: async () => [one] }) } as never

        sessions.changes.next({ teamId: 7, activeSessionId: null })
        await vi.waitFor(() => expect(one.disconnect).toHaveBeenCalledWith(true))
    })
})
