import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Game, GameFields, GameListQuery } from '../models/game.model';
import { Page } from '../models/page.model';

/** Encapsulates all HTTP operations for games. */
@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);

  /** One page of my games; filters and sort are applied by the backend. */
  list(query: GameListQuery = {}) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '' && value !== false) params = params.set(key, String(value));
    }
    return this.http.get<Page<Game>>('/api/games', { params });
  }

  get(id: string) {
    return this.http.get<Game>(`/api/games/${id}`);
  }

  create(fields: GameFields) {
    return this.http.post<Game>('/api/games', this.toForm(fields));
  }

  /** Empty serial or genre clears the field; an absent cover is left unchanged. */
  update(id: string, fields: GameFields) {
    return this.http.patch<Game>(`/api/games/${id}`, this.toForm(fields));
  }

  setFavorite(id: string, favorite: boolean) {
    const body = new FormData();
    body.append('favorite', String(favorite));
    return this.http.patch<Game>(`/api/games/${id}`, body);
  }

  /** Cover image as a Blob: an <img src> could not send the JWT. */
  cover(id: string) {
    return this.http.get(`/api/games/${id}/cover`, { responseType: 'blob' });
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/games/${id}`);
  }

  private toForm(fields: GameFields): FormData {
    const body = new FormData();
    body.append('title', fields.title);
    body.append('serial', fields.serial);
    body.append('genre', fields.genre);
    body.append('region', fields.region);
    body.append('year', fields.year);
    if (fields.cover) body.append('cover', fields.cover);
    if (fields.removeCover) body.append('removeCover', 'true');
    return body;
  }
}
