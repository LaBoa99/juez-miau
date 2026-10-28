import { EditionStatus } from "../enums/edition-status.enum.js"
import { StaffRole } from "../enums/staff-role.enum.js"

// ─── Modelos (espejo de los .entity del backend) ─────────────

export interface IEdition {
    id: number
    name: string
    status: EditionStatus
    scheduled_start: string | Date | null // ISO DATE, se define al programar
    duration_ms: number
    freeze_duration_ms: number
    started_at: string | Date | null
    paused_at: string | Date | null
    finished_at: string | Date | null
    block_submissions_on_alert: boolean
    forbidden_processes: string[]
    created_at: string | Date
}

export interface ICategory {
    id: number
    edition_id: number
    code: string
    name: string
    sort_order: number
}

export interface IRoom {
    id: number
    edition_id: number
    category_id: number | null
    name: string
}

export interface IEditionStaff {
    edition_id: number
    staff_user_id: number
    role: StaffRole
}

export interface IRoomObserver {
    room_id: number
    staff_user_id: number
}

// ─── Requests ────────────────────────────────────────────────

export type IEditionFilters = Partial<Pick<IEdition, 'status'>>

export type ICreateEdition = Pick<IEdition, 'name' | 'duration_ms' | 'freeze_duration_ms' | 'block_submissions_on_alert'>
    & Partial<Pick<IEdition, 'forbidden_processes'>>

export type IUpdateEdition = Partial<ICreateEdition>

export interface IScheduleEdition {
    scheduled_start: string | Date // ISO DATE
}

export type ICreateCategory = Pick<ICategory, 'name' | 'code'>

export type IUpdateCategory = Partial<ICreateCategory>

export type ICreateRoom = Pick<IRoom, 'name'> & Partial<Pick<IRoom, 'category_id'>>

export type IUpdateRoom = Partial<ICreateRoom>

export type ICreateEditionStaff = Pick<IEditionStaff, 'staff_user_id' | 'role'>

export type ICreateRoomObserver = Pick<IRoomObserver, 'staff_user_id'>

// ─── Responses ───────────────────────────────────────────────

export interface IEditionListItem extends IEdition {
    categories: ICategory[]
}

export interface IEditionDetail extends IEdition {
    categories: ICategory[]
    rooms: IRoom[]
    languages: unknown[] // TODO: tipar cuando exista el entity de languages
}

export type IEditionScheduleResponse = Pick<IEdition, 'id' | 'status' | 'scheduled_start'>

export interface IRoomListItem extends IRoom {
    observers: IRoomObserver[]
}

export interface IEditionStaffListItem extends IEditionStaff {
    name: string
}

// El token en texto plano solo se devuelve al generarlo; en BD se guarda su hash
export interface IProjectorTokenResponse {
    token: string
    url: string
    qr_png: string // base64
}
