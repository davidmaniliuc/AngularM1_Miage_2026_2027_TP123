import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppComponent } from './app';
import { AuthService } from '../../shared/services/auth.service';
import { User } from '../../shared/models/user.model';

describe('AppComponent', () => {
  let auth: AuthService;
  let router: Router;

  const user: User = {
    id: '1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: '2024-01-01',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    });

    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('shows login/register links and no logout control when logged out', () => {
    auth.currentUser.set(null);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const nativeElement: HTMLElement = fixture.nativeElement;

    expect(nativeElement.querySelector('a[routerLink="/login"]')).not.toBeNull();
    expect(nativeElement.querySelector('a[routerLink="/register"]')).not.toBeNull();
    expect(nativeElement.querySelector('button[data-testid="logout"]')).toBeNull();
  });

  it('shows the user name and a working logout button when logged in', () => {
    auth.currentUser.set(user);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const nativeElement: HTMLElement = fixture.nativeElement;

    expect(nativeElement.textContent).toContain('Ada Lovelace');
    const logoutButton = nativeElement.querySelector<HTMLButtonElement>(
      'button[data-testid="logout"]',
    );
    expect(logoutButton).not.toBeNull();
    expect(nativeElement.querySelector('a[routerLink="/login"]')).toBeNull();

    const logoutSpy = vi.spyOn(auth, 'logout');
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    logoutButton!.click();

    expect(logoutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });
});
