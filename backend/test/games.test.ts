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
import type { Page, PublicGame } from "../src/types";

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
  expect(await list.json()).toMatchObject({ items: [], total: 0 });
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

async function list(token: string, query = ""): Promise<Page<PublicGame>> {
  const response = await send("GET", `/api/games${query}`, token);
  expect(response.status).toBe(200);
  return (await response.json()) as Page<PublicGame>;
}

const titles = (page: Page<PublicGame>) => page.items.map((game) => game.title);

test("crée et modifie région, année et favori", async () => {
  const { token } = await registerUser();
  const game = await create(token, { title: "A", region: "pal", year: "1998", favorite: "true" });
  expect(game).toMatchObject({ region: "pal", year: 1998, favorite: true });

  const patched = await send("PATCH", `/api/games/${game.id}`, token, form({ favorite: "false", year: "", region: "ntsc-j" }));
  const body = (await patched.json()) as PublicGame;
  expect(body).toMatchObject({ region: "ntsc-j", favorite: false });
  expect(body.year).toBeUndefined();

  expect((await send("POST", "/api/games", token, form({ title: "B", region: "mars" }))).status).toBe(400);
  expect((await send("POST", "/api/games", token, form({ title: "B", year: "1850" }))).status).toBe(400);
  expect((await send("POST", "/api/games", token, form({ title: "B", year: "1998.5" }))).status).toBe(400);
  expect((await send("POST", "/api/games", token, form({ title: "B", favorite: "peut-être" }))).status).toBe(400);
});

test("filtre par région", async () => {
  const { token } = await registerUser();
  await create(token, { title: "US", region: "ntsc-u" });
  await create(token, { title: "EU", region: "pal" });
  await create(token, { title: "Sans" });

  expect(titles(await list(token, "?region=pal"))).toEqual(["EU"]);
  expect((await send("GET", "/api/games?region=mars", token)).status).toBe(400);
});

test("filtre par genre", async () => {
  const { token } = await registerUser();
  await create(token, { title: "Course 1", genre: "course" });
  await create(token, { title: "RPG 1", genre: "rpg" });

  const page = await list(token, "?genre=rpg");
  expect(titles(page)).toEqual(["RPG 1"]);
  expect(page.total).toBe(1);
  expect((await send("GET", "/api/games?genre=nimporte", token)).status).toBe(400);
});

test("filtre par favoris", async () => {
  const { token } = await registerUser();
  await create(token, { title: "Aimé", favorite: "true" });
  await create(token, { title: "Normal" });

  expect(titles(await list(token, "?favorite=true"))).toEqual(["Aimé"]);
  expect((await list(token, "?favorite=false")).total).toBe(2);
});

test("recherche par titre ou série, caractères spéciaux littéraux", async () => {
  const { token } = await registerUser();
  await create(token, { title: "Final Fantasy VII", serial: "SCUS-94163" });
  await create(token, { title: "Crash (Bandicoot)" });

  expect(titles(await list(token, "?q=fantasy"))).toEqual(["Final Fantasy VII"]);
  expect(titles(await list(token, "?q=94163"))).toEqual(["Final Fantasy VII"]);
  expect(titles(await list(token, `?q=${encodeURIComponent("(Bandi")}`))).toEqual(["Crash (Bandicoot)"]);
  expect((await list(token, "?q=.*")).total).toBe(0);
});

test("trie par titre, année et date d'ajout", async () => {
  const { token } = await registerUser();
  await create(token, { title: "banane", year: "1999" });
  await create(token, { title: "Avion", year: "1996" });
  await create(token, { title: "Citron" });

  // Défaut : le plus récent d'abord.
  expect(titles(await list(token))).toEqual(["Citron", "Avion", "banane"]);
  expect(titles(await list(token, "?sort=added&order=asc"))).toEqual(["banane", "Avion", "Citron"]);
  // Titre : insensible à la casse, croissant par défaut.
  expect(titles(await list(token, "?sort=title"))).toEqual(["Avion", "banane", "Citron"]);
  expect(titles(await list(token, "?sort=title&order=desc"))).toEqual(["Citron", "banane", "Avion"]);
  expect(titles(await list(token, "?sort=year&order=asc")).slice(0, 2)).toEqual(["Citron", "Avion"]);
  expect(titles(await list(token, "?sort=year&order=desc")).slice(0, 2)).toEqual(["banane", "Avion"]);
});

test("pagine et combine filtres et pagination", async () => {
  const { token } = await registerUser();
  for (let i = 1; i <= 5; i += 1) await create(token, { title: `Jeu ${i}`, genre: "rpg" });
  await create(token, { title: "Autre", genre: "course" });

  const second = await list(token, "?genre=rpg&sort=title&limit=2&page=2");
  expect(titles(second)).toEqual(["Jeu 3", "Jeu 4"]);
  expect(second).toMatchObject({ page: 2, limit: 2, total: 5, pages: 3, hasNextPage: true, hasPrevPage: true });
});
