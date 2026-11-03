import { Routes } from '@angular/router';
import { EditionList } from './pages/edition-list/edition-list';
import { EditionLayout } from './pages/edition-layout/edition-layout';
import { editionBreadcrumbResolver } from './pages/edition-layout/edition-context';
import { EditionDetail } from './pages/edition-detail/edition-detail';
import { CategoriesTab } from './categories/categories-tab';
import { RoomsTab } from './rooms/rooms-tab';
import { EditionLanguagesTab } from './edition-languages/edition-languages-tab';
import { EditionStaffTab } from './edition-staff/edition-staff-tab';
import { AntiCheatTab } from './anti-cheat/anti-cheat-tab';
import { TeamList } from '../teams/pages/team-list/team-list';
import { ProblemWorkspace } from '../problems/pages/problem-workspace/problem-workspace';
import { ProblemHome } from '../problems/pages/problem-home/problem-home.component';
import { ProblemPanel } from '../problems/pages/problem-panel/problem-panel';
import { problemBreadcrumbResolver } from '../problems/data/problems-bus';
import { ContestControl } from '../contest/pages/contest-control/contest-control';
import { SubmissionList } from '../submissions/pages/submission-list/submission-list';
import { SubmissionDetail } from '../submissions/pages/submission-detail/submission-detail';
import { StandingsPage } from '../standings/pages/standings-page/standings-page';
import { ReviewPage } from '../review/pages/review-page/review-page';
import { AlertsPage } from '../flags/pages/alerts-page/alerts-page';
import { ClarificationsPage } from '../clarifications/pages/clarifications-page/clarifications-page';

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
              { path: 'anti-trampas', component: AntiCheatTab, data: { breadcrumb: 'Anti-trampas' } },
              { path: '', redirectTo: 'categorias', pathMatch: 'full' },
            ],
          },
          { path: 'equipos', component: TeamList, data: { breadcrumb: 'Equipos' } },
          {
            path: 'problemas',
            component: ProblemWorkspace,
            data: { breadcrumb: 'Problemas' },
            children: [
              { path: '', component: ProblemHome },
              { path: 'nuevo', component: ProblemPanel, data: { breadcrumb: 'Nuevo problema' } },
              {
                path: ':problemId',
                component: ProblemPanel,
                resolve: { breadcrumb: problemBreadcrumbResolver },
              },
            ],
          },
          { path: 'concurso', component: ContestControl, data: { breadcrumb: 'Concurso' } },
          {
            path: 'envios',
            data: { breadcrumb: 'Envíos' },
            children: [
              { path: '', component: SubmissionList },
              { path: ':submissionId', component: SubmissionDetail, data: { breadcrumb: 'Detalle' } },
            ],
          },
          { path: 'marcador', component: StandingsPage, data: { breadcrumb: 'Marcador' } },
          { path: 'revision', component: ReviewPage, data: { breadcrumb: 'Revisión' } },
          { path: 'alertas', component: AlertsPage, data: { breadcrumb: 'Alertas' } },
          { path: 'aclaraciones', component: ClarificationsPage, data: { breadcrumb: 'Aclaraciones' } },
          { path: '', redirectTo: 'configuracion', pathMatch: 'full' },
        ],
      },
    ],
  },
];
