import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import crypto from "node:crypto";
import path from "node:path";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import {
  Game,
  MAX_YEAR,
  MIN_YEAR,
  SERIAL_PATTERN,
  isGenre,
  isRegion,
  type GameDoc,
} from "../models/Game";
import { coverPath, removeCover, saveCover } from "../lib/covers";
import { TooLargeError, discardFiles, writeStream } from "../lib/uploads";
import { Ps1Error, checkCue, identifyDiscFile, ps1Message } from "../lib/ps1";
import { GAMES_DIR, MAX_GAME_SIZE } from "../config";
import type { AppEnv, Page } from "../types";

export const gamesRoutes = new Hono<AppEnv>();

gamesRoutes.use("*", requireAuth);

const notFound = () => new HTTPException(404, { message: "Jeu inconnu" });

type Body = Record<string, string | File | (string | File)[]>;

/** Valeur texte d'un champ de formulaire, ou undefined s'il est absent. */
function text(body: Body, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * Valide les champs texte du formulaire. Un champ absent reste inchangé ;
 * serial et genre vides sont effacés. `partial` autorise l'absence de titre
 * (PATCH) ; sinon le titre est obligatoire (POST).
 */
function parseFields(body: Body, partial: boolean) {
  const fields: Partial<Pick<GameDoc, "title" | "serial" | "genre" | "region" | "year" | "favorite">> & {
    unset: ("serial" | "genre" | "region" | "year")[];
  } = { unset: [] };

  const title = text(body, "title");
  if (title !== undefined) {
    if (!title) throw new HTTPException(400, { message: "Le titre est obligatoire" });
    fields.title = title;
  } else if (!partial) {
    throw new HTTPException(400, { message: "Le titre est obligatoire" });
  }

  const serial = text(body, "serial")?.toUpperCase();
  if (serial === "") {
    fields.unset.push("serial");
  } else if (serial !== undefined) {
    if (!SERIAL_PATTERN.test(serial)) {
      throw new HTTPException(400, { message: "Numéro de série invalide (ex. SCUS-94163)" });
    }
    fields.serial = serial;
  }

  const genre = text(body, "genre");
  if (genre === "") {
    fields.unset.push("genre");
  } else if (genre !== undefined) {
    if (!isGenre(genre)) throw new HTTPException(400, { message: "Genre inconnu" });
    fields.genre = genre;
  }

  const region = text(body, "region");
  if (region === "") {
    fields.unset.push("region");
  } else if (region !== undefined) {
    if (!isRegion(region)) throw new HTTPException(400, { message: "Région inconnue" });
    fields.region = region;
  }

  const year = text(body, "year");
  if (year === "") {
    fields.unset.push("year");
  } else if (year !== undefined) {
    const value = Number(year);
    if (!Number.isInteger(value) || value < MIN_YEAR || value > MAX_YEAR) {
      throw new HTTPException(400, { message: `Année invalide (${MIN_YEAR} à ${MAX_YEAR})` });
    }
    fields.year = value;
  }

  const favorite = text(body, "favorite");
  if (favorite !== undefined) {
    if (favorite !== "true" && favorite !== "false") {
      throw new HTTPException(400, { message: "favorite doit valoir true ou false" });
    }
    fields.favorite = favorite === "true";
  }

  return fields;
}

/** Enregistre le fichier "cover" du formulaire ; une image refusée est une erreur 400. */
async function readCover(body: Body) {
  const file = body["cover"];
  if (!(file instanceof File) || file.size === 0) return null;

  const saved = await saveCover(new Uint8Array(await file.arrayBuffer()));
  if (!saved) {
    throw new HTTPException(400, { message: "Pochette invalide (JPEG, PNG ou WebP, 5 Mo maximum)" });
  }
  return saved;
}

/** Supprime une pochette ; l'échec est journalisé sans changer la réponse. */
async function discardCover(storedName: string | undefined): Promise<void> {
  if (!storedName) return;
  try {
    await removeCover(storedName);
  } catch (error) {
    console.error(`[games] Pochette non supprimée : ${storedName}`, error);
  }
}

/** Champs de tri acceptés par GET /games, associés au champ MongoDB. */
const SORT_FIELDS = { title: "title", year: "year", added: "createdAt" } as const;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Liste mes jeux, paginés. Filtres : q (titre ou série), region, genre,
 * favorite=true. Tri : sort=title|year|added, order=asc|desc (défaut : added,
 * du plus récent au plus ancien). Une valeur de filtre inconnue est une 400 ;
 * page, limit, sort et order inconnus retombent sur leur défaut.
 */
gamesRoutes.get("/", async (c) => {
  const { sub } = c.get("auth");
  const page = Math.max(1, Math.floor(Number(c.req.query("page"))) || 1);
  const limit = Math.min(60, Math.max(1, Math.floor(Number(c.req.query("limit"))) || 24));

  const filter: mongoose.QueryFilter<GameDoc> = { ownerId: sub };

  const q = c.req.query("q")?.trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: pattern }, { serial: pattern }];
  }

  const region = c.req.query("region");
  if (region) {
    if (!isRegion(region)) throw new HTTPException(400, { message: "Région inconnue" });
    filter.region = region;
  }

  const genre = c.req.query("genre");
  if (genre) {
    if (!isGenre(genre)) throw new HTTPException(400, { message: "Genre inconnu" });
    filter.genre = genre;
  }

  if (c.req.query("favorite") === "true") filter.favorite = true;

  const sortKey = c.req.query("sort") as keyof typeof SORT_FIELDS;
  const sortField = SORT_FIELDS[sortKey] ?? "createdAt";
  const direction = c.req.query("order") === "asc" ? 1 : c.req.query("order") === "desc" ? -1 : sortField === "title" ? 1 : -1;

  const total = await Game.countDocuments(filter);
  const games = await Game.find(filter)
    .select("+coverStoredName")
    .collation({ locale: "fr", strength: 2 })
    .sort({ [sortField]: direction, _id: direction })
    .skip((page - 1) * limit)
    .limit(limit);

  const pages = Math.max(1, Math.ceil(total / limit));
  const body: Page<ReturnType<(typeof games)[number]["toPublic"]>> = {
    items: games.map((game) => game.toPublic()),
    page,
    limit,
    total,
    pages,
    pagingCounter: (page - 1) * limit + 1,
    hasPrevPage: page > 1,
    hasNextPage: page < pages,
    prevPage: page > 1 ? page - 1 : null,
    nextPage: page < pages ? page + 1 : null,
  };
  console.log(`[games] ${body.items.length} jeu(x) envoyé(s) sur ${total} à ${sub}`);
  return c.json(body);
});

/** Crée un jeu. Multipart : title, serial, genre, cover (tous facultatifs sauf title). */
gamesRoutes.post("/", async (c) => {
  const { sub } = c.get("auth");
  const body = (await c.req.parseBody()) as Body;
  const fields = parseFields(body, false);
  const cover = await readCover(body);

  try {
    const game = await Game.create({
      ownerId: new mongoose.Types.ObjectId(sub),
      title: fields.title,
      serial: fields.serial,
      genre: fields.genre,
      region: fields.region,
      year: fields.year,
      favorite: fields.favorite ?? false,
      coverStoredName: cover?.storedName,
      coverMimeType: cover?.mimeType,
    });
    console.log(`[games] Jeu créé : ${game.id}`);
    return c.json(game.toPublic(), 201);
  } catch (error) {
    await discardCover(cover?.storedName);
    throw error;
  }
});

/** Chemin absolu de l'image disque d'un jeu. */
const discPath = (storedName: string) => path.join(GAMES_DIR, storedName);

// Un .cue tient en quelques centaines d'octets ; au-delà, ce n'en est pas un.
const MAX_CUE_LENGTH = 64 * 1024;

/** Lit le .cue envoyé dans l'en-tête X-Cue (texte UTF-8 encodé en base64). */
function readCue(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    const cue = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(header, "base64"));
    if (cue.length > 0 && cue.length <= MAX_CUE_LENGTH) return cue;
  } catch (error) {
    console.warn("[games] En-tête X-Cue illisible", error);
  }
  throw new HTTPException(400, { message: "Fichier .cue illisible" });
}

/** Les huit premiers octets d'un CHD : "MComprHD". */
async function isChd(filePath: string): Promise<boolean> {
  const head = await Bun.file(filePath).slice(0, 8).text();
  return head === "MComprHD";
}

/**
 * Crée un jeu à partir de son image disque. Le corps de la requête est le
 * fichier lui-même (pas de multipart) : il est écrit sur le disque au fil de
 * l'eau, sans être chargé en mémoire. ?name= donne le nom du fichier (.chd
 * ou .bin) ; l'en-tête X-Cue porte le .cue éventuel d'un .bin, en base64.
 * Le titre, la région et le numéro de série viennent de identifyDisc.
 */
gamesRoutes.post("/disc", async (c) => {
  const { sub } = c.get("auth");
  const name = path.basename(c.req.query("name")?.trim() ?? "");
  const extension = path.extname(name).toLowerCase();
  if (extension !== ".chd" && extension !== ".bin") {
    throw new HTTPException(400, { message: "Envoyez un .chd, un .bin seul ou un .cue avec son .bin" });
  }
  const format = extension === ".chd" ? "chd" : "bin";

  const cue = format === "bin" ? readCue(c.req.header("X-Cue")) : undefined;
  if (cue) {
    try {
      checkCue(cue);
    } catch (error) {
      if (!(error instanceof Ps1Error)) throw error;
      console.warn(`[games] .cue refusé : ${error.code}`);
      return c.json({ message: ps1Message(error), code: error.code }, 400);
    }
  }

  const declaredSize = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_GAME_SIZE) {
    console.warn(`[games] Image refusée avant lecture : ${declaredSize} octets`);
    throw new HTTPException(400, { message: "Fichier trop volumineux (1 Go maximum)" });
  }

  const body = c.req.raw.body;
  if (!body) throw new HTTPException(400, { message: "Fichier du jeu requis" });

  const storedName = crypto.randomUUID() + extension;
  const filePath = discPath(storedName);
  let size: number;
  try {
    size = await writeStream(body, filePath, MAX_GAME_SIZE);
  } catch (error) {
    if (error instanceof TooLargeError) {
      console.warn("[games] Image trop volumineuse, envoi interrompu");
      throw new HTTPException(400, { message: "Fichier trop volumineux (1 Go maximum)" });
    }
    throw error;
  }
  console.log(`[games] Image écrite : ${storedName} (${size} octets)`);

  let identity;
  try {
    if (size === 0) throw new HTTPException(400, { message: "Fichier du jeu requis" });
    if (format === "chd" && !(await isChd(filePath))) throw new Ps1Error("BAD_CHD");
    identity = await identifyDiscFile(filePath);
  } catch (error) {
    await discardFiles([filePath]);
    if (!(error instanceof Ps1Error)) throw error;
    console.warn(`[games] Image refusée par identifyDisc : ${error.code}`);
    return c.json({ message: ps1Message(error), code: error.code }, 400);
  }

  try {
    const game = await Game.create({
      ownerId: new mongoose.Types.ObjectId(sub),
      title: identity.title ?? path.basename(name, path.extname(name)),
      region: identity.region,
      // Un disque non PS1 peut annoncer un numéro d'un autre format : on l'ignore.
      serial: identity.serial && SERIAL_PATTERN.test(identity.serial) ? identity.serial : undefined,
      discStoredName: storedName,
      discName: name,
      discSize: size,
      discFormat: format,
      discCue: cue,
    });
    console.log(`[games] Jeu créé depuis son image : ${game.id} (${identity.serial ?? "sans numéro"})`);
    return c.json(game.toPublic(), 201);
  } catch (error) {
    await discardFiles([filePath]);
    throw error;
  }
});

/** Fiche d'un de mes jeux. */
gamesRoutes.get("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const game = await Game.findOne({ _id: id, ownerId: sub }).select("+coverStoredName");
  if (!game) throw notFound();
  return c.json(game.toPublic());
});

/**
 * Modifie un de mes jeux. Multipart : title, serial, genre, cover (nouvelle
 * pochette) et removeCover=true (retire la pochette). Les champs absents
 * ne changent pas.
 */
gamesRoutes.patch("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const body = (await c.req.parseBody()) as Body;
  const fields = parseFields(body, true);
  const cover = await readCover(body);
  const removeCurrent = text(body, "removeCover") === "true";

  const existing = await Game.findOne({ _id: id, ownerId: sub }).select("+coverStoredName");
  if (!existing) {
    await discardCover(cover?.storedName);
    throw notFound();
  }

  const { unset, ...values } = fields;
  const update: mongoose.UpdateQuery<GameDoc> = {
    $set: { ...values },
    $unset: Object.fromEntries(unset.map((key) => [key, ""])),
  };
  if (cover) {
    update.$set = { ...update.$set, coverStoredName: cover.storedName, coverMimeType: cover.mimeType };
  } else if (removeCurrent) {
    update.$unset = { ...update.$unset, coverStoredName: "", coverMimeType: "" };
  }

  try {
    const game = await Game.findOneAndUpdate({ _id: id, ownerId: sub }, update, {
      new: true,
      runValidators: true,
    }).select("+coverStoredName");
    if (!game) throw notFound();

    if (cover || removeCurrent) await discardCover(existing.coverStoredName);
    console.log(`[games] Jeu modifié : ${id}`);
    return c.json(game.toPublic());
  } catch (error) {
    await discardCover(cover?.storedName);
    throw error;
  }
});

/** Envoie la pochette d'un de mes jeux. */
gamesRoutes.get("/:id/cover", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  const missing = () => new HTTPException(404, { message: "Pochette inconnue" });
  if (!mongoose.isValidObjectId(id)) throw missing();

  const game = await Game.findOne({ _id: id, ownerId: sub }).select("+coverStoredName");
  if (!game?.coverStoredName || !game.coverMimeType) throw missing();

  const file = Bun.file(coverPath(game.coverStoredName));
  if (!(await file.exists())) {
    console.error(`[games] Pochette absente du disque pour le jeu ${game.id}`);
    throw missing();
  }

  c.header("Content-Type", game.coverMimeType);
  c.header("Content-Length", String(file.size));
  c.header("Cache-Control", "private, max-age=86400");
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(file.stream());
});

/** Envoie l'image disque d'un de mes jeux. */
gamesRoutes.get("/:id/disc", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  const missing = () => new HTTPException(404, { message: "Fichier du jeu inconnu" });
  if (!mongoose.isValidObjectId(id)) throw missing();

  const game = await Game.findOne({ _id: id, ownerId: sub }).select("+discStoredName");
  if (!game?.discStoredName) throw missing();

  const file = Bun.file(discPath(game.discStoredName));
  if (!(await file.exists())) {
    console.error(`[games] Image absente du disque pour le jeu ${game.id}`);
    throw missing();
  }

  console.log(`[games] Image envoyée : ${game.id}`);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", String(file.size));
  c.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(game.discName ?? "disc")}`);
  c.header("Cache-Control", "private, no-store");
  return c.body(file.stream());
});

/** Supprime un de mes jeux, sa pochette et son image disque. */
gamesRoutes.delete("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");
  if (!mongoose.isValidObjectId(id)) throw notFound();

  const game = await Game.findOneAndDelete({ _id: id, ownerId: sub }).select("+coverStoredName +discStoredName");
  if (!game) throw notFound();

  await discardCover(game.coverStoredName);
  if (game.discStoredName) await discardFiles([discPath(game.discStoredName)]);
  return c.body(null, 204);
});
