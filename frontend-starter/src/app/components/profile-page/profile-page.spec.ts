import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfilePageComponent } from './profile-page';
import { AuthService } from '../../shared/services/auth.service';
import { User } from '../../shared/models/user.model';

describe('ProfilePageComponent', () => {
  let httpMock: HttpTestingController;
  let auth: AuthService;

  const user: User = {
    id: '1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    createdAt: '2024-01-01',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads the profile automatically when no current user is known', () => {
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/users/me');
    req.flush(user);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.getRawValue().name).toBe('Ada Lovelace');
  });

  it('does not call the profile endpoint when the current user is already known', () => {
    auth.currentUser.set(user);
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();

    httpMock.expectNone('/api/users/me');
    expect(fixture.componentInstance.form.getRawValue().name).toBe('Ada Lovelace');
  });

  it('no longer has a manual "Charger mon profil" button', () => {
    auth.currentUser.set(user);
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();

    const nativeElement: HTMLElement = fixture.nativeElement;
    expect(nativeElement.textContent).not.toContain('Charger mon profil');
  });
});
