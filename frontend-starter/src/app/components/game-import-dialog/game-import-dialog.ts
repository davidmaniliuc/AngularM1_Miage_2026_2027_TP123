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

    <div mat-dialog-content class="content">
      @if (disc(); as picked) {
        <div class="file">
          <span class="ps-disc" [class.spinning]="uploading()" aria-hidden="true"></span>
          <div class="name">
            <b data-testid="disc-name">{{ picked.file.name }}</b>
            <small class="mono">
              @if (uploading()) {
                {{ formatSize(picked.file.size * progress() / 100) }} sur {{ formatSize(picked.file.size) }}
              } @else {
                {{ formatSize(picked.file.size) }}{{ picked.cue ? ' · avec .cue' : '' }}
              }
            </small>
          </div>
          @if (uploading()) {
            <span class="percent mono" aria-hidden="true">{{ progress() }} %</span>
          } @else {
            <button mat-icon-button type="button" (click)="clear()" [attr.aria-label]="'Retirer ' + picked.file.name">
              <mat-icon>close</mat-icon>
            </button>
          }
          @if (uploading()) {
            <mat-progress-bar
              class="progress"
              [mode]="progress() === 100 ? 'indeterminate' : 'determinate'"
              [value]="progress()"
              [attr.aria-label]="'Envoi de ' + picked.file.name"
            />
          }
        </div>
        @if (uploading() && progress() === 100) {
          <p class="hint">Lecture du disque et identification du numéro de série…</p>
        }
      } @else {
        <label
          class="drop"
          [class.over]="dragging()"
          (dragover)="$event.preventDefault(); dragging.set(true)"
          (dragleave)="dragging.set(false)"
          (drop)="onDrop($event)"
        >
          <mat-icon>upload</mat-icon>
          <strong>{{ dragging() ? 'Déposez les fichiers ici' : 'Déposez le disque du jeu' }}</strong>
          <span>ou <u>parcourez vos fichiers</u></span>
          <small id="disc-hint">Un .chd (conseillé), un .bin seul, ou un .cue avec son .bin · 1&nbsp;Go&nbsp;max.</small>
          <input
            class="sr-only"
            type="file"
            multiple
            accept=".chd,.bin,.cue"
            data-testid="disc-input"
            aria-describedby="disc-hint"
            (change)="choose($event)"
          />
        </label>
      }

      @if (error()) {
        <p class="hint-error" role="alert"><mat-icon class="icon-fill">error</mat-icon><span>{{ error() }}</span></p>
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
    .content { width: min(440px, 82vw); }
    .drop {
      position: relative;
      display: grid;
      justify-items: center;
      gap: 6px;
      padding: 26px 20px;
      border: 1.5px dashed var(--gpc-edge);
      border-radius: 3px;
      text-align: center;
      font-size: 14px;
      color: var(--mat-sys-on-surface-variant);
      cursor: pointer;
      transition: background-color 150ms, border-color 150ms;
    }
    .drop mat-icon { font-size: 30px; width: 30px; height: 30px; color: var(--mat-sys-primary); }
    .drop strong { color: var(--mat-sys-on-surface); font-weight: 600; }
    .drop u { color: var(--mat-sys-primary); text-underline-offset: 3px; }
    .drop:hover { border-color: var(--gpc-ink-soft); }
    .drop.over { border-color: var(--mat-sys-primary); background: var(--mat-sys-primary-container); }
    .drop:has(:focus-visible) { outline: 2px solid var(--gpc-ps-cross); outline-offset: -2px; }
    .drop small { font-size: 12.5px; line-height: 1.4; }

    .file {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      border: 1px solid var(--gpc-edge-soft);
      border-radius: 3px;
      background: var(--mat-sys-surface);
    }
    .ps-disc {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background:
        radial-gradient(circle, var(--mat-sys-surface) 0 11%, #3a3b40 11.5% 15%, #0b0b0c 15.5% 32%, #24252a 32.5% 34%, transparent 35%),
        conic-gradient(from 200deg, #0b0b0c, #3f2257 12%, #0b0b0c 24%, #14435e 40%, #0b0b0c 54%, #144a33 72%, #0b0b0c);
      box-shadow: 0 0 0 1px var(--gpc-edge);
    }
    .ps-disc.spinning { animation: spin 2s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .name { display: grid; gap: 2px; min-width: 0; }
    .name b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
    .name small, .percent { font-size: 12px; color: var(--mat-sys-on-surface-variant); }
    .progress { grid-column: 1 / -1; border-radius: 2px; }
    .hint { margin: 10px 0 0; font-size: 13px; color: var(--gpc-ink-soft); }

    .hint-error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 0;
      padding: 8px 10px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
      border-radius: 3px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font-size: 13px;
      line-height: 1.4;
    }
    .hint-error mat-icon { flex: none; font-size: 18px; width: 18px; height: 18px; color: var(--mat-sys-error); }

    @media (prefers-reduced-motion: reduce) {
      .drop { transition: none; }
      .ps-disc.spinning { animation: none; }
    }
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
