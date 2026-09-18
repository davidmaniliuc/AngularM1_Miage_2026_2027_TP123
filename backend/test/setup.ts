/*
 * Ce fichier est chargé par bunfig.toml AVANT tout autre module de test.
 * C'est le seul endroit où l'on peut fixer les variables d'environnement
 * avant que src/config.ts ne les lise.
 */
import os from "node:os";
import path from "node:path";

process.env.MONGODB_URI =
  process.env.TEST_MONGODB_URI ||
  "mongodb://127.0.0.1:27017/guitar-practice-cloud-test";

process.env.JWT_SECRET = "secret-de-test-non-utilise-en-production";

// Les uploads des tests n'atterrissent jamais dans backend/data/uploads.
process.env.UPLOADS_DIR = path.join(os.tmpdir(), "gpc-test-uploads");
