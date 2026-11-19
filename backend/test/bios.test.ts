import { test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { request, authHeaders, registerUser, connectTestDb, resetDb, disconnectTestDb } from "./helpers";
import { ensureUploadsDir } from "../src/lib/uploads";
import { BIOS_BYTES } from "../src/lib/ps1";
import { realBiosPath } from "./ps1-fixtures";
import type { PublicBios } from "../src/types";

beforeAll(async () => {
  ensureUploadsDir();
  await connectTestDb();
});
afterEach(resetDb);
afterAll(disconnectTestDb);

function upload(token: string, bytes: Uint8Array, name = "bios.bin") {
  const form = new FormData();
  form.append("bios", new File([bytes], name));
  return request("/api/bios", { method: "POST", headers: authHeaders(token), body: form });
}

const list = async (token: string) =>
  (await (await request("/api/bios", { headers: authHeaders(token) })).json()) as PublicBios[];

test("un fichier qui n'est pas un BIOS est refusé avec BAD_BIOS_SIZE", async () => {
  const { token } = await registerUser();
  const response = await upload(token, new Uint8Array(1000), "notes.txt");

  expect(response.status).toBe(400);
  expect(((await response.json()) as { code: string }).code).toBe("BAD_BIOS_SIZE");
  expect(await list(token)).toEqual([]);
});

test("un BIOS de bonne taille mais inconnu est gardé, et devient celui par défaut", async () => {
  const { token } = await registerUser();
  const response = await upload(token, new Uint8Array(BIOS_BYTES), "maison.bin");

  expect(response.status).toBe(201);
  const bios = (await response.json()) as PublicBios;
  expect(bios).toMatchObject({ originalName: "maison.bin", size: BIOS_BYTES, known: false, isDefault: true });
  expect(JSON.stringify(bios)).not.toContain("storedName");
});

test.skipIf(!realBiosPath)("un BIOS reconnu affiche sa région et sa version (PS1_BIOS)", async () => {
  const { token } = await registerUser();
  const response = await upload(token, await Bun.file(realBiosPath as string).bytes());

  expect(response.status).toBe(201);
  const bios = (await response.json()) as PublicBios;
  expect(bios.known).toBe(true);
  expect(bios.region).toBeTruthy();
  expect(bios.version).toBeTruthy();
});

test("un autre compte ne peut ni lister ni télécharger le BIOS", async () => {
  const owner = await registerUser();
  const other = await registerUser();
  const bios = (await (await upload(owner.token, new Uint8Array(BIOS_BYTES))).json()) as PublicBios;

  expect(await list(other.token)).toEqual([]);
  const theirs = await request(`/api/bios/${bios.id}/file`, { headers: authHeaders(other.token) });
  expect(theirs.status).toBe(404);

  const mine = await request(`/api/bios/${bios.id}/file`, { headers: authHeaders(owner.token) });
  expect(mine.status).toBe(200);
  expect((await mine.arrayBuffer()).byteLength).toBe(BIOS_BYTES);

  expect((await request("/api/bios")).status).toBe(401);
});

test("choisir un BIOS par défaut retire ce statut à l'ancien", async () => {
  const { token } = await registerUser();
  const first = (await (await upload(token, new Uint8Array(BIOS_BYTES), "a.bin")).json()) as PublicBios;
  const second = (await (await upload(token, new Uint8Array(BIOS_BYTES), "b.bin")).json()) as PublicBios;
  expect(second.isDefault).toBe(false);

  const response = await request(`/api/bios/${second.id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ isDefault: true }),
  });
  expect(response.status).toBe(200);

  const all = await list(token);
  expect(all.map((bios) => [bios.id, bios.isDefault])).toEqual([
    [second.id, true],
    [first.id, false],
  ]);
});

test("supprimer le BIOS par défaut en désigne un autre", async () => {
  const { token } = await registerUser();
  const first = (await (await upload(token, new Uint8Array(BIOS_BYTES), "a.bin")).json()) as PublicBios;
  const second = (await (await upload(token, new Uint8Array(BIOS_BYTES), "b.bin")).json()) as PublicBios;

  const response = await request(`/api/bios/${first.id}`, { method: "DELETE", headers: authHeaders(token) });
  expect(response.status).toBe(204);
  expect(await list(token)).toMatchObject([{ id: second.id, isDefault: true }]);
});

test("un autre compte ne peut ni modifier ni supprimer le BIOS", async () => {
  const owner = await registerUser();
  const other = await registerUser();
  const bios = (await (await upload(owner.token, new Uint8Array(BIOS_BYTES))).json()) as PublicBios;

  const patch = await request(`/api/bios/${bios.id}`, {
    method: "PATCH",
    headers: { ...authHeaders(other.token), "Content-Type": "application/json" },
    body: JSON.stringify({ isDefault: true }),
  });
  expect(patch.status).toBe(404);
  expect((await request(`/api/bios/${bios.id}`, { method: "DELETE", headers: authHeaders(other.token) })).status).toBe(404);
});
