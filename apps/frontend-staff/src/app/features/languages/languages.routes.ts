import { Routes } from '@angular/router';
import { LanguagesPlaceholder } from './pages/languages-placeholder.component';

export const routes: Routes = [
  { path: '', component: LanguagesPlaceholder, data: { breadcrumb: 'Lenguajes' } },
];
