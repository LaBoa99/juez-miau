import { Routes } from '@angular/router';
import { LoginStaff } from './login-staff/login-staff';
import { UiShowcase } from './dev/ui-showcase/ui-showcase';
import { RealtimeDev } from './dev/realtime/realtime-dev.component';
import { Shell } from './core/layout/shell.component';

// shortcut: guards de auth diferidos para poder navegar el shell sin login durante el diseño.
// Antes de cualquier deploy: re-añadir canActivate [authGuard] al Shell y [guestGuard] a 'login'
// (están implementados y listos en ./core/auth/auth.guards).
export const routes: Routes = [
  { path: 'login', component: LoginStaff },
  { path: 'dev/ui', component: UiShowcase },
  { path: 'dev/realtime', component: RealtimeDev },
  {
    path: '',
    component: Shell,
    children: [
      {
        path: 'ediciones',
        loadChildren: () => import('./features/editions/editions.routes').then((m) => m.routes),
      },
      {
        path: 'staff',
        loadChildren: () => import('./features/staff/staff.routes').then((m) => m.routes),
      },
      {
        path: 'lenguajes',
        loadChildren: () => import('./features/languages/languages.routes').then((m) => m.routes),
      },
      {
        path: 'auditoria',
        loadChildren: () => import('./features/audit/audit.routes').then((m) => m.routes),
      },
      { path: '', redirectTo: 'ediciones', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'ediciones' },
];
