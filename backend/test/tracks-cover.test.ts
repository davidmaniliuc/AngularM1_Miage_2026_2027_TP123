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
