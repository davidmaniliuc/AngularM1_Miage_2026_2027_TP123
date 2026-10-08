import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoginPageComponent } from './components/login-page/login-page';
import { RegisterPageComponent } from './components/register-page/register-page';
import { AppComponent } from './components/app/app';
import { AuthService } from './shared/services/auth.service';
import { routes } from './routes';

describe('Games as the application home', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });
  for (const registration of [false, true]) {
    it(`opens games after ${registration ? 'registration' : 'login'}`, () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      if (registration) {
        const fixture = TestBed.createComponent(RegisterPageComponent);
        fixture.componentInstance.form.setValue({ name: 'Player', email: 'p@example.com', password: 'Password1!' });
        fixture.componentInstance.submit();
      } else {
        TestBed.createComponent(LoginPageComponent).componentInstance.submit();
      }
      http.expectOne(registration ? '/api/auth/register' : '/api/auth/login').flush({ token: 'test', user: { id: '1', name: 'Player', email: 'p@example.com', createdAt: '2026-01-01' } });
      expect(navigate).toHaveBeenCalledWith('/games');
    });
  }
  it('links home to games and retains music navigation', () => {
    TestBed.inject(AuthService).currentUser.set({ id: '1', name: 'Player', email: 'p@example.com', createdAt: '2026-01-01' });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.logo')?.getAttribute('href')).toBe('/games');
    expect(element.querySelector('nav a[href="/games"]')).not.toBeNull();
    expect(element.querySelector('nav a[href="/tracks"]')).not.toBeNull();
  });
});
