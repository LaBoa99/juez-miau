import { Routes } from '@angular/router';
import { AuditLog } from './pages/audit-log/audit-log';

export const routes: Routes = [
  { path: '', component: AuditLog, data: { breadcrumb: 'Auditoría' } },
];
