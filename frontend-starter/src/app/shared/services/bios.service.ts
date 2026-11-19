import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Bios } from '../models/bios.model';

/** HTTP operations on my BIOS library. */
@Injectable({ providedIn: 'root' })
export class BiosService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<Bios[]>('/api/bios');
  }

  upload(file: File) {
    const body = new FormData();
    body.append('bios', file);
    return this.http.post<Bios>('/api/bios', body);
  }

  makeDefault(id: string) {
    return this.http.patch<Bios>(`/api/bios/${id}`, { isDefault: true });
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/bios/${id}`);
  }
}
