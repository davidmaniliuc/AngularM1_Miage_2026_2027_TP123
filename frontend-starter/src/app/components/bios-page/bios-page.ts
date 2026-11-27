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
      <div class="banner" role="alert">
        <mat-icon class="icon-fill">error</mat-icon>
        <span>{{ error() }}</span>
        <button mat-icon-button type="button" (click)="error.set('')" aria-label="Fermer le message">
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }

    @if (!loaded() && !error()) {
      <mat-progress-bar mode="indeterminate" class="loading" aria-label="Chargement des BIOS" />
    }

    @if (loaded() && list().length === 0) {
      <div class="empty">
        <span class="ring" aria-hidden="true"><mat-icon>memory</mat-icon></span>
        <h2>Aucun BIOS pour l'instant</h2>
        <p>Un BIOS PS1 est un fichier de 512 Ko (par exemple SCPH-1001.bin), indispensable pour lancer vos disques dans l'émulateur.</p>
        <button mat-flat-button type="button" [disabled]="uploading()" (click)="biosInput.click()">
          <mat-icon>upload</mat-icon>Ajouter un BIOS
        </button>
      </div>
    }

    @if (list().length > 0) {
      <ul>
        @for (bios of list(); track bios.id) {
          <li data-testid="bios">
            <span class="chip" aria-hidden="true"><mat-icon>memory</mat-icon></span>
            <div class="info">
              <div class="title-line">
                <b>{{ bios.originalName }}</b>
                <span class="size mono">{{ formatSize(bios.size) }}</span>
              </div>
              @if (bios.known) {
                <span data-testid="bios-identity">{{ region(bios) }} · version {{ bios.version }}</span>
                <small class="mono">{{ bios.description }}</small>
              } @else {
                <span data-testid="bios-identity">Non reconnu</span>
                <small>Bonne taille ({{ formatSize(bios.size) }}), mais absent de la table de l'émulateur.</small>
              }
            </div>
            <div class="row-actions">
              @if (bios.isDefault) {
                <span class="default" data-testid="default">
                  <mat-icon>check</mat-icon>Par défaut
                </span>
              } @else {
                <button mat-stroked-button type="button" data-testid="make-default" (click)="makeDefault(bios)">
                  Utiliser par défaut
                </button>
              }
              <button mat-icon-button type="button" class="del" [attr.aria-label]="'Supprimer ' + bios.originalName" (click)="confirmRemove(bios)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: block; container-type: inline-size; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 24px; }
    .bar button { height: 40px; }
    .intro, small { color: var(--gpc-ink-soft); }
    .intro { flex: 1; margin: 0; font-size: 14px; }

    .banner {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 20px;
      padding: 6px 6px 6px 14px;
      border: 1px solid color-mix(in srgb, var(--mat-sys-error) 40%, transparent);
      border-radius: 3px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font-size: 14px;
    }
    .banner > mat-icon { color: var(--mat-sys-error); }

    .empty {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 48px 20px;
      border: 1.5px dashed var(--gpc-edge);
      border-radius: 3px;
      text-align: center;
    }
    .empty h2 { margin: 8px 0 0; font-size: 18px; font-weight: 700; }
    .empty p { max-width: 46ch; margin: 0 0 8px; font-size: 14px; line-height: 1.5; color: var(--gpc-ink-soft); }
    .ring { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--gpc-spine); color: var(--gpc-spine-ink); box-shadow: inset 0 0 0 22px var(--gpc-spine), inset 0 0 0 24px #44464d; }
    .ring mat-icon { font-size: 26px; width: 26px; height: 26px; }

    ul { display: grid; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--gpc-edge); }
    li { display: flex; align-items: center; gap: 16px; padding: 14px 6px; border-bottom: 1px solid var(--gpc-edge-soft); }
    .chip { display: grid; flex: none; place-items: center; width: 42px; height: 42px; border: 1px solid light-dark(transparent, #2a2b32); border-radius: 3px; background: var(--gpc-spine); color: var(--gpc-spine-ink); }
    .info { display: grid; flex: 1; min-width: 0; gap: 2px; }
    .title-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
    .info b { font-family: var(--gpc-mono); font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .size { font-size: 11.5px; color: var(--gpc-ink-soft); }
    .info > span { font-size: 13.5px; font-weight: 600; }
    small { font-size: 12.5px; }

    .row-actions { display: flex; align-items: center; gap: 8px; flex: none; }
    .default {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 30px;
      padding: 0 10px;
      border-radius: 2px;
      background: var(--gpc-ink);
      color: var(--mat-sys-on-primary);
      font: 600 12px/1 Archivo, system-ui, sans-serif;
    }
    .default mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .del:hover { color: var(--mat-sys-error); }
    .loading { margin-bottom: 16px; }

    @container (max-width: 600px) {
      li { flex-wrap: wrap; }
      .row-actions { width: 100%; justify-content: space-between; padding-left: 58px; }
    }
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
