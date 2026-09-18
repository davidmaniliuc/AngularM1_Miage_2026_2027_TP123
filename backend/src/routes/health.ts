import { Hono } from "hono";
import type { AppEnv } from "../types";

export const healthRoutes = new Hono<AppEnv>();

/** Endpoint public utilisé pour vérifier que l'API répond. */
healthRoutes.get("/health", (c) => {
  console.log("[health] Vérification de l'API");
  return c.json({ status: "ok" });
});
