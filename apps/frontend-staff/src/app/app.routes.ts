import { Routes } from '@angular/router';
import { LoginStaff } from './login-staff/login-staff';
import { UiShowcase } from './dev/ui-showcase/ui-showcase';
import { Shell } from './core/layout/shell.component';

export const routes: Routes = [
  { path: 'login', component: LoginStaff },
  { path: 'dev/ui', component: UiShowcase },
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
      { path: '', redirectTo: 'ediciones', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'ediciones' },
];
