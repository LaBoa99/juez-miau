import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ICreateRoom,
  IProjectorTokenResponse,
  IRoom,
  IRoomListItem,
  IRoomObserver,
  IUpdateRoom,
} from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly http = inject(HttpClient);

  list(editionId: number): Observable<IRoomListItem[]> {
    return this.http.get<IRoomListItem[]>(`${API}/editions/${editionId}/rooms`);
  }

  create(editionId: number, dto: ICreateRoom): Observable<IRoom> {
    return this.http.post<IRoom>(`${API}/editions/${editionId}/rooms`, dto);
  }

  update(id: number, dto: IUpdateRoom): Observable<IRoom> {
    return this.http.patch<IRoom>(`${API}/rooms/${id}`, dto);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/rooms/${id}`);
  }

  addObserver(roomId: number, staffUserId: number): Observable<IRoomObserver> {
    return this.http.post<IRoomObserver>(`${API}/rooms/${roomId}/observers`, {
      staff_user_id: staffUserId,
    });
  }

  removeObserver(roomId: number, staffUserId: number): Observable<void> {
    return this.http.delete<void>(`${API}/rooms/${roomId}/observers/${staffUserId}`);
  }

  generateToken(roomId: number): Observable<IProjectorTokenResponse> {
    return this.http.post<IProjectorTokenResponse>(`${API}/rooms/${roomId}/board-token`, {});
  }

  revokeToken(roomId: number): Observable<void> {
    return this.http.delete<void>(`${API}/rooms/${roomId}/board-token`);
  }
}
