import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game, GameFields } from '../models/game.model';

/** Encapsulates all HTTP operations for games. */
@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<Game[]>('/api/games');
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
    if (fields.cover) body.append('cover', fields.cover);
    if (fields.removeCover) body.append('removeCover', 'true');
    return body;
  }
}
