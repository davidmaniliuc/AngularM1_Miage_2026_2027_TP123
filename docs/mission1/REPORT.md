# Report — TP1 Mission 1: auth/profile gap closure

Status: **in progress** — this file is filled in as each task from
`docs/superpowers/plans/2026-09-17-mission1-auth-gaps.md` completes. See
`docs/mission1/SPEC.md` for the requirements this implements.

## Summary

_To be filled in once all tasks are done._

## Files changed

| File | Change |
|---|---|
| _pending_ | |

## Tests

_Pending — will record the `npx ng test --watch=false` output once Task 4 runs._

## Acceptance criteria (from SPEC.md)

- [ ] 401 on a protected endpoint clears the session and redirects to `/login`
- [ ] 401 on `/api/auth/login` or `/api/auth/register` does not redirect
- [ ] Logged-out nav shows `/login` and `/register` links, no logout control
- [ ] Logged-in nav shows the user's name and a working logout button
- [ ] `/profile` with no cached user triggers exactly one `profile()` call
- [ ] `/profile` with a cached user triggers no `profile()` call
- [ ] Manual "Charger mon profil" button removed

## Deviations from the plan

_None yet._
