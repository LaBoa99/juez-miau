
export interface ICreateTeam {
    name: string
    category_id: number
    members: ICreateTeamMember[]
}

export interface ICreateTeamMember {
    name: string
    career: string
    semestre ?: number
}


export interface IUpdateTeam {
    name ?: string
    members ?: IUpdateTeamMember[]
}

export interface IUpdateTeamMember {
    id ?: number // el backend lo usa para distinguir edición (con id) de alta (sin id)
    name ?: string
    career ?: string
}

// ─── Respuestas del listado / importación de equipos ─────────

export interface ITeamCategoryRef { id: number; code: string; name: string }
export interface ITeamRoomRef { id: number; name: string }
export interface ITeamMemberListItem { id: number; name: string; career: string }

export interface ITeamListItem {
    id: number
    name: string
    username: string
    category: ITeamCategoryRef | null
    room: ITeamRoomRef | null
    members: ITeamMemberListItem[]
    online: boolean
}

export interface ITeamsPage {
    items: ITeamListItem[]
    total: number
}

export interface ITeamImportError { row: number; column: string | null; message: string }

export interface ITeamImportPreview {
    row: number
    teamName: string
    category: ITeamCategoryRef
    members: { name: string; career: string }[]
}

export interface ITeamImportValidation {
    validRows: number
    errors: ITeamImportError[]
    preview: ITeamImportPreview[]
}

export interface ITeamImportCredential { teamName: string; username: string; password: string }

export interface ITeamImportResult {
    created: number
    errors: ITeamImportError[]
    credentials: ITeamImportCredential[]
}