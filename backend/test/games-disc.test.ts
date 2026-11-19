import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { request, authHeaders, registerUser, connectTestDb, resetDb, disconnectTestDb } from "./helpers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { syntheticDisc } from "./ps1-fixtures";
import type { PublicGame } from "../src/types";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

const ONE_FILE_CUE = 'FILE "croc.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n';
const base64 = (text: string) => Buffer.from(text, "utf-8").toString("base64");

function upload(token: string, name: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) {
  return request(`/api/games/disc?name=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/octet-stream", ...headers },
    body,
  });
}

test("un .bin envoyé crée une fiche remplie par identifyDisc", async () => {
  const { token } = await registerUser();
  const response = await upload(token, "croc.bin", syntheticDisc());
  expect(response.status).toBe(201);

  const game = (await response.json()) as PublicGame;
  expect(game).toMatchObject({
    title: "Croc - Legend of the Gobbos",
    region: "ntsc-u",
    serial: "SLUS-00530",
    disc: { name: "croc.bin", format: "bin", size: syntheticDisc().byteLength },
  });
  expect(JSON.stringify(game)).not.toContain("StoredName");
});

test("un .cue à un seul fichier est gardé avec le jeu", async () => {
  const { token } = await registerUser();
  const response = await upload(token, "croc.bin", syntheticDisc(), { "X-Cue": base64(ONE_FILE_CUE) });
  expect(response.status).toBe(201);
  expect(((await response.json()) as PublicGame).disc?.cue).toBe(ONE_FILE_CUE);
});

test("un .cue qui pointe vers plusieurs fichiers est refusé avec un message clair", async () => {
  const { token } = await registerUser();
  const cue = 'FILE "a.bin" BINARY\n  TRACK 01 MODE2/2352\nFILE "b.bin" BINARY\n  TRACK 02 AUDIO\n';
  const response = await upload(token, "a.bin", syntheticDisc(), { "X-Cue": base64(cue) });

  expect(response.status).toBe(400);
  const body = (await response.json()) as { message: string; code: string };
  expect(body.code).toBe("MULTI_FILE_CUE");
  expect(body.message).toContain(".chd");
});

test("un faux .chd est refusé", async () => {
  const { token } = await registerUser();
  const response = await upload(token, "jeu.chd", syntheticDisc());
  expect(response.status).toBe(400);
  expect(((await response.json()) as { code: string }).code).toBe("BAD_CHD");
});

test("un format inconnu ou un fichier vide est refusé", async () => {
  const { token } = await registerUser();
  expect((await upload(token, "jeu.iso", syntheticDisc())).status).toBe(400);
  expect((await upload(token, "jeu.bin", new Uint8Array(0))).status).toBe(400);
  expect((await upload(token, "jeu.bin", new Uint8Array(100))).status).toBe(400);
});

test("un Content-Length au-dessus de 1 Go est refusé avant lecture", async () => {
  const { token } = await registerUser();
  const response = await upload(token, "jeu.bin", syntheticDisc(), { "Content-Length": String(2 * 1024 ** 3) });
  expect(response.status).toBe(400);
});

test("le propriétaire télécharge l'image, un autre compte reçoit 404", async () => {
  const owner = await registerUser();
  const other = await registerUser();
  const game = (await (await upload(owner.token, "croc.bin", syntheticDisc())).json()) as PublicGame;

  const mine = await request(`/api/games/${game.id}/disc`, { headers: authHeaders(owner.token) });
  expect(mine.status).toBe(200);
  expect(new Uint8Array(await mine.arrayBuffer())).toEqual(new Uint8Array(syntheticDisc()));

  const theirs = await request(`/api/games/${game.id}/disc`, { headers: authHeaders(other.token) });
  expect(theirs.status).toBe(404);

  const anonymous = await request(`/api/games/${game.id}/disc`);
  expect(anonymous.status).toBe(401);
});

test("un jeu sans image renvoie 404 sur /disc", async () => {
  const { token } = await registerUser();
  const form = new FormData();
  form.append("title", "Sans disque");
  const created = await request("/api/games", { method: "POST", headers: authHeaders(token), body: form });
  const game = (await created.json()) as PublicGame;

  expect(game.disc).toBeUndefined();
  expect((await request(`/api/games/${game.id}/disc`, { headers: authHeaders(token) })).status).toBe(404);
});

test("supprimer le jeu supprime son image", async () => {
  const { token } = await registerUser();
  const game = (await (await upload(token, "croc.bin", syntheticDisc())).json()) as PublicGame;

  expect((await request(`/api/games/${game.id}`, { method: "DELETE", headers: authHeaders(token) })).status).toBe(204);
  expect((await request(`/api/games/${game.id}/disc`, { headers: authHeaders(token) })).status).toBe(404);
});
