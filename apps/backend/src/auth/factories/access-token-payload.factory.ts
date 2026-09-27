import type { StaffUser } from '../../staff/entities/staff-user.entity.js'

export enum AccessTokenType {
    STAFF = 'staff',
    TEAM = 'team',
}

export interface AccessTokenPayload {
    sub: number
    type: AccessTokenType
}

export class AccessTokenPayloadFactory {
    static forStaff(user: Pick<StaffUser, 'id'>): AccessTokenPayload {
        return { sub: user.id, type: AccessTokenType.STAFF }
    }
}
