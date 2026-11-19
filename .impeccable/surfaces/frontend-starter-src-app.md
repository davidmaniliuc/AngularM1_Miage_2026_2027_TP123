---
version: 1
slug: "frontend-starter-src-app"
primary_target: "frontend-starter/src/app"
related_targets: []
---

# App shell (all routes)

Scope: the whole Angular frontend (login, register, Jeux bibliothèque + BIOS, détail jeu, Musique, Profil, dialogs, player). Mode: Operate.

Audience: the grader on a desktop browser with DevTools open, then a real user keeping their PS1 dumps and game soundtracks. Task: browse, import, play, listen; every TP mission keeps working. Two equal sections (Jeux, Musique) in one shell, player persistent across both.

## Direction contract

THESIS: Your shelf of PS1 cases. The black PlayStation case spine is the app's shell, every game and album is a jewel case. Refuses the generic dark media dashboard (grey cards + one purple accent, top bar of pills).

OWN-WORLD: Black spine #0b0b0c rail on the left in both modes; main field is clear-case grey (light: #e4e6ea ground, #f7f8fa inlay surfaces; dark: smoked case #17181b / #1f2024). Ink #111 / #ececef. Archivo 400-800 for UI, Spline Sans Mono for serials, sizes, dates, counts. Square 2-3px radii, 1px case-edge borders, one physical drop shadow on cases only. Four controller colours as a strip on the spine and as section marks (Jeux cross blue, Musique circle red). Primary buttons are solid ink, secondary are outlined ink.

STORY: The visitor sees their shelf: which section they are on (spine), what they own (cases with serial on the spine strip), what is playing (the disc in the dock). They import, filter, open, play.

FIRST VIEWPORT: 216px black spine rail left: logo, product name, nav Jeux / Musique / Profil each with its controller symbol (counts dropped: the shell has no data source for them without extra requests), controller colour strip, user + Déconnexion at the bottom. Main: h1 34px/800 with mono summary, sub-tabs on a hairline, toolbar of 38px controls, grid of jewel-case covers with the serial printed vertically on a 22px black spine strip. Primary action "Importer" top-right of the toolbar in solid ink. Player docked at the bottom as a black tray right of the rail.

FORM: Le Boîtier (PS1 jewel case and spine), my top-ranked grounded candidate (1 of 7), taken as IMPECCABLE'S PICK. seed:7e23efef4911619e. Signature move: the spine strip carrying the serial (games) or format (tracks) on every cover, and the disc in the player dock that spins while audio plays (stops under prefers-reduced-motion).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
