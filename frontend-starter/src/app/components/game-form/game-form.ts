import { Component, effect, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { GameInput } from '../../shared/models/game.model';

@Component({
  selector: 'app-game-form',
  imports: [ReactiveFormsModule, MatButtonModule],
  templateUrl: './game-form.html', styleUrl: './game-form.css',
})
export class GameFormComponent {
  readonly game = input<GameInput | null>(null);
  readonly pending = input(false);
  readonly saved = output<GameInput>();
  readonly cancelled = output<void>();
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    region: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    releaseYear: new FormControl<number | null>(null, [Validators.min(1900), Validators.max(2100),
      control => control.value === null || Number.isInteger(control.value) ? null : { integer: true }]),
  });

  constructor() {
    effect(() => {
      const game = this.game();
      this.form.reset({ title: game?.title ?? '', description: game?.description ?? '', region: game?.region ?? '', releaseYear: game?.releaseYear ?? null });
    });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) return;
    const value = this.form.getRawValue();
    this.saved.emit({ title: value.title.trim(), description: value.description.trim() || null,
      region: value.region.trim() || null, releaseYear: value.releaseYear });
  }
}
