import { Routes } from '@angular/router';
import { LoginStaff } from './login-staff/login-staff';
import { UiShowcase } from './dev/ui-showcase/ui-showcase';

export const routes: Routes = [
  { path: '', component: LoginStaff },
  { path: 'dev/ui', component: UiShowcase },
];
