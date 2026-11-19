import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Track } from '../models/track.model';
import { TrackService } from './track.service';

/**
 * What is playing, for the whole app. The player bar lives in the shell, so the
 * music keeps going from Musique to Jeux. This service owns the ObjectURL of the
 * current Blob: it revokes the previous one on each new track and on stop().
 */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly tracks = inject(TrackService);
  /** Play / pause of the mounted player, registered by the shell. */
  private toggleFn: (() => void) | undefined;

  readonly audioUrl = signal('');
  readonly audioBlob = signal<Blob | undefined>(undefined);
  readonly currentTrack = signal<Track | undefined>(undefined);
  readonly playing = signal(false);
  readonly audioLoadingId = signal('');
  readonly audioError = signal('');

  attachToggle(toggle: () => void): void {
    this.toggleFn = toggle;
  }

  play(track: Track): void {
    // Same track already loaded: the card button acts as play / pause.
    if (this.currentTrack()?.id === track.id && this.audioUrl()) {
      this.toggleFn?.();
      return;
    }

    this.audioError.set('');
    this.audioLoadingId.set(track.id);

    this.tracks.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[Playback] Audio chargé', track.id);
        this.revokeAudioUrl();
        this.audioBlob.set(blob);
        this.audioUrl.set(URL.createObjectURL(blob));
        this.currentTrack.set(track);
        this.audioLoadingId.set('');
      },
      error: (error) => {
        console.error('[Playback] Lecture impossible', error);
        this.audioLoadingId.set('');
        this.audioError.set(this.audioMessageOf(error, track));
      },
    });
  }

  /** The <audio> element could not decode the file. */
  reportDecodeError(): void {
    const title = this.currentTrack()?.title ?? 'ce morceau';
    this.audioError.set(`Le navigateur ne parvient pas à lire ce fichier (« ${title} »).`);
  }

  /** Track deleted or user logged out: the bar goes away and the memory is freed. */
  stop(): void {
    this.revokeAudioUrl();
    this.audioUrl.set('');
    this.audioBlob.set(undefined);
    this.currentTrack.set(undefined);
    this.playing.set(false);
  }

  private revokeAudioUrl(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
  }

  /**
   * With responseType "blob", the error body is a Blob, not JSON: the
   * backend message is not directly readable, so we rely on the status.
   */
  private audioMessageOf(error: unknown, track: Track): string {
    if (error instanceof HttpErrorResponse && error.status === 404) {
      return `« ${track.title} » est introuvable ou n'est plus partagée. Actualisez la liste puis réessayez.`;
    }
    return `Impossible de charger « ${track.title} ». Vérifiez votre connexion et réessayez.`;
  }
}
