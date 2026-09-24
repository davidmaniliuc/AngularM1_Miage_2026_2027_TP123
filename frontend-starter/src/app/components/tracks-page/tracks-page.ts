import { Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { TrackCardComponent } from '../track-card/track-card';
import { AudioPlayerComponent } from '../audio-player/audio-player';
import { UploadDialogComponent } from '../upload-dialog/upload-dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';

@Component({
  imports: [
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    TrackCardComponent,
    AudioPlayerComponent,
  ],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent {
  private readonly service = inject(TrackService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly player = viewChild(AudioPlayerComponent);

  readonly pageSizeOptions = [5, 10, 20];

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly limit = signal(5);
  readonly total = signal(0);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  /** Filters the page currently displayed; the API has no search parameter. */
  readonly filter = signal('');
  readonly visibleTracks = computed(() => {
    const query = this.filter().trim().toLocaleLowerCase('fr');
    return query
      ? this.tracks().filter((track) => track.title.toLocaleLowerCase('fr').includes(query))
      : this.tracks();
  });

  readonly audioUrl = signal('');
  readonly audioBlob = signal<Blob | undefined>(undefined);
  readonly currentTrack = signal<Track | undefined>(undefined);
  readonly playing = signal(false);
  readonly audioLoadingId = signal('');
  readonly audioError = signal('');

  constructor() {
    this.load();
    // The last ObjectURL would otherwise stay in memory until the tab closes.
    inject(DestroyRef).onDestroy(() => this.revokeAudioUrl());
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list(this.page(), this.limit()).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.tracks.set(response.items);
        this.total.set(response.total);
        this.pages.set(response.pages);
        this.loading.set(false);
        // The last track of the last page was deleted: show the previous page.
        if (!response.items.length && this.page() > response.pages) {
          this.page.set(response.pages);
          this.load();
        }
      },
      error: (error) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.error.set(this.messageOf(error, 'Impossible de charger vos pistes.'));
        this.loading.set(false);
      },
    });
  }

  /** mat-paginator is 0-based, the API is 1-based. */
  onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.limit.set(event.pageSize);
    this.load();
  }

  openUpload(): void {
    this.dialog
      .open<UploadDialogComponent, void, Track>(UploadDialogComponent, { width: '480px', maxWidth: 'calc(100vw - 32px)' })
      .afterClosed()
      .subscribe((track) => {
        if (track) this.onUploaded(track);
      });
  }

  onUploaded(track: Track): void {
    this.snackBar
      .open(`« ${track.title} » importée.`, 'Écouter', { duration: 6000 })
      .onAction()
      .subscribe(() => this.play(track));
    this.filter.set('');
    this.page.set(1);
    this.load();
  }

  play(track: Track): void {
    // Same track already loaded: the card button acts as play / pause.
    const player = this.player();
    if (this.currentTrack()?.id === track.id && this.audioUrl() && player) {
      player.toggle();
      return;
    }

    this.audioError.set('');
    this.audioLoadingId.set(track.id);

    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        this.revokeAudioUrl();
        this.audioBlob.set(blob);
        this.audioUrl.set(URL.createObjectURL(blob));
        this.currentTrack.set(track);
        this.audioLoadingId.set('');
      },
      error: (error) => {
        console.error('[TracksPage] Lecture impossible', error);
        this.audioLoadingId.set('');
        this.audioError.set(this.audioMessageOf(error, track));
      },
    });
  }

  onAudioError(): void {
    const title = this.currentTrack()?.title ?? 'ce morceau';
    this.audioError.set(`Le navigateur ne parvient pas à lire ce fichier (« ${title} »).`);
  }

  confirmRemove(track: Track): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Supprimer cette piste ?',
          message: `« ${track.title} » sera définitivement supprimée de votre bibliothèque.`,
          confirm: 'Supprimer',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.remove(track);
      });
  }

  remove(track: Track): void {
    this.service.remove(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', track.id);
        if (this.currentTrack()?.id === track.id) this.stopPlayback();
        this.snackBar.open(`« ${track.title} » supprimée.`, undefined, { duration: 4000 });
        this.load();
      },
      error: (error) => {
        console.error('[TracksPage] Suppression impossible', error);
        this.snackBar.open(this.messageOf(error, `Impossible de supprimer « ${track.title} ».`), 'Fermer');
      },
    });
  }

  private stopPlayback(): void {
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
      return `« ${track.title} » est introuvable ou ne vous appartient pas. Actualisez la liste puis réessayez.`;
    }
    return `Impossible de charger « ${track.title} ». Vérifiez votre connexion et réessayez.`;
  }

  /** Uses the backend `{ message }` body when present, otherwise a readable fallback. */
  private messageOf(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.message === 'string') {
      return error.error.message;
    }
    return fallback;
  }
}
