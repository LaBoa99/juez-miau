import { StaffRole } from "../enums/staff-role.enum.js";

export interface ILoginData {
    email: string
    password: string
}

export interface IStaffRoleAssignment {
    editionId: number;
    role: StaffRole;
}

export interface IStaffUser {
    id: number;
    name: string;
    roles: IStaffRoleAssignment[];
    // El backend aún NO lo expone en /auth/me ni en el login (es un campo interno is_superadmin).
    // Debe exponerse antes de activar el gating de superadmin. Hoy llega undefined → se trata como false.
    isSuperadmin?: boolean;
}

export interface ILoginResponse {
    accessToken: string;
    user: IStaffUser;
}

// Lo que devuelve GET /staff (listado de usuarios de staff, superadmin-only)
export interface IStaffListItem {
    id: number;
    name: string;
    email: string;
    active: boolean;
    isSuperadmin: boolean;
    createdAt: string | Date;
}

export interface IMeResponse extends IStaffUser {
    type: 'staff';
}

export interface IRefreshResponse {
    accessToken: string;
}
