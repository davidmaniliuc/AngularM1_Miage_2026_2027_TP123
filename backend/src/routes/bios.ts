import crypto from "node:crypto";
import path from "node:path";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import { Bios } from "../models/Bios";
import { BIOS_DIR } from "../config";
import { discardFiles } from "../lib/uploads";
import { BIOS_BYTES, Ps1Error, inspectBios, ps1Message } from "../lib/ps1";
import type { AppEnv } from "../types";

export const biosRoutes = new Hono<AppEnv>();

// Un BIOS n'est jamais public : toutes les routes exigent un jeton.
biosRoutes.use("*", requireAuth);

const notFound = () => new HTTPException(404, { message: "BIOS inconnu" });
const biosPath = (storedName: string) => path.join(BIOS_DIR, storedName);

/** Mes BIOS, le BIOS par défaut en premier puis du plus récent au plus ancien. */
biosRoutes.get("/", async (c) => {
  const { sub } = c.get("auth");
  const list = await Bios.find({ ownerId: sub }).sort({ isDefault: -1, createdAt: -1 });
  console.log(`[bios] ${list.length} BIOS envoyé(s) à ${sub}`);
  return c.json(list.map((bios) => bios.toPublic()));
});

/**
 * Reçoit un BIOS dans le champ multipart "bios". Le cœur PS1 le vérifie
 * (loadBios) : une taille autre que 512 Ko est refusée ; un BIOS de bonne
 * taille mais absent de sa table est gardé avec known=false. Le premier BIOS
 * envoyé devient celui par défaut.
 */
biosRoutes.post("/", async (c) => {
  const { sub } = c.get("auth");

  // Marge pour l'enveloppe multipart autour des 512 Ko du fichier.
  const declaredSize = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declaredSize) && declaredSize > BIOS_BYTES + 64 * 1024) {
    console.warn(`[bios] Envoi refusé avant lecture : ${declaredSize} octets`);
    return c.json({ message: ps1Message(new Ps1Error("BAD_BIOS_SIZE")), code: "BAD_BIOS_SIZE" }, 400);
  }

  const body = await c.req.parseBody();
  const file = body["bios"];
  if (!(file instanceof File)) throw new HTTPException(400, { message: "Fichier BIOS requis" });

  const bytes = new Uint8Array(await file.arrayBuffer());
  let info;
  try {
    info = await inspectBios(bytes);
  } catch (error) {
    if (!(error instanceof Ps1Error)) throw error;
    console.warn(`[bios] BIOS refusé : ${error.code}`);
    return c.json({ message: ps1Message(error), code: error.code }, 400);
  }

  const storedName = `${crypto.randomUUID()}.bin`;
  await Bun.write(biosPath(storedName), bytes);

  try {
    const isDefault = !(await Bios.exists({ ownerId: sub, isDefault: true }));
    const bios = await Bios.create({
      ownerId: new mongoose.Types.ObjectId(sub),
      storedName,
      originalName: file.name || "bios.bin",
      size: bytes.byteLength,
      known: info.known,
      region: info.region ?? undefined,
      version: info.version ?? undefined,
      description: info.description ?? undefined,
      isDefault,
    });
    console.log(`[bios] BIOS enregistré : ${bios.id} (${info.known ? `${info.region} v${info.version}` : "non reconnu"})`);
    return c.json(bios.toPublic(), 201);
  } catch (error) {
    await discardFiles([biosPath(storedName)]);
    throw error;
  }
});

/** Envoie le fichier d'un de mes BIOS. */
biosRoutes.get("/:id/file", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const bios = await Bios.findOne({ _id: id, ownerId: sub }).select("+storedName");
  if (!bios) throw notFound();

  const file = Bun.file(biosPath(bios.storedName));
  if (!(await file.exists())) {
    console.error(`[bios] Fichier absent du disque pour le BIOS ${bios.id}`);
    throw notFound();
  }

  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", String(file.size));
  c.header("Cache-Control", "private, no-store");
  return c.body(file.stream());
});

/** Choisit le BIOS par défaut. Corps : { "isDefault": true }. */
biosRoutes.patch("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const body: unknown = await c.req.json().catch(() => null);
  if ((body as { isDefault?: unknown } | null)?.isDefault !== true) {
    throw new HTTPException(400, { message: "isDefault doit valoir true" });
  }

  const bios = await Bios.findOne({ _id: id, ownerId: sub });
  if (!bios) throw notFound();

  await Bios.updateMany({ ownerId: sub, _id: { $ne: bios._id } }, { isDefault: false });
  bios.isDefault = true;
  await bios.save();
  console.log(`[bios] BIOS par défaut : ${id}`);
  return c.json(bios.toPublic());
});

/** Supprime un de mes BIOS. S'il était par défaut, le plus récent restant le remplace. */
biosRoutes.delete("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const bios = await Bios.findOneAndDelete({ _id: id, ownerId: sub }).select("+storedName");
  if (!bios) throw notFound();

  await discardFiles([biosPath(bios.storedName)]);
  if (bios.isDefault) {
    await Bios.findOneAndUpdate({ ownerId: sub }, { isDefault: true }, { sort: { createdAt: -1 } });
  }
  console.log(`[bios] BIOS supprimé : ${id}`);
  return c.body(null, 204);
});
