import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Game, GameInput } from '../models/game.model';
import { Page } from '../models/page.model';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5, q = '') {
    return this.http.get<Page<Game>>('/api/games', { params: { page, limit, q } });
  }
  get(id: string) { return this.http.get<Game>(`/api/games/${encodeURIComponent(id)}`); }
  create(input: GameInput) { return this.http.post<Game>('/api/games', input); }
  update(id: string, input: GameInput) { return this.http.patch<Game>(`/api/games/${encodeURIComponent(id)}`, input); }
  remove(id: string) { return this.http.delete<void>(`/api/games/${encodeURIComponent(id)}`); }
}
