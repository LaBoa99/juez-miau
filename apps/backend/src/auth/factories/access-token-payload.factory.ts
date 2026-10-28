import type { StaffUser } from '../../staff/entities/staff-user.entity.js'
import type { Team } from '../../teams/entities/team.entity.js'

export enum AccessTokenType {
    STAFF = 'staff',
    TEAM = 'team',
}

export interface AccessTokenPayload {
    sub: number
    type: AccessTokenType
    // Solo equipos: id de la team_session; si la sesión se reemplaza, el token deja de valer
    sid?: string
}

export class AccessTokenPayloadFactory {
    static forStaff(user: Pick<StaffUser, 'id'>): AccessTokenPayload {
        return { sub: user.id, type: AccessTokenType.STAFF }
    }

    static forTeam(team: Pick<Team, 'id'>, sessionId: string): AccessTokenPayload {
        return { sub: team.id, type: AccessTokenType.TEAM, sid: sessionId }
    }
}
