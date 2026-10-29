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

export interface IMeResponse extends IStaffUser {
    type: 'staff';
}

export interface IRefreshResponse {
    accessToken: string;
}
