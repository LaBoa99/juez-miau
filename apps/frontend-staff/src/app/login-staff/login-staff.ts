import { Component, inject } from '@angular/core';
import { LoginModel } from './models/login.model';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  imports: [FormField],
  selector: 'app-login-staff',
  styleUrl: './login-staff.css',
  templateUrl: './login-staff.html',
})
export class LoginStaff {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loginForm = form(LoginModel);

  onSubmit(event: Event) {
    event.preventDefault();

    this.authService.login(this.loginForm().value()).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/ediciones');
      },
    });
  }
}
