import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "../lib/jwt";
import type { AppEnv } from "../types";

/**
 * Middleware Hono qui protège les routes privées.
 *
 * Le jeton est transmis dans l'en-tête sous la forme
 * "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire.
 *
 * En cas de succès, le contenu du jeton est déposé sur le contexte avec
 * c.set("auth", ...). C'est l'équivalent typé du `req.auth = ...` d'Express :
 * un handler le relit ensuite avec c.get("auth").
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const raw = c.req.header("Authorization");

  if (!raw?.startsWith("Bearer ")) {
    console.warn(
      `[auth] En-tête Authorization absent pour ${c.req.method} ${c.req.path}`,
    );
    throw new HTTPException(401, { message: "Authentification requise" });
  }

  const payload = await verifyToken(raw.slice(7));

  if (!payload) {
    throw new HTTPException(401, { message: "Jeton invalide ou expiré" });
  }

  console.log(`[auth] Jeton accepté pour ${payload.sub}`);
  c.set("auth", payload);
  await next();
});
