export interface ILoginData {
    email: string
    password: string
}

export interface ILoginResponse {
    accesToken: string;
    user: any;
}