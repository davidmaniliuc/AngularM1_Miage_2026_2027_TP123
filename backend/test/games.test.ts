import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import {
  request,
  authHeaders,
  registerUser,
  connectTestDb,
  resetDb,
  disconnectTestDb,
} from "./helpers";
import { ensureUploadsDir } from "../src/lib/uploads";
import type { PublicGame } from "../src/types";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

// Un PNG minimal valide pour la signature (détectée par ses octets).
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const png = () => new File([PNG], "cover.png", { type: "image/png" });

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function send(method: string, path: string, token: string, body?: FormData) {
  return request(path, { method, headers: authHeaders(token), body });
}

async function create(token: string, fields: Record<string, string | File>): Promise<PublicGame> {
  const response = await send("POST", "/api/games", token, form(fields));
  expect(response.status).toBe(201);
  return (await response.json()) as PublicGame;
}

test("crée un jeu avec série, genre et pochette", async () => {
  const { token } = await registerUser();
  const game = await create(token, {
    title: "Final Fantasy VII",
    serial: "scus-94163",
    genre: "rpg",
    cover: png(),
  });

  expect(game).toMatchObject({
    title: "Final Fantasy VII",
    serial: "SCUS-94163",
    genre: "rpg",
    hasCover: true,
  });
  expect(JSON.stringify(game)).not.toContain("coverStoredName");
});

test("série, genre et pochette sont facultatifs", async () => {
  const { token } = await registerUser();
  const game = await create(token, { title: "Crash Bandicoot" });
  expect(game.hasCover).toBe(false);
  expect(game.serial).toBeUndefined();
  expect(game.genre).toBeUndefined();
});

test("refuse un titre vide, une série invalide, un genre inconnu", async () => {
  const { token } = await registerUser();
  const invalid: Record<string, string>[] = [
    { title: "  " },
    { serial: "SCUS-94163" },
    { title: "X", serial: "12345" },
    { title: "X", genre: "inconnu" },
  ];
  for (const fields of invalid) {
    const response = await send("POST", "/api/games", token, form(fields));
    expect(response.status).toBe(400);
  }
});

test("refuse une pochette qui n'est pas une image", async () => {
  const { token } = await registerUser();
  const fake = new File(["<svg></svg>"], "cover.png", { type: "image/png" });
  const response = await send("POST", "/api/games", token, form({ title: "X", cover: fake }));
  expect(response.status).toBe(400);
});

test("sert la pochette, 404 sans pochette", async () => {
  const { token } = await registerUser();
  const withCover = await create(token, { title: "A", cover: png() });
  const without = await create(token, { title: "B" });

  const ok = await request(`/api/games/${withCover.id}/cover`, { headers: authHeaders(token) });
  expect(ok.status).toBe(200);
  expect(ok.headers.get("content-type")).toBe("image/png");
  expect(ok.headers.get("x-content-type-options")).toBe("nosniff");

  const missing = await request(`/api/games/${without.id}/cover`, { headers: authHeaders(token) });
  expect(missing.status).toBe(404);
});

test("modifie les champs, efface la série et retire la pochette", async () => {
  const { token } = await registerUser();
  const game = await create(token, { title: "A", serial: "SCUS-94163", genre: "rpg", cover: png() });

  const renamed = await send("PATCH", `/api/games/${game.id}`, token, form({ title: "B", genre: "course" }));
  expect(await renamed.json()).toMatchObject({ title: "B", genre: "course", serial: "SCUS-94163", hasCover: true });

  const cleared = await send("PATCH", `/api/games/${game.id}`, token, form({ serial: "", removeCover: "true" }));
  const body = (await cleared.json()) as PublicGame;
  expect(body.serial).toBeUndefined();
  expect(body.hasCover).toBe(false);
});

test("un utilisateur ne voit ni ne modifie les jeux d'un autre", async () => {
  const alice = await registerUser();
  const bob = await registerUser({ name: "Bob" });
  const game = await create(alice.token, { title: "Privé", cover: png() });

  const list = await send("GET", "/api/games", bob.token);
  expect(await list.json()).toEqual([]);
  expect((await send("GET", `/api/games/${game.id}`, bob.token)).status).toBe(404);
  expect((await send("PATCH", `/api/games/${game.id}`, bob.token, form({ title: "X" }))).status).toBe(404);
  expect((await send("GET", `/api/games/${game.id}/cover`, bob.token)).status).toBe(404);
  expect((await send("DELETE", `/api/games/${game.id}`, bob.token)).status).toBe(404);
});

test("supprime un jeu ; sans jeton : 401 ; identifiant invalide : 404", async () => {
  const { token } = await registerUser();
  const game = await create(token, { title: "A" });

  expect((await send("DELETE", `/api/games/${game.id}`, token)).status).toBe(204);
  expect((await send("GET", `/api/games/${game.id}`, token)).status).toBe(404);
  expect((await request("/api/games")).status).toBe(401);
  expect((await send("GET", "/api/games/pas-un-id", token)).status).toBe(404);
});
