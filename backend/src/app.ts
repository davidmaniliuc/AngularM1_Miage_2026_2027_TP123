import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import mongoose from "mongoose";
import { requestLog } from "./middleware/request-log";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { tracksRoutes } from "./routes/tracks";
import type { AppEnv } from "./types";

/**
 * Construit l'application Hono sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.ts.
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("*", requestLog);

  /*
   * CORS permet au frontend Angular (http://localhost:4200) d'appeler l'API
   * servie sur un autre port. Dans un vrai projet, il faut restreindre la
   * liste des origines autorisées.
   */
  app.use("*", cors());

  /*
   * Contrairement à Express, Hono n'a pas de middleware express.json() global :
   * chaque handler lit le corps dont il a besoin avec c.req.json() ou
   * c.req.parseBody().
   */
  app.route("/api", healthRoutes);
  app.route("/api/auth", authRoutes);
  app.route("/api/users", usersRoutes);
  app.route("/api/tracks", tracksRoutes);

  /** Route inconnue : réponse JSON, jamais une page HTML. */
  app.notFound((c) => c.json({ message: "Ressource inconnue" }, 404));

  /**
   * Gestionnaire central des erreurs. Il remplace le middleware d'erreur
   * d'Express : au lieu d'appeler next(error), un handler lève une exception
   * et elle arrive ici.
   */
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      console.warn(`[error] ${error.status} ${error.message}`);
      return c.json({ message: error.message }, error.status);
    }

    if (error instanceof mongoose.Error.ValidationError) {
      console.error("[error] Validation Mongoose refusée", error);
      return c.json({ message: error.message }, 400);
    }

    if (error instanceof mongoose.Error.CastError) {
      console.error("[error] Identifiant MongoDB invalide", error);
      return c.json({ message: "Ressource inconnue" }, 404);
    }

    console.error("[error] Erreur non gérée", error);
    return c.json({ message: "Erreur interne du serveur" }, 500);
  });

  return app;
}
