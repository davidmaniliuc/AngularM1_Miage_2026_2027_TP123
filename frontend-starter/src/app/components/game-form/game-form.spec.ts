import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { GameFormComponent } from './game-form';

describe('Game metadata form', () => {
  it('rejects blank titles and fractional years, trims values and clears optional fields', () => {
    const fixture = TestBed.createComponent(GameFormComponent);
    const component = fixture.componentInstance;
    const saved = vi.fn();
    component.saved.subscribe(saved);
    component.form.controls.title.setValue('   ');
    component.submit();
    expect(saved).not.toHaveBeenCalled();
    component.form.controls.title.setValue('  Ridge Racer ');
    component.form.controls.releaseYear.setValue(1995.5);
    component.submit();
    expect(saved).not.toHaveBeenCalled();
    component.form.controls.releaseYear.setValue(null);
    component.submit();
    expect(saved).toHaveBeenCalledWith({ title: 'Ridge Racer', description: null, region: null, releaseYear: null });
  });
  it('prefills metadata when editing and does not submit while saving', () => {
    const fixture = TestBed.createComponent(GameFormComponent);
    fixture.componentRef.setInput('game', { title: 'Demo', description: 'A game', region: 'Japan', releaseYear: 1994 });
    fixture.componentRef.setInput('pending', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.form.getRawValue()).toEqual({ title: 'Demo', description: 'A game', region: 'Japan', releaseYear: 1994 });
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.submit();
    expect(saved).not.toHaveBeenCalled();
  });
});
