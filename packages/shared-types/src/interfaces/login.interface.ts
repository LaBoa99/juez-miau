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
