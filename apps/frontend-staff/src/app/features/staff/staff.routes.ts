import { Routes } from '@angular/router';
import { StaffList } from './pages/staff-list/staff-list';

export const routes: Routes = [
  { path: '', component: StaffList, data: { breadcrumb: 'Staff' } },
];
