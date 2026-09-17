# Spec — TP1 Mission 1: close the remaining auth/profile gaps

## Background

`SUJET_ETUDIANT_TP1.md` Mission 1 asks for a full register/login/profile flow.
A codebase exploration (2026-09-17) found that `frontend-starter` is not a bare
skeleton: `AuthService`, the JWT request interceptor, the `authGuard`, and the
login/register/profile pages are already implemented and match
`API_CONTRACT.md`. Only four items from the Mission 1 checklist are actually
missing. This spec covers closing exactly those four gaps — nothing else.

Confirmed with the user via a grilling session before work started (see
`RAPPORT_IA_MODELE.md` → Mission 1 for the prompt trail). Decisions below are
final for this pass.

## Goals

1. **Session-expiry handling.** A `401` from a protected endpoint must clear
   the local session and redirect to `/login`. A `401` from
   `/api/auth/login` or `/api/auth/register` themselves (wrong password /
   normal auth failure) must **not** trigger this — those are handled by the
   page's own inline error display and must keep working unchanged.
2. **Logout is reachable.** `AuthService.logout()` exists but no UI element
   calls it. Add a control the user can actually click.
3. **Nav reflects auth state.** The nav bar is currently static. It must show
   "Connexion / Inscription" when logged out, and the user's name plus a
   logout control when logged in.
4. **Profile loads itself.** `/profile` currently requires a manual "Charger
   mon profil" click. Loading must happen automatically when the page is
   opened, without a redundant network call if the user object is already in
   memory (e.g., right after login/register, which already returns the full
   user).

## Non-goals / constraints

- Do not modify anything under `backend/`.
- Do not touch `AuthService`, `authGuard`, `authInterceptor`'s existing
  token-attaching behavior, the login/register forms, or `API_CONTRACT.md` —
  all already correct.
- No new abstractions (no separate token-storage service, no new error
  types) — the starter's existing shape (plain signals + `localStorage` in
  `AuthService`) stays as is.
- Angular 22 standalone conventions only: `inject()`, Signals, Reactive
  Forms, native `@if`/`@for` control flow (per `frontend-starter/CLAUDE.md`).

## Design decisions

- **401 handling lives in the existing `authInterceptor`**, extended with a
  response-side `catchError`, rather than a second interceptor — it already
  has access to `AuthService` and runs on every request.
- **Auth-endpoint exclusion is a URL prefix check** (`/api/auth/login`,
  `/api/auth/register`) against `request.url`, not a magic `HttpContext`
  token — simplest thing that works given only two excluded routes.
- **Logout button lives in `app.html`**, driven by `AuthService.currentUser()`
  — same change closes both gap #2 and gap #3 in one place.
- **Profile auto-load happens in the component constructor** (standalone
  components run inside an injection context at construction), guarded by
  `if (!this.auth.currentUser())` — skips the network call when the user is
  already known.
- Post-logout and post-401-redirect both land on `/login` (not `/tracks` or
  the current page) — consistent, unambiguous, never re-triggers a guard
  bounce.

## Acceptance criteria

- [ ] A `401` on any request other than `/api/auth/login` /
      `/api/auth/register` clears `AuthService.token()` /
      `AuthService.currentUser()` and navigates to `/login`.
- [ ] A `401` on `/api/auth/login` or `/api/auth/register` does neither.
- [ ] Logged out: nav shows links to `/login` and `/register`, no logout
      control.
- [ ] Logged in: nav shows the current user's name and a working logout
      button; clicking it clears the session and navigates to `/login`.
- [ ] Visiting `/profile` with no `currentUser()` yet triggers exactly one
      `AuthService.profile()` call and populates the name field.
- [ ] Visiting `/profile` with `currentUser()` already set triggers **no**
      `AuthService.profile()` call; the name field is populated from the
      existing signal.
- [ ] The manual "Charger mon profil" button no longer exists in the
      template.

## Out of scope for this spec

Mission 1's non-code deliverables (annotated login-flow schema, Network
screenshots, Signal-vs-`localStorage` write-up, `RAPPORT_IA_MODELE.md`
narrative entry) are tracked separately and are the student binôme's own
work — not part of this implementation pass.
