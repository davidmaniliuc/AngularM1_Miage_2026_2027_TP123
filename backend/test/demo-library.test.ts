import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { registerUser, connectTestDb, resetDb, disconnectTestDb, request, authHeaders } from "./helpers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { DEMO_GAMES, seedDemoLibrary } from "../src/lib/demo-library";
import type { Page, PublicGame } from "../src/types";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

test("la bibliothèque de démonstration compte 8 à 10 jeux avec pochette", async () => {
  const { token, user } = await registerUser();
  expect(DEMO_GAMES.length).toBeGreaterThanOrEqual(8);
  expect(DEMO_GAMES.length).toBeLessThanOrEqual(10);

  expect(await seedDemoLibrary(user.id)).toBe(DEMO_GAMES.length);

  const response = await request("/api/games?limit=60", { headers: authHeaders(token) });
  const page = (await response.json()) as Page<PublicGame>;
  expect(page.total).toBe(DEMO_GAMES.length);
  expect(page.items.every((game) => game.hasCover)).toBe(true);
  expect(page.items[0]?.title).toBe(DEMO_GAMES[0]!.title);

  const cover = await request(`/api/games/${page.items[0]!.id}/cover`, { headers: authHeaders(token) });
  expect(cover.headers.get("Content-Type")).toBe("image/png");
});

test("relancer l'ajout ne crée pas de doublon", async () => {
  const { user } = await registerUser();
  await seedDemoLibrary(user.id);
  expect(await seedDemoLibrary(user.id)).toBe(0);
});
