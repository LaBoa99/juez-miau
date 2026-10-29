import { Routes } from '@angular/router';
import { AuditPlaceholder } from './pages/audit-placeholder.component';

export const routes: Routes = [
  { path: '', component: AuditPlaceholder, data: { breadcrumb: 'Auditoría' } },
];
