import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Page } from '../models/page.model';
import { Track, TrackScope, Visibility } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5, scope: TrackScope = 'mine') {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: { page, limit, scope },
    });
  }

  /** Emits upload progress events, then the created track in the final HttpResponse. */
  upload(file: File, title: string, visibility: Visibility = 'private') {
    const body = new FormData();
    body.append('audio', file);
    body.append('title', title);
    body.append('visibility', visibility);
    return this.http.post<Track>('/api/tracks', body, {
      reportProgress: true,
      observe: 'events',
    });
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  /** Cover image as a Blob: an <img src> could not send the JWT. */
  cover(id: string) {
    return this.http.get(`/api/tracks/${id}/cover`, {
      responseType: 'blob',
    });
  }

  setVisibility(id: string, visibility: Visibility) {
    return this.http.patch<Track>(`/api/tracks/${id}`, { visibility });
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}
