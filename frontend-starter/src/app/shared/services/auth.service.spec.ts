import { TestBed } from '@angular/core/testing';
import { ApplicationInitStatus, inject, provideAppInitializer } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { AuthService } from './auth.service';

const ADA = { id: '1', name: 'Ada', email: 'ada@example.com', createdAt: '2024-01-01' };

describe('AuthService.restoreSession', () => {
  let httpMock: HttpTestingController;

  const setup = () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('loads the current user when a token is already stored', () => {
    localStorage.setItem('gpc_token', 'stored-token');
    const auth = setup();

    auth.restoreSession();

    const request = httpMock.expectOne('/api/users/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer stored-token');
    request.flush(ADA);

    expect(auth.currentUser()).toEqual(ADA);
    httpMock.verify();
  });

  it('does not call the API when no token is stored', () => {
    const auth = setup();

    auth.restoreSession();

    expect(auth.currentUser()).toBeNull();
    httpMock.verify();
  });

  // Le vrai piège : appelée pendant la construction du service, la requête
  // meurt en NG0200 car authInterceptor fait inject(AuthService).
  it('reaches the API through the bootstrap initializer used by main.ts', () => {
    localStorage.setItem('gpc_token', 'stored-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        provideAppInitializer(() => inject(AuthService).restoreSession()),
      ],
    });
    TestBed.inject(ApplicationInitStatus);
    httpMock = TestBed.inject(HttpTestingController);

    httpMock.expectOne('/api/users/me').flush(ADA);

    expect(TestBed.inject(AuthService).currentUser()).toEqual(ADA);
    httpMock.verify();
  });

  it('keeps the stored token when the profile request fails without a 401', () => {
    localStorage.setItem('gpc_token', 'stored-token');
    const auth = setup();

    auth.restoreSession();
    httpMock
      .expectOne('/api/users/me')
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(auth.token()).toBe('stored-token');
    expect(localStorage.getItem('gpc_token')).toBe('stored-token');
    httpMock.verify();
  });
});
