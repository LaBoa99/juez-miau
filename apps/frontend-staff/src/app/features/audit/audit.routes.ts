import { Routes } from '@angular/router';
import { AuditLog } from './pages/audit-log/audit-log';
import { NavHeat } from './pages/nav-heat/nav-heat';

export const routes: Routes = [
  { path: '', component: AuditLog, data: { breadcrumb: 'Auditoría' } },
  { path: 'navegacion', component: NavHeat, data: { breadcrumb: 'Uso de la barra' } },
];
