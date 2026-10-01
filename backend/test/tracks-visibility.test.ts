import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import mongoose from "mongoose";
import {
  request,
  authHeaders,
  registerUser,
  connectTestDb,
  resetDb,
  disconnectTestDb,
  fixtureFile,
} from "./helpers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { Track } from "../src/models/Track";
import { UPLOADS_DIR } from "../src/config";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(async () => {
  await resetDb();
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  ensureUploadsDir();
});
afterAll(disconnectTestDb);

type TrackBody = {
  id: string;
  title: string;
  ownerId: string;
  ownerName?: string;
  visibility: "private" | "public";
};
type PageBody = { items: TrackBody[]; total: number };

function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function upload(token: string, visibility?: string): Promise<TrackBody> {
  const data = new FormData();
  data.append("audio", await fixtureFile("plain.mp3", "audio/mpeg", "song.mp3"));
  if (visibility !== undefined) data.append("visibility", visibility);
  const response = await request("/api/tracks", {
    method: "POST",
    headers: authHeaders(token),
    body: data,
  });
  expect(response.status).toBe(201);
  return json<TrackBody>(response);
}

/** Crée une piste en base ; `minute` fixe l'ordre de tri. */
async function seed(
  ownerId: string,
  title: string,
  visibility: "private" | "public",
  minute: number,
) {
  await Track.create({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    title,
    originalName: `${title}.mp3`,
    storedName: `${title}.mp3`,
    mimeType: "audio/mpeg",
    size: 1024,
    visibility,
    createdAt: new Date(2026, 0, 1, 0, minute),
  });
}

async function list(token: string, query = ""): Promise<PageBody> {
  const response = await request(`/api/tracks${query}`, { headers: authHeaders(token) });
  expect(response.status).toBe(200);
  return json<PageBody>(response);
}

function patch(token: string, id: string, body: unknown): Promise<Response> {
  return request(`/api/tracks/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Alice : 1 privée, 1 publique. Bob : 1 privée, 1 publique. */
async function twoLibraries() {
  const alice = await registerUser({ name: "Alice" });
  const bob = await registerUser({ name: "Bob" });
  await seed(alice.user.id, "alice-privee", "private", 1);
  await seed(alice.user.id, "alice-publique", "public", 2);
  await seed(bob.user.id, "bob-privee", "private", 3);
  await seed(bob.user.id, "bob-publique", "public", 4);
  return { alice, bob };
}

test("une piste importée est privée par défaut", async () => {
  const { token } = await registerUser();
  const track = await upload(token);
  expect(track.visibility).toBe("private");
});

test("le champ visibility=public rend la piste publique dès l'import", async () => {
  const { token } = await registerUser();
  const track = await upload(token, "public");
  expect(track.visibility).toBe("public");
});

test("sans scope, la liste ne contient que mes pistes (comportement du TP2)", async () => {
  const { alice } = await twoLibraries();
  const page = await list(alice.token);
  expect(page.items.map((t) => t.title)).toEqual(["alice-publique", "alice-privee"]);
});

test("scope=others : seulement les pistes publiques des autres, avec le nom du propriétaire", async () => {
  const { alice } = await twoLibraries();
  const page = await list(alice.token, "?scope=others");
  expect(page.items.map((t) => t.title)).toEqual(["bob-publique"]);
  expect(page.items[0]?.ownerName).toBe("Bob");
  expect(page.total).toBe(1);
});

test("scope=all : mes pistes et les pistes publiques des autres, triées par date", async () => {
  const { alice } = await twoLibraries();
  const page = await list(alice.token, "?scope=all");
  expect(page.items.map((t) => t.title)).toEqual([
    "bob-publique",
    "alice-publique",
    "alice-privee",
  ]);
  expect(page.total).toBe(3);
});

test("un scope inconnu retombe sur mes pistes", async () => {
  const { alice } = await twoLibraries();
  const page = await list(alice.token, "?scope=n-importe-quoi");
  expect(page.total).toBe(2);
});

test("l'audio d'une piste publique d'un autre utilisateur est lisible", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const track = await upload(alice.token, "public");

  const response = await request(`/api/tracks/${track.id}/audio`, {
    headers: authHeaders(bob.token),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("audio/mpeg");
});

test("l'audio d'une piste privée d'un autre utilisateur reste introuvable : 404", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const track = await upload(alice.token);

  const response = await request(`/api/tracks/${track.id}/audio`, {
    headers: authHeaders(bob.token),
  });
  expect(response.status).toBe(404);
});

test("PATCH change la visibilité de ma piste", async () => {
  const { token } = await registerUser();
  const track = await upload(token);

  const response = await patch(token, track.id, { visibility: "public" });
  expect(response.status).toBe(200);
  expect((await json<TrackBody>(response)).visibility).toBe("public");
  expect((await Track.findById(track.id))?.visibility).toBe("public");
});

test("PATCH avec une valeur inconnue : 400", async () => {
  const { token } = await registerUser();
  const track = await upload(token);

  const response = await patch(token, track.id, { visibility: "amis" });
  expect(response.status).toBe(400);
});

test("on ne peut pas changer la visibilité de la piste d'un autre, même publique : 404", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const track = await upload(alice.token, "public");

  const response = await patch(bob.token, track.id, { visibility: "private" });
  expect(response.status).toBe(404);
  expect((await Track.findById(track.id))?.visibility).toBe("public");
});

test("on ne peut pas supprimer la piste publique d'un autre : 404", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const track = await upload(alice.token, "public");

  const response = await request(`/api/tracks/${track.id}`, {
    method: "DELETE",
    headers: authHeaders(bob.token),
  });
  expect(response.status).toBe(404);
  expect(await Track.findById(track.id)).not.toBeNull();
});
