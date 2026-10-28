import { Injectable } from '@nestjs/common'
import { RealtimeGateway } from './realtime.gateway.js'
import { publicRoom, staffRoom, teamRoom } from './rooms.js'

// Envía eventos a las salas del gateway. Los demás módulos usan esto, no el gateway directo
@Injectable()
export class RealtimeService {

    constructor(private readonly gateway: RealtimeGateway) {}

    toTeam(teamId: number, event: string, payload: unknown): void {
        this.gateway.server?.to(teamRoom(teamId)).emit(event, payload)
    }

    toStaff(editionId: number, event: string, payload: unknown): void {
        this.gateway.server?.to(staffRoom(editionId)).emit(event, payload)
    }

    // Equipos de la edición, proyector y staff
    toPublic(editionId: number, event: string, payload: unknown): void {
        this.gateway.server?.to(publicRoom(editionId)).emit(event, payload)
    }
}
