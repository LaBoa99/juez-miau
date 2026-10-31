import { Routes } from '@angular/router';
import { LanguagesList } from './pages/languages-list/languages-list';

export const routes: Routes = [
  { path: '', component: LanguagesList, data: { breadcrumb: 'Lenguajes' } },
];
