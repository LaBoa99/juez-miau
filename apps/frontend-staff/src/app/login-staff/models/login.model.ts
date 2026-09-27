import { signal } from "@angular/core";
import { ILoginData } from "@concurso/shared-types"

export const LoginModel = signal<ILoginData>({
    email: '',
    password: '',
});