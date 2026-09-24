import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirm: string;
}

/** Generic confirmation. Closes with `true` when the user confirms. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <p mat-dialog-content>{{ data.message }}</p>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close cdkFocusInitial>Annuler</button>
      <button mat-flat-button type="button" class="danger" [mat-dialog-close]="true">{{ data.confirm }}</button>
    </div>
  `,
  styles: `
    .danger { --mat-button-filled-container-color: var(--mat-sys-error); --mat-button-filled-label-text-color: #fff; }
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
