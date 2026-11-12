import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Game } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { formatSize } from '../../shared/utils/audio-file';
import { PickedDisc, pickDisc } from '../../shared/utils/disc-files';

/**
 * Imports a game from its disc image (.chd, a .bin, or a .cue and its .bin).
 * The backend reads the disc and fills the title, region and serial; the
 * dialog closes with the created Game.
 */
@Component({
  selector: 'app-game-import-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Importer un jeu</h2>

    <div mat-dialog-content>
      @if (disc(); as picked) {
        <div class="file">
          <mat-icon>album</mat-icon>
          <div class="name">
            <b data-testid="disc-name">{{ picked.file.name }}</b>
            <small>
              @if (uploading()) {
                {{ formatSize(picked.file.size * progress() / 100) }} sur {{ formatSize(picked.file.size) }}
              } @else {
                {{ formatSize(picked.file.size) }}{{ picked.cue ? ', avec son .cue' : '' }}
              }
            </small>
          </div>
          @if (uploading()) {
            <span aria-hidden="true">{{ progress() }} %</span>
          } @else {
            <button mat-icon-button type="button" (click)="clear()" [attr.aria-label]="'Retirer ' + picked.file.name">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
        @if (uploading()) {
          <mat-progress-bar mode="determinate" [value]="progress()" [attr.aria-label]="'Envoi de ' + picked.file.name" />
          @if (progress() === 100) {
            <p class="hint">Lecture du disque…</p>
          }
        }
      } @else {
        <label class="drop" [class.over]="dragging()"
               (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
          <mat-icon>upload</mat-icon>
          <strong>{{ dragging() ? 'Déposez les fichiers ici' : 'Déposez le jeu' }}</strong>
          <span>ou <u>parcourez vos fichiers</u></span>
          <small id="disc-hint">Un .chd (conseillé), un .bin seul, ou un .cue avec son .bin. 1 Go maximum.</small>
          <input class="sr-only" type="file" multiple accept=".chd,.bin,.cue" data-testid="disc-input"
                 aria-describedby="disc-hint" (change)="choose($event)" />
        </label>
      }

      @if (error()) {
        <p class="hint-error" role="alert"><mat-icon>error</mat-icon>{{ error() }}</p>
      }
    </div>

    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="uploading()">Annuler</button>
      <button mat-flat-button type="button" data-testid="import" [disabled]="!disc() || uploading()" (click)="upload()">
        {{ uploading() ? 'Envoi…' : 'Importer' }}
      </button>
    </div>
  `,
  styles: `
    .drop { display: grid; justify-items: center; gap: 4px; padding: 28px 16px; border: 2px dashed var(--mat-sys-outline-variant); border-radius: 12px; text-align: center; cursor: pointer; }
    .drop.over { border-color: var(--mat-sys-primary); background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent); }
    .drop small, .file small, .hint { color: var(--mat-sys-on-surface-variant); }
    .file { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .name { display: grid; flex: 1; min-width: 0; }
    .name b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hint-error { display: flex; align-items: center; gap: 6px; color: var(--mat-sys-error); }
  `,
})
export class GameImportDialogComponent {
  private readonly service = inject(GameService);
  private readonly dialogRef = inject(MatDialogRef<GameImportDialogComponent, Game>);

  readonly disc = signal<PickedDisc | undefined>(undefined);
  readonly error = signal('');
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly dragging = signal(false);
  readonly formatSize = formatSize;

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.select([...(input.files ?? [])]);
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.select([...(event.dataTransfer?.files ?? [])]);
  }

  clear(): void {
    this.disc.set(undefined);
    this.error.set('');
  }

  upload(): void {
    const disc = this.disc();
    if (!disc || this.uploading()) return;

    this.uploading.set(true);
    this.progress.set(0);
    this.error.set('');
    this.dialogRef.disableClose = true;

    this.service.importDisc(disc.file, disc.cue).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round((100 * event.loaded) / event.total));
        } else if (event.type === HttpEventType.Response && event.body) {
          console.debug('[GameImport] Jeu créé', event.body.id);
          this.dialogRef.close(event.body);
        }
      },
      error: (error) => {
        console.error('[GameImport] Envoi impossible', error);
        this.uploading.set(false);
        this.dialogRef.disableClose = false;
        this.error.set(
          error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
            ? error.error.message
            : "L'envoi a échoué. Vérifiez votre connexion puis réessayez.",
        );
      },
    });
  }

  private async select(files: File[]): Promise<void> {
    if (this.uploading() || files.length === 0) return;
    const result = await pickDisc(files);
    this.disc.set(result.ok ? result.disc : undefined);
    this.error.set(result.ok ? '' : result.message);
  }
}
