import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import {
  request,
  authHeaders,
  registerUser,
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
function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

test("GET /api/users/me renvoie le profil du porteur du jeton", async () => {
  const { token, user } = await registerUser({ name: "Alice" });

  const response = await request("/api/users/me", { headers: authHeaders(token) });

  expect(response.status).toBe(200);
  const profile = await json<{ id: string; name: string }>(response);
  expect(profile.id).toBe(user.id);
  expect(profile.name).toBe("Alice");
  expect(profile).not.toHaveProperty("passwordHash");
});

test("GET /api/users/me sans jeton : 401", async () => {
  const response = await request("/api/users/me");
  expect(response.status).toBe(401);
});

test("un jeton illisible donne 401", async () => {
  const response = await request("/api/users/me", {
    headers: authHeaders("pas-un-jeton"),
  });

  expect(response.status).toBe(401);
  expect((await json<{ message: string }>(response)).message).toBe(
    "Jeton invalide ou expiré",
  );
});

test("PUT /api/users/me modifie le nom", async () => {
  const { token } = await registerUser({ name: "Alice" });

  const response = await request("/api/users/me", {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alice Dupont" }),
  });

  expect(response.status).toBe(200);
  expect((await json<{ name: string }>(response)).name).toBe("Alice Dupont");
});

test("PUT /api/users/me avec un nom trop court : 400", async () => {
  const { token } = await registerUser();

  const response = await request("/api/users/me", {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "A" }),
  });

  expect(response.status).toBe(400);
});

test("PUT /api/users/me ne permet pas de changer l'email", async () => {
  const { token, user } = await registerUser();

  const response = await request("/api/users/me", {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Bob", email: "pirate@example.com" }),
  });

  expect(response.status).toBe(200);
  expect((await json<{ email: string }>(response)).email).toBe(user.email);
});
