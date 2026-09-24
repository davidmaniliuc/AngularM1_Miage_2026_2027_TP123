import { test, expect, beforeAll, afterEach, afterAll, spyOn } from "bun:test";
import fs from "node:fs";
import {
  request,
  authHeaders,
  registerUser,
  connectTestDb,
  resetDb,
  disconnectTestDb,
  fixtureFile,
} from "./helpers";
import { ensureUploadsDir, audioPath } from "../src/lib/uploads";
import { coverPath } from "../src/lib/covers";
import { Track } from "../src/models/Track";
import { UPLOADS_DIR, COVERS_DIR } from "../src/config";

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
  artist?: string;
  album?: string;
  transcodedFrom?: string;
  hasCover: boolean;
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

function upload(token: string, data: FormData): Promise<Response> {
  return request("/api/tracks", {
    method: "POST",
    headers: authHeaders(token),
    body: data,
  });
}

test("upload réussi : 201 avec les métadonnées publiques", async () => {
  const { token, user } = await registerUser();

  const response = await upload(token, form(await audio(), "Mon Blues"));
  expect(response.status).toBe(201);

  const track = await json<PublicTrackBody>(response);
  expect(track.title).toBe("Mon Blues");
  expect(track.originalName).toBe("song.mp3");
  expect(track.mimeType).toBe("audio/mpeg");
  expect(track.size).toBe(MP3_SIZE);
  expect(track.ownerId).toBe(user.id);
  expect(track).not.toHaveProperty("storedName");

  // Le fichier existe réellement sur le disque.
  const stored = await Track.findById(track.id).select("+storedName");
  expect(fs.existsSync(audioPath(stored!.storedName))).toBe(true);
});

test("sans titre, le nom du fichier sert de titre", async () => {
  const { token } = await registerUser();

  const track = await json<PublicTrackBody>(
    await upload(token, form(await audio("solo.mp3"))),
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
    form(new File([new Uint8Array(16)], "virus.exe", { type: "application/octet-stream" })),
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
    body: form(await audio()),
  });

  expect(response.status).toBe(401);
});

test("GET /:id/audio renvoie le flux avec le bon Content-Type", async () => {
  const { token } = await registerUser();
  const track = await json<PublicTrackBody>(
    await upload(token, form(await audio("a.mp3"))),
  );

  const response = await request(`/api/tracks/${track.id}/audio`, {
    headers: authHeaders(token),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("audio/mpeg");
  expect((await response.arrayBuffer()).byteLength).toBe(MP3_SIZE);
});

test("l'audio d'un autre utilisateur est introuvable : 404", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const track = await json<PublicTrackBody>(
    await upload(alice.token, form(await audio())),
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
  const track = await json<PublicTrackBody>(await upload(token, form(await audio())));
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
  const track = await json<PublicTrackBody>(await upload(token, form(await audio())));

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
    await upload(alice.token, form(await audio())),
  );

  const response = await request(`/api/tracks/${track.id}`, {
    method: "DELETE",
    headers: authHeaders(bob.token),
  });

  expect(response.status).toBe(404);
  expect(await Track.countDocuments({})).toBe(1);
});

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

test("AAC .m4a de marque isom : accepté en audio/mp4", async () => {
  const { token } = await registerUser();
  const file = await fixtureFile("aac-isom.m4a", "audio/mp4");

  const response = await upload(token, form(file));
  expect(response.status).toBe(201);
  expect((await json<PublicTrackBody>(response)).mimeType).toBe("audio/mp4");
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
