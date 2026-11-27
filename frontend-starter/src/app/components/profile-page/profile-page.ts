import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [DatePipe, ReactiveFormsModule, MatIconModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  private savedTimer = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => window.clearTimeout(this.savedTimer));
    const currentUser = this.auth.currentUser();
    if (currentUser) {
      this.form.setValue({ name: currentUser.name });
    } else {
      this.load();
    }
  }

  private load(): void {
    this.auth.profile().subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil chargé', user.id);
        this.form.setValue({ name: user.name });
      },
      error: (error) => {
        console.error('[ProfilePage] Chargement impossible', error);
        this.error.set('Impossible de charger votre profil.');
      },
    });
  }

  save(): void {
    const name = this.form.getRawValue().name.trim();
    if (!name || this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    this.auth.update(name).subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil enregistré', user.id);
        this.saving.set(false);
        this.saved.set(true);
        window.clearTimeout(this.savedTimer);
        this.savedTimer = window.setTimeout(() => this.saved.set(false), 4000);
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Enregistrement impossible', error);
        this.saving.set(false);
        this.error.set(error.error?.message ?? "L'enregistrement a échoué. Réessayez.");
      },
    });
  }
}
