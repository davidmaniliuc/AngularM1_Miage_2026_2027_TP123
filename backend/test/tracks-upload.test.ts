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

/*
 * Sans la lib "dom" dans tsconfig, Response.json() est typé Promise<unknown>
 * (types undici) plutôt que Promise<any>. Ce helper de test centralise le
 * cast vers la forme attendue de chaque réponse.
 */
type PublicTrackBody = {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  ownerId: string;
};

function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

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

  const track = await json<PublicTrackBody>(response);
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

  const track = await json<PublicTrackBody>(
    await upload(token, form(audio("solo.mp3"))),
  );
  expect(track.title).toBe("solo.mp3");
});

test("upload sans fichier : 400", async () => {
  const { token } = await registerUser();

  const response = await upload(token, form(null, "Sans fichier"));
  expect(response.status).toBe(400);
  expect((await json<{ message: string }>(response)).message).toBe(
    "Fichier audio requis",
  );
});

test("type MIME refusé : 400 et aucune piste créée", async () => {
  const { token } = await registerUser();

  const response = await upload(
    token,
    form(audio("virus.exe", "application/octet-stream")),
  );

  expect(response.status).toBe(400);
  expect((await json<{ message: string }>(response)).message).toBe(
    "Format audio non accepté",
  );
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
  const track = await json<PublicTrackBody>(
    await upload(token, form(audio("a.mp3", "audio/mpeg", 512))),
  );

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
  const track = await json<PublicTrackBody>(
    await upload(alice.token, form(audio())),
  );

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
  const track = await json<PublicTrackBody>(await upload(token, form(audio())));
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
  const track = await json<PublicTrackBody>(await upload(token, form(audio())));

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
  const track = await json<PublicTrackBody>(
    await upload(alice.token, form(audio())),
  );

  const response = await request(`/api/tracks/${track.id}`, {
    method: "DELETE",
    headers: authHeaders(bob.token),
  });

  expect(response.status).toBe(404);
  expect(await Track.countDocuments({})).toBe(1);
});
