import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ICategory, ICreateCategory, IUpdateCategory } from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly http = inject(HttpClient);

  list(editionId: number): Observable<ICategory[]> {
    return this.http.get<ICategory[]>(`${API}/editions/${editionId}/categories`);
  }

  create(editionId: number, dto: ICreateCategory): Observable<ICategory> {
    return this.http.post<ICategory>(`${API}/editions/${editionId}/categories`, dto);
  }

  update(id: number, dto: IUpdateCategory): Observable<ICategory> {
    return this.http.patch<ICategory>(`${API}/categories/${id}`, dto);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/categories/${id}`);
  }
}
