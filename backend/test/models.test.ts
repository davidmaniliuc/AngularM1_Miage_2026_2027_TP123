import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import mongoose from "mongoose";
import { connectTestDb, resetDb, disconnectTestDb } from "./helpers";
import { User } from "../src/models/User";
import { Track } from "../src/models/Track";

beforeAll(connectTestDb);
afterEach(resetDb);
afterAll(disconnectTestDb);

test("l'email est normalisé en minuscules", async () => {
  const user = await User.register({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  expect(user.email).toBe("test@example.com");
});

test("le mot de passe est haché, jamais stocké en clair", async () => {
  const user = await User.register({
    name: "Test",
    email: "hash@example.com",
    password: "12345678",
  });

  expect(user.passwordHash).not.toBe("12345678");
  expect(await user.verifyPassword("12345678")).toBe(true);
  expect(await user.verifyPassword("mauvais")).toBe(false);
});

test("toPublic n'expose ni le hash ni les champs techniques", async () => {
  const user = await User.register({
    name: "Test",
    email: "public@example.com",
    password: "12345678",
  });

  const publicUser = user.toPublic();
  expect(Object.keys(publicUser).sort()).toEqual([
    "createdAt",
    "email",
    "id",
    "name",
  ]);
});

test("une piste référence son propriétaire et cache storedName", () => {
  const track = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });

  expect(track.title).toBe("Blues");
  expect(Track.schema.path("ownerId").options.ref).toBe("User");
  expect(track.toPublic()).not.toHaveProperty("storedName");
});
