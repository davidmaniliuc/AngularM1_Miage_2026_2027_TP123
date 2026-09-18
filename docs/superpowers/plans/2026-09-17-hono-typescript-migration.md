# Migration backend Hono + TypeScript — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Express/JavaScript backend with a Hono/TypeScript API running on Bun, without changing the HTTP contract.

**Architecture:** A single `createApp()` builds a `Hono<AppEnv>` instance that mounts four route modules under `/api`. Authentication is a `createMiddleware` that verifies a JWT and puts the payload on the typed context (`c.set("auth", …)`). Errors travel as `HTTPException` and are converted to JSON by one `app.onError` handler. File uploads are parsed with `c.req.parseBody()` and written with `Bun.write`; Multer is gone.

**Tech Stack:** Bun 1.4.2 (runtime + test runner, no build step), Hono 4.13.8, Mongoose 9.10.1, bcryptjs 3.0.3, TypeScript 7.0.2 (`tsc --noEmit` for typechecking only).

**Spec:** `docs/superpowers/specs/2026-09-17-hono-typescript-migration-design.md`

## Global Constraints

- **The HTTP contract must not change.** `API_CONTRACT.md` is not edited. Same routes, same bodies, same status codes: 200, 201, 204, 400, 401, 404, 409.
- **Never log a secret.** No password, no JWT, no `MONGODB_URI`, no `JWT_SECRET` in any log line.
- **Never log a `hono/jwt` error object or its `.message`** — `JwtTokenExpired.message` contains the full token. Log `error.constructor.name` only.
- **No empty `catch`.** Every catch logs and produces an appropriate HTTP response.
- Comments are in French, matching the existing teaching style of the repo.
- Max upload size: `25 * 1024 * 1024`. Accepted MIME types, exactly: `audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`.
- Token TTL: 2 hours. Algorithm: `HS256`.
- `storedName` is never exposed in a response. `passwordHash` is never exposed in a response.
- Every task ends with `bun run typecheck` passing before the commit.
- Tests need MongoDB: `docker compose up -d mongo` before `bun test`.

## Deliberate deviations from the old implementation

Two internal changes, neither visible on the wire. Both are noted here so a reviewer does not read them as mistakes.

1. **Password hashing moves from a `pre("validate")` hook + `password` virtual to an explicit `User.register()` static.** The virtual-plus-hook pattern needs awkward casts under `strict` TypeScript because `password` is not a schema path. The static is typed end-to-end and reads more clearly. Validated against TS 7 strict during design.
2. **`app.notFound()` returns JSON.** Express returned its default HTML 404 for unmatched paths. This matches spec deviation 3 (unknown errors become JSON).

---

### Task 1: Toolchain, configuration and shared types

Replaces the Node/Express toolchain with a Bun/TypeScript one and creates the two modules every later task imports.

**Files:**
- Modify: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/bunfig.toml`
- Create: `backend/src/config.ts`
- Create: `backend/src/types.ts`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `config.ts`: `PORT: number`, `MONGODB_URI: string | undefined`, `JWT_SECRET: string`, `JWT_ALG: "HS256"`, `TOKEN_TTL_SECONDS: number`, `UPLOADS_DIR: string`, `MAX_FILE_SIZE: number`, `ALLOWED_MIME: ReadonlySet<string>`
  - `types.ts`: `AuthPayload`, `AppEnv`, `PublicUser`, `PublicTrack`, `Page<T>`

- [ ] **Step 1: Rewrite `backend/package.json`**

```json
{
    "name": "gpc-api",
    "version": "4.0.0",
    "type": "module",
    "scripts": {
        "start": "bun run src/server.ts",
        "dev": "bun --watch run src/server.ts",
        "test": "bun test",
        "typecheck": "tsc --noEmit"
    },
    "dependencies": {
        "bcryptjs": "^3.0.3",
        "hono": "^4.13.8",
        "mongoose": "^9.10.1"
    },
    "devDependencies": {
        "@types/bun": "^1.4.2",
        "typescript": "^7.0.2"
    }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "preserve",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["bun"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 3: Create `backend/bunfig.toml`**

`preload` runs before any test module is imported, which is the only way to set
environment variables before `src/config.ts` is evaluated.

```toml
[test]
preload = ["./test/setup.ts"]
```

- [ ] **Step 4: Create `backend/src/config.ts`**

```ts
import path from "node:path";

/*
 * Toute la configuration passe par des variables d'environnement.
 * Bun charge automatiquement le fichier .env, il n'y a rien à appeler.
 */

export const PORT = Number(process.env.PORT) || 3000;

export const MONGODB_URI = process.env.MONGODB_URI;

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
export const JWT_SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// hono/jwt exige que l'algorithme soit précisé explicitement à la signature
// comme à la vérification.
export const JWT_ALG = "HS256" as const;

// Durée de vie d'un jeton : 2 heures, exprimées en secondes.
export const TOKEN_TTL_SECONDS = 2 * 60 * 60;

/*
 * Les fichiers audio restent sur le disque du serveur dans ce TP.
 * MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
 * UPLOADS_DIR est surchargeable pour que les tests écrivent ailleurs.
 */
export const UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR || "data/uploads",
);

// La taille maximale d'un fichier audio est de 25 Mo.
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
export const ALLOWED_MIME: ReadonlySet<string> = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);
```

- [ ] **Step 5: Create `backend/src/types.ts`**

```ts
/** Contenu utile d'un jeton JWT accepté par l'API. */
export interface AuthPayload {
  /** `sub` (subject) contient l'identifiant MongoDB de l'utilisateur. */
  sub: string;
  email: string;
  /** Date d'expiration, en secondes depuis 1970. */
  exp: number;
}

/**
 * Typage du contexte Hono. `Variables` décrit ce qu'un middleware peut
 * déposer avec c.set(...) et qu'un handler relit avec c.get(...).
 * C'est l'équivalent typé du `req.auth = ...` d'Express.
 */
export type AppEnv = {
  Variables: {
    auth: AuthPayload;
  };
};

/** Champs d'un utilisateur qu'une réponse HTTP peut exposer. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

/** Champs d'une piste qu'une réponse HTTP peut exposer (jamais storedName). */
export interface PublicTrack {
  id: string;
  ownerId: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/** Enveloppe de pagination attendue par le frontend Angular. */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
```

- [ ] **Step 6: Add `UPLOADS_DIR` to `backend/.env.example`**

Append this line to the existing file, leaving `MONGODB_URI`, `JWT_SECRET` and `PORT` untouched:

```
# Facultatif : dossier de stockage des fichiers audio (défaut : data/uploads)
UPLOADS_DIR=data/uploads
```

- [ ] **Step 7: Install dependencies and verify the toolchain**

```bash
cd backend
rm -rf node_modules
bun install
bun run typecheck
```

Expected: `bun install` removes express/cors/multer/jsonwebtoken and installs hono. `bun run typecheck` exits 0 (there are no `.ts` source files yet beyond config/types, which is fine).

- [ ] **Step 8: Refresh `package-lock.json`**

The repo keeps `package-lock.json` as its dependency reference (`bun.lock` is gitignored).

```bash
cd backend
npm install --package-lock-only
```

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json \
        backend/bunfig.toml backend/src/config.ts backend/src/types.ts backend/.env.example
git commit -m "chore(backend): outillage Bun + TypeScript et configuration partagée"
```

---

### Task 2: Mongoose models in TypeScript

**Files:**
- Create: `backend/src/models/User.ts`
- Create: `backend/src/models/Track.ts`
- Create: `backend/test/setup.ts`
- Create: `backend/test/helpers.ts`
- Create: `backend/test/models.test.ts`

**Interfaces:**
- Consumes: `PublicUser`, `PublicTrack` from `src/types.ts`.
- Produces:
  - `User` model with static `register(input: { name: string; email: string; password: string }): Promise<HydratedDocument<UserDoc, UserMethods>>`, methods `verifyPassword(value: string): Promise<boolean>` and `toPublic(): PublicUser`.
  - `Track` model with method `toPublic(): PublicTrack`. Exported types `UserDoc`, `UserMethods`, `TrackDoc`, `TrackMethods`.
  - `test/helpers.ts`: `connectTestDb()`, `resetDb()`, `disconnectTestDb()`.

- [ ] **Step 1: Create `backend/test/setup.ts`**

Preloaded by `bunfig.toml` before any other module, so `src/config.ts` reads these values.

```ts
/*
 * Ce fichier est chargé par bunfig.toml AVANT tout autre module de test.
 * C'est le seul endroit où l'on peut fixer les variables d'environnement
 * avant que src/config.ts ne les lise.
 */
import os from "node:os";
import path from "node:path";

process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://127.0.0.1:27017/guitar-practice-cloud-test";

process.env.JWT_SECRET = "secret-de-test-non-utilise-en-production";

// Les uploads des tests n'atterrissent jamais dans backend/data/uploads.
process.env.UPLOADS_DIR = path.join(os.tmpdir(), "gpc-test-uploads");
```

- [ ] **Step 2: Create `backend/test/helpers.ts`**

```ts
import mongoose from "mongoose";

/** Ouvre la connexion à la base de test si elle n'est pas déjà ouverte. */
export async function connectTestDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI as string);
  }
}

/** Vide toutes les collections entre deux tests pour les isoler. */
export async function resetDb(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name]?.deleteMany({});
  }
}

/** Referme la connexion à la fin d'un fichier de test. */
export async function disconnectTestDb(): Promise<void> {
  await mongoose.disconnect();
}
```

- [ ] **Step 3: Write the failing test `backend/test/models.test.ts`**

```ts
import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import mongoose from "mongoose";
import { connectTestDb, resetDb, disconnectTestDb } from "./helpers";
import { User } from "../src/models/User";
import { Track } from "../src/models/Track";

beforeAll(connectTestDb);
afterEach(resetDb);
afterAll(disconnectTestDb);

test("l'email est normalisé en minuscules", async () => {
  const user = await User.register({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  expect(user.email).toBe("test@example.com");
});

test("le mot de passe est haché, jamais stocké en clair", async () => {
  const user = await User.register({
    name: "Test",
    email: "hash@example.com",
    password: "12345678",
  });

  expect(user.passwordHash).not.toBe("12345678");
  expect(await user.verifyPassword("12345678")).toBe(true);
  expect(await user.verifyPassword("mauvais")).toBe(false);
});

test("toPublic n'expose ni le hash ni les champs techniques", async () => {
  const user = await User.register({
    name: "Test",
    email: "public@example.com",
    password: "12345678",
  });

  const publicUser = user.toPublic();
  expect(Object.keys(publicUser).sort()).toEqual([
    "createdAt",
    "email",
    "id",
    "name",
  ]);
});

test("une piste référence son propriétaire et cache storedName", () => {
  const track = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });

  expect(track.title).toBe("Blues");
  expect(Track.schema.path("ownerId").options.ref).toBe("User");
  expect(track.toPublic()).not.toHaveProperty("storedName");
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
docker compose up -d mongo
cd backend && bun test test/models.test.ts
```

Expected: FAIL — `Cannot find module '../src/models/User'`.

- [ ] **Step 5: Create `backend/src/models/User.ts`**

```ts
import mongoose, { Schema, type Model, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";
import type { PublicUser } from "../types";

/*
 * Un schéma Mongoose décrit la forme des documents MongoDB et leurs règles de
 * validation. `timestamps` ajoute automatiquement createdAt et updatedAt.
 * En TypeScript, on décrit d'abord la forme du document, puis ses méthodes.
 */
export interface UserDoc {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMethods {
  verifyPassword(value: string): Promise<boolean>;
  toPublic(): PublicUser;
}

export interface UserStatics {
  register(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<HydratedDocument<UserDoc, UserMethods>>;
}

type UserModel = Model<UserDoc, {}, UserMethods> & UserStatics;

const schema = new Schema<UserDoc, UserModel, UserMethods>(
  {
    name: { type: String, required: true, trim: true, minlength: 2 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // select:false empêche de renvoyer le hash par défaut dans les requêtes.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

/**
 * Crée un utilisateur en hachant son mot de passe au passage.
 * bcrypt transforme le mot de passe en empreinte irréversible : le mot de
 * passe d'origine n'est jamais écrit en base ni dans les logs.
 */
schema.static("register", async function register(input: {
  name: string;
  email: string;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return this.create({
    name: input.name,
    email: input.email,
    passwordHash,
  });
});

/** Compare un mot de passe reçu avec l'empreinte stockée. */
schema.method("verifyPassword", function verifyPassword(value: string) {
  return bcrypt.compare(value, this.passwordHash);
});

/** Retourne uniquement les champs qu'une réponse HTTP peut exposer. */
schema.method("toPublic", function toPublic(): PublicUser {
  return {
    id: this.id as string,
    name: this.name,
    email: this.email,
    createdAt: this.createdAt,
  };
});

export const User = mongoose.model<UserDoc, UserModel>("User", schema);
```

- [ ] **Step 6: Create `backend/src/models/Track.ts`**

```ts
import mongoose, { Schema, type Model } from "mongoose";
import type { PublicTrack } from "../types";

/*
 * Ce schéma conserve les métadonnées d'une piste. Le fichier audio lui-même
 * reste sur le disque ; storedName contient le nom technique utilisé côté
 * serveur et n'est jamais exposé par toPublic().
 */
export interface TrackDoc {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrackMethods {
  toPublic(): PublicTrack;
}

type TrackModel = Model<TrackDoc, {}, TrackMethods>;

const schema = new Schema<TrackDoc, TrackModel, TrackMethods>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

// Cet index accélère la liste des pistes d'un utilisateur triées par date.
schema.index({ ownerId: 1, createdAt: -1 });

/**
 * Convertit un document Mongoose en objet sûr pour le frontend.
 * L'identifiant MongoDB devient la propriété simple `id` attendue par Angular.
 */
schema.method("toPublic", function toPublic(): PublicTrack {
  return {
    id: this.id as string,
    ownerId: String(this.ownerId),
    title: this.title,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    createdAt: this.createdAt,
  };
});

export const Track = mongoose.model<TrackDoc, TrackModel>("Track", schema);
```

- [ ] **Step 7: Run tests and typecheck**

```bash
cd backend && bun test test/models.test.ts && bun run typecheck
```

Expected: 4 tests pass, typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add backend/src/models backend/test/setup.ts backend/test/helpers.ts backend/test/models.test.ts
git commit -m "feat(backend): modèles Mongoose User et Track en TypeScript"
```

---

### Task 3: JWT helper and authentication middleware

**Files:**
- Create: `backend/src/lib/jwt.ts`
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/middleware/request-log.ts`
- Create: `backend/test/jwt.test.ts`

**Interfaces:**
- Consumes: `JWT_SECRET`, `JWT_ALG`, `TOKEN_TTL_SECONDS` from `src/config.ts`; `AuthPayload`, `AppEnv` from `src/types.ts`.
- Produces:
  - `createToken(user: { id: string; email: string }): Promise<string>`
  - `verifyToken(raw: string): Promise<AuthPayload | null>`
  - `requireAuth` — Hono middleware for `AppEnv`, throws `HTTPException` 401, otherwise sets `auth`.
  - `requestLog` — Hono middleware logging method, path and status.

- [ ] **Step 1: Write the failing test `backend/test/jwt.test.ts`**

```ts
import { test, expect } from "bun:test";
import { sign } from "hono/jwt";
import { createToken, verifyToken } from "../src/lib/jwt";
import { JWT_SECRET, JWT_ALG } from "../src/config";

test("un jeton créé par l'API est relu correctement", async () => {
  const token = await createToken({ id: "507f1f77bcf86cd799439011", email: "a@b.c" });
  const payload = await verifyToken(token);

  expect(payload?.sub).toBe("507f1f77bcf86cd799439011");
  expect(payload?.email).toBe("a@b.c");
  expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
});

test("un jeton expiré est refusé", async () => {
  const expired = await sign(
    { sub: "abc", email: "a@b.c", exp: Math.floor(Date.now() / 1000) - 10 },
    JWT_SECRET,
    JWT_ALG,
  );

  expect(await verifyToken(expired)).toBeNull();
});

test("un jeton signé avec un autre secret est refusé", async () => {
  const forged = await sign(
    { sub: "abc", email: "a@b.c", exp: Math.floor(Date.now() / 1000) + 60 },
    "un-autre-secret",
    JWT_ALG,
  );

  expect(await verifyToken(forged)).toBeNull();
});

test("une chaîne qui n'est pas un JWT est refusée", async () => {
  expect(await verifyToken("pas-un-jeton")).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && bun test test/jwt.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/jwt'`.

- [ ] **Step 3: Create `backend/src/lib/jwt.ts`**

```ts
import { sign, verify } from "hono/jwt";
import { JWT_ALG, JWT_SECRET, TOKEN_TTL_SECONDS } from "../config";
import type { AuthPayload } from "../types";

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'y figure jamais. `sub` signifie subject et contient
 * l'identifiant MongoDB de l'utilisateur.
 */
export async function createToken(user: {
  id: string;
  email: string;
}): Promise<string> {
  console.log(`[auth] Création d'un jeton pour l'utilisateur ${user.id}`);

  return sign(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    },
    JWT_SECRET,
    JWT_ALG,
  );
}

/**
 * Vérifie la signature et la date d'expiration d'un jeton.
 * Retourne null si le jeton est absent, invalide ou expiré.
 *
 * ATTENTION : hono/jwt place le jeton complet dans error.message
 * (JwtTokenExpired). On ne journalise donc QUE le nom de la classe d'erreur,
 * sinon un jeton réutilisable se retrouverait dans les logs.
 */
export async function verifyToken(raw: string): Promise<AuthPayload | null> {
  try {
    const payload = await verify(raw, JWT_SECRET, JWT_ALG);

    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      console.warn("[auth] Jeton refusé : contenu inattendu");
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      exp: Number(payload.exp),
    };
  } catch (error) {
    console.warn(
      `[auth] Jeton refusé (${(error as Error).constructor.name})`,
    );
    return null;
  }
}
```

- [ ] **Step 4: Create `backend/src/middleware/auth.ts`**

```ts
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "../lib/jwt";
import type { AppEnv } from "../types";

/**
 * Middleware Hono qui protège les routes privées.
 *
 * Le jeton est transmis dans l'en-tête sous la forme
 * "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire.
 *
 * En cas de succès, le contenu du jeton est déposé sur le contexte avec
 * c.set("auth", ...). C'est l'équivalent typé du `req.auth = ...` d'Express :
 * un handler le relit ensuite avec c.get("auth").
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const raw = c.req.header("Authorization");

  if (!raw?.startsWith("Bearer ")) {
    console.warn(
      `[auth] En-tête Authorization absent pour ${c.req.method} ${c.req.path}`,
    );
    throw new HTTPException(401, { message: "Authentification requise" });
  }

  const payload = await verifyToken(raw.slice(7));

  if (!payload) {
    throw new HTTPException(401, { message: "Jeton invalide ou expiré" });
  }

  console.log(`[auth] Jeton accepté pour ${payload.sub}`);
  c.set("auth", payload);
  await next();
});
```

- [ ] **Step 5: Create `backend/src/middleware/request-log.ts`**

```ts
import { createMiddleware } from "hono/factory";

/**
 * Journalise la fin de chaque requête : méthode, URL, statut et durée.
 * Les corps de requête ne sont jamais journalisés, car ils contiennent
 * parfois un mot de passe.
 *
 * `await next()` laisse passer la requête vers la suite de la chaîne ; le code
 * placé après s'exécute une fois la réponse construite.
 */
export const requestLog = createMiddleware(async (c, next) => {
  const startedAt = Date.now();
  const { pathname, search } = new URL(c.req.url);

  await next();

  console.log(
    `[http] ${c.req.method} ${pathname}${search} -> ${c.res.status} (${Date.now() - startedAt} ms)`,
  );
});
```

- [ ] **Step 6: Run tests and typecheck**

```bash
cd backend && bun test test/jwt.test.ts && bun run typecheck
```

Expected: 4 tests pass, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/jwt.ts backend/src/middleware backend/test/jwt.test.ts
git commit -m "feat(backend): jetons JWT et middlewares Hono d'authentification et de log"
```

---

### Task 4: Upload helper

**Files:**
- Create: `backend/src/lib/uploads.ts`
- Create: `backend/test/uploads.test.ts`

**Interfaces:**
- Consumes: `UPLOADS_DIR`, `MAX_FILE_SIZE`, `ALLOWED_MIME` from `src/config.ts`.
- Produces:
  - `ensureUploadsDir(): void`
  - `audioPath(storedName: string): string`
  - `validateAudio(candidate: unknown): { ok: true; file: File } | { ok: false; message: string }`
  - `saveAudio(file: File): Promise<string>` — returns the generated `storedName`
  - `removeAudio(storedName: string): Promise<void>`

- [ ] **Step 1: Write the failing test `backend/test/uploads.test.ts`**

```ts
import { test, expect, beforeAll } from "bun:test";
import fs from "node:fs";
import {
  ensureUploadsDir,
  validateAudio,
  saveAudio,
  removeAudio,
  audioPath,
} from "../src/lib/uploads";
import { MAX_FILE_SIZE } from "../src/config";

beforeAll(ensureUploadsDir);

function audioFile(name: string, type: string, size = 16): File {
  return new File([new Uint8Array(size)], name, { type });
}

test("un champ absent est refusé", () => {
  const result = validateAudio(undefined);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.message).toBe("Fichier audio requis");
});

test("une chaîne de texte n'est pas un fichier", () => {
  const result = validateAudio("song.mp3");
  expect(result.ok).toBe(false);
});

test("un type MIME non audio est refusé", () => {
  const result = validateAudio(audioFile("x.exe", "application/octet-stream"));
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.message).toBe("Format audio non accepté");
});

test("un fichier trop volumineux est refusé", () => {
  const result = validateAudio(audioFile("big.mp3", "audio/mpeg", MAX_FILE_SIZE + 1));
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.message).toBe("Fichier trop volumineux");
});

test("un mp3 valide est accepté", () => {
  expect(validateAudio(audioFile("ok.mp3", "audio/mpeg")).ok).toBe(true);
});

test("saveAudio écrit le fichier sous un nom aléatoire et removeAudio le supprime", async () => {
  const storedName = await saveAudio(audioFile("Chanson Été.MP3", "audio/mpeg", 128));

  expect(storedName).toEndWith(".mp3");
  expect(storedName).not.toContain("Chanson");
  expect(fs.existsSync(audioPath(storedName))).toBe(true);
  expect(Bun.file(audioPath(storedName)).size).toBe(128);

  await removeAudio(storedName);
  expect(fs.existsSync(audioPath(storedName))).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && bun test test/uploads.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/uploads'`.

- [ ] **Step 3: Create `backend/src/lib/uploads.ts`**

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { ALLOWED_MIME, MAX_FILE_SIZE, UPLOADS_DIR } from "../config";

/**
 * Crée le dossier des uploads au démarrage : l'application doit en disposer
 * avant de pouvoir accepter le premier fichier.
 */
export function ensureUploadsDir(): void {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`[startup] Dossier des uploads prêt : ${UPLOADS_DIR}`);
  } catch (error) {
    console.error("[startup] Impossible de créer le dossier des uploads", error);
    throw error;
  }
}

/** Chemin absolu d'un fichier stocké. */
export function audioPath(storedName: string): string {
  return path.join(UPLOADS_DIR, storedName);
}

export type AudioValidation =
  | { ok: true; file: File }
  | { ok: false; message: string };

/**
 * Contrôle ce que le navigateur a envoyé dans le champ "audio".
 *
 * Hono ne fait aucune validation : parseBody() rend soit une chaîne (champ
 * texte), soit un File (champ fichier). On vérifie donc nous-mêmes la nature
 * du champ, son type MIME et sa taille, ce que Multer faisait auparavant.
 */
export function validateAudio(candidate: unknown): AudioValidation {
  if (!(candidate instanceof File)) {
    console.warn("[upload] Aucun fichier reçu dans le champ audio");
    return { ok: false, message: "Fichier audio requis" };
  }

  if (!ALLOWED_MIME.has(candidate.type)) {
    console.warn(`[upload] Type refusé : ${candidate.type}`);
    return { ok: false, message: "Format audio non accepté" };
  }

  if (candidate.size > MAX_FILE_SIZE) {
    console.warn(`[upload] Fichier trop volumineux : ${candidate.size} octets`);
    return { ok: false, message: "Fichier trop volumineux" };
  }

  return { ok: true, file: candidate };
}

/**
 * Écrit le fichier sur le disque sous un nom aléatoire.
 * Le nom d'origine n'est jamais réutilisé comme nom de stockage : il pourrait
 * contenir des caractères dangereux ou provoquer une collision entre
 * utilisateurs. Seule l'extension est conservée, en minuscules.
 */
export async function saveAudio(file: File): Promise<string> {
  const storedName =
    crypto.randomUUID() + path.extname(file.name).toLowerCase();

  await Bun.write(audioPath(storedName), file);
  console.log(`[upload] Fichier écrit : ${storedName} (${file.size} octets)`);

  return storedName;
}

/** Supprime un fichier stocké. L'appelant traite l'erreur éventuelle. */
export async function removeAudio(storedName: string): Promise<void> {
  await fsPromises.unlink(audioPath(storedName));
  console.log(`[upload] Fichier supprimé : ${storedName}`);
}
```

- [ ] **Step 4: Run tests and typecheck**

```bash
cd backend && bun test test/uploads.test.ts && bun run typecheck
```

Expected: 6 tests pass, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/uploads.ts backend/test/uploads.test.ts
git commit -m "feat(backend): gestion des fichiers audio sans Multer"
```

---

### Task 5: Application shell, health route and error handling

**Files:**
- Create: `backend/src/routes/health.ts`
- Create: `backend/src/app.ts`
- Create: `backend/test/app.test.ts`
- Modify: `backend/test/helpers.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requestLog`, `AppEnv`.
- Produces:
  - `createApp(): Hono<AppEnv>`
  - `test/helpers.ts` gains `app`, `request(path, init?)`, `authHeaders(token)`.

- [ ] **Step 1: Add request helpers to `backend/test/helpers.ts`**

Append to the existing file:

```ts
import { createApp } from "../src/app";

/** Une seule instance d'application est partagée par tous les tests. */
export const app = createApp();

/**
 * Appelle l'API sans ouvrir de port : app.fetch reçoit directement un objet
 * Request standard et retourne une Response standard.
 */
export function request(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

/** Construit l'en-tête Authorization attendu par les routes privées. */
export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
```

Move the `import mongoose from "mongoose";` line so all imports stay at the top of the file.

- [ ] **Step 2: Write the failing test `backend/test/app.test.ts`**

```ts
import { test, expect } from "bun:test";
import { request, authHeaders } from "./helpers";

test("GET /api/health répond sans authentification ni MongoDB", async () => {
  const response = await request("/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("une route inconnue répond 404 en JSON", async () => {
  const response = await request("/api/inexistant");

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ message: "Ressource inconnue" });
});

test("CORS autorise le frontend Angular", async () => {
  const response = await request("/api/health", {
    headers: { Origin: "http://localhost:4200" },
  });

  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});

test("un en-tête Authorization absent donne 401 en JSON", async () => {
  const response = await request("/api/users/me");

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "Authentification requise" });
});

test("un jeton illisible donne 401", async () => {
  const response = await request("/api/users/me", {
    headers: authHeaders("pas-un-jeton"),
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ message: "Jeton invalide ou expiré" });
});
```

The last two tests depend on `/api/users/me` existing, which Task 6 adds. Keep them in this file; they will fail until Task 7 and that is expected — Step 4 below says so explicitly.

- [ ] **Step 3: Create `backend/src/routes/health.ts`**

```ts
import { Hono } from "hono";
import type { AppEnv } from "../types";

export const healthRoutes = new Hono<AppEnv>();

/** Endpoint public utilisé pour vérifier que l'API répond. */
healthRoutes.get("/health", (c) => {
  console.log("[health] Vérification de l'API");
  return c.json({ status: "ok" });
});
```

- [ ] **Step 4: Create `backend/src/app.ts`**

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requestLog } from "./middleware/request-log";
import { healthRoutes } from "./routes/health";
import type { AppEnv } from "./types";

/**
 * Construit l'application Hono sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.ts.
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", requestLog);

  /*
   * CORS permet au frontend Angular (http://localhost:4200) d'appeler l'API
   * servie sur un autre port. Dans un vrai projet, il faut restreindre la
   * liste des origines autorisées.
   */
  app.use("*", cors());

  /*
   * Contrairement à Express, Hono n'a pas de middleware express.json() global :
   * chaque handler lit le corps dont il a besoin avec c.req.json() ou
   * c.req.parseBody().
   */
  app.route("/api", healthRoutes);

  /** Route inconnue : réponse JSON, jamais une page HTML. */
  app.notFound((c) => c.json({ message: "Ressource inconnue" }, 404));

  /**
   * Gestionnaire central des erreurs. Il remplace le middleware d'erreur
   * d'Express : au lieu d'appeler next(error), un handler lève une exception
   * et elle arrive ici.
   */
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      console.warn(`[error] ${error.status} ${error.message}`);
      return c.json({ message: error.message }, error.status);
    }

    if (error instanceof mongoose.Error.ValidationError) {
      console.error("[error] Validation Mongoose refusée", error);
      return c.json({ message: error.message }, 400);
    }

    if (error instanceof mongoose.Error.CastError) {
      console.error("[error] Identifiant MongoDB invalide", error);
      return c.json({ message: "Ressource inconnue" }, 404);
    }

    console.error("[error] Erreur non gérée", error);
    return c.json({ message: "Erreur interne du serveur" }, 500);
  });

  return app;
}
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && bun test test/app.test.ts
```

Expected: the first 3 tests PASS. The last 2 FAIL with 404 instead of 401, because `/api/users/me` does not exist yet — Task 6 fixes that.

- [ ] **Step 6: Typecheck and commit**

```bash
cd backend && bun run typecheck
git add backend/src/app.ts backend/src/routes/health.ts backend/test/app.test.ts backend/test/helpers.ts
git commit -m "feat(backend): application Hono, route health et gestion centralisée des erreurs"
```

---

### Task 6: Authentication routes

**Files:**
- Create: `backend/src/routes/auth.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/test/auth.test.ts`
- Modify: `backend/test/helpers.ts`

**Interfaces:**
- Consumes: `User`, `createToken`.
- Produces: `authRoutes` mounted at `/api/auth`; `test/helpers.ts` gains `registerUser(overrides?)` returning `{ token: string; user: PublicUser }`.

- [ ] **Step 1: Add `registerUser` to `backend/test/helpers.ts`**

```ts
import type { PublicUser } from "../src/types";

/** Inscrit un utilisateur via l'API et retourne son jeton. */
export async function registerUser(
  overrides: Partial<{ name: string; email: string; password: string }> = {},
): Promise<{ token: string; user: PublicUser }> {
  const body = {
    name: "Alice",
    email: `alice-${crypto.randomUUID()}@example.com`,
    password: "MotDePasse1!",
    ...overrides,
  };

  const response = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status !== 201) {
    throw new Error(`Inscription de test échouée : ${response.status}`);
  }

  return response.json() as Promise<{ token: string; user: PublicUser }>;
}
```

- [ ] **Step 2: Write the failing test `backend/test/auth.test.ts`**

```ts
import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { request, connectTestDb, resetDb, disconnectTestDb } from "./helpers";

beforeAll(connectTestDb);
afterEach(resetDb);
afterAll(disconnectTestDb);

function post(path: string, body: unknown): Promise<Response> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { name: "Alice", email: "Alice@Example.com", password: "MotDePasse1!" };

test("inscription réussie : 201, jeton et utilisateur public", async () => {
  const response = await post("/api/auth/register", valid);
  expect(response.status).toBe(201);

  const payload = await response.json();
  expect(typeof payload.token).toBe("string");
  expect(payload.user.email).toBe("alice@example.com");
  expect(payload.user.name).toBe("Alice");
  expect(payload.user).not.toHaveProperty("passwordHash");
});

test("inscription sans nom : 400", async () => {
  const response = await post("/api/auth/register", { ...valid, name: "" });
  expect(response.status).toBe(400);
  expect((await response.json()).message).toBe(
    "Nom, email et mot de passe de 8 caractères requis",
  );
});

test("inscription avec un mot de passe trop court : 400", async () => {
  const response = await post("/api/auth/register", { ...valid, password: "court" });
  expect(response.status).toBe(400);
});

test("inscription sans corps JSON : 400", async () => {
  const response = await request("/api/auth/register", { method: "POST" });
  expect(response.status).toBe(400);
});

test("email déjà utilisé : 409", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/register", valid);

  expect(response.status).toBe(409);
  expect((await response.json()).message).toBe("Email déjà utilisé");
});

test("connexion réussie : 200 avec un jeton", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/login", {
    email: "alice@example.com",
    password: "MotDePasse1!",
  });

  expect(response.status).toBe(200);
  expect(typeof (await response.json()).token).toBe("string");
});

test("connexion insensible à la casse de l'email", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/login", {
    email: "ALICE@EXAMPLE.COM",
    password: "MotDePasse1!",
  });

  expect(response.status).toBe(200);
});

test("mauvais mot de passe : 401", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/login", {
    email: "alice@example.com",
    password: "mauvais-mot-de-passe",
  });

  expect(response.status).toBe(401);
  expect((await response.json()).message).toBe("Identifiants incorrects");
});

test("email inconnu : 401 avec le même message", async () => {
  const response = await post("/api/auth/login", {
    email: "personne@example.com",
    password: "MotDePasse1!",
  });

  expect(response.status).toBe(401);
  expect((await response.json()).message).toBe("Identifiants incorrects");
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd backend && bun test test/auth.test.ts
```

Expected: FAIL — every request returns 404 because `/api/auth/*` is not mounted.

- [ ] **Step 4: Create `backend/src/routes/auth.ts`**

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { User } from "../models/User";
import { createToken } from "../lib/jwt";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>();

/**
 * Lit le corps JSON d'une requête. Hono n'a pas d'équivalent global à
 * express.json() : c'est au handler de demander le corps, et un corps absent
 * ou mal formé doit produire une erreur 400 explicite.
 */
async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<
  Record<string, unknown>
> {
  try {
    const body = await c.req.json();
    return (body ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.warn("[auth] Corps JSON illisible", error);
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  }
}

/** Inscrit un utilisateur et renvoie un jeton avec ses données publiques. */
authRoutes.post("/register", async (c) => {
  const body = await readJson(c);
  const name = typeof body.name === "string" ? body.name : "";
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

  if (!name || !email || !password || password.length < 8) {
    console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
    throw new HTTPException(400, {
      message: "Nom, email et mot de passe de 8 caractères requis",
    });
  }

  // Vérifie que l'email est libre avant de créer le compte.
  if (await User.exists({ email: email.toLowerCase() })) {
    console.warn("[auth] Inscription refusée : email déjà utilisé");
    throw new HTTPException(409, { message: "Email déjà utilisé" });
  }

  const user = await User.register({ name, email, password });
  console.log(`[auth] Utilisateur créé : ${user.id}`);

  return c.json({ token: await createToken(user), user: user.toPublic() }, 201);
});

/** Vérifie les identifiants et ouvre une session JWT. */
authRoutes.post("/login", async (c) => {
  const body = await readJson(c);
  const email = (typeof body.email === "string" ? body.email : "").toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

  /*
   * passwordHash est marqué select:false dans le schéma : il faut le demander
   * explicitement pour pouvoir comparer le mot de passe.
   */
  const user = await User.findOne({ email }).select("+passwordHash");

  /*
   * Le même message est renvoyé pour un email inconnu et pour un mot de passe
   * faux : cela évite de révéler quels comptes existent.
   */
  if (!user || !(await user.verifyPassword(password))) {
    console.warn("[auth] Identifiants incorrects");
    throw new HTTPException(401, { message: "Identifiants incorrects" });
  }

  console.log(`[auth] Connexion réussie : ${user.id}`);
  return c.json({ token: await createToken(user), user: user.toPublic() });
});
```

- [ ] **Step 5: Mount the routes in `backend/src/app.ts`**

Add the import next to the `healthRoutes` import:

```ts
import { authRoutes } from "./routes/auth";
```

Add the mount immediately after `app.route("/api", healthRoutes);`:

```ts
  app.route("/api/auth", authRoutes);
```

- [ ] **Step 6: Run tests and typecheck**

```bash
cd backend && bun test test/auth.test.ts && bun run typecheck
```

Expected: 9 tests pass, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/app.ts backend/test/auth.test.ts backend/test/helpers.ts
git commit -m "feat(backend): routes d'inscription et de connexion en Hono"
```

---

### Task 7: User profile routes

**Files:**
- Create: `backend/src/routes/users.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/test/users.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `User`, `registerUser`, `authHeaders`.
- Produces: `usersRoutes` mounted at `/api/users`.

- [ ] **Step 1: Write the failing test `backend/test/users.test.ts`**

```ts
import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import {
  request,
  authHeaders,
  registerUser,
  connectTestDb,
  resetDb,
  disconnectTestDb,
} from "./helpers";

beforeAll(connectTestDb);
afterEach(resetDb);
afterAll(disconnectTestDb);

test("GET /api/users/me renvoie le profil du porteur du jeton", async () => {
  const { token, user } = await registerUser({ name: "Alice" });

  const response = await request("/api/users/me", { headers: authHeaders(token) });

  expect(response.status).toBe(200);
  const profile = await response.json();
  expect(profile.id).toBe(user.id);
  expect(profile.name).toBe("Alice");
  expect(profile).not.toHaveProperty("passwordHash");
});

test("GET /api/users/me sans jeton : 401", async () => {
  const response = await request("/api/users/me");
  expect(response.status).toBe(401);
});

test("PUT /api/users/me modifie le nom", async () => {
  const { token } = await registerUser({ name: "Alice" });

  const response = await request("/api/users/me", {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alice Dupont" }),
  });

  expect(response.status).toBe(200);
  expect((await response.json()).name).toBe("Alice Dupont");
});

test("PUT /api/users/me avec un nom trop court : 400", async () => {
  const { token } = await registerUser();

  const response = await request("/api/users/me", {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "A" }),
  });

  expect(response.status).toBe(400);
});

test("PUT /api/users/me ne permet pas de changer l'email", async () => {
  const { token, user } = await registerUser();

  const response = await request("/api/users/me", {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Bob", email: "pirate@example.com" }),
  });

  expect(response.status).toBe(200);
  expect((await response.json()).email).toBe(user.email);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && bun test test/users.test.ts
```

Expected: FAIL — 404 on every request.

- [ ] **Step 3: Create `backend/src/routes/users.ts`**

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth";
import { User } from "../models/User";
import type { AppEnv } from "../types";

export const usersRoutes = new Hono<AppEnv>();

// Toutes les routes de ce module exigent un jeton valide.
usersRoutes.use("*", requireAuth);

/** Retourne le profil public de l'utilisateur identifié par le jeton. */
usersRoutes.get("/me", async (c) => {
  // c.get("auth") contient ce que le middleware requireAuth a déposé.
  const { sub } = c.get("auth");
  const user = await User.findById(sub);

  if (!user) {
    console.warn(`[user] Profil introuvable : ${sub}`);
    throw new HTTPException(404, { message: "Utilisateur inconnu" });
  }

  console.log(`[user] Profil envoyé : ${user.id}`);
  return c.json(user.toPublic());
});

/**
 * Modifie uniquement le nom de l'utilisateur connecté.
 * Seul le champ `name` est repris du corps : un client ne doit pas pouvoir
 * changer son email ou son mot de passe par cette route.
 */
usersRoutes.put("/me", async (c) => {
  const { sub } = c.get("auth");

  let body: Record<string, unknown>;
  try {
    body = ((await c.req.json()) ?? {}) as Record<string, unknown>;
  } catch (error) {
    console.warn("[user] Corps JSON illisible", error);
    throw new HTTPException(400, { message: "Corps JSON invalide" });
  }

  const name = typeof body.name === "string" ? body.name : undefined;

  // runValidators applique les règles du schéma (longueur minimale du nom)
  // à une mise à jour, ce que Mongoose ne fait pas par défaut.
  const user = await User.findByIdAndUpdate(
    sub,
    { $set: { name } },
    { new: true, runValidators: true },
  );

  if (!user) {
    console.warn(`[user] Mise à jour impossible : ${sub}`);
    throw new HTTPException(404, { message: "Utilisateur inconnu" });
  }

  console.log(`[user] Nom mis à jour : ${user.id}`);
  return c.json(user.toPublic());
});
```

- [ ] **Step 4: Mount the routes in `backend/src/app.ts`**

Add the import:

```ts
import { usersRoutes } from "./routes/users";
```

Add the mount after the `authRoutes` line:

```ts
  app.route("/api/users", usersRoutes);
```

- [ ] **Step 5: Run tests and typecheck**

```bash
cd backend && bun test test/users.test.ts test/app.test.ts && bun run typecheck
```

Expected: the 5 user tests pass, and the 2 previously failing tests in `app.test.ts` now pass (10 total). Typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/users.ts backend/src/app.ts backend/test/users.test.ts
git commit -m "feat(backend): routes de profil utilisateur en Hono"
```

---

### Task 8: Track listing with pagination

**Files:**
- Create: `backend/src/routes/tracks.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/test/tracks-list.test.ts`
- Modify: `backend/test/helpers.ts`

**Interfaces:**
- Consumes: `requireAuth`, `Track`, `PublicTrack`, `Page`.
- Produces: `tracksRoutes` mounted at `/api/tracks`; `test/helpers.ts` gains `seedTracks(ownerId: string, count: number): Promise<void>`.

- [ ] **Step 1: Add `seedTracks` to `backend/test/helpers.ts`**

```ts
import mongoose from "mongoose";
import { Track } from "../src/models/Track";

/**
 * Crée des pistes directement en base, sans passer par l'upload HTTP.
 * `createdAt` est forcé pour que l'ordre de tri soit déterministe.
 */
export async function seedTracks(ownerId: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await Track.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      title: `Piste ${index + 1}`,
      originalName: `piste-${index + 1}.mp3`,
      storedName: `stocke-${index + 1}.mp3`,
      mimeType: "audio/mpeg",
      size: 1024,
      createdAt: new Date(2026, 0, 1, 0, 0, index),
    });
  }
}
```

`createdAt` is normally managed by `timestamps`, but Mongoose accepts an
explicit value on `create`.

- [ ] **Step 2: Write the failing test `backend/test/tracks-list.test.ts`**

```ts
import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import {
  request,
  authHeaders,
  registerUser,
  seedTracks,
  connectTestDb,
  resetDb,
  disconnectTestDb,
} from "./helpers";

beforeAll(connectTestDb);
afterEach(resetDb);
afterAll(disconnectTestDb);

test("liste paginée par défaut : 5 éléments par page", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 7);

  const response = await request("/api/tracks", { headers: authHeaders(token) });
  expect(response.status).toBe(200);

  const page = await response.json();
  expect(page.items).toHaveLength(5);
  expect(page.page).toBe(1);
  expect(page.limit).toBe(5);
  expect(page.total).toBe(7);
  expect(page.pages).toBe(2);
});

test("les pistes sont triées de la plus récente à la plus ancienne", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 3);

  const page = await (
    await request("/api/tracks", { headers: authHeaders(token) })
  ).json();

  expect(page.items.map((t: { title: string }) => t.title)).toEqual([
    "Piste 3",
    "Piste 2",
    "Piste 1",
  ]);
});

test("storedName n'est jamais exposé", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 1);

  const page = await (
    await request("/api/tracks", { headers: authHeaders(token) })
  ).json();

  expect(page.items[0]).not.toHaveProperty("storedName");
  expect(page.items[0]).not.toHaveProperty("_id");
  expect(page.items[0].id).toBeString();
});

test("limit est borné à 20 et page à 1 minimum", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 2);

  const page = await (
    await request("/api/tracks?page=0&limit=999", { headers: authHeaders(token) })
  ).json();

  expect(page.page).toBe(1);
  expect(page.limit).toBe(20);
});

test("des paramètres non numériques retombent sur les valeurs par défaut", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 1);

  const page = await (
    await request("/api/tracks?page=abc&limit=xyz", { headers: authHeaders(token) })
  ).json();

  expect(page.page).toBe(1);
  expect(page.limit).toBe(5);
});

test("un utilisateur ne voit jamais les pistes d'un autre", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  await seedTracks(alice.user.id, 3);

  const page = await (
    await request("/api/tracks", { headers: authHeaders(bob.token) })
  ).json();

  expect(page.items).toHaveLength(0);
  expect(page.total).toBe(0);
  expect(page.pages).toBe(1);
});

test("sans jeton : 401", async () => {
  expect((await request("/api/tracks")).status).toBe(401);
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd backend && bun test test/tracks-list.test.ts
```

Expected: FAIL — 404 on every request.

- [ ] **Step 4: Create `backend/src/routes/tracks.ts`**

```ts
import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { Track } from "../models/Track";
import type { AppEnv, Page, PublicTrack } from "../types";

export const tracksRoutes = new Hono<AppEnv>();

// Toutes les routes de ce module exigent un jeton valide.
tracksRoutes.use("*", requireAuth);

/** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
tracksRoutes.get("/", async (c) => {
  const { sub } = c.get("auth");

  /*
   * Les paramètres d'URL sont toujours des chaînes, et toujours suspects.
   * On les convertit puis on les borne : page >= 1, limit entre 1 et 20.
   */
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit")) || 5));
  const filter = { ownerId: sub };

  console.log(`[tracks] Lecture page=${page}, limit=${limit}, user=${sub}`);

  /*
   * La lecture et le comptage sont lancés en parallèle avec Promise.all :
   * les deux requêtes partent en même temps au lieu de s'attendre.
   * .lean() retourne des objets JavaScript simples, sans méthode Mongoose,
   * ce qui suffit ici et coûte moins cher.
   */
  const [items, total] = await Promise.all([
    Track.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-storedName")
      .lean(),
    Track.countDocuments(filter),
  ]);

  // Chaque document est recopié champ par champ : rien ne peut fuiter par
  // accident, et l'_id de MongoDB devient l'`id` attendu par Angular.
  const publicItems: PublicTrack[] = items.map((track) => ({
    id: String(track._id),
    ownerId: String(track.ownerId),
    title: track.title,
    originalName: track.originalName,
    mimeType: track.mimeType,
    size: track.size,
    createdAt: track.createdAt,
  }));

  console.log(`[tracks] ${publicItems.length} piste(s) envoyée(s) sur ${total}`);

  const body: Page<PublicTrack> = {
    items: publicItems,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };

  return c.json(body);
});
```

- [ ] **Step 5: Mount the routes in `backend/src/app.ts`**

Add the import:

```ts
import { tracksRoutes } from "./routes/tracks";
```

Add the mount after the `usersRoutes` line:

```ts
  app.route("/api/tracks", tracksRoutes);
```

- [ ] **Step 6: Run tests and typecheck**

```bash
cd backend && bun test test/tracks-list.test.ts && bun run typecheck
```

Expected: 7 tests pass, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/tracks.ts backend/src/app.ts backend/test/tracks-list.test.ts backend/test/helpers.ts
git commit -m "feat(backend): liste paginée des pistes en Hono"
```

---

### Task 9: Track upload, audio streaming and deletion

**Files:**
- Modify: `backend/src/routes/tracks.ts`
- Create: `backend/test/tracks-upload.test.ts`

**Interfaces:**
- Consumes: `validateAudio`, `saveAudio`, `removeAudio`, `audioPath`, `ensureUploadsDir`, `MAX_FILE_SIZE`, `Track`.
- Produces: `POST /`, `GET /:id/audio`, `DELETE /:id` on `tracksRoutes`.

- [ ] **Step 1: Write the failing test `backend/test/tracks-upload.test.ts`**

```ts
import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import {
  request,
  authHeaders,
  registerUser,
  connectTestDb,
  resetDb,
  disconnectTestDb,
} from "./helpers";
import { ensureUploadsDir, audioPath } from "../src/lib/uploads";
import { Track } from "../src/models/Track";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

function form(file: File | null, title?: string): FormData {
  const data = new FormData();
  if (file) data.append("audio", file);
  if (title !== undefined) data.append("title", title);
  return data;
}

function audio(name = "song.mp3", type = "audio/mpeg", size = 2048): File {
  return new File([new Uint8Array(size)], name, { type });
}

function upload(token: string, data: FormData): Promise<Response> {
  return request("/api/tracks", {
    method: "POST",
    headers: authHeaders(token),
    body: data,
  });
}

test("upload réussi : 201 avec les métadonnées publiques", async () => {
  const { token, user } = await registerUser();

  const response = await upload(token, form(audio(), "Mon Blues"));
  expect(response.status).toBe(201);

  const track = await response.json();
  expect(track.title).toBe("Mon Blues");
  expect(track.originalName).toBe("song.mp3");
  expect(track.mimeType).toBe("audio/mpeg");
  expect(track.size).toBe(2048);
  expect(track.ownerId).toBe(user.id);
  expect(track).not.toHaveProperty("storedName");

  // Le fichier existe réellement sur le disque.
  const stored = await Track.findById(track.id).select("+storedName");
  expect(fs.existsSync(audioPath(stored!.storedName))).toBe(true);
});

test("sans titre, le nom du fichier sert de titre", async () => {
  const { token } = await registerUser();

  const track = await (await upload(token, form(audio("solo.mp3")))).json();
  expect(track.title).toBe("solo.mp3");
});

test("upload sans fichier : 400", async () => {
  const { token } = await registerUser();

  const response = await upload(token, form(null, "Sans fichier"));
  expect(response.status).toBe(400);
  expect((await response.json()).message).toBe("Fichier audio requis");
});

test("type MIME refusé : 400 et aucune piste créée", async () => {
  const { token } = await registerUser();

  const response = await upload(
    token,
    form(audio("virus.exe", "application/octet-stream")),
  );

  expect(response.status).toBe(400);
  expect((await response.json()).message).toBe("Format audio non accepté");
  expect(await Track.countDocuments({})).toBe(0);
});

test("upload sans jeton : 401", async () => {
  const response = await request("/api/tracks", {
    method: "POST",
    body: form(audio()),
  });

  expect(response.status).toBe(401);
});

test("GET /:id/audio renvoie le flux avec le bon Content-Type", async () => {
  const { token } = await registerUser();
  const track = await (await upload(token, form(audio("a.mp3", "audio/mpeg", 512)))).json();

  const response = await request(`/api/tracks/${track.id}/audio`, {
    headers: authHeaders(token),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("audio/mpeg");
  expect((await response.arrayBuffer()).byteLength).toBe(512);
});

test("l'audio d'un autre utilisateur est introuvable : 404", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const track = await (await upload(alice.token, form(audio()))).json();

  const response = await request(`/api/tracks/${track.id}/audio`, {
    headers: authHeaders(bob.token),
  });

  expect(response.status).toBe(404);
});

test("un identifiant malformé donne 404, pas 500", async () => {
  const { token } = await registerUser();

  const response = await request("/api/tracks/pas-un-objectid/audio", {
    headers: authHeaders(token),
  });

  expect(response.status).toBe(404);
});

test("DELETE supprime la métadonnée et le fichier", async () => {
  const { token } = await registerUser();
  const track = await (await upload(token, form(audio()))).json();
  const stored = await Track.findById(track.id).select("+storedName");
  const diskPath = audioPath(stored!.storedName);

  const response = await request(`/api/tracks/${track.id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  expect(response.status).toBe(204);
  expect(await Track.countDocuments({})).toBe(0);
  expect(fs.existsSync(diskPath)).toBe(false);
});

test("supprimer deux fois donne 404 la seconde fois", async () => {
  const { token } = await registerUser();
  const track = await (await upload(token, form(audio()))).json();

  await request(`/api/tracks/${track.id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  const second = await request(`/api/tracks/${track.id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  expect(second.status).toBe(404);
});

test("un utilisateur ne peut pas supprimer la piste d'un autre", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const track = await (await upload(alice.token, form(audio()))).json();

  const response = await request(`/api/tracks/${track.id}`, {
    method: "DELETE",
    headers: authHeaders(bob.token),
  });

  expect(response.status).toBe(404);
  expect(await Track.countDocuments({})).toBe(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && bun test test/tracks-upload.test.ts
```

Expected: FAIL — the upload returns 404 because `POST /api/tracks` does not exist.

- [ ] **Step 3: Extend `backend/src/routes/tracks.ts`**

Replace the import block at the top of the file with:

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import { Track } from "../models/Track";
import { MAX_FILE_SIZE } from "../config";
import {
  audioPath,
  removeAudio,
  saveAudio,
  validateAudio,
} from "../lib/uploads";
import type { AppEnv, Page, PublicTrack } from "../types";
```

Then append the three new routes after the existing `tracksRoutes.get("/", …)` handler:

```ts
/**
 * Reçoit un formulaire multipart contenant le champ fichier "audio" et le
 * champ texte "title".
 *
 * Différence avec Multer : parseBody() met tout le corps en mémoire avant que
 * l'on puisse lire la taille du fichier. On regarde donc d'abord l'en-tête
 * Content-Length pour rejeter un envoi manifestement trop gros sans le lire.
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
  const title = typeof body["title"] === "string" && body["title"]
    ? body["title"]
    : file.name;

  const storedName = await saveAudio(file);

  try {
    const track = await Track.create({
      ownerId: new mongoose.Types.ObjectId(sub),
      title,
      originalName: file.name,
      storedName,
      mimeType: file.type,
      size: file.size,
    });

    console.log(`[tracks] Upload enregistré : ${track.id}`);
    return c.json(track.toPublic(), 201);
  } catch (error) {
    console.error("[tracks] Erreur après l'écriture du fichier", error);

    // Si MongoDB échoue après l'écriture sur disque, on nettoie le fichier
    // orphelin. Un échec du nettoyage est lui aussi journalisé.
    try {
      await removeAudio(storedName);
    } catch (cleanupError) {
      console.error(
        `[tracks] Impossible de supprimer le fichier orphelin ${storedName}`,
        cleanupError,
      );
    }

    throw error;
  }
});

/** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
tracksRoutes.get("/:id/audio", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");

  // Un identifiant malformé ne doit pas atteindre MongoDB : on répond 404.
  if (!mongoose.isValidObjectId(id)) {
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  const track = await Track.findOne({ _id: id, ownerId: sub }).select(
    "+storedName",
  );

  if (!track) {
    console.warn(`[tracks] Audio introuvable ou interdit : ${id}`);
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  const file = Bun.file(audioPath(track.storedName));

  if (!(await file.exists())) {
    console.error(`[tracks] Fichier absent du disque pour la piste ${track.id}`);
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  console.log(`[tracks] Audio envoyé : ${track.id}`);
  c.header("Content-Type", track.mimeType);
  c.header("Content-Length", String(file.size));

  // file.stream() envoie le fichier par morceaux, sans le charger en mémoire.
  return c.body(file.stream());
});

/** Supprime la métadonnée et le fichier physique correspondant. */
tracksRoutes.delete("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");

  if (!mongoose.isValidObjectId(id)) {
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  const track = await Track.findOneAndDelete({
    _id: id,
    ownerId: sub,
  }).select("+storedName");

  if (!track) {
    console.warn(`[tracks] Suppression impossible : ${id}`);
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  try {
    await removeAudio(track.storedName);
  } catch (error) {
    // L'exception n'est pas ignorée : l'administrateur doit voir ce fichier
    // orphelin si sa suppression échoue.
    console.error(`[tracks] Fichier audio non supprimé : ${track.storedName}`, error);
    return c.json(
      { message: "Métadonnée supprimée, mais fichier audio non supprimé" },
      500,
    );
  }

  return c.body(null, 204);
});
```

- [ ] **Step 4: Run tests and typecheck**

```bash
cd backend && bun test test/tracks-upload.test.ts && bun run typecheck
```

Expected: 11 tests pass, typecheck exits 0.

- [ ] **Step 5: Run the whole suite**

```bash
cd backend && bun test
```

Expected: every test file passes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/tracks.ts backend/test/tracks-upload.test.ts
git commit -m "feat(backend): upload, lecture et suppression des pistes en Hono"
```

---

### Task 10: Server entry point, Docker wiring and removal of the Express code

**Files:**
- Create: `backend/src/server.ts`
- Delete: `backend/src/app.js`, `backend/src/server.js`, `backend/src/models/User.js`, `backend/src/models/Track.js`, `backend/test/api.test.js`
- Modify: `docker-compose.yml:56`

**Interfaces:**
- Consumes: `createApp`, `User`, `ensureUploadsDir`, `MONGODB_URI`, `PORT`.
- Produces: a Bun server entry point (`export default { port, fetch }`).

- [ ] **Step 1: Create `backend/src/server.ts`**

```ts
import mongoose from "mongoose";
import { createApp } from "./app";
import { User } from "./models/User";
import { ensureUploadsDir } from "./lib/uploads";
import { MONGODB_URI, PORT } from "./config";

// Le port et l'URI viennent de l'environnement du backend, jamais d'Angular.
if (!MONGODB_URI) {
  const error = new Error("MONGODB_URI manque dans backend/.env");
  console.error("[startup] Configuration MongoDB absente", error);
  throw error;
}

ensureUploadsDir();

try {
  // `await` suspend le démarrage jusqu'à la connexion effective à MongoDB :
  // il ne faut pas démarrer une API qui ne peut pas atteindre sa base.
  await mongoose.connect(MONGODB_URI);
  console.log("[startup] Connecté à MongoDB");
  console.log(
    "[startup] La base guitar-practice-cloud est prête à recevoir des données",
  );
} catch (error) {
  console.error("[startup] Échec de connexion à MongoDB", error);
  throw error;
}

try {
  // Le compte de démonstration facilite les premiers tests des étudiants.
  const demoEmail = "demo@example.com";

  if (await User.exists({ email: demoEmail })) {
    console.log("[startup] Compte de démonstration déjà présent");
  } else {
    const demoUser = await User.register({
      name: "Demo",
      email: demoEmail,
      password: "Demo1234!",
    });
    console.log(`[startup] Compte de démonstration créé : ${demoUser.id}`);
  }
} catch (error) {
  console.error(
    "[startup] Impossible de préparer le compte de démonstration",
    error,
  );
  throw error;
}

console.log(`Guitar Practice Cloud API: http://localhost:${PORT}/api/health`);

/*
 * Bun démarre automatiquement un serveur HTTP quand le module principal
 * exporte un objet { port, fetch }. Il n'y a ni app.listen() ni adaptateur
 * Node à installer.
 */
export default {
  port: PORT,
  fetch: createApp().fetch,
};
```

- [ ] **Step 2: Delete the Express implementation**

```bash
git rm backend/src/app.js backend/src/server.js \
       backend/src/models/User.js backend/src/models/Track.js \
       backend/test/api.test.js
```

- [ ] **Step 3: Point Docker at the TypeScript entry point**

In `docker-compose.yml`, in the `backend` service, replace:

```yaml
    command: sh -c "bun install && bun --watch run src/server.js"
```

with:

```yaml
    command: sh -c "bun install && bun --watch run src/server.ts"
```

And update the comment above it, replacing:

```yaml
    # `bun run src/server.js` remplace `node --env-file=.env src/server.js` :
    # Bun charge le .env tout seul, et les variables ci-dessous ont priorité.
```

with:

```yaml
    # Bun exécute directement le TypeScript : aucune étape de compilation.
    # Bun charge le .env tout seul, et les variables ci-dessous ont priorité.
```

- [ ] **Step 4: Verify no JavaScript source remains**

```bash
cd backend && find src test -name "*.js" | wc -l
```

Expected: `0`.

- [ ] **Step 5: Start the full stack and verify it serves**

```bash
docker compose up -d --force-recreate backend
sleep 10
docker compose logs --tail=30 backend
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
```

Expected: logs show "Connecté à MongoDB" and the demo account line; curl prints `200`.

- [ ] **Step 6: Verify the demo account can log in against the running container**

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"Demo1234!"}' | head -c 120
```

Expected: a JSON body containing a `token`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.ts docker-compose.yml
git commit -m "feat(backend): point d'entrée Bun et suppression du backend Express"
```

---

### Task 11: Documentation

Brings the assistant instructions and setup guides in line with the new stack. `API_CONTRACT.md` is deliberately untouched.

**Files:**
- Modify: `backend/AGENTS.md`
- Modify: `backend/CLAUDE.md`
- Modify: `backend/GEMINI.md`
- Modify: `backend/best-practices.md`
- Modify: `LOCAL_MONGO_SETUP.md:46`, `LOCAL_MONGO_SETUP.md:68`
- Modify: `README.md:8`, `README.md:57`

- [ ] **Step 1: Update `backend/AGENTS.md`**

Replace the opening paragraph:

```markdown
Ce dossier contient une API Hono écrite en TypeScript, exécutée par Bun, avec
Mongoose et MongoDB. Lis `best-practices.md`, `../API_CONTRACT.md` et
`../LOCAL_MONGO_SETUP.md` avant toute modification.
```

Replace these three bullets:

- « Utiliser les middlewares Express… » → `- Utiliser les middlewares Hono (`createMiddleware`) pour séparer validation, authentification et traitement métier.`
- « Pour Multer, limiter la taille… » → `- Pour un upload, contrôler `Content-Length`, le type MIME et la taille avant d'écrire, et générer un nom de stockage aléatoire.`

Add these bullets:

```markdown
- Signaler une erreur avec `throw new HTTPException(status, { message })` ; le gestionnaire `app.onError` la convertit en JSON.
- Ne jamais journaliser une erreur de `hono/jwt` ni son `.message` : il contient le jeton complet. Journaliser uniquement le nom de la classe d'erreur.
- Typer le contexte avec `Hono<AppEnv>` pour que `c.get("auth")` soit vérifié à la compilation.
- Après une modification : `bun run typecheck` puis `bun test` (nécessite `docker compose up -d mongo`).
```

- [ ] **Step 2: Update `backend/CLAUDE.md`**

Replace the second paragraph:

```markdown
Travaille par petites étapes. Commence par identifier les fichiers concernés et
le flux `route Hono -> middleware -> handler -> Mongoose -> MongoDB`. Pour un
upload, décris aussi le flux `multipart/form-data -> c.req.parseBody() ->
validation -> Bun.write -> métadonnées`.
```

- [ ] **Step 3: Update `backend/GEMINI.md`**

Replace "Respecte l'architecture Express/Mongoose existante" with "Respecte l'architecture Hono/Mongoose existante", and replace the Multer sentence with one describing `c.req.parseBody()` plus explicit size and MIME checks before writing.

- [ ] **Step 4: Rewrite two sections of `backend/best-practices.md`**

Rename `## Node.js et configuration` to `## Bun, TypeScript et configuration` and replace its first bullet with:

```markdown
- Bun exécute directement le TypeScript : il n'y a pas d'étape de compilation. `bun run typecheck` vérifie les types avec `tsc --noEmit`.
```

Rename `## Express : routes et middlewares` to `## Hono : routes et middlewares` and replace its content so that it teaches:

```text
route -> middleware -> handler -> modèle Mongoose -> MongoDB
```

- Hono n'a pas de parseur de corps global : un handler lit `await c.req.json()` ou `await c.req.parseBody()` et traite lui-même un corps absent ou illisible.
- `c.req.query("page")`, `c.req.param("id")` et `c.req.header("Authorization")` remplacent `req.query`, `req.params` et `req.headers`.
- Un handler retourne toujours une `Response` : `return c.json(body, status)`, `return c.body(null, 204)`.
- Un middleware s'écrit avec `createMiddleware<AppEnv>` ; il partage des données via `c.set(...)` / `c.get(...)` au lieu de poser une propriété sur `req`.
- Une erreur se signale avec `throw new HTTPException(status, { message })`, jamais avec `next(error)`.

Replace the async error example with:

```ts
try {
  const result = await operation();
  console.log("[operation] succès", { id: result.id });
  return c.json(result);
} catch (error) {
  console.error("[operation] échec", error);
  throw new HTTPException(500, { message: "Erreur interne du serveur" });
}
```

Replace the documentation link with `[middleware Hono](https://hono.dev/docs/guides/middleware)`.

Rename `## Multer et les uploads` to `## Uploads de fichiers` and replace its content with:

- `c.req.parseBody()` rend un objet dont chaque champ est une chaîne (champ texte) ou un `File` (champ fichier). Rien n'est validé automatiquement.
- Vérifier d'abord l'en-tête `Content-Length` : `parseBody()` charge tout le corps en mémoire, donc un envoi manifestement trop gros doit être refusé avant d'être lu.
- Vérifier ensuite que le champ est bien une instance de `File`, que son type MIME figure dans la liste autorisée et que sa taille respecte la limite.
- Ne jamais réutiliser le nom d'origine comme nom de stockage : générer un nom avec `crypto.randomUUID()` et ne conserver que l'extension, en minuscules.
- Écrire avec `Bun.write(chemin, file)`, puis enregistrer les métadonnées. Si l'enregistrement échoue, supprimer le fichier orphelin et journaliser l'échec éventuel du nettoyage.
- Servir un fichier avec `c.body(Bun.file(chemin).stream())` après avoir vérifié que la ressource appartient bien à l'utilisateur.

Replace the Multer documentation link with `[Hono — corps de requête](https://hono.dev/docs/api/request#parsebody)`.

- [ ] **Step 5: Update `LOCAL_MONGO_SETUP.md`**

- Line 46: replace `L'API Express, exécutée par Bun` with `L'API Hono (TypeScript), exécutée par Bun`.
- Line 68: replace `backend/src/server.js` with `backend/src/server.ts`.

- [ ] **Step 6: Update `README.md`**

- Line 8: replace `- Node.js 22 ou plus récent ;` with `- Bun 1.4 ou plus récent (ou Docker, qui fournit Bun) ;`
- Line 57: replace `Node.js, Express, Mongoose, MongoDB, l'authentification, Multer, les uploads,` with `Bun, TypeScript, Hono, Mongoose, MongoDB, l'authentification, les uploads,`

- [ ] **Step 7: Confirm the contract and the handouts are untouched**

```bash
git diff --name-only HEAD | grep -E "API_CONTRACT|SUJET_ETUDIANT|CONSEILS" | wc -l
```

Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git add backend/AGENTS.md backend/CLAUDE.md backend/GEMINI.md \
        backend/best-practices.md LOCAL_MONGO_SETUP.md README.md
git commit -m "docs: documentation backend alignée sur Hono, TypeScript et Bun"
```

---

### Task 12: Full verification

**Files:** none modified.

- [ ] **Step 1: Clean install and typecheck**

```bash
cd backend && rm -rf node_modules && bun install && bun run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Full test suite**

```bash
docker compose up -d mongo
cd backend && bun test
```

Expected: all tests pass across `models`, `jwt`, `uploads`, `app`, `auth`, `users`, `tracks-list`, `tracks-upload`.

- [ ] **Step 3: Confirm the removed dependencies are gone**

```bash
cd backend && grep -E '"(express|multer|jsonwebtoken|cors)"' package.json | wc -l
```

Expected: `0`.

- [ ] **Step 4: Bring up the whole stack**

```bash
docker compose up -d --build
sleep 15
curl -s http://localhost:3000/api/health
```

Expected: `{"status":"ok"}`.

- [ ] **Step 5: Exercise the contract end to end against the container**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"Demo1234!"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -s -o /dev/null -w "users/me      %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/users/me
curl -s -o /dev/null -w "tracks        %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/tracks
curl -s -o /dev/null -w "upload        %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@frontend-starter/fichiers-audio-de-test/song1.mp3;type=audio/mpeg" \
  -F "title=Test migration" http://localhost:3000/api/tracks
curl -s -o /dev/null -w "sans jeton    %{http_code}\n" http://localhost:3000/api/users/me
```

Expected: `200`, `200`, `201`, `401`.

- [ ] **Step 6: Manual check of the Angular frontend**

Open http://localhost:4200 and confirm, without having changed any frontend
file: registration, login, profile display and rename, paginated track list,
audio upload, playback, deletion.

- [ ] **Step 7: Final commit if anything needed adjusting**

```bash
git status
```

Expected: a clean tree. If the verification required fixes, commit them with a message describing the fix.

---

## Self-Review

**Spec coverage.** Dependencies → Task 1. File layout → Tasks 1–10. Express→Hono mapping → applied in Tasks 5–9. Preserved contract → Tasks 6–9 test every route and status code. Deviation 1 (upload limit) → Task 9 Step 3, `Content-Length` guard plus `validateAudio` size check tested in Task 4. Deviation 2 (JWT logging) → Task 3, `lib/jwt.ts` logs `constructor.name` only. Deviation 3 (JSON 500s) → Task 5 `onError`. Error handling order → Task 5. Upload flow → Task 9. Tests → Tasks 2–9, listed coverage all present. Non-`src/` files → Tasks 10 and 11. Success criteria 1–7 → Task 12.

**Placeholders.** None. Every code step contains complete code; every doc step quotes the replacement text.

**Type consistency.** `createToken` takes `{ id, email }` and is fed Mongoose documents, which expose `id: string` and `email: string` — compatible. `verifyToken` returns `AuthPayload | null`; `requireAuth` narrows it before `c.set("auth", …)`, matching `AppEnv["Variables"]["auth"]`. `validateAudio` returns a discriminated union consumed correctly in both Task 4's tests and Task 9's handler. `saveAudio` returns `string`, stored as `storedName` and passed to `removeAudio` and `audioPath`, both of which take `string`. `seedTracks(ownerId: string, …)` converts to `ObjectId` internally, as does the upload handler. `Page<PublicTrack>` fields match the assertions in `tracks-list.test.ts`.
