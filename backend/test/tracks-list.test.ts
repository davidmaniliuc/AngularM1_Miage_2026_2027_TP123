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

/*
 * Sans la lib "dom" dans tsconfig, Response.json() est typé Promise<unknown>
 * (types undici) plutôt que Promise<any>. Ce helper de test centralise le
 * cast vers la forme attendue de chaque réponse.
 */
type PageBody = {
  items: Array<Record<string, unknown>>;
  page: number;
  limit: number;
  total: number;
  pages: number;
};

function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

test("liste paginée par défaut : 5 éléments par page", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 7);

  const response = await request("/api/tracks", { headers: authHeaders(token) });
  expect(response.status).toBe(200);

  const page = await json<PageBody>(response);
  expect(page.items).toHaveLength(5);
  expect(page.page).toBe(1);
  expect(page.limit).toBe(5);
  expect(page.total).toBe(7);
  expect(page.pages).toBe(2);
});

test("les pistes sont triées de la plus récente à la plus ancienne", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 3);

  const page = await json<PageBody>(
    await request("/api/tracks", { headers: authHeaders(token) }),
  );

  expect(page.items.map((t) => t.title)).toEqual(["Piste 3", "Piste 2", "Piste 1"]);
});

test("storedName n'est jamais exposé", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 1);

  const page = await json<PageBody>(
    await request("/api/tracks", { headers: authHeaders(token) }),
  );

  expect(page.items[0]).not.toHaveProperty("storedName");
  expect(page.items[0]).not.toHaveProperty("_id");
  expect(page.items[0]?.id).toBeString();
});

test("limit est borné à 20 et page à 1 minimum", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 2);

  const page = await json<PageBody>(
    await request("/api/tracks?page=0&limit=999", { headers: authHeaders(token) }),
  );

  expect(page.page).toBe(1);
  expect(page.limit).toBe(20);
});

test("des paramètres non numériques retombent sur les valeurs par défaut", async () => {
  const { token, user } = await registerUser();
  await seedTracks(user.id, 1);

  const page = await json<PageBody>(
    await request("/api/tracks?page=abc&limit=xyz", { headers: authHeaders(token) }),
  );

  expect(page.page).toBe(1);
  expect(page.limit).toBe(5);
});

test("un utilisateur ne voit jamais les pistes d'un autre", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  await seedTracks(alice.user.id, 3);

  const page = await json<PageBody>(
    await request("/api/tracks", { headers: authHeaders(bob.token) }),
  );

  expect(page.items).toHaveLength(0);
  expect(page.total).toBe(0);
  expect(page.pages).toBe(1);
});

test("sans jeton : 401", async () => {
  expect((await request("/api/tracks")).status).toBe(401);
});
