import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { request, authHeaders, registerUser, connectTestDb, resetDb, disconnectTestDb } from "./helpers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { MEMCARD_BYTES } from "../src/config";
import type { PublicGame } from "../src/types";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

async function createGame(token: string): Promise<PublicGame> {
  const form = new FormData();
  form.append("title", "Croc");
  const response = await request("/api/games", { method: "POST", headers: authHeaders(token), body: form });
  return (await response.json()) as PublicGame;
}

const put = (token: string, id: string, kind: string, body: Uint8Array<ArrayBuffer>) =>
  request(`/api/games/${id}/saves/${kind}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/octet-stream" },
    body,
  });
const get = (token: string, id: string, kind: string) =>
  request(`/api/games/${id}/saves/${kind}`, { headers: authHeaders(token) });

test("une carte mémoire envoyée est rendue telle quelle, et remplacée par la suivante", async () => {
  const { token } = await registerUser();
  const game = await createGame(token);
  expect((await get(token, game.id, "memcard")).status).toBe(404);

  const first = new Uint8Array(MEMCARD_BYTES).fill(7);
  expect((await put(token, game.id, "memcard", first)).status).toBe(204);
  expect(new Uint8Array(await (await get(token, game.id, "memcard")).arrayBuffer())).toEqual(first);

  const second = new Uint8Array(MEMCARD_BYTES).fill(9);
  await put(token, game.id, "memcard", second);
  expect(new Uint8Array(await (await get(token, game.id, "memcard")).arrayBuffer())).toEqual(second);
});

test("une carte mémoire qui ne fait pas 128 Ko est refusée", async () => {
  const { token } = await registerUser();
  const game = await createGame(token);
  expect((await put(token, game.id, "memcard", new Uint8Array(100))).status).toBe(400);
});

test("une sauvegarde rapide se stocke, se relit et se supprime", async () => {
  const { token } = await registerUser();
  const game = await createGame(token);
  const state = new Uint8Array(5000).fill(3);

  expect((await put(token, game.id, "state", state)).status).toBe(204);
  expect(new Uint8Array(await (await get(token, game.id, "state")).arrayBuffer())).toEqual(state);
  expect((await put(token, game.id, "state", new Uint8Array(0))).status).toBe(400);

  const removed = await request(`/api/games/${game.id}/saves/state`, { method: "DELETE", headers: authHeaders(token) });
  expect(removed.status).toBe(204);
  expect((await get(token, game.id, "state")).status).toBe(404);
});

test("les sauvegardes sont privées : un autre compte reçoit 404 et ne peut rien écraser", async () => {
  const owner = await registerUser();
  const other = await registerUser();
  const game = await createGame(owner.token);
  await put(owner.token, game.id, "state", new Uint8Array(10).fill(1));

  expect((await get(other.token, game.id, "state")).status).toBe(404);
  expect((await put(other.token, game.id, "state", new Uint8Array(10))).status).toBe(404);
  expect((await request(`/api/games/${game.id}/saves/state`)).status).toBe(401);
});

test("supprimer le jeu supprime ses sauvegardes", async () => {
  const { token } = await registerUser();
  const game = await createGame(token);
  await put(token, game.id, "state", new Uint8Array(10).fill(1));

  await request(`/api/games/${game.id}`, { method: "DELETE", headers: authHeaders(token) });
  expect((await get(token, game.id, "state")).status).toBe(404);
});

test("le test de compatibilité d'un jeu se change et refuse une valeur inconnue", async () => {
  const { token } = await registerUser();
  const game = await createGame(token);
  expect(game.compat).toBe("untested");

  const patch = (value: string) => {
    const form = new FormData();
    form.append("compat", value);
    return request(`/api/games/${game.id}`, { method: "PATCH", headers: authHeaders(token), body: form });
  };
  const response = await patch("tested");
  expect(((await response.json()) as PublicGame).compat).toBe("tested");
  expect((await patch("parfait")).status).toBe(400);
});
