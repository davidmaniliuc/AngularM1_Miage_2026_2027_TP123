# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the teacher grading the TP (M1 MIAGE, Angular course 2026-2027). They run the app locally with the demo account (`demo@example.com`), go through the features required by `SUJET_ETUDIANT_TP1.md`, `SUJET_ETUDIANT_TP2.md` and `SUJET_ETUDIANT_TP3.md`, read the code and tests, and check the evidence in `screenshots/` and `RAPPORT_IA_MODELE.md`.

The app is built as if for a real user too: someone who keeps a personal PS1 library (their own disc dumps and BIOS), plays in the browser, and listens to music next to it. That user comes second; grading comes first.

## Product Purpose

A web app with three areas behind login:

- **Jeux**: a PS1 game library (title, serial, genre, region, year, favorite, cover), disc import (`.chd`, `.cue`/`.bin`, auto-identified), a detail page, and in-browser play through the `@davidmaniliuc/substation` emulator core (WASM).
- **BIOS** (under Jeux): upload and check PS1 BIOS files, pick a default one. Always private.
- **Musique**: upload audio tracks (MP3, WAV, OGG, M4A/ALAC, FLAC), paginated library, private/public visibility, player with waveform and cover-based colors.

Success means: every TP mission works for the grader without breaking earlier missions, the build passes, the tests pass, and each member can explain the code.

## Positioning

A student project that grew from the required guitar-practice audio app into a personal PS1 library with a real emulator running in the browser, keeping all the TP1 to TP3 features working on top of it.

## Operating Context

- Run locally: backend Bun + Hono + MongoDB (Atlas or local Docker) on `:3000`, Angular frontend on `:4200` with a proxy. `docker-compose.yml` runs the full stack.
- Grading happens on a desktop browser, with DevTools open to check Network and Console (see TP3 evidence).
- Two-person team working on GitHub with issues and branches. AI assistants are allowed; every step is logged in `RAPPORT_IA_MODELE.md`.
- UI language: French.

## Capabilities and Constraints

- Contract: `API_CONTRACT.md` is the source of truth for the HTTP API. TP features (auth, profile, pagination, upload with progress, delete with confirmation, audio playback) must keep working.
- Frontend: Angular 22, Angular Material, standalone components, Vitest tests.
- Music: oriented toward game soundtracks, but any music is accepted. No link between tracks and games for now.
- Private by default: tracks are private unless set public; games and discs are visible only to their owner; BIOS always private.
- No game or BIOS file is committed to the repo; test discs are built in memory.
- Open: the product name. "Guitar Practice Cloud" no longer fits and will change; the new name is not decided yet.

## Brand Commitments

- Name: open (see above). Do not invent a new name without the team.
- Existing assets: logo and favicon made of the four PlayStation button symbols in a 2x2 grid (triangle, circle / cross, square), drawn in SVG (`frontend-starter/public/favicon.svg`, inline in `app.html`).

## Evidence on Hand

- Demo account with 9 fictional homebrew games and their covers (seeded by the backend).
- Screenshots per mission in `screenshots/`, test report in `RAPPORT_TESTS_TP3.md`, AI log in `RAPPORT_IA_MODELE.md`.
- No real users, testimonials or usage data. Do not make any up.

## Product Principles

1. Never break a TP mission: required features and the API contract come before new ideas.
2. Every feature has to be explainable and tested.
3. Act like a real product: real errors, loading states and empty states, not a demo shell.
4. The user's files stay theirs: private by default, owner-only access.
