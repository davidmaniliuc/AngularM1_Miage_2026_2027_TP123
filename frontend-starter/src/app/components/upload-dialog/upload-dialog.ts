import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';
import { formatFormat, formatSize, validateAudioFile } from '../../shared/utils/audio-file';

/**
 * Import dialog. Closes with the created Track on success, so a new opening
 * always starts from an empty form.
 */
@Component({
  selector: 'app-upload-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './upload-dialog.html',
  styleUrl: './upload-dialog.css',
})
export class UploadDialogComponent {
  private readonly service = inject(TrackService);
  private readonly dialogRef = inject(MatDialogRef<UploadDialogComponent, Track>);

  readonly title = new FormControl('', { nonNullable: true });
  readonly file = signal<File | undefined>(undefined);
  readonly fileError = signal('');
  readonly serverError = signal('');
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly dragging = signal(false);

  readonly canUpload = computed(() => !!this.file() && !this.fileError() && !this.uploading());
  readonly fileFormat = computed(() => {
    const file = this.file();
    return file && !this.fileError() ? formatFormat(file.type) : '';
  });
  readonly formatSize = formatSize;

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.select(input.files?.[0]);
    // Allows choosing the same file again after removing it.
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.uploading()) this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (!this.uploading()) this.select(event.dataTransfer?.files[0]);
  }

  clearFile(): void {
    this.file.set(undefined);
    this.fileError.set('');
    this.serverError.set('');
  }

  upload(): void {
    if (this.uploading()) return;

    const file = this.file();
    const invalid = validateAudioFile(file);
    if (invalid || !file) {
      this.fileError.set(invalid ?? '');
      return;
    }

    this.uploading.set(true);
    this.progress.set(0);
    this.serverError.set('');
    this.dialogRef.disableClose = true;
    const title = this.title.value.trim() || file.name;

    this.service.upload(file, title).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round((100 * event.loaded) / event.total));
        } else if (event.type === HttpEventType.Response && event.body) {
          console.debug('[UploadDialog] Piste envoyée', event.body.id);
          this.dialogRef.close(event.body);
        }
      },
      error: (error) => {
        console.error('[UploadDialog] Envoi impossible', error);
        this.uploading.set(false);
        this.dialogRef.disableClose = false;
        this.serverError.set(
          error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
            ? error.error.message
            : "L'envoi a échoué. Vérifiez votre connexion puis réessayez.",
        );
      },
    });
  }

  private select(file: File | undefined): void {
    this.file.set(file);
    this.serverError.set('');
    this.fileError.set(file ? (validateAudioFile(file) ?? '') : '');
    console.debug('[UploadDialog] Fichier sélectionné', file?.name);
  }
}
