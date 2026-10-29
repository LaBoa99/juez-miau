import { Routes } from '@angular/router';
import { EditionList } from './pages/edition-list/edition-list';
import { EditionLayout } from './pages/edition-layout/edition-layout';
import { editionBreadcrumbResolver } from './pages/edition-layout/edition-context';
import { EditionDetail } from './pages/edition-detail/edition-detail';
import { EditionSectionPlaceholder } from './pages/edition-section-placeholder.component';
import { CategoriesTab } from './categories/categories-tab';
import { RoomsTab } from './rooms/rooms-tab';
import { EditionLanguagesTab } from './edition-languages/edition-languages-tab';
import { EditionStaffTab } from './edition-staff/edition-staff-tab';

export const routes: Routes = [
  {
    path: '',
    data: { breadcrumb: 'Ediciones' },
    children: [
      { path: '', component: EditionList },
      {
        path: ':id',
        component: EditionLayout,
        resolve: { breadcrumb: editionBreadcrumbResolver },
        children: [
          {
            path: 'configuracion',
            component: EditionDetail,
            data: { breadcrumb: 'Configuración' },
            children: [
              { path: 'categorias', component: CategoriesTab, data: { breadcrumb: 'Categorías' } },
              { path: 'salones', component: RoomsTab, data: { breadcrumb: 'Salones' } },
              { path: 'lenguajes', component: EditionLanguagesTab, data: { breadcrumb: 'Lenguajes' } },
              { path: 'staff', component: EditionStaffTab, data: { breadcrumb: 'Staff' } },
              { path: '', redirectTo: 'categorias', pathMatch: 'full' },
            ],
          },
          { path: 'equipos', component: EditionSectionPlaceholder, data: { breadcrumb: 'Equipos' } },
          { path: 'problemas', component: EditionSectionPlaceholder, data: { breadcrumb: 'Problemas' } },
          { path: 'concurso', component: EditionSectionPlaceholder, data: { breadcrumb: 'Concurso' } },
          { path: 'envios', component: EditionSectionPlaceholder, data: { breadcrumb: 'Envíos' } },
          { path: 'marcador', component: EditionSectionPlaceholder, data: { breadcrumb: 'Marcador' } },
          { path: 'revision', component: EditionSectionPlaceholder, data: { breadcrumb: 'Revisión' } },
          { path: 'alertas', component: EditionSectionPlaceholder, data: { breadcrumb: 'Alertas' } },
          { path: '', redirectTo: 'configuracion', pathMatch: 'full' },
        ],
      },
    ],
  },
];
