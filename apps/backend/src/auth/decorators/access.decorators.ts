import { SetMetadata } from '@nestjs/common'
import { StaffRole } from '@concurso/shared-types'

// Todas las rutas exigen token de staff salvo que se marquen con estos decoradores

export const IS_PUBLIC_KEY = 'auth:public'
export const ALLOW_TEAM_KEY = 'auth:allow-team'
export const EDITION_ACCESS_KEY = 'auth:edition-access'

// Sin token. Si llega uno válido, igual se deja en req.user (lo usa el logout de equipos)
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

// Acepta también tokens de equipo con sesión activa
export const AllowTeam = () => SetMetadata(ALLOW_TEAM_KEY, true)

// Entidad de la que sale el edition_id para revisar el rol del staff
export enum EditionScope {
    EDITION = 'edition',
    ROOM = 'room',
    CATEGORY = 'category',
    TEAM = 'team',
}

export interface EditionAccess {
    superadminOnly?: boolean
    roles?: StaffRole[]
    scope?: EditionScope
    param?: string
}

export const ANY_EDITION_ROLE = [StaffRole.ADMIN, StaffRole.JUDGE, StaffRole.OBSERVER]

// Superadmin, o alguno de los roles en la edición a la que pertenece el recurso de la ruta.
// `param` es el parámetro de la ruta con el id de la entidad indicada en `scope`
export const RequireEditionRole = (roles: StaffRole[], scope = EditionScope.EDITION, param = 'editionId') =>
    SetMetadata(EDITION_ACCESS_KEY, { roles, scope, param } satisfies EditionAccess)

export const SuperadminOnly = () => SetMetadata(EDITION_ACCESS_KEY, { superadminOnly: true } satisfies EditionAccess)
