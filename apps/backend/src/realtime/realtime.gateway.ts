import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets'
import { DataSource } from 'typeorm'
import type { Namespace, Socket } from 'socket.io'
import { ANY_EDITION_ROLE } from '../auth/decorators/access.decorators.js'
import { AccessTokenType, type AccessTokenPayload } from '../auth/factories/access-token-payload.factory.js'
import { EditionStaffService } from '../editions/services/edition-staff.service.js'
import { Edition } from '../editions/entities/edition.entity.js'
import { TeamSessionsService, type TeamSessionChange } from '../teams/services/team-sessions.service.js'
import { Team } from '../teams/entities/team.entity.js'
import { SOCKET_EVENTS, type IJoinEdition } from '@concurso/shared-types'
import { publicRoom, staffRoom, teamRoom } from './rooms.js'

interface SocketData {
    user?: AccessTokenPayload
}

type ClientSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>

type Ack = { ok: true } | { ok: false, error: string }

// Namespace /ws. El token va en el handshake: io(url + '/ws', { auth: { token } }).
// - Equipo: entra solo a su sala y a la pública de su edición
// - Staff: pide `edition:join` por cada edición que quiera seguir (se revisa su rol)
// - Sin token (proyector): pide `public:join`
@WebSocketGateway({ namespace: '/ws' })
export class RealtimeGateway implements OnGatewayConnection {
    private readonly logger = new Logger(RealtimeGateway.name)

    @WebSocketServer()
    declare server: Namespace

    constructor(
        private readonly jwtService: JwtService,
        private readonly teamSessionsService: TeamSessionsService,
        private readonly editionStaffService: EditionStaffService,
        private readonly dataSource: DataSource,
    ) {
        // El token del equipo solo se revisa al conectar: al reemplazar o cerrar su sesión
        // se desconectan aquí los sockets que siguen abiertos con la sesión vieja
        this.teamSessionsService.changes.subscribe((change) => {
            this.closeStaleTeamSockets(change).catch((error) => this.logger.warn('could not close team sockets: ' + String(error)))
        })
    }

    async closeStaleTeamSockets({ teamId, activeSessionId }: TeamSessionChange): Promise<void> {
        if(!this.server) return
        const sockets = await this.server.in(teamRoom(teamId)).fetchSockets()
        for(const socket of sockets){
            const user = (socket.data as SocketData).user
            if(user?.type === AccessTokenType.TEAM && user.sid !== activeSessionId) socket.disconnect(true)
        }
    }

    async handleConnection(socket: ClientSocket): Promise<void> {
        const token: unknown = socket.handshake.auth?.token
        if(typeof token !== 'string' || !token) return

        try {
            const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token)
            if(payload.type === AccessTokenType.TEAM){
                await this.teamSessionsService.assertActive(payload.sub, payload.sid)
                const team = await this.dataSource.getRepository(Team).findOne({ where: { id: payload.sub }, select: { id: true, edition_id: true } })
                if(!team) throw new Error('team not found')
                await socket.join([teamRoom(team.id), publicRoom(team.edition_id)])
            }
            socket.data.user = payload
        } catch(error) {
            this.logger.debug('rejected socket: ' + String(error))
            socket.disconnect(true)
        }
    }

    @SubscribeMessage(SOCKET_EVENTS.JOIN_EDITION)
    async joinEdition(@ConnectedSocket() socket: ClientSocket, @MessageBody() body: IJoinEdition): Promise<Ack> {
        const user = socket.data.user
        if(user?.type !== AccessTokenType.STAFF) return { ok: false, error: 'staff token required' }

        const editionId = Number(body?.editionId)
        if(!Number.isInteger(editionId)) return { ok: false, error: 'editionId must be an integer' }

        try {
            await this.editionStaffService.assertRole(user.sub, editionId, ANY_EDITION_ROLE)
        } catch {
            return { ok: false, error: 'no role in edition #' + editionId }
        }
        await socket.join([staffRoom(editionId), publicRoom(editionId)])
        return { ok: true }
    }

    @SubscribeMessage(SOCKET_EVENTS.JOIN_PUBLIC)
    async joinPublic(@ConnectedSocket() socket: ClientSocket, @MessageBody() body: IJoinEdition): Promise<Ack> {
        const editionId = Number(body?.editionId)
        if(!Number.isInteger(editionId)) return { ok: false, error: 'editionId must be an integer' }
        if(!await this.dataSource.getRepository(Edition).existsBy({ id: editionId })){
            return { ok: false, error: 'edition not found #' + editionId }
        }
        await socket.join(publicRoom(editionId))
        return { ok: true }
    }
}
