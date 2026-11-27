---
name: Guitar Practice Cloud (nom provisoire)
description: Your shelf of PS1 cases. A black case spine holds the app, every game and album is a jewel case.
colors:
  boitier: "light-dark(#e2e4e8, #141518)"
  jaquette: "light-dark(#f6f7f9, #1e1f23)"
  encre: "light-dark(#121316, #ececef)"
  encre-douce: "light-dark(#4f525a, #a6a9b1)"
  arete: "light-dark(#a9adb5, #4a4d55)"
  arete-douce: "light-dark(#cbced4, #2d2f34)"
  arete-controle: "light-dark(#7a7e87, #6a6d76)"
  on-encre: "light-dark(#ffffff, #121316)"
  dos: "#0b0b0c"
  dos-releve: "#1b1b1e"
  dos-encre: "#ececee"
  dos-encre-douce: "#8e9199"
  dos-actif: "#f6f7f9"
  dos-actif-encre: "#121316"
  ps-triangle: "#3eb489"
  ps-rond: "#e0463f"
  ps-croix: "#4a7bd6"
  ps-carre: "#e27bb4"
  lecture: "light-dark(#c4352e, #f06a62)"
  lecture-dos: "#f06a62"
  onde-repos: "#63656c"
  erreur: "light-dark(#b3261e, #ff8a80)"
  erreur-container: "light-dark(#fbe9e7, #4a1a17)"
  on-erreur-container: "light-dark(#5c1410, #ffdad6)"
  format-mp3: "#17664f"
  format-m4a: "#3d55b8"
  format-wav: "#a8671c"
  format-ogg: "#8a3d86"
  format-flac: "#2f6f8f"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  mono:
    fontFamily: "Spline Sans Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
  mono-spine:
    fontFamily: "Spline Sans Mono, ui-monospace, monospace"
    fontSize: "9.5px"
    fontWeight: 500
    letterSpacing: "0.12em"
rounded:
  case: "2px"
  control: "3px"
  dialog: "4px"
  round: "50%"
spacing:
  rail: "216px"
  dock: "76px"
  case-spine: "22px"
  control-height: "40px"
  field-height: "42px"
  grid-gap-row: "32px"
  grid-gap-col: "26px"
  page-x: "clamp(16px, 4vw, 48px)"
components:
  button-primary:
    backgroundColor: "{colors.encre}"
    textColor: "{colors.on-encre}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 20px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.encre}"
    rounded: "{rounded.control}"
    height: "40px"
  segmented-selected:
    backgroundColor: "{colors.encre}"
    textColor: "{colors.on-encre}"
    rounded: "{rounded.control}"
    height: "40px"
  input-field:
    backgroundColor: "{colors.jaquette}"
    textColor: "{colors.encre}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 12px"
  spine-rail:
    backgroundColor: "{colors.dos}"
    textColor: "{colors.dos-encre}"
    width: "216px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.dos-encre-douce}"
    rounded: "{rounded.control}"
    height: "42px"
    padding: "0 10px"
  nav-item-active:
    backgroundColor: "{colors.dos-actif}"
    textColor: "{colors.dos-actif-encre}"
  jewel-case:
    backgroundColor: "{colors.jaquette}"
    rounded: "{rounded.case}"
  player-dock:
    backgroundColor: "{colors.dos}"
    textColor: "{colors.dos-encre}"
    height: "76px"
  form-card:
    backgroundColor: "{colors.jaquette}"
    rounded: "{rounded.control}"
    width: "520px"
---

# Design System: Guitar Practice Cloud (nom provisoire)

## Overview

**Creative North Star: "Le Boîtier"**

The app is a shelf of PS1 jewel cases. The black case spine is the shell: a 216px rail on the left that names the section you are on, and a black tray docked at the bottom that holds what is playing. Everything else is clear-case plastic: a grey ground, lighter inlay surfaces, thin case-edge borders, square corners. Every game and every album is a case, with a black strip down its left edge that carries the serial (games) or the format (tracks) in small mono capitals.

The tone is physical and quiet. Colour comes from the covers and from the four controller buttons, never from a UI accent: primary actions are solid ink, secondary actions are outlined ink, and the controller colours appear as a four-colour strip and as section marks (Jeux is the blue cross, Musique the red circle, Profil the green triangle). Light and dark follow the system through `light-dark()` pairs; the spine, the case strips and the player stay black in both modes. The world refuses the generic dark media dashboard: grey cards with one purple accent and a top bar of pills.

Density is a working library, not a showcase: 14px body, 40px controls, a cover grid with generous gutters, a tight track list with hairline rows.

**Key Characteristics:**
- Black spine rail (left) and black player tray (bottom), identical in light and dark.
- Clear-case grey ground with lighter inlay surfaces and 1px case-edge borders.
- Every item is a jewel case with a 22px black spine strip printing its serial or format vertically.
- Ink, not colour, for actions; controller colours only as marks and the strip.
- Archivo for UI, Spline Sans Mono for every number, serial, size, date and format.
- Square 2-3px corners; soft physical drop shadows on cases only.

## Colors

Clear plastic grey and ink, a black spine, and four controller colours used as marks.

### Primary
- **Encre** (light-dark #121316 / #ececef): text, primary buttons, selected segments, active sub-tab underline, focus border on inputs. The action colour of the system is ink.
- **On-encre** (#ffffff / #121316): text on solid-ink buttons and selected segments.

### Secondary
- **Dos** (#0b0b0c): the spine rail, the case spine strips, the player tray, the track-cover hinge, the BIOS chip, the empty-state ring. Same in both modes.
- **Dos relevé** (#1b1b1e): raised spine surfaces: nav hover, avatar tile, the 3px inner lip on the rail and tray.
- **Dos encre / dos encre douce** (#ececee / #8e9199): text on the spine; soft variant for inactive nav, region codes, player times.

### Tertiary
- **PS Croix** (#4a7bd6): Jeux symbol, focus ring (`:focus-visible` 2px outline), text selection.
- **PS Rond** (#e0463f): Musique symbol, favourite heart when on.
- **PS Triangle** (#3eb489): Profil symbol.
- **PS Carré** (#e27bb4): fourth segment of the strip and the logo.
- **Lecture** (#c4352e / #f06a62): the "now playing" tint when a cover gives no colour; covers override it with their own accent pair.
- **Format colours** (mp3 #17664f, m4a #3d55b8, wav #a8671c, ogg #8a3d86, flac #2f6f8f): fill of a track cover that has no artwork.

### Neutral
- **Boîtier** (#e2e4e8 / #141518): page ground, input fill on form cards.
- **Jaquette** (#f6f7f9 / #1e1f23): inlay surfaces: cases, form cards, dialogs, menus, search, segmented control, active nav item.
- **Encre douce** (#4f525a / #a6a9b1): secondary text, captions, column headers, icons in fields.
- **Arête** (#a9adb5 / #4a4d55): 1px case-edge borders on cases, controls, dialogs.
- **Arête douce** (#cbced4 / #2d2f34): hairlines between list rows and segments, progress track.
- **Arête contrôle** (#7a7e87 / #6a6d76): 1px edge of inputs, selects, outlined buttons, the segmented control and the Favoris toggle. At least 3:1 against both the ground and the inlay (WCAG 1.4.11); cases and dialogs keep the lighter Arête.
- **Onde repos** (#63656c): unplayed waveform bars on the black tray, 3.4:1 against it.
- **Lecture dos** (#f06a62): the playing tint on the black tray when the cover gives no colour (the tray is black in both modes, so it always takes the light-on-dark red).
- **Erreur** family: Material error values, used for the error banner and destructive menu items only.

### Named Rules
**The Ink Action Rule.** The primary action is solid ink, the secondary is outlined ink. No UI hue is ever the button colour; Material's azure seed is overridden to ink.

**The Four Buttons Rule.** The controller colours appear as the four-colour strip (spine foot, form-card spine, mobile top-bar edge, logo) and as one-symbol section marks. They never fill a surface or a button.

**The Cover Speaks Rule.** Playing state takes its colour from the track's cover (`--cover-accent`), falling back to Lecture red. Colour in the content area comes from artwork, not from the chrome.

## Typography

**Display Font:** Archivo (with system-ui, sans-serif)
**Body Font:** Archivo
**Label/Mono Font:** Spline Sans Mono (with ui-monospace, monospace)

**Character:** A sturdy grotesk at heavy weights for titles, paired with a mono that reads like the print on a disc spine.

### Hierarchy
- **Display** (800, 34px, 1.1, -0.025em): the page h1 for Jeux, Musique, Profil; 28px under a 680px container. Followed by a mono summary ("27 pistes").
- **Headline** (800, 30px, 1.1, -0.02em): game sheet title, form-card h1.
- **Title** (600, 15px, 1.25): case captions, track titles, nav items, sub-tabs.
- **Body** (400, 14px, 1.5): base text; empty-state copy capped at 38-46ch.
- **Label** (600, 13px): form labels, metadata terms.
- **Mono** (400, 12-13px, tabular-nums): summaries, sizes, dates, durations, the "serial · genre · year" caption.
- **Mono spine** (500, 8.5-11px, 0.08-0.14em, uppercase, vertical): text printed on case spines, track-cover hinges and column headers (11px).

### Named Rules
**The Mono Numbers Rule.** Every serial, size, count, date, time and format is in Spline Sans Mono with tabular figures. Words are Archivo.

**The Printed Spine Rule.** Spine text runs vertically (`writing-mode: vertical-rl`, rotated 180deg) in mono capitals with wide tracking, light ink on black.

## Layout

The shell is a two-column grid: the 216px spine rail (sticky, full height) and the main field (padding 36px top, `clamp(16px, 4vw, 48px)` sides, content capped at 1240px). When a track is loaded the player tray is fixed at the bottom, starting at the rail's edge, 76px tall, and main gains bottom padding to clear it.

The player is mounted in the shell, not in a page: it persists across Jeux, Musique and Profil and stops on logout.

Pages share one header pattern: h1 with a mono summary, then (on Jeux) sub-tabs on a 1px hairline with a 3px ink underline on the active tab, then a toolbar of 40px controls with the primary action at the right end. Games sit in an auto-fill grid (min 168px, gaps 32px rows / 26px columns). Tracks are a list with a mono column header and hairline rows on a fixed 68px / 1fr / 96px / 120px / 40px track.

Responsive: at 760px and below the spine lies down into a 56px top bar. Product name, user name and logout label become screen-reader-only; the four-colour strip runs along the bar's bottom edge (3px); nav items lose their inlay pill and the active one is underlined in its own symbol colour (cross blue, circle red, triangle green). The player spans full width. Pages use container queries (680px toolbar wrap, 560px track row collapse, 640px player stack).

## Elevation & Depth

Depth is physical and sparse: the surfaces are flat plastic separated by 1px edges, and only objects you could pick up (cases, the form card, the detached player tray) cast a shadow. Shadows are soft, negative-spread drops, never hard offsets.

### Shadow Vocabulary
- **Case rest** (`box-shadow: 0 10px 18px -12px #000a`): game cases in the grid.
- **Case lifted** (`box-shadow: 0 18px 24px -14px #000b`, plus `translateY(-4px)`): hovered or focused case.
- **Case large** (`box-shadow: 0 22px 36px -22px #000b`): the case on a game sheet.
- **Track cover** (`box-shadow: 0 6px 10px -8px #000a`): the small CD case in a track row.
- **Form card** (`box-shadow: 0 18px 40px -24px #0007`): login, register, profile card.
- **Tray** (`box-shadow: inset 0 3px 0 #1b1b1e, 0 -12px 28px -20px #000c`): the player tray; the rail uses the same inner lip on its right edge.

### Named Rules
**The Only Cases Cast Rule.** Toolbars, fields, lists, banners and nav carry no shadow. If it is not a case or the tray, it is flat.

## Shapes

Square case geometry. Cases and covers use 2px corners, controls and cards 3px, dialogs 4px; Material's pill shapes are overridden everywhere. Borders are 1px case edges. Circles are reserved for disc-like things: the play button, the spinning disc, the empty-state ring, the favourite backing. Empty states use a 1.5px dashed edge. Each case carries a faint diagonal plastic glare (white gradient at 115deg plus a 1px top highlight) over its cover.

## Components

### Buttons
- **Shape:** square-cornered (3px).
- **Primary:** solid ink, on-encre text, weight 600, 40px tall in toolbars, 42px on form cards. Hover mixes 14% of the ground into the ink.
- **Secondary:** outlined with the case-edge colour, ink text.
- **Text:** ink text, used for "Effacer les filtres" and logout on the spine.
- **Focus:** 2px PS Croix outline, 2px offset.

### Segmented control and toggles
- **Style:** a 40px inlay box with a 1px edge; segments split by soft hairlines; inactive segments in soft ink.
- **Selected:** solid ink with on-encre text. The Favoris toggle follows the same pattern, with its heart turning PS Rond when on.

### Cards / Containers
- **Form card:** 520px inlay card with a 28px black spine column on its left carrying four 4px x 14px controller bars, 3px corners, 1px edge, form-card shadow, 32px padding.
- **Dialogs and menus:** inlay surface, 4px / 3px corners.

### Inputs / Fields
- **Style:** inlay fill (ground fill on form cards), 1px Arête contrôle edge, 3px corners, 40-42px tall, 12px side padding.
- **Hover / Focus:** edge darkens to soft ink on hover; on focus it becomes ink with a 1px ink ring, no glow.
- **Error:** a banner in the error container with a tinted 1px border and an error icon.

### Navigation
- **Spine rail:** logo (a 2x2 grid of the four controller symbols, drawn in stroke, no tile behind it) and the product name in 17px/800; then Jeux, Musique, Profil, each 42px tall with its 16px controller symbol in its colour (cross, circle, triangle). No counts. Inactive items in soft spine ink; hover raises to dos relevé; the active item is the inlay pulled out of the spine: the light jaquette (#f6f7f9, ink #121316) in both modes, because the spine itself does not change with the mode. The foot holds the four-colour strip (4px), the user's initial tile and name, and Déconnexion.
- **Sub-tabs:** 15px/600 links on a hairline, 28px apart, active one with a 3px ink underline.
- **Mobile:** see Layout.

### Jewel Case (signature)
A case is a 22px black spine strip plus a square cover on an inlay fill, 1px edge, 2px corners, case-rest shadow and plastic glare. The spine prints the serial at the top and the region code at the bottom. Hover lifts the case 6px with a -1.5deg tilt and slides a black PS1 disc (rainbow sheen, hub in the ground colour) 42% out to the right with a 160deg turn, over the neighbouring case (`cubic-bezier(0.16, 1, 0.3, 1)`); no motion under reduced motion. Below the case: title at 15px/600, then a mono caption "serial · genre · year" (the serial repeats what the spine prints; the caption is pinned by an existing unit test). A 44px favourite target sits on the top-right corner over a dark disc.

### Track Row
A CD case 68 x 54px: a 16px black hinge printing the format, the cover (or format colour) beside it, hover reveals a play overlay, tilts the case open on its hinge (`perspective(420px) rotateY(-16deg)`) and slides a silver CD 24px out to the right; the case column is 84px so the CD clears the title. No motion under reduced motion. The row playing is tinted with a gradient from the cover's accent into the inlay, with a three-bar equaliser in the same colour (static under reduced motion). Size and date in mono on the right.

### Player Tray (signature)
A black tray fixed at the bottom, right of the rail, in both modes. The cover sits with a silver disc behind it, tinted by the cover's accent; the disc slides out and spins (2.4s linear) while audio plays and stops under reduced motion. A 44px round play button in spine ink. The waveform is a row of bars, unplayed in onde repos, played in the cover accent, growing slightly under the pointer and while dragging.

## Do's and Don'ts

### Do:
- **Do** put every new item (game, album, BIOS, track) in a case with a black spine strip printing its identifier in mono.
- **Do** keep the spine rail, case strips and player tray black (#0b0b0c) in light and dark.
- **Do** use solid ink for the one primary action per toolbar, placed at its right end, and outlined ink for the rest.
- **Do** set every number, serial, size and date in Spline Sans Mono with tabular figures.
- **Do** mark sections with their controller symbol and colour: Jeux cross blue, Musique circle red, Profil triangle green.
- **Do** declare every themed colour as a `light-dark()` pair on `html` and let the system choose.
- **Do** stop every spinning, lifting or bouncing motion under `prefers-reduced-motion`.

### Don't:
- **Don't** use a coloured accent for buttons, links or selection states; Material's azure stays overridden by ink.
- **Don't** round corners past 4px or use pill shapes, except for disc-like circles.
- **Don't** put shadows on toolbars, fields, lists or nav; only cases and the tray cast.
- **Don't** add counts or badges to the spine nav.
- **Don't** fill surfaces or buttons with the controller colours; they are marks and strips only.
