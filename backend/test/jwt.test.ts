import { test, expect } from "bun:test";
import { sign } from "hono/jwt";
import { createToken, verifyToken } from "../src/lib/jwt";
import { JWT_SECRET, JWT_ALG } from "../src/config";

test("un jeton créé par l'API est relu correctement", async () => {
  const token = await createToken({ id: "507f1f77bcf86cd799439011", email: "a@b.c" });
  const payload = await verifyToken(token);

  expect(payload?.sub).toBe("507f1f77bcf86cd799439011");
  expect(payload?.email).toBe("a@b.c");
  expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
});

test("un jeton expiré est refusé", async () => {
  const expired = await sign(
    { sub: "abc", email: "a@b.c", exp: Math.floor(Date.now() / 1000) - 10 },
    JWT_SECRET,
    JWT_ALG,
  );

  expect(await verifyToken(expired)).toBeNull();
});

test("un jeton signé avec un autre secret est refusé", async () => {
  const forged = await sign(
    { sub: "abc", email: "a@b.c", exp: Math.floor(Date.now() / 1000) + 60 },
    "un-autre-secret",
    JWT_ALG,
  );

  expect(await verifyToken(forged)).toBeNull();
});

test("une chaîne qui n'est pas un JWT est refusée", async () => {
  expect(await verifyToken("pas-un-jeton")).toBeNull();
});
