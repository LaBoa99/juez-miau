import { Component, inject } from '@angular/core';
import { LoginModel } from './models/login.model';
import { form, FormField } from '@angular/forms/signals';
import { AuthService } from '../core/services/auth';

@Component({
  imports: [FormField],
  selector: 'app-login-staff',
  styleUrl: './login-staff.css',
  templateUrl: './login-staff.html',
})
export class LoginStaff {
  private readonly authService = inject(AuthService);

  loginForm = form(LoginModel);

  onSubmit(event: Event) {

    event.preventDefault();

    this.authService.login(this.loginForm().value()).subscribe()

    console.log(this.loginForm().value())
  }
}
