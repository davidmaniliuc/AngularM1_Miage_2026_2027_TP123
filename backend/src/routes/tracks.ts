import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth";
import { Track } from "../models/Track";
import { MAX_FILE_SIZE } from "../config";
import {
  audioPath,
  removeAudio,
  saveAudio,
  validateAudio,
} from "../lib/uploads";
import type { AppEnv, Page, PublicTrack } from "../types";

export const tracksRoutes = new Hono<AppEnv>();

// Toutes les routes de ce module exigent un jeton valide.
tracksRoutes.use("*", requireAuth);

/*
 * Correspondance entre les noms du plugin et ceux du contrat : docs devient
 * items, totalDocs devient total, totalPages devient pages. Les autres
 * métadonnées du plugin (hasNextPage, nextPage…) gardent leur nom.
 */
const PAGE_LABELS = { docs: "items", totalDocs: "total", totalPages: "pages" };

/** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
tracksRoutes.get("/", async (c) => {
  const { sub } = c.get("auth");

  /*
   * Les paramètres d'URL sont toujours des chaînes, et toujours suspects.
   * On les convertit puis on les borne : page >= 1, limit entre 1 et 20.
   */
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const limit = Math.min(20, Math.max(1, Number(c.req.query("limit")) || 5));

  /*
   * Contrairement à find(), un pipeline d'agrégation ne convertit pas les
   * types : ownerId doit être un vrai ObjectId, sinon $match ne trouve rien.
   * `sub` vient d'un jeton signé, mais on le valide quand même.
   */
  if (!mongoose.isValidObjectId(sub)) {
    console.warn("[tracks] Identifiant utilisateur invalide dans le jeton");
    throw new HTTPException(401, { message: "Authentification requise" });
  }
  const ownerId = new mongoose.Types.ObjectId(sub);

  console.log(`[tracks] Lecture page=${page}, limit=${limit}, user=${sub}`);

  /*
   * $project recopie champ par champ ce que le frontend a le droit de voir :
   * storedName ne peut pas fuiter, et _id devient l'`id` attendu par Angular.
   * Le tri est confié au plugin, qui l'applique avant le découpage en pages.
   */
  const pipeline = Track.aggregate<PublicTrack>([
    { $match: { ownerId } },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        ownerId: { $toString: "$ownerId" },
        title: 1,
        originalName: 1,
        mimeType: 1,
        size: 1,
        createdAt: 1,
      },
    },
  ]);

  const result = await Track.aggregatePaginate<PublicTrack>(pipeline, {
    page,
    limit,
    sort: { createdAt: -1 },
    customLabels: PAGE_LABELS,
  });

  const body: Page<PublicTrack> = {
    items: result.items as PublicTrack[],
    page: result.page ?? page,
    limit: result.limit,
    total: result.total as number,
    pages: result.pages as number,
    pagingCounter: result.pagingCounter,
    hasPrevPage: result.hasPrevPage,
    hasNextPage: result.hasNextPage,
    prevPage: result.prevPage ?? null,
    nextPage: result.nextPage ?? null,
  };

  console.log(`[tracks] ${body.items.length} piste(s) envoyée(s) sur ${body.total}`);
  return c.json(body);
});

/**
 * Reçoit un formulaire multipart contenant le champ fichier "audio" et le
 * champ texte "title".
 *
 * Différence avec Multer : parseBody() met tout le corps en mémoire avant que
 * l'on puisse lire la taille du fichier. On regarde donc d'abord l'en-tête
 * Content-Length pour rejeter un envoi manifestement trop gros sans le lire.
 */
tracksRoutes.post("/", async (c) => {
  const { sub } = c.get("auth");

  const declaredSize = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_FILE_SIZE) {
    console.warn(`[tracks] Envoi refusé avant lecture : ${declaredSize} octets`);
    throw new HTTPException(400, { message: "Fichier trop volumineux" });
  }

  const body = await c.req.parseBody();
  const validation = validateAudio(body["audio"]);

  if (!validation.ok) {
    throw new HTTPException(400, { message: validation.message });
  }

  const { file } = validation;
  const title = typeof body["title"] === "string" && body["title"]
    ? body["title"]
    : file.name;

  const storedName = await saveAudio(file);

  try {
    const track = await Track.create({
      ownerId: new mongoose.Types.ObjectId(sub),
      title,
      originalName: file.name,
      storedName,
      mimeType: file.type,
      size: file.size,
    });

    console.log(`[tracks] Upload enregistré : ${track.id}`);
    return c.json(track.toPublic(), 201);
  } catch (error) {
    console.error("[tracks] Erreur après l'écriture du fichier", error);

    // Si MongoDB échoue après l'écriture sur disque, on nettoie le fichier
    // orphelin. Un échec du nettoyage est lui aussi journalisé.
    try {
      await removeAudio(storedName);
    } catch (cleanupError) {
      console.error(
        `[tracks] Impossible de supprimer le fichier orphelin ${storedName}`,
        cleanupError,
      );
    }

    throw error;
  }
});

/** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
tracksRoutes.get("/:id/audio", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");

  // Un identifiant malformé ne doit pas atteindre MongoDB : on répond 404.
  if (!mongoose.isValidObjectId(id)) {
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  const track = await Track.findOne({ _id: id, ownerId: sub }).select(
    "+storedName",
  );

  if (!track) {
    console.warn(`[tracks] Audio introuvable ou interdit : ${id}`);
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  const file = Bun.file(audioPath(track.storedName));

  if (!(await file.exists())) {
    console.error(`[tracks] Fichier absent du disque pour la piste ${track.id}`);
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  console.log(`[tracks] Audio envoyé : ${track.id}`);
  c.header("Content-Type", track.mimeType);
  c.header("Content-Length", String(file.size));

  // file.stream() envoie le fichier par morceaux, sans le charger en mémoire.
  return c.body(file.stream());
});

/** Supprime la métadonnée et le fichier physique correspondant. */
tracksRoutes.delete("/:id", async (c) => {
  const { sub } = c.get("auth");
  const id = c.req.param("id");

  if (!mongoose.isValidObjectId(id)) {
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  const track = await Track.findOneAndDelete({
    _id: id,
    ownerId: sub,
  }).select("+storedName");

  if (!track) {
    console.warn(`[tracks] Suppression impossible : ${id}`);
    throw new HTTPException(404, { message: "Piste inconnue" });
  }

  try {
    await removeAudio(track.storedName);
  } catch (error) {
    // L'exception n'est pas ignorée : l'administrateur doit voir ce fichier
    // orphelin si sa suppression échoue.
    console.error(`[tracks] Fichier audio non supprimé : ${track.storedName}`, error);
    return c.json(
      { message: "Métadonnée supprimée, mais fichier audio non supprimé" },
      500,
    );
  }

  return c.body(null, 204);
});
