# PS1 Community Platform — Project Concept

Working draft · 8 October 2026 · Project name to be decided

## The idea

Evolve the existing music application into a PS1 gaming platform built around an emulator I have already developed. The website would let users organise games, play supported titles in their browser, and share games, cheats, and patches. It would also offer a download link for the fuller desktop emulator, currently available for macOS as a `.dmg`.

The university project allows broad creative freedom, so the application can move away from music while reusing useful parts of the existing project.

## What already exists

- An Angular frontend and a Bun/Hono backend with MongoDB.
- Accounts, authentication, file uploads, and a music library that can provide a foundation for the new application.
- A separately developed emulator with a working but very limited WebAssembly version.
- A fuller native emulator for macOS.

The emulator has not yet been assessed or integrated into this web project. Browser compatibility and supported game formats still need to be established.

## Main features

### Personal game library

Users can upload and organise games in their own library. The platform can include homebrew, open-source, and commercial game entries. Adding a game to a personal library and publishing its files for other people to download are separate actions.

Details to refine include game descriptions, cover images, tags, search, and library organisation. Whether game files are stored on the server or selected locally for browser play remains open.

### Browser emulation

Users can launch supported games directly from the website using the existing WebAssembly emulator.

The browser player is an experimental, limited version. Game pages should make compatibility clear rather than imply that every PS1 game will run. The first demonstration can focus on a small selection of games or homebrew programs known to work.

### Game sharing

Users can choose to make eligible games publicly available to other users. Homebrew and open-source releases are potential content sources, but permission to redistribute must be considered for each release.

Before publishing a game, the uploader must check a required agreement confirming that they are allowed to distribute it. Proposed wording:

> I confirm that I own the rights to distribute this game, or that its licence or rights holder permits redistribution.

The checkbox is a record of the uploader's declaration, not a verification of their rights. The publishing flow should keep the game private until the required declaration is completed.

Possible supporting measures to refine include a licence or permission-source field, reports, and a process for removing disputed uploads. The agreement wording is a product draft, not a completed legal policy.

### Community cheats and patches

Users can share cheat codes and game patches, linked to the relevant game and version.

Examples include:

- Cheat codes, with descriptions and usage instructions.
- Translation patches.
- Bug fixes and compatibility patches.
- Gameplay modifications.

Patches would contain changes to apply to a user's own copy rather than a complete modified game. Each submission could identify the required region or version and explain how to apply it. Hosting patches and automatically applying them in the browser are separate features; automatic application has not been decided.

### Desktop emulator download

A dedicated page provides the macOS `.dmg` download for the fuller emulator. It can include the version, supported Macs, installation instructions, and release notes.

The browser player offers an accessible way to try the emulator, while the download page gives users access to the native application. Windows and Linux desktop versions are outside the current idea.

## Example user journey

1. A user creates an account and browses game entries.
2. They add games to their personal library or upload a homebrew release.
3. They launch a compatible title in the browser.
4. They find or contribute cheats and patches for a specific game version.
5. If publishing game files, they complete the required redistribution declaration.
6. They can download the macOS emulator for the fuller native experience.

## Suggested first version — open for revision

Start with accounts, a game catalogue and personal library, game detail pages, a browser player for a few verified titles, and the macOS download page. Add a simple publishing flow with the required agreement, plus basic cheat and patch submissions.

Keep the web application useful even when a game cannot run in the browser. Improving emulator compatibility can continue separately rather than becoming a prerequisite for completing the university project.

Features such as ratings, comments, cloud saves, automatic patching, and multiplayer are possible later additions, not agreed requirements.

## Questions to refine

- What is the platform's name and visual identity?
- Which games and file formats does the WASM emulator reliably support today?
- Which files should be uploaded to the server, and which should remain local?
- How will commercial game entries work without making their files public by default?
- What information or review is required before a game becomes public?
- Which cheat and patch formats should the first version support?
- Does the emulator require a BIOS, and how will users supply it if needed?
- Which features are essential for the course deadline and grading requirements?

## Short pitch

A PS1 community platform where users organise their games, try supported titles through a browser-based emulator, share permitted game releases, cheats, and patches, and download a fuller macOS emulator developed by the project's author.
