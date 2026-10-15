import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { GENRES, Game, GameFields, SERIAL_PATTERN } from '../../shared/models/game.model';
import { GameService } from '../../shared/services/game.service';

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
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ game ? 'Modifier le jeu' : 'Ajouter un jeu' }}</h2>

    <form mat-dialog-content id="game-form" [formGroup]="form" (submit)="$event.preventDefault(); save()">
      <mat-form-field appearance="outline">
        <mat-label>Titre</mat-label>
        <input matInput formControlName="title" required />
        @if (form.controls.title.hasError('required')) {
          <mat-error>Le titre est obligatoire</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Numéro de série</mat-label>
        <input matInput formControlName="serial" placeholder="SCUS-94163" />
        @if (form.controls.serial.hasError('pattern')) {
          <mat-error>Format attendu : SCUS-94163</mat-error>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Genre</mat-label>
        <mat-select formControlName="genre">
          <mat-option value="">Aucun</mat-option>
          @for (genre of genres; track genre.value) {
            <mat-option [value]="genre.value">{{ genre.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <label class="cover">
        Pochette (JPEG, PNG ou WebP, 5 Mo maximum)
        <input type="file" accept="image/jpeg,image/png,image/webp" data-testid="cover-input" (change)="chooseCover($event)" />
      </label>
      @if (cover(); as file) {
        <p class="chosen">{{ file.name }}</p>
      }
      @if (game?.hasCover && !cover()) {
        <mat-checkbox [formControl]="removeCover">Retirer la pochette actuelle</mat-checkbox>
      }

      @if (coverError()) {
        <p class="error" role="alert">{{ coverError() }}</p>
      }
      @if (serverError()) {
        <p class="error" role="alert">{{ serverError() }}</p>
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
    form { display: grid; gap: 4px; min-width: min(420px, 80vw); }
    mat-form-field:first-child { margin-top: 6px; }
    .cover { display: grid; gap: 6px; margin: 4px 0 8px; font-size: 14px; color: var(--mat-sys-on-surface-variant); }
    .chosen { margin: 0; font-size: 13px; }
    .error { margin: 8px 0 0; color: var(--mat-sys-error); font-size: 13px; }
  `,
})
export class GameFormDialogComponent {
  private readonly service = inject(GameService);
  private readonly dialogRef = inject(MatDialogRef<GameFormDialogComponent, Game>);
  /** The game being edited; undefined when creating. */
  readonly game = inject<Game | null>(MAT_DIALOG_DATA, { optional: true }) ?? undefined;

  readonly genres = GENRES;
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
  });
  readonly removeCover = new FormControl(false, { nonNullable: true });
  readonly cover = signal<File | undefined>(undefined);
  readonly coverError = signal('');
  readonly serverError = signal('');
  readonly saving = signal(false);
  readonly canSave = computed(() => !this.saving() && !this.coverError());

  chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.serverError.set('');

    if (file && !COVER_TYPES.includes(file.type)) {
      this.coverError.set('La pochette doit être une image JPEG, PNG ou WebP.');
      this.cover.set(undefined);
    } else if (file && file.size > MAX_COVER_SIZE) {
      this.coverError.set('La pochette dépasse 5 Mo.');
      this.cover.set(undefined);
    } else {
      this.coverError.set('');
      this.cover.set(file);
    }
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
