import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ICreateTeam,
  ICreateTeamResult,
  ITeamCredentials,
  ITeamImportResult,
  ITeamImportValidation,
  ITeamsPage,
  IUpdateTeam,
} from '@concurso/shared-types';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';

const API = '/api';

export interface TeamListFilters {
  categoryId?: number;
  search?: string;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class TeamsService {
  private readonly http = inject(HttpClient);

  // Nombre de un equipo (GET /teams/:id devuelve la entidad; solo usamos id y name).
  get(teamId: number): Observable<{ id: number; name: string }> {
    return this.http.get<{ id: number; name: string }>(`${API}/teams/${teamId}`);
  }

  list(editionId: number, filters: TeamListFilters): Observable<ITeamsPage> {
    let params = new HttpParams().set('page', filters.page).set('pageSize', filters.pageSize);
    if (filters.categoryId) params = params.set('categoryId', filters.categoryId);
    if (filters.search?.trim()) params = params.set('search', filters.search.trim());
    return this.http.get<ITeamsPage>(`${API}/editions/${editionId}/teams`, { params });
  }

  // Todos los equipos de la edición (el backend pagina de 100 en 100)
  listAll(editionId: number): Observable<ITeamsPage['items']> {
    const page = (n: number) => this.list(editionId, { page: n, pageSize: 100 }).pipe(map((res) => ({ n, res })));
    return page(1).pipe(
      expand(({ n, res }) => (n * 100 < res.total && res.items.length ? page(n + 1) : EMPTY)),
      reduce((all, { res }) => all.concat(res.items), [] as ITeamsPage['items']),
    );
  }

  // Alta rápida de un equipo (usuario y contraseña los genera el backend).
  create(editionId: number, dto: ICreateTeam): Observable<ICreateTeamResult> {
    return this.http.post<ICreateTeamResult>(`${API}/editions/${editionId}/teams`, dto);
  }

  // Usuario y contraseña en claro para el PDF. Se pide solo al descargar; no se guarda en estado.
  getCredentials(teamId: number): Observable<ITeamCredentials> {
    return this.http.get<ITeamCredentials>(`${API}/teams/${teamId}/credentials`);
  }

  validateImport(editionId: number, file: File): Observable<ITeamImportValidation> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ITeamImportValidation>(`${API}/editions/${editionId}/teams/import/validate`, form);
  }

  import(editionId: number, file: File): Observable<ITeamImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ITeamImportResult>(`${API}/editions/${editionId}/teams/import`, form);
  }

  update(teamId: number, dto: IUpdateTeam): Observable<unknown> {
    return this.http.patch(`${API}/teams/${teamId}`, dto);
  }

  resetPassword(teamId: number): Observable<unknown> {
    return this.http.post(`${API}/teams/${teamId}/reset-password`, {});
  }

  remove(teamId: number): Observable<void> {
    return this.http.delete<void>(`${API}/teams/${teamId}`);
  }

  closeSessions(teamId: number): Observable<void> {
    return this.http.delete<void>(`${API}/teams/${teamId}/sessions`);
  }
}
