import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LoginModel } from './models/login.model';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { Alert } from '../shared/ui/alert.component';
import { ButtonDirective } from '../shared/ui/button.directive';
import { FormField as OjFormField } from '../shared/ui/form-field.component';

@Component({
  imports: [FormField, OjFormField, Alert, ButtonDirective],
  selector: 'app-login-staff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './login-staff.css',
  templateUrl: './login-staff.html',
})
export class LoginStaff {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loginForm = form(LoginModel);
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  onSubmit(event: Event) {
    event.preventDefault();

    this.error.set(null);
    this.submitting.set(true);

    this.authService
      .login(this.loginForm().value())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
          this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/ediciones');
        },
        error: (err) => {
          this.error.set(
            err.status === 401
              ? 'Correo o contraseña incorrectos.'
              : 'No se pudo conectar con el servidor.',
          );
        },
      });
  }
}
