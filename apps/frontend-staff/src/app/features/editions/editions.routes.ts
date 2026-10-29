import { Routes } from '@angular/router';
import { EditionList } from './pages/edition-list/edition-list';

export const routes: Routes = [
  { path: '', component: EditionList, data: { breadcrumb: 'Ediciones' } },
];
