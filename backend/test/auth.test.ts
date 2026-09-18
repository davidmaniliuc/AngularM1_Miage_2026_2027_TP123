import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { request, connectTestDb, resetDb, disconnectTestDb } from "./helpers";

beforeAll(connectTestDb);
afterEach(resetDb);
afterAll(disconnectTestDb);

function post(path: string, body: unknown): Promise<Response> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/*
 * Sans la lib "dom" dans tsconfig, Response.json() est typé Promise<unknown>
 * (types undici) plutôt que Promise<any>. Ce helper de test centralise le
 * cast vers la forme attendue de chaque réponse.
 */
function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

const valid = { name: "Alice", email: "Alice@Example.com", password: "MotDePasse1!" };

test("inscription réussie : 201, jeton et utilisateur public", async () => {
  const response = await post("/api/auth/register", valid);
  expect(response.status).toBe(201);

  const payload = await json<{ token: string; user: { email: string; name: string } }>(response);
  expect(typeof payload.token).toBe("string");
  expect(payload.user.email).toBe("alice@example.com");
  expect(payload.user.name).toBe("Alice");
  expect(payload.user).not.toHaveProperty("passwordHash");
});

test("inscription sans nom : 400", async () => {
  const response = await post("/api/auth/register", { ...valid, name: "" });
  expect(response.status).toBe(400);
  expect((await json<{ message: string }>(response)).message).toBe(
    "Nom, email et mot de passe de 8 caractères requis",
  );
});

test("inscription avec un mot de passe trop court : 400", async () => {
  const response = await post("/api/auth/register", { ...valid, password: "court" });
  expect(response.status).toBe(400);
});

test("inscription sans corps JSON : 400", async () => {
  const response = await request("/api/auth/register", { method: "POST" });
  expect(response.status).toBe(400);
});

test("email déjà utilisé : 409", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/register", valid);

  expect(response.status).toBe(409);
  expect((await json<{ message: string }>(response)).message).toBe("Email déjà utilisé");
});

test("connexion réussie : 200 avec un jeton", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/login", {
    email: "alice@example.com",
    password: "MotDePasse1!",
  });

  expect(response.status).toBe(200);
  expect(typeof (await json<{ token: string }>(response)).token).toBe("string");
});

test("connexion insensible à la casse de l'email", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/login", {
    email: "ALICE@EXAMPLE.COM",
    password: "MotDePasse1!",
  });

  expect(response.status).toBe(200);
});

test("mauvais mot de passe : 401", async () => {
  await post("/api/auth/register", valid);
  const response = await post("/api/auth/login", {
    email: "alice@example.com",
    password: "mauvais-mot-de-passe",
  });

  expect(response.status).toBe(401);
  expect((await json<{ message: string }>(response)).message).toBe("Identifiants incorrects");
});

test("email inconnu : 401 avec le même message", async () => {
  const response = await post("/api/auth/login", {
    email: "personne@example.com",
    password: "MotDePasse1!",
  });

  expect(response.status).toBe(401);
  expect((await json<{ message: string }>(response)).message).toBe("Identifiants incorrects");
});
