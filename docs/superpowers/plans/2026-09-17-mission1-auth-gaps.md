# Mission 1 Auth/Profile Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four remaining Mission 1 gaps in `frontend-starter` — 401 session handling, a reachable logout control, an auth-aware nav bar, and automatic profile loading — test-first, without touching anything already correct.

**Architecture:** Extend the existing `authInterceptor` with response-side 401 handling; add auth-state branching + a logout handler to `AppComponent`/`app.html`; move the profile fetch from a manual button click into the `ProfilePageComponent` constructor, guarded on `currentUser()` already being populated.

**Tech Stack:** Angular 22 (standalone components, Signals, Reactive Forms, functional interceptors/guards), RxJS, `@angular/build:unit-test` running on Vitest (`npx ng test`).

**Spec:** `docs/mission1/SPEC.md`

## Global Constraints

- Do not modify anything under `backend/`.
- Do not change `AuthService`'s public shape, `authGuard`, the login/register forms, or `API_CONTRACT.md`.
- Angular 22 standalone conventions only: `inject()`, Signals, Reactive Forms, native `@if`/`@for` control flow (`frontend-starter/CLAUDE.md`).
- No new abstractions beyond what each task needs (no token-storage service, no custom error types).
- Test files import Vitest APIs explicitly (`import { describe, it, expect, vi, beforeEach } from 'vitest';`) — `tsconfig.app.json` sets `"types": []`, so nothing is ambient.
- Test run command for a single spec: `npx ng test --watch=false --include <path/to/file.spec.ts>` (run from `frontend-starter/`). Full suite: `npx ng test --watch=false`.

---

### Task 1: Session lifecycle — 401 handling + auth-aware nav/logout

Both pieces manage the same thing (when a session ends, the UI must reflect
it) and touch no common files, so they're one reviewable unit: closing this
task means "a session can end — by expiry or by the user's own choice — and
the UI always shows the truth."

**Files:**
- Modify: `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`
- Test: `frontend-starter/src/app/shared/interceptors/auth.interceptor.spec.ts` (create)
- Modify: `frontend-starter/src/app/components/app/app.ts`
- Modify: `frontend-starter/src/app/components/app/app.html`
- Test: `frontend-starter/src/app/components/app/app.spec.ts` (create)

**Interfaces:**
- Consumes: `AuthService.token: WritableSignal<string | null>`, `AuthService.currentUser: WritableSignal<User | null>`, `AuthService.logout(): void` (all already exist in `frontend-starter/src/app/shared/services/auth.service.ts`).
- Produces: `authInterceptor: HttpInterceptorFn` — same export name/signature as before (registered in `main.ts` via `withInterceptors([authInterceptor])`), now also redirects on session-ending 401s. `AppComponent.auth: AuthService` (public, template-facing) and `AppComponent.logout(): void` (public, called from `app.html`) — nothing downstream depends on these yet.

#### Part A — `authInterceptor` 401 handling

- [ ] **Step 1: Write the failing tests**

Create `frontend-starter/src/app/shared/interceptors/auth.interceptor.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
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
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('attaches the bearer token to outgoing requests when one is present', () => {
    auth.token.set('abc123');

    httpClient.get('/api/tracks').subscribe();

    const req = httpMock.expectOne('/api/tracks');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc123');
    req.flush({});
  });

  it('clears the session and redirects to /login on a 401 from a protected endpoint', () => {
    auth.token.set('expired-token');
    auth.currentUser.set({ id: '1', name: 'Alice', email: 'a@b.com', createdAt: '2024-01-01' });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    httpClient.get('/api/users/me').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/users/me');
    req.flush({ message: 'Jeton invalide ou expiré' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('does not clear the session or redirect on a 401 from /api/auth/login', () => {
    auth.token.set(null);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    httpClient.post('/api/auth/login', { email: 'x', password: 'y' }).subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ message: 'Identifiants incorrects' }, { status: 401, statusText: 'Unauthorized' });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not clear the session or redirect on a 401 from /api/auth/register', () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    httpClient.post('/api/auth/register', { name: 'x', email: 'y', password: 'z' }).subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/auth/register');
    req.flush({ message: 'Email déjà utilisé' }, { status: 401, statusText: 'Unauthorized' });

    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend-starter/`): `npx ng test --watch=false --include src/app/shared/interceptors/auth.interceptor.spec.ts`
Expected: the header-attachment test passes (existing behavior), the three 401-handling tests FAIL (no redirect happens yet).

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`:

```typescript
import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/register'];

/** Adds the bearer token to protected API requests and handles session expiry. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();

  const authorizedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: unknown) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((endpoint) => request.url.startsWith(endpoint));
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint) {
        auth.logout();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --watch=false --include src/app/shared/interceptors/auth.interceptor.spec.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-starter/src/app/shared/interceptors/auth.interceptor.ts frontend-starter/src/app/shared/interceptors/auth.interceptor.spec.ts
git commit -m "feat(auth): clear session and redirect to /login on expired/invalid token"
```

#### Part B — Auth-aware nav + reachable logout

- [ ] **Step 6: Write the failing tests**

Create `frontend-starter/src/app/components/app/app.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app';
import { AuthService } from '../../shared/services/auth.service';

describe('AppComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('shows Connexion/Inscription links and no logout control when logged out', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[routerLink="/login"]')).toBeTruthy();
    expect(el.querySelector('a[routerLink="/register"]')).toBeTruthy();
    expect(el.textContent).not.toContain('Déconnexion');
  });

  it('shows the current user name and a logout button when logged in', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const auth = TestBed.inject(AuthService);
    auth.currentUser.set({ id: '1', name: 'Alice', email: 'a@b.com', createdAt: '2024-01-01' });

    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Alice');
    expect(el.querySelector('button')).toBeTruthy();
  });

  it('clears the session and navigates to /login when logout is clicked', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const auth = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    auth.token.set('abc');
    auth.currentUser.set({ id: '1', name: 'Alice', email: 'a@b.com', createdAt: '2024-01-01' });
    fixture.detectChanges();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx ng test --watch=false --include src/app/components/app/app.spec.ts`
Expected: FAIL — current `app.html` has no `[routerLink="/register"]`, no username display, no button.

- [ ] **Step 8: Write the minimal implementation**

Replace `frontend-starter/src/app/components/app/app.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
```

Replace `frontend-starter/src/app/components/app/app.html`:

```html
<header>
  <div>
    <b>Guitar Practice Cloud</b>
    <small>Le cloud qui manque à votre ampli</small>
  </div>
  <nav aria-label="Navigation principale">
    <a routerLink="/tracks">Backing tracks</a>
    <a routerLink="/profile">Profil</a>
    @if (auth.currentUser(); as user) {
      <span>Bonjour {{ user.name }}</span>
      <button type="button" (click)="logout()">Déconnexion</button>
    } @else {
      <a routerLink="/login">Connexion</a>
      <a routerLink="/register">Inscription</a>
    }
  </nav>
</header>

<main>
  <router-outlet />
</main>
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx ng test --watch=false --include src/app/components/app/app.spec.ts`
Expected: all 3 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend-starter/src/app/components/app/app.ts frontend-starter/src/app/components/app/app.html frontend-starter/src/app/components/app/app.spec.ts
git commit -m "feat(nav): reflect auth state and wire up logout"
```

---

### Task 2: Automatic profile loading + verification/report

**Files:**
- Modify: `frontend-starter/src/app/components/profile-page/profile-page.ts`
- Modify: `frontend-starter/src/app/components/profile-page/profile-page.html`
- Test: `frontend-starter/src/app/components/profile-page/profile-page.spec.ts` (create)
- Modify: `docs/mission1/REPORT.md`

**Interfaces:**
- Consumes: `AuthService.currentUser: WritableSignal<User | null>`, `AuthService.profile(): Observable<User>`, `AuthService.update(name: string): Observable<User>` (all pre-existing, unchanged).
- Produces: none — this is a leaf component.

- [ ] **Step 1: Write the failing tests**

Create `frontend-starter/src/app/components/profile-page/profile-page.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePageComponent } from './profile-page';
import { AuthService } from '../../shared/services/auth.service';

describe('ProfilePageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('fetches the profile automatically when no user is loaded yet', () => {
    const auth = TestBed.inject(AuthService);
    const user = { id: '1', name: 'Alice', email: 'a@b.com', createdAt: '2024-01-01' };
    const profileSpy = vi.spyOn(auth, 'profile').mockReturnValue(of(user));

    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();

    expect(profileSpy).toHaveBeenCalled();
    expect(fixture.componentInstance.form.getRawValue().name).toBe('Alice');
  });

  it('does not re-fetch when a user is already loaded', () => {
    const auth = TestBed.inject(AuthService);
    auth.currentUser.set({ id: '1', name: 'Bob', email: 'b@b.com', createdAt: '2024-01-01' });
    const profileSpy = vi.spyOn(auth, 'profile');

    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();

    expect(profileSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.form.getRawValue().name).toBe('Bob');
  });

  it('has no manual "Charger mon profil" button in the template', () => {
    const auth = TestBed.inject(AuthService);
    auth.currentUser.set({ id: '1', name: 'Bob', email: 'b@b.com', createdAt: '2024-01-01' });

    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Charger mon profil');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx ng test --watch=false --include src/app/components/profile-page/profile-page.spec.ts`
Expected: FAIL — `profile()` is never called automatically today, and the manual button is still in the template.

- [ ] **Step 3: Write the minimal implementation**

Replace `frontend-starter/src/app/components/profile-page/profile-page.ts`:

```typescript
import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    const user = this.auth.currentUser();
    if (user) {
      this.form.setValue({ name: user.name });
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
      error: (error) => console.error('[ProfilePage] Chargement impossible', error),
    });
  }

  save(): void {
    this.auth.update(this.form.getRawValue().name).subscribe({
      next: (user) => console.debug('[ProfilePage] Profil enregistré', user.id),
      error: (error) => console.error('[ProfilePage] Enregistrement impossible', error),
    });
  }
}
```

Replace `frontend-starter/src/app/components/profile-page/profile-page.html`:

```html
<section class="card">
  <h1>Mon profil</h1>
  @if (auth.currentUser(); as user) {
    <p>
      <b>{{ user.name }}</b><br />{{ user.email }}<br />
      Membre depuis {{ user.createdAt.slice(0, 10) }}
    </p>
    <form [formGroup]="form" (ngSubmit)="save()">
      <label>Nouveau nom<input formControlName="name" /></label>
      <button type="submit">Enregistrer</button>
    </form>
  }
</section>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx ng test --watch=false --include src/app/components/profile-page/profile-page.spec.ts`
Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-starter/src/app/components/profile-page/profile-page.ts frontend-starter/src/app/components/profile-page/profile-page.html frontend-starter/src/app/components/profile-page/profile-page.spec.ts
git commit -m "feat(profile): load profile automatically instead of via manual button"
```

- [ ] **Step 6: Run the full frontend test suite**

Run (from `frontend-starter/`): `npx ng test --watch=false`
Expected: all specs pass, including the two new spec files from Task 1 and the one from this task.

- [ ] **Step 7: Manually verify the acceptance criteria in `docs/mission1/SPEC.md`** against the running app (`npm start` + backend running), since automated tests don't cover live Network behavior end-to-end.

- [ ] **Step 8: Fill in `docs/mission1/REPORT.md`** with what was actually done: files touched, test output, any deviations from the plan, and which acceptance criteria were manually verified.

- [ ] **Step 9: Commit the report**

```bash
git add docs/mission1/REPORT.md
git commit -m "docs: record mission 1 gap-closure report"
```
