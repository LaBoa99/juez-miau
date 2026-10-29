import { Routes } from '@angular/router';
import { StaffPlaceholder } from './pages/staff-placeholder.component';

export const routes: Routes = [
  { path: '', component: StaffPlaceholder, data: { breadcrumb: 'Staff' } },
];
