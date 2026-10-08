import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import { parseBuffer } from "music-metadata";
import { seedDemo } from "../scripts/seed";
import { User } from "../src/models/User";
import { Track } from "../src/models/Track";
import { UPLOADS_DIR } from "../src/config";
import { authHeaders, connectTestDb, disconnectTestDb, registerUser, request, resetDb } from "./helpers";

beforeAll(connectTestDb);
afterEach(async () => {
  await resetDb();
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
});
afterAll(disconnectTestDb);

test("le seed permet connexion, pagination et lecture de vrais fichiers audio", async () => {
  await seedDemo();
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@example.com", password: "Demo1234!" }),
  });
  expect(login.status).toBe(200);
  const { token } = await login.json() as { token: string };
  const headers = authHeaders(token);
  const mine = await request("/api/tracks?scope=mine&limit=5", { headers });
  const page = await mine.json() as { total: number; hasNextPage: boolean; items: { id: string }[] };
  expect(page.total).toBe(12);
  expect(page.hasNextPage).toBe(true);
  const audio = await request(`/api/tracks/${page.items[0]!.id}/audio`, { headers });
  expect(audio.status).toBe(200);
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const metadata = await parseBuffer(bytes);
  expect(metadata.format.duration).toBe(8);
  const others = await request("/api/tracks?scope=others", { headers });
  expect((await others.json() as { total: number }).total).toBe(6);
  const demo = await User.findOne({ email: "demo@example.com" });
  const privateTrack = await Track.findOne({ ownerId: { $ne: demo!._id }, visibility: "private" });
  expect((await request(`/api/tracks/${privateTrack!.id}/audio`, { headers })).status).toBe(404);
});

test("réexécuter le seed conserve les comptes, les modifications et les fichiers existants", async () => {
  const { user } = await registerUser({ email: "demo@example.com", name: "Mon nom", password: "Autre1234!" });
  await seedDemo();
  const track = await Track.findOne({ ownerId: user.id });
  await Track.updateOne({ _id: track!._id }, { title: "Titre modifié", visibility: "public" });
  const files = fs.readdirSync(UPLOADS_DIR).sort();
  const result = await seedDemo();
  expect(result).toEqual({ usersCreated: 0, tracksCreated: 0 });
  expect(await User.countDocuments()).toBe(3);
  expect(await Track.countDocuments()).toBe(24);
  expect(fs.readdirSync(UPLOADS_DIR).sort()).toEqual(files);
  expect((await Track.findById(track!._id))?.title).toBe("Titre modifié");
  const existing = await User.findById(user.id).select("+passwordHash");
  expect(existing?.name).toBe("Mon nom");
  expect(await existing!.verifyPassword("Autre1234!")).toBe(true);
});
