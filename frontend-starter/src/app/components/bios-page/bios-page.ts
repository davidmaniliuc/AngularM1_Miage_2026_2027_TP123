import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Bios, biosRegionLabel } from '../../shared/models/bios.model';
import { BiosService } from '../../shared/services/bios.service';
import { formatSize } from '../../shared/utils/audio-file';
import { ConfirmDialogComponent, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';

/**
 * My BIOS library. The backend checks each file with loadBios: a wrong size
 * is refused, a recognised BIOS shows its region and version. The default
 * BIOS is the one a game starts with.
 */
@Component({
  selector: 'app-bios-page',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="bar">
      <p class="intro">Vos BIOS restent privés : personne d'autre ne peut les voir ni les télécharger.</p>
      <button mat-flat-button type="button" [disabled]="uploading()" (click)="biosInput.click()">
        <mat-icon>upload</mat-icon>{{ uploading() ? 'Vérification…' : 'Ajouter un BIOS' }}
      </button>
      <input #biosInput hidden type="file" accept=".bin,.rom" data-testid="bios-input" (change)="choose($event)" />
    </div>

    @if (error()) {
      <p class="error" role="alert"><mat-icon>error</mat-icon>{{ error() }}</p>
    }

    @if (!loaded() && !error()) {
      <mat-progress-bar mode="indeterminate" class="loading" aria-label="Chargement des BIOS" />
    }

    @if (loaded() && list().length === 0) {
      <p class="empty">Aucun BIOS pour l'instant. Un BIOS PS1 est un fichier de 512 Ko, par exemple SCPH-1001.bin.</p>
    }

    <ul>
      @for (bios of list(); track bios.id) {
        <li data-testid="bios">
          <span class="chip" aria-hidden="true"><mat-icon>memory</mat-icon></span>
          <div class="info">
            <b>{{ bios.originalName }}</b>
            @if (bios.known) {
              <span data-testid="bios-identity">{{ region(bios) }} · version {{ bios.version }}</span>
              <small>{{ bios.description }}</small>
            } @else {
              <span data-testid="bios-identity">Non reconnu</span>
              <small>Bonne taille ({{ formatSize(bios.size) }}), mais absent de la table de l'émulateur.</small>
            }
          </div>
          @if (bios.isDefault) {
            <span class="default" data-testid="default">Par défaut</span>
          } @else {
            <button mat-button type="button" data-testid="make-default" (click)="makeDefault(bios)">Utiliser par défaut</button>
          }
          <button mat-icon-button type="button" [attr.aria-label]="'Supprimer ' + bios.originalName" (click)="confirmRemove(bios)">
            <mat-icon>delete</mat-icon>
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 24px; }
    .bar button { height: 40px; }
    .intro, .empty, small { color: var(--gpc-ink-soft); }
    .intro { flex: 1; margin: 0; font-size: 14px; }
    .empty { padding: 32px 20px; border: 1.5px dashed var(--gpc-edge); border-radius: 3px; text-align: center; }
    ul { display: grid; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--gpc-edge); }
    li { display: flex; align-items: center; gap: 16px; padding: 14px 4px; border-bottom: 1px solid var(--gpc-edge-soft); }
    .chip { display: grid; flex: none; place-items: center; width: 40px; height: 40px; border-radius: 3px; background: var(--gpc-spine); color: var(--gpc-spine-ink); }
    .info { display: grid; flex: 1; min-width: 0; gap: 2px; }
    .info b { font-family: var(--gpc-mono); font-size: 14px; font-weight: 500; }
    .info span { font-size: 14px; font-weight: 600; }
    small { font-size: 13px; }
    .default { padding: 5px 10px; border: 1px solid var(--gpc-ink); border-radius: 3px; font-size: 13px; font-weight: 600; }
    .loading { margin-bottom: 16px; }
    .error { display: flex; align-items: center; gap: 6px; color: var(--mat-sys-error); }
  `,
})
export class BiosPageComponent {
  private readonly service = inject(BiosService);
  private readonly dialog = inject(MatDialog);

  readonly list = signal<Bios[]>([]);
  readonly loaded = signal(false);
  readonly uploading = signal(false);
  readonly error = signal('');
  readonly region = (bios: Bios) => biosRegionLabel(bios.region);
  readonly formatSize = formatSize;

  constructor() {
    this.reload();
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.uploading.set(true);
    this.error.set('');
    this.service.upload(file).subscribe({
      next: () => {
        this.uploading.set(false);
        this.reload();
      },
      error: (error) => {
        console.error('[BiosPage] Envoi impossible', error);
        this.uploading.set(false);
        this.error.set(
          error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
            ? error.error.message
            : "L'envoi a échoué. Vérifiez votre connexion puis réessayez.",
        );
      },
    });
  }

  makeDefault(bios: Bios): void {
    this.service.makeDefault(bios.id).subscribe({
      next: () => this.reload(),
      error: (error) => {
        console.error('[BiosPage] Choix par défaut impossible', error);
        this.error.set('Impossible de choisir ce BIOS par défaut.');
      },
    });
  }

  confirmRemove(bios: Bios): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Supprimer ce BIOS ?',
          message: `« ${bios.originalName} » sera définitivement supprimé.`,
          confirm: 'Supprimer',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.remove(bios);
      });
  }

  private remove(bios: Bios): void {
    this.service.remove(bios.id).subscribe({
      next: () => this.reload(),
      error: (error) => {
        console.error('[BiosPage] Suppression impossible', error);
        this.error.set('La suppression a échoué.');
      },
    });
  }

  /** The backend decides which BIOS becomes default after an upload or a delete. */
  private reload(): void {
    this.service.list().subscribe({
      next: (list) => {
        this.list.set(list);
        this.loaded.set(true);
      },
      error: (error) => {
        console.error('[BiosPage] Chargement impossible', error);
        this.error.set('Impossible de charger vos BIOS.');
      },
    });
  }
}
