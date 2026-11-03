import { Routes } from '@angular/router';
import { LoginStaff } from './login-staff/login-staff';
import { Shell } from './core/layout/shell.component';
import { Forbidden } from './core/layout/forbidden.component';
import { Credits } from './core/layout/credits.component';
import { NotFound } from './core/layout/not-found.component';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { superadminGuard } from './core/auth/role.guard';

// Páginas de desarrollo: solo existen en el build de desarrollo. El build de producción reemplaza
// ngDevMode por false, así la rama muerta se elimina y los chunks lazy ni siquiera se emiten.
declare const ngDevMode: boolean | undefined;
const devRoutes: Routes = typeof ngDevMode !== 'undefined' && ngDevMode
  ? [
      { path: 'dev/ui', loadComponent: () => import('./dev/ui-showcase/ui-showcase').then((m) => m.UiShowcase) },
      { path: 'dev/realtime', loadComponent: () => import('./dev/realtime/realtime-dev.component').then((m) => m.RealtimeDev) },
    ]
  : [];

export const routes: Routes = [
  { path: 'login', component: LoginStaff, canActivate: [guestGuard] },
  ...devRoutes,
  // Proyector público: fuera del shell y sin guards (sin sesión ni token).
  {
    path: 'proyector/:editionId',
    loadComponent: () => import('./features/projector/pages/projector/projector').then((m) => m.Projector),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: 'ediciones',
        loadChildren: () => import('./features/editions/editions.routes').then((m) => m.routes),
      },
      {
        path: 'staff',
        canActivate: [superadminGuard],
        loadChildren: () => import('./features/staff/staff.routes').then((m) => m.routes),
      },
      {
        path: 'lenguajes',
        loadChildren: () => import('./features/languages/languages.routes').then((m) => m.routes),
      },
      {
        path: 'auditoria',
        canActivate: [superadminGuard],
        loadChildren: () => import('./features/audit/audit.routes').then((m) => m.routes),
      },
      { path: '403', component: Forbidden },
      { path: 'creditos', component: Credits },
      { path: '', redirectTo: 'ediciones', pathMatch: 'full' },
      // Cualquier otra ruta: 404 dentro del shell (sin sesión, el authGuard manda al login)
      { path: '**', component: NotFound },
    ],
  },
];
