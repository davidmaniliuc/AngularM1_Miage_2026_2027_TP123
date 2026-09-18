import { createMiddleware } from "hono/factory";

/**
 * Journalise la fin de chaque requête : méthode, URL, statut et durée.
 * Les corps de requête ne sont jamais journalisés, car ils contiennent
 * parfois un mot de passe.
 *
 * `await next()` laisse passer la requête vers la suite de la chaîne ; le code
 * placé après s'exécute une fois la réponse construite.
 */
export const requestLog = createMiddleware(async (c, next) => {
  const startedAt = Date.now();
  const { pathname, search } = new URL(c.req.url);

  await next();

  console.log(
    `[http] ${c.req.method} ${pathname}${search} -> ${c.res.status} (${Date.now() - startedAt} ms)`,
  );
});
