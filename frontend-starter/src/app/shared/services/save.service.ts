import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';

export type SaveKind = 'memcard' | 'state';

/** Memory cards and quick saves of a game, kept on the server for my account. */
@Injectable({ providedIn: 'root' })
export class SaveService {
  private readonly http = inject(HttpClient);

  /** The saved file, or undefined when this game has none yet (404). */
  load(gameId: string, kind: SaveKind) {
    return this.http.get(this.url(gameId, kind), { responseType: 'arraybuffer' }).pipe(
      map((buffer) => new Uint8Array(buffer)),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) return of(undefined);
        throw error;
      }),
    );
  }

  /** Replaces the saved file; the bytes are the raw request body. */
  save(gameId: string, kind: SaveKind, bytes: Uint8Array) {
    const body = new Blob([bytes.slice().buffer], { type: 'application/octet-stream' });
    return this.http.put<void>(this.url(gameId, kind), body, { headers: { 'Content-Type': 'application/octet-stream' } });
  }

  private url(gameId: string, kind: SaveKind): string {
    return `/api/games/${gameId}/saves/${kind}`;
  }
}
