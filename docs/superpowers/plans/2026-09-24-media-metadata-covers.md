# Métadonnées, pochettes et formats sans perte — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** chaque piste affiche sa pochette intégrée et ses tags (artiste, album), les ALAC sont convertis en FLAC lisible partout, et le FLAC est accepté à l'upload.

**Architecture :** le backend lit les métadonnées avec `music-metadata` (JavaScript pur). Il convertit l'ALAC en FLAC en lançant le ffmpeg du système avec `Bun.spawn`, et stocke la pochette à part dans `UPLOADS_DIR/covers/`. Un module `lib/ingest.ts` enchaîne ces étapes ; la route `POST /tracks` et le script de migration l'utilisent tous les deux. Le frontend charge la pochette en Blob, via un nouveau composant `app-track-cover`.

**Tech stack :** Bun 1.4.2, Hono 4.13, Mongoose 9.10, music-metadata 11.16.0, ffmpeg (système), Angular 22, Vitest.

**Spec :** `docs/superpowers/specs/2026-09-24-media-metadata-covers-design.md`

## Global Constraints

- ffmpeg sert **uniquement** à convertir l'ALAC. Les métadonnées et les pochettes sont lues par `music-metadata`.
- ffmpeg est lancé avec `Bun.spawn` et un **tableau d'arguments**, jamais une chaîne shell.
- Commande de conversion, exacte : `ffmpeg -nostdin -v error -y -i <src> -map 0:a -map 0:v? -c:a flac -c:v copy -disposition:v attached_pic <dst>`.
- Délai maximum de conversion : 60 s.
- `MAX_FILE_SIZE` = 100 Mo ; `MAX_COVER_SIZE` = 5 Mo.
- MIME déclarés acceptés : `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`, `audio/flac`, `audio/x-flac`.
- Le format réel est déterminé par le contenu. `mimeType` stocké : mp3 → `audio/mpeg`, wav → `audio/wav`, ogg → `audio/ogg`, aac → `audio/mp4`, alac et flac → `audio/flac`.
- `coverStoredName` et `storedName` ne sont **jamais** exposés par l'API.
- `GET /tracks/:id/cover` répond `404 { message: "Pochette inconnue" }` dans tous les cas d'échec (identifiant invalide, piste d'un autre utilisateur, pas de pochette, fichier absent).
- En-têtes de `/cover` : `Content-Type`, `Content-Length`, `Cache-Control: private, max-age=86400`, `X-Content-Type-Options: nosniff`.
- Titre : champ `title` non vide, sinon tag `title`, sinon nom du fichier.
- Le script de migration ne modifie **jamais** `title`.
- `package-lock.json` reste le fichier de référence du backend : les dépendances s'ajoutent avec `npm install`, pas `bun add`.
- Ne jamais modifier `RAPPORT_IA_MODELE.md`, `SUJET_ETUDIANT_TP*.md` ni `CONSEILS_POUR_UTIISER_ASSISTANT_AI.md`.
- Style du code : commentaires et messages de log en français, préfixes de log entre crochets (`[upload]`, `[tracks]`, `[cover]`, `[metadata]`, `[transcode]`, `[migration]`).

## Review Focus

1. **Fichier à l'extension trompeuse** (texte renommé en `.m4a`, zéros avec MIME `audio/mpeg`) : 400 « Format audio non accepté », sans fichier restant sur le disque. Test dans la tâche 5.
2. **ALAC sans pochette** : la conversion réussit (`-map 0:v?`) et `hasCover` vaut `false`. Tests dans les tâches 3 et 5.
3. **Échec de MongoDB après la conversion** : l'original, le FLAC et la pochette sont tous supprimés. Test dans la tâche 5, qui force l'erreur avec `spyOn(Track, "create")`.
4. **Pochette d'un autre utilisateur** : 404 et non 403, pour ne pas révéler que la piste existe. Test dans la tâche 6.
5. **Migration lancée deux fois** : le second passage ne change rien et ne supprime aucun fichier. Test dans la tâche 7.

---

## Structure des fichiers

**Backend**

| Fichier | Rôle |
|---|---|
| `backend/test/fixtures/*` (créés) | Fichiers audio de référence d'une seconde, avec leur script de génération |
| `backend/src/lib/metadata.ts` (créé) | `readMetadata()` et `kindOf()` : format réel, tags, pochette |
| `backend/src/lib/covers.ts` (créé) | Signature d'image, enregistrement, suppression et chemin d'une pochette |
| `backend/src/lib/transcode.ts` (créé) | `alacToFlac()` : lance ffmpeg |
| `backend/src/lib/ingest.ts` (créé) | `processAudio()` : métadonnées, conversion et pochette pour un fichier stocké |
| `backend/src/lib/uploads.ts` (modifié) | Crée aussi `covers/` ; ajout de `discardFiles()` |
| `backend/src/config.ts` (modifié) | 100 Mo, FLAC, `COVERS_DIR` |
| `backend/src/models/Track.ts`, `backend/src/types.ts` (modifiés) | Nouveaux champs, `hasCover` |
| `backend/src/routes/tracks.ts` (modifié) | Upload, `$project`, `/cover`, suppression |
| `backend/scripts/migrate-media.ts` (créé) | Migration des pistes existantes |
| `backend/Dockerfile`, `backend/.dockerignore` (créés), `docker-compose.yml` (modifié) | ffmpeg dans le conteneur |

**Frontend** (`frontend-starter/src/app/…`)

| Fichier | Rôle |
|---|---|
| `shared/models/track.model.ts` (modifié) | Nouveaux champs |
| `shared/utils/audio-file.ts` (modifié) | FLAC, 100 Mo |
| `shared/utils/track-subtitle.ts` (créé) | « Artiste · Album », sinon nom du fichier |
| `shared/services/track.service.ts` (modifié) | `cover(id)` |
| `components/track-cover/track-cover.ts` (créé) | Charge la pochette en Blob et gère l'ObjectURL |
| `components/track-card/*`, `components/audio-player/*` (modifiés) | Affichent la pochette et le sous-titre |
| `components/upload-dialog/*` (modifiés) | `.flac`, titre vide envoyé tel quel |

---

### Task 1: Fixtures, `music-metadata` et `lib/metadata.ts`

**Files :**
- Create : `backend/test/fixtures/generate.sh`, `backend/test/fixtures/README.md`, les fixtures générées
- Create : `backend/src/lib/metadata.ts`
- Test : `backend/test/metadata.test.ts`
- Modify : `backend/package.json`, `backend/package-lock.json`

**Interfaces :**
- Produit :
  ```ts
  export type AudioKind = "mp3" | "wav" | "ogg" | "aac" | "alac" | "flac";
  export interface AudioMetadata {
    kind: AudioKind | null;
    title?: string;
    artist?: string;
    album?: string;
    picture?: { format: string; data: Uint8Array };
  }
  export function kindOf(container: string | undefined, codec: string | undefined): AudioKind | null;
  export async function readMetadata(filePath: string): Promise<AudioMetadata>;
  ```
- Produit aussi : les fixtures `backend/test/fixtures/{alac-cover.m4a, alac-nocover.m4a, aac.m4a, flac-cover.flac, plain.mp3, plain.wav, plain.ogg, not-audio.m4a}`. Les deux fichiers avec pochette portent les tags `title=Sinus`, `artist=Testeur`, `album=Fixtures`.

- [ ] **Step 1 : installer la dépendance**

```bash
cd backend && npm install music-metadata@^11.16.0
```

Attendu : `package.json` contient `"music-metadata": "^11.16.0"` dans `dependencies`, et `package-lock.json` est mis à jour.

- [ ] **Step 2 : écrire le script de génération des fixtures**

Créer `backend/test/fixtures/generate.sh` :

```bash
#!/usr/bin/env bash
# Génère les fichiers audio de référence des tests (1 s de sinus à 440 Hz).
# Les fichiers produits sont commités : ce script ne sert qu'à les recréer.
# Nécessite ffmpeg avec libmp3lame et libopus (build Homebrew ou Debian).
set -euo pipefail
cd "$(dirname "$0")"

F=(ffmpeg -nostdin -v error -y)
SINE=(-f lavfi -i sine=frequency=440:duration=1)
TAGS=(-metadata title=Sinus -metadata artist=Testeur -metadata album=Fixtures)

"${F[@]}" -f lavfi -i color=c=red:s=64x64 -frames:v 1 cover.jpg
"${F[@]}" -f lavfi -i color=c=blue:s=64x64 -frames:v 1 cover.png

"${F[@]}" "${SINE[@]}" -i cover.jpg -map 0:a -map 1:v -c:a alac -c:v copy \
  -disposition:v attached_pic "${TAGS[@]}" alac-cover.m4a
"${F[@]}" "${SINE[@]}" -c:a alac alac-nocover.m4a
"${F[@]}" "${SINE[@]}" -c:a aac -b:a 64k aac.m4a
"${F[@]}" "${SINE[@]}" -i cover.png -map 0:a -map 1:v -c:a flac -c:v copy \
  -disposition:v attached_pic "${TAGS[@]}" flac-cover.flac
"${F[@]}" "${SINE[@]}" -c:a libmp3lame -b:a 64k plain.mp3
"${F[@]}" "${SINE[@]}" -c:a pcm_s16le plain.wav
"${F[@]}" "${SINE[@]}" -c:a libopus -b:a 32k plain.ogg
printf "ceci n'est pas de l'audio\n" > not-audio.m4a

rm cover.jpg cover.png
```

Créer `backend/test/fixtures/README.md` :

```markdown
# Fixtures audio des tests

Fichiers d'une seconde, générés par `bash generate.sh` (ffmpeg requis).

| Fichier | Contenu |
|---|---|
| `alac-cover.m4a` | ALAC + tags (Sinus / Testeur / Fixtures) + pochette JPEG |
| `alac-nocover.m4a` | ALAC sans tags ni pochette |
| `aac.m4a` | AAC sans tags |
| `flac-cover.flac` | FLAC + tags + pochette PNG |
| `plain.mp3` | MP3 sans tags |
| `plain.wav` | WAV PCM 16 bits |
| `plain.ogg` | Ogg Opus |
| `not-audio.m4a` | Texte renommé en `.m4a` |
```

- [ ] **Step 3 : générer les fixtures**

Run : `bash backend/test/fixtures/generate.sh && ls -la backend/test/fixtures`
Attendu : les 8 fichiers audio sont présents, chacun fait moins de 100 Ko.

- [ ] **Step 4 : écrire le test qui échoue**

Créer `backend/test/metadata.test.ts` :

```ts
import { test, expect } from "bun:test";
import os from "node:os";
import path from "node:path";
import { kindOf, readMetadata, type AudioKind } from "../src/lib/metadata";

const fixture = (name: string) => path.join(import.meta.dir, "fixtures", name);

/*
 * Les chaînes container/codec ont été relevées sur les fixtures avec
 * music-metadata 11.16.0. Si une mise à jour de la librairie les change,
 * ces tests le signalent.
 */
test.each<[string, AudioKind]>([
  ["alac-cover.m4a", "alac"],
  ["alac-nocover.m4a", "alac"],
  ["aac.m4a", "aac"],
  ["flac-cover.flac", "flac"],
  ["plain.mp3", "mp3"],
  ["plain.wav", "wav"],
  ["plain.ogg", "ogg"],
])("%s est reconnu comme %s", async (name, kind) => {
  expect((await readMetadata(fixture(name))).kind).toBe(kind);
});

test("un fichier texte renommé en .m4a n'est pas de l'audio", async () => {
  expect((await readMetadata(fixture("not-audio.m4a"))).kind).toBeNull();
});

test("un fichier absent n'est pas de l'audio", async () => {
  expect((await readMetadata(fixture("absent.mp3"))).kind).toBeNull();
});

test("des zéros étiquetés MP3 ne sont pas de l'audio", async () => {
  const zeros = path.join(os.tmpdir(), `gpc-zeros-${process.pid}.mp3`);
  await Bun.write(zeros, new Uint8Array(2048));
  try {
    expect((await readMetadata(zeros)).kind).toBeNull();
  } finally {
    await Bun.file(zeros).delete();
  }
});

test("tags et pochette JPEG d'un ALAC", async () => {
  const meta = await readMetadata(fixture("alac-cover.m4a"));
  expect(meta.title).toBe("Sinus");
  expect(meta.artist).toBe("Testeur");
  expect(meta.album).toBe("Fixtures");
  expect(meta.picture?.format).toBe("image/jpeg");
  expect(Array.from(meta.picture!.data.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
});

test("pochette PNG d'un FLAC", async () => {
  const meta = await readMetadata(fixture("flac-cover.flac"));
  expect(meta.picture?.format).toBe("image/png");
});

test("un fichier sans tags n'a ni titre ni pochette", async () => {
  const meta = await readMetadata(fixture("plain.mp3"));
  expect(meta.title).toBeUndefined();
  expect(meta.artist).toBeUndefined();
  expect(meta.picture).toBeUndefined();
});

test("kindOf refuse les combinaisons inconnues", () => {
  expect(kindOf(undefined, undefined)).toBeNull();
  expect(kindOf("MPEG", undefined)).toBeNull();
  expect(kindOf("Matroska", "Vorbis I")).toBeNull();
  expect(kindOf("M4A/mp42/isom", "ALAC")).toBe("alac");
  expect(kindOf("MPEG-4/isom", "MPEG-4/AAC")).toBe("aac");
});
```

- [ ] **Step 5 : vérifier que le test échoue**

Run : `cd backend && bun test test/metadata.test.ts`
Attendu : FAIL, `Cannot find module '../src/lib/metadata'`.

- [ ] **Step 6 : écrire l'implémentation**

Créer `backend/src/lib/metadata.ts` :

```ts
import path from "node:path";
import { parseFile, selectCover } from "music-metadata";

/** Formats audio acceptés, déterminés par le contenu du fichier. */
export type AudioKind = "mp3" | "wav" | "ogg" | "aac" | "alac" | "flac";

export interface AudioMetadata {
  /** null : le contenu n'est pas un format accepté. */
  kind: AudioKind | null;
  title?: string;
  artist?: string;
  album?: string;
  picture?: { format: string; data: Uint8Array };
}

/**
 * Traduit le couple (conteneur, codec) renvoyé par music-metadata.
 * Un .m4a peut contenir de l'AAC ou de l'ALAC : c'est le codec qui décide.
 */
export function kindOf(
  container: string | undefined,
  codec: string | undefined,
): AudioKind | null {
  if (!container || !codec) return null;
  if (codec === "ALAC") return "alac";
  if (container === "FLAC" && codec === "FLAC") return "flac";
  if (/^(M4A|MPEG-4)/.test(container) && codec.includes("AAC")) return "aac";
  if (container === "MPEG" && codec.endsWith("Layer 3")) return "mp3";
  if (container === "WAVE") return "wav";
  if (container === "Ogg") return "ogg";
  return null;
}

/** Une chaîne vide ou faite d'espaces ne vaut pas un tag. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Lit les tags et la pochette sans décoder l'audio : music-metadata ne
 * parcourt que les zones de métadonnées (ID3, atomes MP4, blocs FLAC…).
 * Le type MIME annoncé par le navigateur n'intervient pas.
 */
export async function readMetadata(filePath: string): Promise<AudioMetadata> {
  let parsed;
  try {
    parsed = await parseFile(filePath);
  } catch (error) {
    console.warn(`[metadata] Fichier illisible : ${path.basename(filePath)}`, error);
    return { kind: null };
  }

  const { format, common } = parsed;
  // selectCover préfère « Cover (front) », sinon prend la première image.
  const cover = selectCover(common.picture);

  return {
    kind: kindOf(format.container, format.codec),
    title: clean(common.title),
    artist: clean(common.artist),
    album: clean(common.album),
    picture: cover ? { format: cover.format, data: cover.data } : undefined,
  };
}
```

- [ ] **Step 7 : vérifier que le test passe**

Run : `cd backend && bun test test/metadata.test.ts && bun run typecheck`
Attendu : PASS (15 tests), typecheck sans erreur.

- [ ] **Step 8 : commit**

```bash
git add backend/package.json backend/package-lock.json backend/test/fixtures backend/src/lib/metadata.ts backend/test/metadata.test.ts
git commit -m "feat(backend): lecture des métadonnées audio avec music-metadata"
```

---

### Task 2: `lib/covers.ts` et dossier des pochettes

**Files :**
- Create : `backend/src/lib/covers.ts`
- Modify : `backend/src/config.ts`, `backend/src/lib/uploads.ts:10-19` (`ensureUploadsDir`)
- Test : `backend/test/covers.test.ts`

**Interfaces :**
- Produit (`config.ts`) : `export const COVERS_DIR: string` (= `path.join(UPLOADS_DIR, "covers")`)
- Produit (`covers.ts`) :
  ```ts
  export const MAX_COVER_SIZE = 5 * 1024 * 1024;
  export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
  export function detectImageType(data: Uint8Array): ImageMime | null;
  export function coverPath(storedName: string): string;
  export async function saveCover(data: Uint8Array): Promise<{ storedName: string; mimeType: ImageMime } | null>;
  export async function removeCover(storedName: string): Promise<void>;
  ```
- Produit (`uploads.ts`) : `ensureUploadsDir()` crée aussi `COVERS_DIR`.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `backend/test/covers.test.ts` :

```ts
import { test, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import {
  MAX_COVER_SIZE,
  coverPath,
  detectImageType,
  removeCover,
  saveCover,
} from "../src/lib/covers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { COVERS_DIR } from "../src/config";

beforeAll(ensureUploadsDir);

const bytes = (...values: number[]) => new Uint8Array(values);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);

test("ensureUploadsDir crée le dossier des pochettes", () => {
  expect(fs.existsSync(COVERS_DIR)).toBe(true);
});

test("detectImageType reconnaît JPEG, PNG et WebP par leurs octets", () => {
  expect(detectImageType(JPEG)).toBe("image/jpeg");
  expect(detectImageType(PNG)).toBe("image/png");
  expect(detectImageType(WEBP)).toBe("image/webp");
});

test("detectImageType refuse le reste", () => {
  expect(detectImageType(new Uint8Array(0))).toBeNull();
  expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38))).toBeNull(); // GIF
  expect(detectImageType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")]))).toBeNull();
  expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
});

test("saveCover écrit sous un nom UUID et removeCover supprime", async () => {
  const saved = await saveCover(JPEG);
  expect(saved).not.toBeNull();
  expect(saved!.mimeType).toBe("image/jpeg");
  expect(saved!.storedName).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  expect(fs.existsSync(coverPath(saved!.storedName))).toBe(true);

  await removeCover(saved!.storedName);
  expect(fs.existsSync(coverPath(saved!.storedName))).toBe(false);
});

test("saveCover ignore une image inconnue sans lever d'erreur", async () => {
  expect(await saveCover(bytes(1, 2, 3))).toBeNull();
});

test("saveCover ignore une image de plus de 5 Mo", async () => {
  const big = new Uint8Array(MAX_COVER_SIZE + 1);
  big.set(JPEG);
  expect(await saveCover(big)).toBeNull();
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run : `cd backend && bun test test/covers.test.ts`
Attendu : FAIL, `Cannot find module '../src/lib/covers'`.

- [ ] **Step 3 : écrire l'implémentation**

Dans `backend/src/config.ts`, juste après la déclaration de `UPLOADS_DIR`, ajouter :

```ts
// Les pochettes extraites des fichiers audio sont rangées à part.
export const COVERS_DIR = path.join(UPLOADS_DIR, "covers");
```

Dans `backend/src/lib/uploads.ts`, importer `COVERS_DIR` avec le reste de la configuration et remplacer le corps de `ensureUploadsDir` :

```ts
import { ALLOWED_MIME, COVERS_DIR, MAX_FILE_SIZE, UPLOADS_DIR } from "../config";

/**
 * Crée le dossier des uploads et celui des pochettes au démarrage :
 * l'application doit en disposer avant d'accepter le premier fichier.
 */
export function ensureUploadsDir(): void {
  try {
    // recursive crée UPLOADS_DIR en même temps que son sous-dossier.
    fs.mkdirSync(COVERS_DIR, { recursive: true });
    console.log(`[startup] Dossier des uploads prêt : ${UPLOADS_DIR}`);
  } catch (error) {
    console.error("[startup] Impossible de créer le dossier des uploads", error);
    throw error;
  }
}
```

Créer `backend/src/lib/covers.ts` :

```ts
import crypto from "node:crypto";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { COVERS_DIR } from "../config";

// Une pochette dépasse rarement 1 Mo ; au-delà de 5 Mo, on l'ignore.
export const MAX_COVER_SIZE = 5 * 1024 * 1024;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

const EXTENSIONS: Record<ImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/**
 * Identifie une image par ses premiers octets (sa « signature »).
 * Le format annoncé par le tag n'est jamais cru : un fichier piégé pourrait
 * déclarer image/jpeg et contenir du SVG ou du HTML.
 */
export function detectImageType(data: Uint8Array): ImageMime | null {
  const startsWith = (signature: number[], offset = 0) =>
    data.length >= offset + signature.length &&
    signature.every((byte, index) => data[offset + index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // WebP : "RIFF", 4 octets de taille, puis "WEBP".
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

/** Chemin absolu d'une pochette stockée. */
export function coverPath(storedName: string): string {
  return path.join(COVERS_DIR, storedName);
}

/**
 * Enregistre une pochette sous un nom aléatoire. Renvoie null, sans lever
 * d'erreur, si l'image est refusée : une pochette ne bloque jamais l'upload.
 */
export async function saveCover(
  data: Uint8Array,
): Promise<{ storedName: string; mimeType: ImageMime } | null> {
  const mimeType = detectImageType(data);

  if (!mimeType) {
    console.warn("[cover] Pochette ignorée : format d'image non reconnu");
    return null;
  }

  if (data.byteLength > MAX_COVER_SIZE) {
    console.warn(`[cover] Pochette ignorée : ${data.byteLength} octets`);
    return null;
  }

  const storedName = crypto.randomUUID() + EXTENSIONS[mimeType];
  await Bun.write(coverPath(storedName), data);
  console.log(`[cover] Pochette écrite : ${storedName} (${data.byteLength} octets)`);

  return { storedName, mimeType };
}

/** Supprime une pochette stockée. L'appelant traite l'erreur éventuelle. */
export async function removeCover(storedName: string): Promise<void> {
  await fsPromises.unlink(coverPath(storedName));
  console.log(`[cover] Pochette supprimée : ${storedName}`);
}
```

- [ ] **Step 4 : vérifier que le test passe**

Run : `cd backend && bun test test/covers.test.ts test/uploads.test.ts && bun run typecheck`
Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add backend/src/config.ts backend/src/lib/uploads.ts backend/src/lib/covers.ts backend/test/covers.test.ts
git commit -m "feat(backend): stockage des pochettes avec contrôle de signature"
```

---

### Task 3: `lib/transcode.ts`

**Files :**
- Create : `backend/src/lib/transcode.ts`
- Test : `backend/test/transcode.test.ts`

**Interfaces :**
- Consomme : `readMetadata` (tâche 1), dans les tests uniquement.
- Produit :
  ```ts
  export interface TranscodeOptions { ffmpeg?: string; timeoutMs?: number }
  export async function alacToFlac(src: string, dst: string, options?: TranscodeOptions): Promise<void>;
  ```
  Valeurs par défaut : `ffmpeg = "ffmpeg"`, `timeoutMs = 60_000`. En cas d'échec, lève une `Error` dont le message commence par `ffmpeg n'est pas installé`, `ffmpeg interrompu` ou `ffmpeg a échoué`.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `backend/test/transcode.test.ts` :

```ts
import { test, expect, afterEach } from "bun:test";
import os from "node:os";
import path from "node:path";
import fsPromises from "node:fs/promises";
import { alacToFlac } from "../src/lib/transcode";
import { readMetadata } from "../src/lib/metadata";

const fixture = (name: string) => path.join(import.meta.dir, "fixtures", name);
const output = path.join(os.tmpdir(), `gpc-transcode-${process.pid}.flac`);

afterEach(() => fsPromises.rm(output, { force: true }));

test("ALAC → FLAC conserve les tags et la pochette", async () => {
  await alacToFlac(fixture("alac-cover.m4a"), output);

  const meta = await readMetadata(output);
  expect(meta.kind).toBe("flac");
  expect(meta.title).toBe("Sinus");
  expect(meta.artist).toBe("Testeur");
  expect(meta.picture?.format).toBe("image/jpeg");
});

test("un ALAC sans pochette se convertit aussi", async () => {
  await alacToFlac(fixture("alac-nocover.m4a"), output);

  const meta = await readMetadata(output);
  expect(meta.kind).toBe("flac");
  expect(meta.picture).toBeUndefined();
});

test("une source invalide donne une erreur avec le message de ffmpeg", async () => {
  await expect(alacToFlac(fixture("not-audio.m4a"), output)).rejects.toThrow(/^ffmpeg a échoué/);
});

test("ffmpeg absent donne une erreur explicite", async () => {
  await expect(
    alacToFlac(fixture("alac-cover.m4a"), output, { ffmpeg: "ffmpeg-introuvable" }),
  ).rejects.toThrow("ffmpeg n'est pas installé");
});

test("au-delà du délai, ffmpeg est interrompu", async () => {
  await expect(
    alacToFlac(fixture("alac-cover.m4a"), output, { timeoutMs: 1 }),
  ).rejects.toThrow(/^ffmpeg interrompu/);
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run : `cd backend && bun test test/transcode.test.ts`
Attendu : FAIL, `Cannot find module '../src/lib/transcode'`.

- [ ] **Step 3 : écrire l'implémentation**

Créer `backend/src/lib/transcode.ts` :

```ts
export interface TranscodeOptions {
  /** Exécutable à lancer ; modifiable pour les tests. */
  ffmpeg?: string;
  timeoutMs?: number;
}

/**
 * Convertit un ALAC (.m4a) en FLAC. Les deux formats sont sans perte, mais
 * Chrome et Firefox ne savent décoder que le FLAC.
 *
 * ffmpeg voit la pochette comme un flux vidéo d'une image :
 * - `-map 0:v?` la garde si elle existe (le `?` évite l'échec sinon) ;
 * - `-c:v copy` la recopie sans la réencoder ;
 * - `-disposition:v attached_pic` l'écrit dans un bloc PICTURE du FLAC.
 *
 * Les arguments sont passés en tableau : aucun shell n'intervient, donc un
 * nom de fichier ne peut pas injecter de commande.
 */
export async function alacToFlac(
  src: string,
  dst: string,
  { ffmpeg = "ffmpeg", timeoutMs = 60_000 }: TranscodeOptions = {},
): Promise<void> {
  let proc;
  try {
    proc = Bun.spawn(
      [
        ffmpeg, "-nostdin", "-v", "error", "-y",
        "-i", src,
        "-map", "0:a", "-map", "0:v?",
        "-c:a", "flac", "-c:v", "copy",
        "-disposition:v", "attached_pic",
        dst,
      ],
      { stdout: "ignore", stderr: "pipe", timeout: timeoutMs },
    );
  } catch (error) {
    // Bun lève ENOENT tout de suite si l'exécutable est introuvable.
    console.error("[transcode] ffmpeg introuvable", error);
    throw new Error("ffmpeg n'est pas installé", { cause: error });
  }

  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);

  if (proc.signalCode) {
    throw new Error(`ffmpeg interrompu (${proc.signalCode}) après ${timeoutMs} ms`);
  }

  if (exitCode !== 0) {
    throw new Error(`ffmpeg a échoué (code ${exitCode}) : ${stderr.trim()}`);
  }
}
```

- [ ] **Step 4 : vérifier que le test passe**

Run : `cd backend && bun test test/transcode.test.ts && bun run typecheck`
Attendu : PASS (5 tests).

- [ ] **Step 5 : commit**

```bash
git add backend/src/lib/transcode.ts backend/test/transcode.test.ts
git commit -m "feat(backend): conversion ALAC vers FLAC avec ffmpeg"
```

---

### Task 4: Modèle `Track`, `PublicTrack` et liste paginée

**Files :**
- Modify : `backend/src/models/Track.ts`, `backend/src/types.ts:30-39`, `backend/src/routes/tracks.ts:61-73` (`$project`)
- Test : `backend/test/tracks-list.test.ts`, `backend/test/models.test.ts`

**Interfaces :**
- Produit (`TrackDoc`) : `artist?: string; album?: string; coverStoredName?: string; coverMimeType?: string; transcodedFrom?: "alac"`
- Produit (`PublicTrack`) : `artist?: string; album?: string; transcodedFrom?: string; hasCover: boolean`

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter à la fin de `backend/test/tracks-list.test.ts` (ajouter `import { Track } from "../src/models/Track";` en tête) :

```ts
test("la liste expose artist, album et hasCover, jamais coverStoredName", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 2);
  await Track.updateOne(
    { title: "Piste 2" },
    {
      artist: "Frank Ocean",
      album: "Endless",
      coverStoredName: "secret.jpg",
      coverMimeType: "image/jpeg",
      transcodedFrom: "alac",
    },
  );

  const body = await json<PageBody>(
    await request("/api/tracks", { headers: authHeaders(token) }),
  );
  const [withCover, withoutCover] = body.items;

  expect(withCover).toMatchObject({
    title: "Piste 2",
    artist: "Frank Ocean",
    album: "Endless",
    transcodedFrom: "alac",
    hasCover: true,
  });
  expect(withCover).not.toHaveProperty("coverStoredName");
  expect(withCover).not.toHaveProperty("coverMimeType");
  expect(withoutCover).toMatchObject({ title: "Piste 1", hasCover: false });
  expect(withoutCover).not.toHaveProperty("artist");
});
```

Ajouter à `backend/test/models.test.ts`. Le fichier a déjà son `beforeAll(connectTestDb)` ; ajouter les imports `Track` et `mongoose` s'ils manquent :

```ts
test("toPublic() calcule hasCover sans exposer coverStoredName", async () => {
  const track = await Track.create({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Wither",
    originalName: "wither.m4a",
    storedName: "a.flac",
    mimeType: "audio/flac",
    size: 10,
    artist: "Frank Ocean",
    coverStoredName: "c.jpg",
    coverMimeType: "image/jpeg",
  });

  const pub = track.toPublic();
  expect(pub.hasCover).toBe(true);
  expect(pub.artist).toBe("Frank Ocean");
  expect(pub).not.toHaveProperty("coverStoredName");

  // Relu depuis la base, le champ n'est chargé qu'avec select("+coverStoredName").
  const reloaded = await Track.findById(track.id).select("+coverStoredName");
  expect(reloaded!.toPublic().hasCover).toBe(true);
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run : `cd backend && bun test test/tracks-list.test.ts test/models.test.ts`
Attendu : FAIL. `hasCover` est absent. Si `bun run typecheck` est lancé, il signale en plus les champs inconnus de `TrackDoc`.

- [ ] **Step 3 : écrire l'implémentation**

Dans `backend/src/types.ts`, remplacer `PublicTrack` par :

```ts
/** Champs d'une piste qu'une réponse HTTP peut exposer (jamais storedName ni coverStoredName). */
export interface PublicTrack {
  id: string;
  ownerId: string;
  title: string;
  originalName: string;
  /** Type du fichier stocké : audio/flac pour un ALAC converti. */
  mimeType: string;
  size: number;
  artist?: string;
  album?: string;
  /** "alac" si le fichier envoyé a été converti en FLAC. */
  transcodedFrom?: string;
  /** Une pochette est disponible sur GET /tracks/:id/cover. */
  hasCover: boolean;
  createdAt: Date;
}
```

Dans `backend/src/models/Track.ts` :

1. Remplacer le commentaire d'en-tête et `TrackDoc` :

```ts
/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio et sa
 * pochette restent sur le disque ; storedName et coverStoredName contiennent
 * les noms techniques utilisés côté serveur et ne sont jamais exposés par
 * toPublic().
 */
export interface TrackDoc {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  originalName: string;
  storedName: string;
  /** Type du fichier stocké (audio/flac après conversion d'un ALAC). */
  mimeType: string;
  size: number;
  artist?: string;
  album?: string;
  coverStoredName?: string;
  coverMimeType?: string;
  transcodedFrom?: "alac";
  createdAt: Date;
  updatedAt: Date;
}
```

2. Dans la définition du schéma, après `size`, ajouter :

```ts
    artist: { type: String, trim: true },
    album: { type: String, trim: true },
    coverStoredName: { type: String, select: false },
    coverMimeType: { type: String },
    transcodedFrom: { type: String, enum: ["alac"] },
```

3. Remplacer le corps de `toPublic` :

```ts
schema.method("toPublic", function toPublic(): PublicTrack {
  return {
    id: this.id as string,
    ownerId: String(this.ownerId),
    title: this.title,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    artist: this.artist,
    album: this.album,
    transcodedFrom: this.transcodedFrom,
    // coverStoredName n'est présent que si la requête l'a sélectionné.
    hasCover: Boolean(this.coverStoredName),
    createdAt: this.createdAt,
  };
});
```

Dans `backend/src/routes/tracks.ts`, remplacer l'étape `$project` par :

```ts
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        ownerId: { $toString: "$ownerId" },
        title: 1,
        originalName: 1,
        mimeType: 1,
        size: 1,
        artist: 1,
        album: 1,
        transcodedFrom: 1,
        // Vrai si le champ existe, sans jamais recopier sa valeur.
        hasCover: { $ne: [{ $type: "$coverStoredName" }, "missing"] },
        createdAt: 1,
      },
    },
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `cd backend && bun test && bun run typecheck`
Attendu : toute la suite passe.

- [ ] **Step 5 : commit**

```bash
git add backend/src/models/Track.ts backend/src/types.ts backend/src/routes/tracks.ts backend/test/tracks-list.test.ts backend/test/models.test.ts
git commit -m "feat(backend): champs artiste, album et pochette sur Track"
```

---

### Task 5: `lib/ingest.ts` et nouveau `POST /tracks`

**Files :**
- Create : `backend/src/lib/ingest.ts`
- Modify : `backend/src/config.ts` (`MAX_FILE_SIZE`, `ALLOWED_MIME`), `backend/src/lib/uploads.ts` (`discardFiles`), `backend/src/routes/tracks.ts` (`POST /`)
- Modify : `backend/test/helpers.ts` (`fixtureFile`), `backend/test/tracks-upload.test.ts`, `backend/test/uploads.test.ts`

**Interfaces :**
- Consomme : `readMetadata` (tâche 1), `saveCover` / `coverPath` (tâche 2), `alacToFlac` (tâche 3), les champs de `Track` (tâche 4).
- Produit (`uploads.ts`) : `export async function discardFiles(paths: string[]): Promise<void>`. Supprime chaque fichier, ignore ceux qui sont absents, journalise les échecs et **ne lève jamais d'erreur**.
- Produit (`ingest.ts`) :
  ```ts
  export interface ProcessedAudio {
    storedName: string;
    mimeType: string;
    size: number;
    title?: string;
    artist?: string;
    album?: string;
    cover?: { storedName: string; mimeType: string };
    transcodedFrom?: "alac";
  }
  export type ProcessResult = { ok: true; audio: ProcessedAudio } | { ok: false; message: string };
  export async function processAudio(storedName: string, options?: { extractCover?: boolean }): Promise<ProcessResult>;
  export function createdFiles(audio: ProcessedAudio, originalStoredName: string): string[];
  ```
  `processAudio` ne supprime **jamais** le fichier d'origine : l'appelant le fait après avoir mis la base à jour. Si elle lève une erreur, elle a déjà supprimé ce qu'elle avait créé.
- Produit (`helpers.ts`) : `export async function fixtureFile(name: string, type: string, as?: string): Promise<File>`

- [ ] **Step 1 : adapter les tests existants à la détection par contenu**

Les tests actuels envoient des zéros avec le MIME `audio/mpeg`. Ces fichiers seront désormais refusés, ce qui est voulu. Il faut donc envoyer de vrais fichiers.

Dans `backend/test/helpers.ts`, ajouter `import path from "node:path";` en tête, puis :

```ts
/** Charge une fixture de test/fixtures comme si le navigateur l'envoyait. */
export async function fixtureFile(name: string, type: string, as = name): Promise<File> {
  const bytes = await Bun.file(path.join(import.meta.dir, "fixtures", name)).arrayBuffer();
  return new File([bytes], as, { type });
}
```

Dans `backend/test/tracks-upload.test.ts` :

1. Ajouter `fixtureFile` à l'import depuis `./helpers`, et ajouter ces imports :

```ts
import { spyOn } from "bun:test";
import { coverPath } from "../src/lib/covers";
import { UPLOADS_DIR, COVERS_DIR } from "../src/config";
```

2. Remplacer la fonction `audio()` et le type `PublicTrackBody` par :

```ts
type PublicTrackBody = {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  ownerId: string;
  artist?: string;
  album?: string;
  transcodedFrom?: string;
  hasCover: boolean;
};

const MP3_SIZE = Bun.file(`${import.meta.dir}/fixtures/plain.mp3`).size;

/** Un vrai MP3 d'une seconde, sans tags. */
function audio(name = "song.mp3"): Promise<File> {
  return fixtureFile("plain.mp3", "audio/mpeg", name);
}

/** Fichiers présents dans UPLOADS_DIR et COVERS_DIR (hors sous-dossier). */
function filesOnDisk(): string[] {
  return [
    ...fs.readdirSync(UPLOADS_DIR).filter((name) => name !== "covers"),
    ...fs.readdirSync(COVERS_DIR),
  ];
}
```

3. Dans tous les tests existants, remplacer `audio()` par `await audio()` et `audio("x.mp3")` par `await audio("x.mp3")`. Deux tests changent en plus :
   - « upload réussi » : `expect(track.size).toBe(MP3_SIZE);` au lieu de `2048`.
   - « GET /:id/audio » : envoyer `await audio("a.mp3")` et vérifier `expect((await response.arrayBuffer()).byteLength).toBe(MP3_SIZE);`.
   - « type MIME refusé » garde son fichier fictif : `form(new File([new Uint8Array(16)], "virus.exe", { type: "application/octet-stream" }))`.

4. Ajouter un `afterEach` qui vide les dossiers, car les tests comptent les fichiers restants. `bun test` exécute les fichiers de test l'un après l'autre, donc vider `UPLOADS_DIR` ici ne gêne aucun autre fichier :

```ts
afterEach(async () => {
  await resetDb();
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  ensureUploadsDir();
});
```

et retirer l'ancien `afterEach(resetDb);`.

Dans `backend/test/uploads.test.ts`, remplacer le test « un fichier trop volumineux » pour qu'il suive la nouvelle limite, puis ajouter les deux nouveaux tests :

```ts
test("un fichier trop volumineux est refusé", () => {
  const result = validateAudio(audioFile("big.flac", "audio/flac", MAX_FILE_SIZE + 1));
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.message).toBe("Fichier trop volumineux");
});

test("la limite est de 100 Mo et le FLAC est accepté", () => {
  expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  expect(validateAudio(audioFile("a.flac", "audio/flac")).ok).toBe(true);
  expect(validateAudio(audioFile("a.flac", "audio/x-flac")).ok).toBe(true);
});

test("discardFiles supprime, ignore les absents et ne lève jamais d'erreur", async () => {
  const storedName = await saveAudio(audioFile("x.mp3", "audio/mpeg", 8));
  await discardFiles([audioPath(storedName), audioPath("absent.mp3")]);
  expect(fs.existsSync(audioPath(storedName))).toBe(false);
});
```

(ajouter `discardFiles` à l'import depuis `../src/lib/uploads`).

- [ ] **Step 2 : écrire les nouveaux tests d'upload (qui échouent)**

Ajouter à la fin de `backend/test/tracks-upload.test.ts` :

```ts
test("ALAC : converti en FLAC, tags et pochette extraits, original supprimé", async () => {
  const { token } = await registerUser();
  const file = await fixtureFile("alac-cover.m4a", "audio/x-m4a", "Wither.m4a");

  const response = await upload(token, form(file, "Mon titre"));
  expect(response.status).toBe(201);
  const track = await json<PublicTrackBody>(response);

  expect(track).toMatchObject({
    title: "Mon titre",
    originalName: "Wither.m4a",
    mimeType: "audio/flac",
    artist: "Testeur",
    album: "Fixtures",
    transcodedFrom: "alac",
    hasCover: true,
  });

  const stored = await Track.findById(track.id).select("+storedName +coverStoredName");
  expect(stored!.storedName).toEndWith(".flac");
  expect(track.size).toBe(Bun.file(audioPath(stored!.storedName)).size);
  expect(fs.existsSync(coverPath(stored!.coverStoredName!))).toBe(true);
  // Seuls le FLAC et la pochette restent : l'ALAC d'origine a disparu.
  expect(filesOnDisk().sort()).toEqual(
    [stored!.storedName, stored!.coverStoredName!].sort(),
  );
});

test("ALAC sans pochette : converti, hasCover false", async () => {
  const { token } = await registerUser();
  const file = await fixtureFile("alac-nocover.m4a", "audio/mp4");

  const track = await json<PublicTrackBody>(await upload(token, form(file)));
  expect(track.mimeType).toBe("audio/flac");
  expect(track.hasCover).toBe(false);
});

test("FLAC accepté tel quel, même avec un MIME en x-flac", async () => {
  const { token } = await registerUser();
  const file = await fixtureFile("flac-cover.flac", "audio/x-flac");

  const track = await json<PublicTrackBody>(await upload(token, form(file)));
  expect(track.mimeType).toBe("audio/flac");
  expect(track.transcodedFrom).toBeUndefined();
  expect(track.hasCover).toBe(true);
});

test("AAC en .m4a : stocké tel quel en audio/mp4", async () => {
  const { token } = await registerUser();
  const file = await fixtureFile("aac.m4a", "audio/x-m4a");

  const track = await json<PublicTrackBody>(await upload(token, form(file)));
  expect(track.mimeType).toBe("audio/mp4");
  expect(track.transcodedFrom).toBeUndefined();
});

test("titre vide : le tag title du fichier sert de titre", async () => {
  const { token } = await registerUser();
  const file = await fixtureFile("flac-cover.flac", "audio/flac", "piste-07.flac");

  const track = await json<PublicTrackBody>(await upload(token, form(file, "  ")));
  expect(track.title).toBe("Sinus");
});

test("texte déguisé en .m4a : 400 et aucun fichier restant", async () => {
  const { token } = await registerUser();
  const file = await fixtureFile("not-audio.m4a", "audio/x-m4a");

  const response = await upload(token, form(file));
  expect(response.status).toBe(400);
  expect((await json<{ message: string }>(response)).message).toBe("Format audio non accepté");
  expect(await Track.countDocuments({})).toBe(0);
  expect(filesOnDisk()).toEqual([]);
});

test("des zéros annoncés en audio/mpeg sont refusés", async () => {
  const { token } = await registerUser();
  const fake = new File([new Uint8Array(2048)], "faux.mp3", { type: "audio/mpeg" });

  expect((await upload(token, form(fake))).status).toBe(400);
  expect(filesOnDisk()).toEqual([]);
});

test("échec MongoDB après conversion : original, FLAC et pochette supprimés", async () => {
  const { token } = await registerUser();
  const create = spyOn(Track, "create").mockRejectedValueOnce(new Error("Mongo KO"));

  try {
    const file = await fixtureFile("alac-cover.m4a", "audio/x-m4a");
    const response = await upload(token, form(file));
    expect(response.status).toBe(500);
    expect(filesOnDisk()).toEqual([]);
  } finally {
    create.mockRestore();
  }
});
```

- [ ] **Step 3 : vérifier que les tests échouent**

Run : `cd backend && bun test test/tracks-upload.test.ts test/uploads.test.ts`
Attendu : FAIL. On attend `audio/flac` et on reçoit `audio/x-m4a` ; le MIME `x-flac` est refusé ; `discardFiles` n'existe pas ; les zéros sont acceptés.

- [ ] **Step 4 : configuration et `discardFiles`**

Dans `backend/src/config.ts`, remplacer la limite de taille et la liste des MIME :

```ts
// La taille maximale d'un fichier audio est de 100 Mo : un morceau sans
// perte (FLAC, ALAC) de 5 minutes pèse souvent 30 à 50 Mo.
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/*
 * Premier filtre, peu coûteux, sur le type annoncé par le navigateur.
 * Le vrai format est ensuite déterminé par le contenu (lib/metadata.ts).
 */
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/x-flac",
]);
```

Dans `backend/src/lib/uploads.ts`, ajouter à la fin :

```ts
/**
 * Supprime une liste de fichiers sans jamais lever d'erreur : sert au
 * nettoyage après un échec, où l'erreur d'origine doit rester celle qu'on
 * remonte. Un fichier déjà absent n'est pas une erreur ; un autre échec est
 * journalisé pour que l'administrateur voie le fichier orphelin.
 */
export async function discardFiles(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    try {
      await fsPromises.rm(filePath, { force: true });
    } catch (error) {
      console.error(`[upload] Fichier orphelin non supprimé : ${filePath}`, error);
    }
  }
}
```

- [ ] **Step 5 : créer `lib/ingest.ts`**

```ts
import path from "node:path";
import { audioPath, discardFiles } from "./uploads";
import { coverPath, saveCover } from "./covers";
import { readMetadata, type AudioKind } from "./metadata";
import { alacToFlac } from "./transcode";

export interface ProcessedAudio {
  /** Nom du fichier à conserver : différent de l'original après conversion. */
  storedName: string;
  mimeType: string;
  size: number;
  title?: string;
  artist?: string;
  album?: string;
  cover?: { storedName: string; mimeType: string };
  transcodedFrom?: "alac";
}

export type ProcessResult =
  | { ok: true; audio: ProcessedAudio }
  | { ok: false; message: string };

// Type MIME enregistré pour chaque format stocké tel quel.
const STORED_MIME: Record<Exclude<AudioKind, "alac">, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  aac: "audio/mp4",
  flac: "audio/flac",
};

/** Fichiers créés par processAudio, sans l'original. */
export function createdFiles(audio: ProcessedAudio, originalStoredName: string): string[] {
  const files: string[] = [];
  if (audio.storedName !== originalStoredName) files.push(audioPath(audio.storedName));
  if (audio.cover) files.push(coverPath(audio.cover.storedName));
  return files;
}

/**
 * Analyse un fichier déjà écrit dans UPLOADS_DIR :
 * 1. détermine le format réel par le contenu ;
 * 2. convertit l'ALAC en FLAC (<même uuid>.flac) ;
 * 3. extrait la pochette, sauf si extractCover vaut false.
 *
 * Ne supprime jamais l'original : l'appelant le fait une fois la base à jour.
 * En cas d'exception, supprime d'abord ce qu'elle a elle-même créé.
 */
export async function processAudio(
  storedName: string,
  { extractCover = true }: { extractCover?: boolean } = {},
): Promise<ProcessResult> {
  const meta = await readMetadata(audioPath(storedName));

  if (!meta.kind) {
    console.warn(`[upload] Contenu non reconnu : ${storedName}`);
    return { ok: false, message: "Format audio non accepté" };
  }
  console.log(`[upload] Format détecté : ${meta.kind} (${storedName})`);

  const created: string[] = [];
  try {
    let finalName = storedName;
    let mimeType: string;
    let transcodedFrom: "alac" | undefined;

    if (meta.kind === "alac") {
      finalName = `${path.parse(storedName).name}.flac`;
      // Ajouté avant la conversion : un FLAC partiel doit aussi être nettoyé.
      created.push(audioPath(finalName));
      const started = performance.now();
      await alacToFlac(audioPath(storedName), audioPath(finalName));
      console.log(
        `[upload] ALAC converti en FLAC en ${Math.round(performance.now() - started)} ms : ${finalName}`,
      );
      mimeType = "audio/flac";
      transcodedFrom = "alac";
    } else {
      mimeType = STORED_MIME[meta.kind];
    }

    let cover: ProcessedAudio["cover"];
    if (extractCover && meta.picture) {
      cover = (await saveCover(meta.picture.data)) ?? undefined;
      if (cover) created.push(coverPath(cover.storedName));
    }
    console.log(`[upload] Pochette : ${cover ? cover.storedName : "aucune"}`);

    return {
      ok: true,
      audio: {
        storedName: finalName,
        mimeType,
        size: Bun.file(audioPath(finalName)).size,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        cover,
        transcodedFrom,
      },
    };
  } catch (error) {
    console.error(`[upload] Traitement impossible : ${storedName}`, error);
    await discardFiles(created);
    throw error;
  }
}
```

- [ ] **Step 6 : réécrire `POST /tracks`**

Dans `backend/src/routes/tracks.ts`, compléter les imports :

```ts
import { audioPath, discardFiles, saveAudio, validateAudio } from "../lib/uploads";
import { createdFiles, processAudio } from "../lib/ingest";
```

(`removeAudio` reste importé pour `DELETE`). Puis remplacer tout le handler `tracksRoutes.post("/", …)`, commentaire compris :

```ts
/**
 * Reçoit un formulaire multipart contenant le champ fichier "audio" et le
 * champ texte facultatif "title".
 *
 * parseBody() met tout le corps en mémoire avant que l'on puisse lire la
 * taille du fichier. On regarde donc d'abord l'en-tête Content-Length pour
 * rejeter un envoi manifestement trop gros sans le lire.
 *
 * Le fichier est ensuite écrit, analysé par son contenu (lib/ingest.ts) et,
 * si c'est de l'ALAC, converti en FLAC. Le titre vient du formulaire, sinon
 * du tag title, sinon du nom du fichier.
 */
tracksRoutes.post("/", async (c) => {
  const { sub } = c.get("auth");

  const declaredSize = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_FILE_SIZE) {
    console.warn(`[tracks] Envoi refusé avant lecture : ${declaredSize} octets`);
    throw new HTTPException(400, { message: "Fichier trop volumineux" });
  }

  const body = await c.req.parseBody();
  const validation = validateAudio(body["audio"]);

  if (!validation.ok) {
    throw new HTTPException(400, { message: validation.message });
  }

  const { file } = validation;
  const storedName = await saveAudio(file);

  let result;
  try {
    result = await processAudio(storedName);
  } catch (error) {
    // processAudio a déjà nettoyé ce qu'elle avait créé ; reste l'original.
    await discardFiles([audioPath(storedName)]);
    throw error;
  }

  if (!result.ok) {
    await discardFiles([audioPath(storedName)]);
    throw new HTTPException(400, { message: result.message });
  }

  const { audio } = result;
  const formTitle = typeof body["title"] === "string" ? body["title"].trim() : "";

  try {
    const track = await Track.create({
      ownerId: new mongoose.Types.ObjectId(sub),
      title: formTitle || audio.title || file.name,
      originalName: file.name,
      storedName: audio.storedName,
      mimeType: audio.mimeType,
      size: audio.size,
      artist: audio.artist,
      album: audio.album,
      coverStoredName: audio.cover?.storedName,
      coverMimeType: audio.cover?.mimeType,
      transcodedFrom: audio.transcodedFrom,
    });

    // L'ALAC d'origine n'est plus utile une fois le FLAC enregistré en base.
    if (audio.storedName !== storedName) {
      await discardFiles([audioPath(storedName)]);
    }

    console.log(`[tracks] Upload enregistré : ${track.id}`);
    return c.json(track.toPublic(), 201);
  } catch (error) {
    console.error("[tracks] Erreur après l'écriture du fichier", error);
    // Si MongoDB échoue, on supprime l'original et tout ce qui a été créé.
    await discardFiles([audioPath(storedName), ...createdFiles(audio, storedName)]);
    throw error;
  }
});
```

- [ ] **Step 7 : vérifier que les tests passent**

Run : `cd backend && bun test && bun run typecheck`
Attendu : toute la suite passe. Si le test « sans titre, le nom du fichier sert de titre » échoue, vérifier que `plain.mp3` n'a pas de tag `title` (`ffprobe backend/test/fixtures/plain.mp3`).

- [ ] **Step 8 : commit**

```bash
git add backend/src backend/test
git commit -m "feat(backend): upload analysé par contenu, conversion ALAC et pochette"
```

---

### Task 6: `GET /tracks/:id/cover` et suppression de la pochette

**Files :**
- Modify : `backend/src/routes/tracks.ts` (nouvelle route, handler `DELETE`)
- Test : `backend/test/tracks-cover.test.ts` (créé)

**Interfaces :**
- Consomme : `coverPath`, `removeCover` (tâche 2) ; `fixtureFile` (tâche 5).

- [ ] **Step 1 : écrire le test qui échoue**

Créer `backend/test/tracks-cover.test.ts` :

```ts
import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import {
  request,
  authHeaders,
  registerUser,
  fixtureFile,
  connectTestDb,
  resetDb,
  disconnectTestDb,
} from "./helpers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { coverPath } from "../src/lib/covers";
import { Track } from "../src/models/Track";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

async function uploadFixture(token: string, name: string, type: string): Promise<string> {
  const data = new FormData();
  data.append("audio", await fixtureFile(name, type));
  const response = await request("/api/tracks", {
    method: "POST",
    headers: authHeaders(token),
    body: data,
  });
  return ((await response.json()) as { id: string }).id;
}

function getCover(id: string, token?: string): Promise<Response> {
  return request(`/api/tracks/${id}/cover`, {
    headers: token ? authHeaders(token) : {},
  });
}

test("renvoie l'image avec les bons en-têtes", async () => {
  const { token } = await registerUser();
  const id = await uploadFixture(token, "flac-cover.flac", "audio/flac");

  const response = await getCover(id, token);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");

  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Number(response.headers.get("content-length"))).toBe(bytes.byteLength);
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

test("sans jeton : 401", async () => {
  const { token } = await registerUser();
  const id = await uploadFixture(token, "flac-cover.flac", "audio/flac");

  expect((await getCover(id)).status).toBe(401);
});

test("la pochette d'un autre utilisateur : 404, pas 403", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const id = await uploadFixture(alice.token, "flac-cover.flac", "audio/flac");

  const response = await getCover(id, bob.token);
  expect(response.status).toBe(404);
  expect(((await response.json()) as { message: string }).message).toBe("Pochette inconnue");
});

test("piste sans pochette : 404", async () => {
  const { token } = await registerUser();
  const id = await uploadFixture(token, "plain.mp3", "audio/mpeg");

  expect((await getCover(id, token)).status).toBe(404);
});

test("identifiant malformé : 404", async () => {
  const { token } = await registerUser();
  expect((await getCover("pas-un-objectid", token)).status).toBe(404);
});

test("fichier image absent du disque : 404", async () => {
  const { token } = await registerUser();
  const id = await uploadFixture(token, "flac-cover.flac", "audio/flac");
  const stored = await Track.findById(id).select("+coverStoredName");
  fs.rmSync(coverPath(stored!.coverStoredName!));

  expect((await getCover(id, token)).status).toBe(404);
});

test("DELETE supprime aussi la pochette", async () => {
  const { token } = await registerUser();
  const id = await uploadFixture(token, "flac-cover.flac", "audio/flac");
  const stored = await Track.findById(id).select("+coverStoredName");
  const imagePath = coverPath(stored!.coverStoredName!);

  const response = await request(`/api/tracks/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  expect(response.status).toBe(204);
  expect(fs.existsSync(imagePath)).toBe(false);
});

test("DELETE reste en 204 si la pochette a déjà disparu", async () => {
  const { token } = await registerUser();
  const id = await uploadFixture(token, "flac-cover.flac", "audio/flac");
  const stored = await Track.findById(id).select("+coverStoredName");
  fs.rmSync(coverPath(stored!.coverStoredName!));

  const response = await request(`/api/tracks/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  expect(response.status).toBe(204);
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run : `cd backend && bun test test/tracks-cover.test.ts`
Attendu : FAIL. La route renvoie 404 « Not Found » de Hono, le message diffère, et la pochette reste sur le disque après `DELETE`.

- [ ] **Step 3 : écrire l'implémentation**

Dans `backend/src/routes/tracks.ts`, ajouter l'import :

```ts
import { coverPath, removeCover } from "../lib/covers";
```

Ajouter cette route juste après `GET /:id/audio` :

```ts
/**
 * Envoie la pochette d'une piste après vérification de sa propriété.
 * Tous les échecs donnent le même 404 : on ne révèle pas qu'une piste
 * existe quand elle appartient à un autre utilisateur.
 */
tracksRoutes.get("/:id/cover", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  const notFound = () => new HTTPException(404, { message: "Pochette inconnue" });

  if (!mongoose.isValidObjectId(id)) {
    throw notFound();
  }

  const track = await Track.findOne({ _id: id, ownerId: sub }).select(
    "+coverStoredName",
  );

  if (!track?.coverStoredName || !track.coverMimeType) {
    console.warn(`[tracks] Pochette introuvable ou interdite : ${id}`);
    throw notFound();
  }

  const file = Bun.file(coverPath(track.coverStoredName));

  if (!(await file.exists())) {
    console.error(`[tracks] Pochette absente du disque pour la piste ${track.id}`);
    throw notFound();
  }

  c.header("Content-Type", track.coverMimeType);
  c.header("Content-Length", String(file.size));
  // private : le navigateur peut garder l'image, un proxy partagé non.
  c.header("Cache-Control", "private, max-age=86400");
  // Le navigateur doit croire Content-Type et ne pas deviner le format.
  c.header("X-Content-Type-Options", "nosniff");

  return c.body(file.stream());
});
```

Dans le handler `DELETE /:id` :
- remplacer `.select("+storedName")` par `.select("+storedName +coverStoredName")` ;
- insérer ce bloc entre le `if (!track) {…}` et le `try { await removeAudio(…) }` existant :

```ts
  // Une pochette orpheline est moins grave qu'un fichier audio orphelin :
  // son échec est journalisé mais ne change pas la réponse.
  if (track.coverStoredName) {
    try {
      await removeCover(track.coverStoredName);
    } catch (error) {
      console.error(`[tracks] Pochette non supprimée : ${track.coverStoredName}`, error);
    }
  }
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `cd backend && bun test && bun run typecheck`
Attendu : toute la suite passe.

- [ ] **Step 5 : commit**

```bash
git add backend/src/routes/tracks.ts backend/test/tracks-cover.test.ts
git commit -m "feat(backend): route GET /tracks/:id/cover et suppression de la pochette"
```

---

### Task 7: Script de migration

**Files :**
- Create : `backend/scripts/migrate-media.ts`
- Modify : `backend/package.json` (script `migrate:media`), `backend/tsconfig.json` (`include`)
- Test : `backend/test/migrate-media.test.ts`

**Interfaces :**
- Consomme : `processAudio`, `createdFiles` (tâche 5) ; `audioPath`, `discardFiles`, `ensureUploadsDir`.
- Produit :
  ```ts
  export interface MigrationReport { converted: number; coversAdded: number; tagsAdded: number; skipped: number; failed: number }
  export async function migrateMedia(): Promise<MigrationReport>;
  ```

- [ ] **Step 1 : écrire le test qui échoue**

Créer `backend/test/migrate-media.test.ts` :

```ts
import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectTestDb, resetDb, disconnectTestDb } from "./helpers";
import { audioPath, ensureUploadsDir } from "../src/lib/uploads";
import { coverPath } from "../src/lib/covers";
import { Track } from "../src/models/Track";
import { migrateMedia } from "../scripts/migrate-media";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

/** Copie une fixture dans UPLOADS_DIR et crée la piste « ancienne » correspondante. */
async function seedLegacy(fixture: string, mimeType: string) {
  const storedName = `${crypto.randomUUID()}${path.extname(fixture)}`;
  fs.copyFileSync(path.join(import.meta.dir, "fixtures", fixture), audioPath(storedName));
  return Track.create({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Titre choisi",
    originalName: fixture,
    storedName,
    mimeType,
    size: fs.statSync(audioPath(storedName)).size,
  });
}

test("convertit un ALAC existant, ajoute pochette et tags, garde le titre", async () => {
  const legacy = await seedLegacy("alac-cover.m4a", "audio/x-m4a");
  const oldPath = audioPath(legacy.storedName);

  const report = await migrateMedia();
  expect(report).toEqual({ converted: 1, coversAdded: 1, tagsAdded: 1, skipped: 0, failed: 0 });

  const track = await Track.findById(legacy.id).select("+storedName +coverStoredName");
  expect(track!.title).toBe("Titre choisi");
  expect(track!.mimeType).toBe("audio/flac");
  expect(track!.transcodedFrom).toBe("alac");
  expect(track!.artist).toBe("Testeur");
  expect(track!.storedName).toEndWith(".flac");
  expect(track!.size).toBe(fs.statSync(audioPath(track!.storedName)).size);
  expect(fs.existsSync(coverPath(track!.coverStoredName!))).toBe(true);
  expect(fs.existsSync(oldPath)).toBe(false);
});

test("un second passage ne change rien", async () => {
  await seedLegacy("alac-cover.m4a", "audio/x-m4a");
  await migrateMedia();
  const before = await Track.findOne().select("+storedName +coverStoredName").lean();

  const report = await migrateMedia();
  expect(report).toEqual({ converted: 0, coversAdded: 0, tagsAdded: 0, skipped: 0, failed: 0 });

  const after = await Track.findOne().select("+storedName +coverStoredName").lean();
  expect(after).toEqual(before);
  expect(fs.existsSync(audioPath(after!.storedName))).toBe(true);
});

test("fichier audio absent : piste ignorée", async () => {
  await Track.create({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Fantôme",
    originalName: "x.mp3",
    storedName: "absent.mp3",
    mimeType: "audio/mpeg",
    size: 1,
  });

  const report = await migrateMedia();
  expect(report.skipped).toBe(1);
  expect(report.failed).toBe(0);
});
```

- [ ] **Step 2 : vérifier que le test échoue**

Run : `cd backend && bun test test/migrate-media.test.ts`
Attendu : FAIL, `Cannot find module '../scripts/migrate-media'`.

- [ ] **Step 3 : écrire l'implémentation**

Dans `backend/tsconfig.json`, remplacer `include` par :

```json
  "include": ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"]
```

Dans `backend/package.json`, ajouter aux `scripts` :

```json
        "migrate:media": "bun run scripts/migrate-media.ts",
```

Créer `backend/scripts/migrate-media.ts` :

```ts
import mongoose from "mongoose";
import { MONGODB_URI } from "../src/config";
import { Track } from "../src/models/Track";
import { audioPath, discardFiles, ensureUploadsDir } from "../src/lib/uploads";
import { createdFiles, processAudio } from "../src/lib/ingest";

export interface MigrationReport {
  converted: number;
  coversAdded: number;
  tagsAdded: number;
  skipped: number;
  failed: number;
}

/**
 * Applique aux pistes déjà en base le traitement de l'upload : conversion
 * ALAC → FLAC, extraction de la pochette, lecture de artist et album.
 * Le titre choisi par l'utilisateur n'est jamais modifié.
 *
 * Idempotent : un FLAC n'est pas reconverti, une pochette présente n'est pas
 * réextraite, un tag déjà renseigné n'est pas écrasé.
 */
export async function migrateMedia(): Promise<MigrationReport> {
  const report: MigrationReport = { converted: 0, coversAdded: 0, tagsAdded: 0, skipped: 0, failed: 0 };
  const tracks = await Track.find().select("+storedName +coverStoredName");

  for (const track of tracks) {
    const originalName = track.storedName;

    if (!(await Bun.file(audioPath(originalName)).exists())) {
      console.warn(`[migration] Fichier absent, piste ignorée : ${track.id}`);
      report.skipped += 1;
      continue;
    }

    try {
      const result = await processAudio(originalName, {
        extractCover: !track.coverStoredName,
      });

      if (!result.ok) {
        console.warn(`[migration] Format non reconnu, piste ignorée : ${track.id}`);
        report.skipped += 1;
        continue;
      }

      const { audio } = result;

      if (audio.transcodedFrom) {
        track.storedName = audio.storedName;
        track.mimeType = audio.mimeType;
        track.size = audio.size;
        track.transcodedFrom = audio.transcodedFrom;
      }
      if (audio.cover) {
        track.coverStoredName = audio.cover.storedName;
        track.coverMimeType = audio.cover.mimeType;
      }
      const addsTags =
        (!track.artist && !!audio.artist) || (!track.album && !!audio.album);
      if (!track.artist && audio.artist) track.artist = audio.artist;
      if (!track.album && audio.album) track.album = audio.album;

      if (!track.isModified()) continue;

      try {
        await track.save();
      } catch (error) {
        await discardFiles(createdFiles(audio, originalName));
        throw error;
      }

      if (audio.transcodedFrom) report.converted += 1;
      if (audio.cover) report.coversAdded += 1;
      if (addsTags) report.tagsAdded += 1;

      // L'ancien fichier n'est supprimé qu'une fois la base à jour.
      if (audio.storedName !== originalName) {
        await discardFiles([audioPath(originalName)]);
      }
      console.log(`[migration] Piste mise à jour : ${track.id}`);
    } catch (error) {
      console.error(`[migration] Échec pour la piste ${track.id}`, error);
      report.failed += 1;
    }
  }

  return report;
}

// Exécuté seulement avec `bun run scripts/migrate-media.ts`, pas à l'import.
if (import.meta.main) {
  if (!MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");

  ensureUploadsDir();
  await mongoose.connect(MONGODB_URI);
  const report = await migrateMedia();
  console.log("[migration] Bilan", report);
  await mongoose.disconnect();
  process.exit(report.failed > 0 ? 1 : 0);
}
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `cd backend && bun test && bun run typecheck`
Attendu : toute la suite passe.

- [ ] **Step 5 : commit**

```bash
git add backend/scripts backend/package.json backend/tsconfig.json backend/test/migrate-media.test.ts
git commit -m "feat(backend): script de migration des pistes existantes"
```

---

### Task 8: Docker, README et contrat d'API

**Files :**
- Create : `backend/Dockerfile`, `backend/.dockerignore`
- Modify : `docker-compose.yml:40-41`, `README.md` (section « Démarrer le backend »), `API_CONTRACT.md`

- [ ] **Step 1 : Dockerfile**

Créer `backend/Dockerfile` :

```dockerfile
# Image de développement du backend : Bun + ffmpeg (conversion ALAC → FLAC).
# Le code n'est pas copié : docker-compose monte ./backend dans /app.
FROM oven/bun:1.4.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
```

Créer `backend/.dockerignore`, pour que le build n'envoie pas les modules ni les uploads à Docker :

```
node_modules
data
.env
```

Dans `docker-compose.yml`, service `backend`, remplacer :

```yaml
    image: oven/bun:1.4.2
```

par :

```yaml
    # Image construite par backend/Dockerfile : Bun + ffmpeg.
    build: ./backend
```

- [ ] **Step 2 : vérifier le conteneur**

Run : `docker compose build backend && docker compose run --rm --no-deps backend ffmpeg -hide_banner -encoders | grep -E " flac|alac"`
Attendu : une ligne `flac` apparaît dans la liste des encodeurs (le décodeur ALAC est inclus dans tout build ffmpeg).

Run : `docker compose run --rm --no-deps -e MONGODB_URI=mongodb://mongo:27017/guitar-practice-cloud-test backend sh -c "bun install && bun test test/transcode.test.ts test/metadata.test.ts"`
Attendu : PASS dans le conteneur Linux.

- [ ] **Step 3 : README**

Dans `README.md`, section « Démarrer le backend », juste avant le bloc `npm install / npm start`, ajouter :

```markdown
Hors de Docker, le backend a besoin de **ffmpeg** pour convertir les fichiers
ALAC (Apple Lossless) en FLAC : `brew install ffmpeg` sur macOS,
`sudo apt install ffmpeg` sur Debian/Ubuntu. Dans Docker, l'image du backend
l'installe déjà.

Après une mise à jour, les pistes importées avant l'ajout des pochettes se
migrent avec `npm run migrate:media`.
```

- [ ] **Step 4 : contrat d'API**

Dans `API_CONTRACT.md` :

1. Dans le tableau des routes, remplacer la ligne `POST /tracks` et ajouter la ligne `/cover` après `/audio` :

```markdown
| POST | `/tracks` | multipart : `audio`, `title` (facultatif) | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT | image (JPEG, PNG ou WebP) |
```

2. Remplacer `Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.` par :

```markdown
Formats acceptés : MP3, WAV, OGG, M4A (AAC ou ALAC) et FLAC, 100 Mo maximum.
Le format est déterminé par le contenu du fichier, pas par le type MIME envoyé.
Un M4A en ALAC est converti en FLAC à l'upload : la piste renvoyée a alors
`mimeType: "audio/flac"` et `transcodedFrom: "alac"`.

Sans `title`, le titre est le tag `title` du fichier, sinon son nom.
```

3. Dans la description du champ `items` de `GET /tracks`, remplacer la phrase sur le contenu d'un `Track` par :

```markdown
Chaque `Track` contient `id`, `ownerId`, `title`, `originalName`, `mimeType` (type du fichier stocké), `size` (octets), `createdAt`, `hasCover` (booléen) et, s'ils existent, `artist`, `album` et `transcodedFrom`.
```

4. Ajouter à la fin du fichier :

```markdown
## `GET /tracks/:id/cover` — pochette

Pochette extraite du fichier audio (tag ID3 `APIC`, atome MP4 `covr` ou bloc
FLAC `PICTURE`). Réservée au propriétaire de la piste.

- `200` : binaire de l'image, avec `Content-Type` (`image/jpeg`, `image/png` ou
  `image/webp`), `Content-Length`, `Cache-Control: private, max-age=86400` et
  `X-Content-Type-Options: nosniff`.
- `404 { "message": "Pochette inconnue" }` : identifiant invalide, piste d'un
  autre utilisateur, piste sans pochette (`hasCover: false`) ou fichier absent.
- `401` sans jeton.

Une balise `<img src>` ne peut pas envoyer l'en-tête `Authorization` : le
frontend télécharge l'image en `Blob`, puis l'affiche avec un ObjectURL.
```

- [ ] **Step 5 : commit**

```bash
git add backend/Dockerfile backend/.dockerignore docker-compose.yml README.md API_CONTRACT.md
git commit -m "chore: ffmpeg dans l'image backend, contrat d'API et README à jour"
```

---

### Task 9: Frontend — modèle, validation et formulaire d'import

**Files :**
- Modify : `frontend-starter/src/app/shared/models/track.model.ts`, `frontend-starter/src/app/shared/utils/audio-file.ts`, `frontend-starter/src/app/shared/services/track.service.ts`
- Modify : `frontend-starter/src/app/components/upload-dialog/upload-dialog.ts:89`, `frontend-starter/src/app/components/upload-dialog/upload-dialog.html:46-47`
- Modify : `frontend-starter/src/styles.scss:39-43`
- Test : `frontend-starter/src/app/shared/utils/audio-file.spec.ts`, `frontend-starter/src/app/components/upload-dialog/upload-dialog.spec.ts`, `frontend-starter/src/app/components/tracks-page/tracks-page.spec.ts` (fixtures)

**Interfaces :**
- Produit (`Track`) : `artist?: string; album?: string; transcodedFrom?: string; hasCover: boolean`
- Produit (`TrackService`) : `cover(id: string): Observable<Blob>`

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `audio-file.spec.ts`, remplacer les deux tests de taille par ceux-ci et ajouter le test FLAC :

```ts
  it('rejects a file larger than 100 Mo', () => {
    expect(validateAudioFile(fileOf('audio/mpeg', MAX_AUDIO_SIZE + 1))).toContain('100 Mo');
  });

  it('accepts an mp3 of exactly 100 Mo', () => {
    expect(MAX_AUDIO_SIZE).toBe(100 * 1024 * 1024);
    expect(validateAudioFile(fileOf('audio/mpeg', MAX_AUDIO_SIZE))).toBeNull();
  });

  it('accepts FLAC, whatever MIME variant the browser sends', () => {
    expect(validateAudioFile(fileOf('audio/flac', 1000, 'a.flac'))).toBeNull();
    expect(validateAudioFile(fileOf('audio/x-flac', 1000, 'a.flac'))).toBeNull();
  });
```

Dans `upload-dialog.spec.ts` :
- ajouter `hasCover: false,` à l'objet `created` ;
- dans le test « refuses a file larger than 25 Mo », remplacer le titre par `'refuses a file larger than 100 Mo before any HTTP call'` et `toContain('25 Mo')` par `toContain('100 Mo')` ;
- remplacer le test « uses the file name when the title is empty » par :

```ts
  it('sends an empty title when none is typed, so the backend can use the file tag', () => {
    const fixture = create();
    selectFile(fixture, mp3());
    fixture.componentInstance.upload();

    const req = httpMock.expectOne((r) => r.method === 'POST');
    expect((req.request.body as FormData).get('title')).toBe('');
    req.flush(created);
  });

  it('accepts .flac in the file picker', () => {
    const fixture = create();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="file"]');
    expect(input.accept).toContain('.flac');
  });
```

Dans `tracks-page.spec.ts`, ajouter `hasCover: false,` à l'objet `track` (ligne 13 environ).

- [ ] **Step 2 : vérifier que les tests échouent**

Run : `cd frontend-starter && npm test`
Attendu : FAIL. On trouve « 25 Mo » au lieu de « 100 Mo », le FLAC est refusé, le titre envoyé vaut `song.mp3`, et la compilation signale que `hasCover` n'existe pas dans `Track`.

- [ ] **Step 3 : écrire l'implémentation**

`track.model.ts` :

```ts
/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  /** Type of the stored file: audio/flac for a converted ALAC. */
  mimeType: string;
  size: number;
  artist?: string;
  album?: string;
  /** "alac" when the uploaded file was converted to FLAC. */
  transcodedFrom?: string;
  /** A cover is available at GET /api/tracks/:id/cover. */
  hasCover: boolean;
  createdAt: string;
}
```

`audio-file.ts` : remplacer `ALLOWED_AUDIO_TYPES`, `MAX_AUDIO_SIZE` et les messages de `validateAudioFile`, puis ajouter FLAC à `FORMAT_LABELS` :

```ts
export const ALLOWED_AUDIO_TYPES: ReadonlySet<string> = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/flac',
  'audio/x-flac',
]);

export const MAX_AUDIO_SIZE = 100 * 1024 * 1024;

/** Returns an error message, or null when the file can be sent. */
export function validateAudioFile(file: File | undefined): string | null {
  if (!file) return 'Choisissez un fichier audio.';
  if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
    return `Format non accepté (${file.type || 'inconnu'}). Formats possibles : MP3, WAV, OGG, M4A, FLAC.`;
  }
  if (file.size > MAX_AUDIO_SIZE) {
    return `Fichier trop volumineux (${formatSize(file.size)}). Taille maximale : 100 Mo.`;
  }
  return null;
}
```

et dans `FORMAT_LABELS` :

```ts
  'audio/flac': 'FLAC',
  'audio/x-flac': 'FLAC',
```

`track.service.ts`, à ajouter après `audio()` :

```ts
  /** Cover image as a Blob: an <img src> could not send the JWT. */
  cover(id: string) {
    return this.http.get(`/api/tracks/${id}/cover`, {
      responseType: 'blob',
    });
  }
```

`upload-dialog.ts`, ligne 89 : remplacer la ligne qui calcule `title` par :

```ts
    // Empty on purpose: the backend then uses the file's title tag, or its name.
    const title = this.title.value.trim();
```

`upload-dialog.html`, lignes 46-47 :

```html
      <small id="file-hint">MP3, WAV, OGG, M4A ou FLAC, 100 Mo maximum</small>
      <input class="sr-only" type="file" accept=".mp3,.wav,.ogg,.m4a,.flac,audio/*"
```

`styles.scss`, après `--gpc-format-ogg` :

```scss
  --gpc-format-flac: #2f6f8f;
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `cd frontend-starter && npm test`
Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add frontend-starter/src
git commit -m "feat(frontend): FLAC, 100 Mo, titre laissé au backend et modèle Track enrichi"
```

---

### Task 10: Frontend — pochette et sous-titre dans la carte et le lecteur

**Files :**
- Create : `frontend-starter/src/app/components/track-cover/track-cover.ts`, `frontend-starter/src/app/components/track-cover/track-cover.spec.ts`
- Create : `frontend-starter/src/app/shared/utils/track-subtitle.ts`, `frontend-starter/src/app/shared/utils/track-subtitle.spec.ts`
- Modify : `frontend-starter/src/app/components/track-card/track-card.{ts,html,css}`, `frontend-starter/src/app/components/audio-player/audio-player.{ts,html,css}`

**Interfaces :**
- Consomme : `TrackService.cover(id)` et `Track.hasCover` (tâche 9).
- Produit : `<app-track-cover [track]="…" />`, qui remplit son parent positionné (`position: absolute; inset: 0`) et n'affiche rien tant que l'image n'est pas prête.
- Produit : `export function trackSubtitle(track: Pick<Track, 'artist' | 'album' | 'originalName'>): string`

- [ ] **Step 1 : écrire les tests qui échouent**

`track-subtitle.spec.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { trackSubtitle } from './track-subtitle';

describe('trackSubtitle', () => {
  it('joins artist and album', () => {
    expect(trackSubtitle({ artist: 'Frank Ocean', album: 'Endless', originalName: 'a.m4a' })).toBe(
      'Frank Ocean · Endless',
    );
  });

  it('shows whichever of the two exists', () => {
    expect(trackSubtitle({ artist: 'Frank Ocean', originalName: 'a.m4a' })).toBe('Frank Ocean');
    expect(trackSubtitle({ album: 'Endless', originalName: 'a.m4a' })).toBe('Endless');
  });

  it('falls back to the file name', () => {
    expect(trackSubtitle({ originalName: 'solo.mp3' })).toBe('solo.mp3');
  });
});
```

`track-cover.spec.ts` :

```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrackCoverComponent } from './track-cover';
import { Track } from '../../shared/models/track.model';

const base: Track = {
  id: 't1',
  title: 'Wither',
  originalName: 'wither.m4a',
  mimeType: 'audio/flac',
  size: 10,
  hasCover: true,
  createdAt: '2026-09-24T08:00:00.000Z',
};

describe('TrackCoverComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:cover-' + Math.random());
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      imports: [TrackCoverComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function create(track: Track) {
    const fixture = TestBed.createComponent(TrackCoverComponent);
    fixture.componentRef.setInput('track', track);
    fixture.detectChanges();
    return fixture;
  }

  it('does not call the API when the track has no cover', () => {
    const fixture = create({ ...base, hasCover: false });
    httpMock.expectNone('/api/tracks/t1/cover');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('loads the cover as a Blob and shows it as a decorative image', () => {
    const fixture = create(base);
    httpMock.expectOne('/api/tracks/t1/cover').flush(new Blob(['x'], { type: 'image/jpeg' }));
    fixture.detectChanges();

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('src')).toMatch(/^blob:cover-/);
    expect(img.getAttribute('alt')).toBe('');
  });

  it('revokes the ObjectURL when the track changes and when destroyed', () => {
    const fixture = create(base);
    httpMock.expectOne('/api/tracks/t1/cover').flush(new Blob(['x']));
    fixture.detectChanges();
    const first = fixture.nativeElement.querySelector('img').getAttribute('src');

    fixture.componentRef.setInput('track', { ...base, id: 't2' });
    fixture.detectChanges();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
    httpMock.expectOne('/api/tracks/t2/cover').flush(new Blob(['y']));
    fixture.detectChanges();
    const second = fixture.nativeElement.querySelector('img').getAttribute('src');

    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(second);
  });

  it('shows nothing (the format label stays visible) when loading fails', () => {
    const fixture = create(base);
    httpMock.expectOne('/api/tracks/t1/cover').flush(new Blob(), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 2 : vérifier que les tests échouent**

Run : `cd frontend-starter && npm test`
Attendu : FAIL, les modules `./track-subtitle` et `./track-cover` sont introuvables.

- [ ] **Step 3 : écrire l'implémentation**

`shared/utils/track-subtitle.ts` :

```ts
import { Track } from '../models/track.model';

/** "Artist · Album" from the file tags, or the file name when there are none. */
export function trackSubtitle(track: Pick<Track, 'artist' | 'album' | 'originalName'>): string {
  const parts = [track.artist, track.album].filter((part): part is string => !!part);
  return parts.length ? parts.join(' · ') : track.originalName;
}
```

`components/track-cover/track-cover.ts` :

```ts
import { Component, effect, inject, input, signal } from '@angular/core';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

/**
 * Cover image of a track, fetched as a Blob because <img src> cannot send the
 * JWT. Fills its positioned parent; renders nothing until the image is ready,
 * so the parent's format label stays visible as a fallback.
 * The image is decorative (alt=""): the play button already names the track.
 */
@Component({
  selector: 'app-track-cover',
  template: `@if (url(); as src) { <img [src]="src" alt="" (error)="url.set(null)" /> }`,
  styles: `
    :host { position: absolute; inset: 0; pointer-events: none; }
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class TrackCoverComponent {
  private readonly service = inject(TrackService);

  readonly track = input.required<Track>();
  readonly url = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const track = this.track();
      this.url.set(null);
      if (!track.hasCover) return;

      let objectUrl: string | undefined;
      const subscription = this.service.cover(track.id).subscribe({
        next: (blob) => {
          objectUrl = URL.createObjectURL(blob);
          this.url.set(objectUrl);
        },
        error: (error) => console.warn('[TrackCover] Pochette indisponible', track.id, error),
      });

      // Runs when the track changes and when the component is destroyed.
      onCleanup(() => {
        subscription.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }
}
```

`track-card.ts` : ajouter `TrackCoverComponent` aux `imports` du composant, importer `trackSubtitle`, et ajouter :

```ts
  readonly subtitle = computed(() => trackSubtitle(this.track()));
```

`track-card.html` :
- première ligne à l'intérieur du `<button … class="cover" …>` : `<app-track-cover [track]="track()" />` ;
- remplacer `<p class="file" [title]="track().originalName">{{ track().originalName }}</p>` par :

```html
    <p class="file" [title]="track().originalName">{{ subtitle() }}</p>
```

`track-card.css`, après `.cover.format-ogg` :

```css
.cover.format-flac { --cover: var(--gpc-format-flac); }
```

(L'image, positionnée en absolu, se dessine au-dessus du libellé de format, qui n'est pas positionné. La couche `.overlay` vient après dans le DOM et reste donc au-dessus de l'image.)

`audio-player.ts` : ajouter `TrackCoverComponent` aux `imports`, importer `trackSubtitle`, et ajouter :

```ts
  readonly subtitle = computed(() => trackSubtitle(this.track()));
```

`audio-player.html` :

```html
    <span class="cover" [class]="'format-' + format().toLowerCase()" aria-hidden="true">
      {{ format() }}
      <app-track-cover [track]="track()" />
    </span>
```

et remplacer `<small>{{ track().originalName }}</small>` par `<small>{{ subtitle() }}</small>`.

`audio-player.css` : dans la règle `.cover`, ajouter `position: relative;` et `overflow: hidden;`, puis ajouter :

```css
.cover.format-flac { background: var(--gpc-format-flac); }
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `cd frontend-starter && npm test && npx ng build`
Attendu : tous les tests passent, et le build réussit sans avertissement de budget nouveau.

- [ ] **Step 5 : vérification manuelle**

1. `cd backend && npm run migrate:media`. Attendu dans le bilan : `converted: 5, coversAdded: 5`, `failed: 0`.
2. Lancer backend et frontend, ouvrir `http://localhost:4200` dans **Chrome**.
3. Attendu : les 5 pistes « Endless » affichent la pochette et le sous-titre « Frank Ocean · Endless », « Slide On Me » se lit, et le lecteur montre la pochette.
4. Importer un `.flac` de plus de 25 Mo : l'import réussit et la piste se lit.
5. Dans l'onglet Network : `GET /api/tracks/<id>/cover` répond 200, `image/jpeg`, avec l'en-tête `Authorization` présent.

- [ ] **Step 6 : commit**

```bash
git add frontend-starter/src
git commit -m "feat(frontend): pochette et sous-titre artiste/album dans la carte et le lecteur"
```
