import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { request, authHeaders, registerUser, connectTestDb, resetDb, disconnectTestDb } from "./helpers";

beforeAll(connectTestDb);
afterEach(resetDb);
afterAll(disconnectTestDb);

function send(token: string, method: string, path = "/api/games", body?: unknown) {
  return request(path, { method, headers: { ...authHeaders(token), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
type GameBody = { id: string; ownerId: string; title: string; description?: string; region?: string; releaseYear?: number };
type GamePage = { items: GameBody[]; total: number; page: number; limit: number; pages: number; nextPage: number | null };
const json = <T>(response: Response) => response.json() as Promise<T>;

test("game metadata persists, can be edited, cleared and deleted", async () => {
  const { token, user } = await registerUser();
  const created = await send(token, "POST", undefined, { title: "  Ridge Racer  ", description: "Racing", region: "Europe", releaseYear: 1995 });
  expect(created.status).toBe(201);
  const game = await json<GameBody>(created);
  expect(game).toMatchObject({ title: "Ridge Racer", ownerId: user.id, releaseYear: 1995 });
  const url = `/api/games/${game.id}`;
  expect(await json<GameBody>(await send(token, "GET", url))).toMatchObject(game);
  const edited = await send(token, "PATCH", url, { title: "Ridge Racer edition", description: "", region: "", releaseYear: null });
  expect(edited.status).toBe(200);
  expect(await json<GameBody>(edited)).toMatchObject({ title: "Ridge Racer edition" });
  const reloaded = await json<GameBody>(await send(token, "GET", url));
  expect(reloaded.description).toBeUndefined();
  expect(reloaded.region).toBeUndefined();
  expect(reloaded.releaseYear).toBeUndefined();
  expect((await send(token, "DELETE", url)).status).toBe(204);
  expect((await send(token, "GET", url)).status).toBe(404);
});

test("every operation is private and requires authentication", async () => {
  const alice = await registerUser();
  const bob = await registerUser();
  const game = await json<GameBody>(await send(alice.token, "POST", undefined, { title: "Private" }));
  const url = `/api/games/${game.id}`;
  for (const method of ["GET", "PATCH", "DELETE"]) {
    expect((await send(bob.token, method, url, method === "PATCH" ? { title: "Stolen" } : undefined)).status).toBe(404);
    expect((await request(url, { method })).status).toBe(401);
  }
  expect((await request("/api/games")).status).toBe(401);
  expect((await request("/api/games", { method: "POST" })).status).toBe(401);
  expect((await json<GamePage>(await send(bob.token, "GET"))).total).toBe(0);
  expect((await send(alice.token, "PATCH", url, { ownerId: bob.user.id })).status).toBe(400);
  expect((await json<GameBody>(await send(alice.token, "GET", url))).title).toBe("Private");
});

test("search is literal, case insensitive, paginated and owner scoped", async () => {
  const { token } = await registerUser();
  for (const title of ["Ridge [1]", "Ridge [2]", "Other"]) {
    expect((await send(token, "POST", undefined, { title })).status).toBe(201);
  }
  const page = await json<GamePage>(await send(token, "GET", "/api/games?q=ridge&limit=1"));
  expect(page.total).toBe(2);
  expect(page.items[0]?.title).toBe("Ridge [2]");
  expect(page.nextPage).toBe(2);
  expect((await json<GamePage>(await send(token, "GET", "/api/games?q=%5B1%5D"))).total).toBe(1);
  const empty = await json<GamePage>(await send(token, "GET", "/api/games?page=99"));
  expect(empty.items).toEqual([]);
  expect(empty.total).toBe(3);
  const defaults = await json<GamePage>(await send(token, "GET", "/api/games?page=Infinity&limit=no"));
  expect(defaults.page).toBe(1);
  expect(defaults.limit).toBe(5);
  const bounded = await json<GamePage>(await send(token, "GET", "/api/games?page=-1&limit=999"));
  expect(bounded.page).toBe(1);
  expect(bounded.limit).toBe(20);
});

test("rejects malformed metadata and unknown fields, allows duplicate editions", async () => {
  const { token } = await registerUser();
  for (const body of [null, [], {}, { title: " " }, { title: { $ne: null } }, { title: "x", releaseYear: "1995" },
    { title: "x", releaseYear: 1995.5 }, { title: "x", description: 1 }, { title: "x", visibility: "public" }, { title: "x".repeat(201) }]) {
    expect((await send(token, "POST", undefined, body)).status).toBe(400);
  }
  expect((await request("/api/games", { method: "POST", headers: { ...authHeaders(token), "Content-Type": "application/json" }, body: "{" })).status).toBe(400);
  expect((await send(token, "GET", "/api/games/not-an-id")).status).toBe(404);
  for (let i = 0; i < 2; i++) expect((await send(token, "POST", undefined, { title: "Same title" })).status).toBe(201);
  expect((await json<GamePage>(await send(token, "GET"))).total).toBe(2);
});
