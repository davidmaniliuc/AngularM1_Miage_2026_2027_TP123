import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('clears the session and navigates to /login on a 401 from a protected endpoint', async () => {
    auth.token.set('some-token');
    auth.currentUser.set({
      id: '1',
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: '2024-01-01',
    });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    http.get('/api/tracks').subscribe({ error: () => {} });
    httpMock.expectOne('/api/tracks').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('does not clear the session on a 401 from /api/auth/login', () => {
    auth.token.set('some-token');
    auth.currentUser.set({
      id: '1',
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: '2024-01-01',
    });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    http.post('/api/auth/login', {}).subscribe({ error: () => {} });
    httpMock
      .expectOne('/api/auth/login')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBe('some-token');
    expect(auth.currentUser()).not.toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not clear the session on a 401 from /api/auth/register', () => {
    auth.token.set('some-token');
    auth.currentUser.set({
      id: '1',
      name: 'Ada',
      email: 'ada@example.com',
      createdAt: '2024-01-01',
    });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    http.post('/api/auth/register', {}).subscribe({ error: () => {} });
    httpMock
      .expectOne('/api/auth/register')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBe('some-token');
    expect(auth.currentUser()).not.toBeNull();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
