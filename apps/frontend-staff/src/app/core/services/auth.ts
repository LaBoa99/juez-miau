import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { ILoginData, ILoginResponse } from '@concurso/shared-types';
import { tap } from 'rxjs';

@Service()
export class AuthService {
    private readonly httpClient = inject(HttpClient);
    private apiUrl = '/api'

    login(credentials: ILoginData){
        return this.httpClient.post<ILoginResponse>('/api/auth/staff/login', credentials).pipe(
            tap(response => {
                localStorage.setItem('authToken', response.accesToken);
                console.log(response)
            })
        )

    }
}
