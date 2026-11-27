import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { GENRES, Game, GameFields, REGIONS, SERIAL_PATTERN } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';
import { formatSize } from '../../shared/utils/audio-file';

const MAX_COVER_SIZE = 5 * 1024 * 1024;
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Create / edit form. Opened with a Game to edit it, without data to create
 * one. Closes with the saved Game.
 */
@Component({
  selector: 'app-game-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ game ? 'Modifier le jeu' : 'Ajouter un jeu' }}</h2>

    <form mat-dialog-content id="game-form" [formGroup]="form" (submit)="$event.preventDefault(); save()">
      <mat-form-field appearance="outline" class="full">
        <mat-label>Titre</mat-label>
        <input matInput formControlName="title" required />
        @if (form.controls.title.hasError('required')) {
          <mat-error>Le titre est obligatoire</mat-error>
        }
      </mat-form-field>

      <div class="pair">
        <mat-form-field appearance="outline">
          <mat-label>Numéro de série</mat-label>
          <input matInput formControlName="serial" placeholder="SCUS-94163" />
          @if (form.controls.serial.hasError('pattern')) {
            <mat-error>Format : SCUS-94163</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Année</mat-label>
          <input matInput formControlName="year" inputmode="numeric" placeholder="1998" />
          @if (form.controls.year.hasError('pattern')) {
            <mat-error>4 chiffres (1994+)</mat-error>
          }
        </mat-form-field>
      </div>

      <div class="pair">
        <mat-form-field appearance="outline">
          <mat-label>Genre</mat-label>
          <mat-select formControlName="genre">
            <mat-option value="">Aucun</mat-option>
            @for (genre of genres; track genre.value) {
              <mat-option [value]="genre.value">{{ genre.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Région</mat-label>
          <mat-select formControlName="region">
            <mat-option value="">Aucune</mat-option>
            @for (region of regions; track region.value) {
              <mat-option [value]="region.value">{{ region.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <div class="cover-box">
        @if (cover(); as file) {
          <div class="picked-cover">
            @if (coverPreview()) {
              <img [src]="coverPreview()" alt="" class="thumb" />
            } @else {
              <span class="thumb thumb-icon" aria-hidden="true"><mat-icon>image</mat-icon></span>
            }
            <div class="picked-info">
              <b class="chosen">{{ file.name }}</b>
              <small class="mono">{{ formatSize(file.size) }}</small>
            </div>
            <button mat-icon-button type="button" (click)="clearCover()" aria-label="Retirer la pochette sélectionnée">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        } @else {
          <label class="cover-picker">
            <mat-icon>image</mat-icon>
            <span class="picker-text">
              <strong>Choisir une pochette</strong>
              <small>JPEG, PNG ou WebP · 5 Mo max.</small>
            </span>
            <input
              class="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              data-testid="cover-input"
              (change)="chooseCover($event)"
            />
          </label>
        }

        @if (game?.hasCover && !cover()) {
          <mat-checkbox [formControl]="removeCover">Retirer la pochette actuelle</mat-checkbox>
        }
      </div>

      @if (coverError()) {
        <p class="hint-error" role="alert"><mat-icon class="icon-fill">error</mat-icon><span>{{ coverError() }}</span></p>
      }
      @if (serverError()) {
        <p class="hint-error" role="alert"><mat-icon class="icon-fill">error</mat-icon><span>{{ serverError() }}</span></p>
      }
    </form>

    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="saving()">Annuler</button>
      <button mat-flat-button type="submit" form="game-form" data-testid="save" [disabled]="!canSave()">
        {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </div>
  `,
  styles: `
    form { display: grid; gap: 4px; width: min(460px, 82vw); }
    .full { width: 100%; margin-top: 6px; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pair mat-form-field { min-width: 0; }

    .cover-box { display: grid; gap: 8px; margin: 4px 0 6px; }
    .cover-picker {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border: 1.5px dashed var(--gpc-edge);
      border-radius: 3px;
      cursor: pointer;
      transition: border-color 150ms, background-color 150ms;
    }
    .cover-picker:hover { border-color: var(--gpc-ink-soft); background: color-mix(in srgb, var(--gpc-case) 50%, transparent); }
    .cover-picker:has(:focus-visible) { outline: 2px solid var(--gpc-ps-cross); outline-offset: -2px; }
    .cover-picker mat-icon { color: var(--gpc-ink-soft); }
    .picker-text { display: grid; gap: 2px; }
    .picker-text strong { font-size: 13.5px; font-weight: 600; color: var(--gpc-ink); }
    .picker-text small { font-size: 12px; color: var(--gpc-ink-soft); }

    .picked-cover {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 8px 10px;
      border: 1px solid var(--gpc-edge-soft);
      border-radius: 3px;
      background: var(--mat-sys-surface);
    }
    .thumb { width: 44px; height: 44px; border-radius: 2px; object-fit: cover; border: 1px solid var(--gpc-edge); }
    .thumb-icon { display: grid; place-items: center; background: var(--gpc-spine); color: var(--gpc-spine-ink); }
    .picked-info { display: grid; gap: 2px; min-width: 0; }
    .chosen { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .picked-info small { font-size: 11.5px; color: var(--gpc-ink-soft); }

    .hint-error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0 0;
      padding: 8px 10px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
      border-radius: 3px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font-size: 13px;
    }
    .hint-error mat-icon { flex: none; font-size: 18px; width: 18px; height: 18px; color: var(--mat-sys-error); }

    @media (max-width: 500px) {
      .pair { grid-template-columns: 1fr; gap: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cover-picker { transition: none; }
    }
  `,
})
export class GameFormDialogComponent {
  private readonly service = inject(GameService);
  private readonly dialogRef = inject(MatDialogRef<GameFormDialogComponent, Game>);
  /** The game being edited; undefined when creating. */
  readonly game = inject<Game | null>(MAT_DIALOG_DATA, { optional: true }) ?? undefined;

  readonly genres = GENRES;
  readonly regions = REGIONS;
  readonly formatSize = formatSize;
  readonly form = new FormGroup({
    title: new FormControl(this.game?.title ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
    serial: new FormControl(this.game?.serial ?? '', {
      nonNullable: true,
      validators: [Validators.pattern(SERIAL_PATTERN)],
    }),
    genre: new FormControl<string>(this.game?.genre ?? '', { nonNullable: true }),
    region: new FormControl<string>(this.game?.region ?? '', { nonNullable: true }),
    year: new FormControl(this.game?.year ? String(this.game.year) : '', {
      nonNullable: true,
      validators: [Validators.pattern(/^(19(9[4-9])|20\d\d|2100)$|^$/)],
    }),
  });
  readonly removeCover = new FormControl(false, { nonNullable: true });
  readonly cover = signal<File | undefined>(undefined);
  readonly coverPreview = signal<string | null>(null);
  readonly coverError = signal('');
  readonly serverError = signal('');
  readonly saving = signal(false);
  readonly canSave = computed(() => !this.saving() && !this.coverError());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.serverError.set('');
    this.revokePreview();

    if (file && !COVER_TYPES.includes(file.type)) {
      this.coverError.set('La pochette doit être une image JPEG, PNG ou WebP.');
      this.cover.set(undefined);
    } else if (file && file.size > MAX_COVER_SIZE) {
      this.coverError.set('La pochette dépasse 5 Mo.');
      this.cover.set(undefined);
    } else {
      this.coverError.set('');
      this.cover.set(file);
      if (file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        this.coverPreview.set(URL.createObjectURL(file));
      }
    }
  }

  clearCover(): void {
    this.revokePreview();
    this.cover.set(undefined);
    this.coverError.set('');
  }

  private revokePreview(): void {
    const url = this.coverPreview();
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
    this.coverPreview.set(null);
  }

  save(): void {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid || this.coverError()) return;

    const value = this.form.getRawValue();
    const fields: GameFields = {
      title: value.title.trim(),
      serial: value.serial.trim().toUpperCase(),
      genre: value.genre as GameFields['genre'],
      region: value.region as GameFields['region'],
      year: value.year.trim(),
      cover: this.cover(),
      removeCover: this.removeCover.value,
    };

    this.saving.set(true);
    this.serverError.set('');
    const request = this.game
      ? this.service.update(this.game.id, fields)
      : this.service.create(fields);

    request.subscribe({
      next: (saved) => {
        console.debug('[GameForm] Jeu enregistré', saved.id);
        this.dialogRef.close(saved);
      },
      error: (error) => {
        console.error('[GameForm] Enregistrement impossible', error);
        this.saving.set(false);
        this.serverError.set(
          error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
            ? error.error.message
            : "L'enregistrement a échoué. Vérifiez votre connexion puis réessayez.",
        );
      },
    });
  }
}
