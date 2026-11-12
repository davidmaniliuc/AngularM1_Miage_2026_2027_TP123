import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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

  /**
   * Creates a game from its disc image; the backend fills title, region and
   * serial. The file is the raw request body (no multipart) so the server
   * can stream it to disk; a .bin's .cue travels base64-encoded in X-Cue.
   * Emits progress events, then the response.
   */
  importDisc(file: File, cue?: string) {
    let headers = new HttpHeaders({ 'Content-Type': 'application/octet-stream' });
    if (cue) headers = headers.set('X-Cue', toBase64(cue));
    return this.http.post<Game>('/api/games/disc', file, {
      headers,
      params: { name: file.name },
      reportProgress: true,
      observe: 'events',
    });
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

/** Base64 of a UTF-8 text: btoa() alone only takes Latin-1. */
function toBase64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
