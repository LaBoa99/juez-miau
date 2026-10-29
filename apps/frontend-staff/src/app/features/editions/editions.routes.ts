import { Routes } from '@angular/router';
import { EditionsPlaceholder } from './pages/editions-placeholder.component';

export const routes: Routes = [
  { path: '', component: EditionsPlaceholder, data: { breadcrumb: 'Ediciones' } },
];
