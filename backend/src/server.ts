import mongoose from "mongoose";
import { createApp } from "./app";
import { User } from "./models/User";
import { ensureUploadsDir } from "./lib/uploads";
import { MONGODB_URI, PORT } from "./config";

// Le port et l'URI viennent de l'environnement du backend, jamais d'Angular.
if (!MONGODB_URI) {
  const error = new Error("MONGODB_URI manque dans backend/.env");
  console.error("[startup] Configuration MongoDB absente", error);
  throw error;
}

ensureUploadsDir();

try {
  // `await` suspend le démarrage jusqu'à la connexion effective à MongoDB :
  // il ne faut pas démarrer une API qui ne peut pas atteindre sa base.
  await mongoose.connect(MONGODB_URI);
  console.log("[startup] Connecté à MongoDB");
  console.log(
    "[startup] La base guitar-practice-cloud est prête à recevoir des données",
  );
} catch (error) {
  console.error("[startup] Échec de connexion à MongoDB", error);
  throw error;
}

try {
  // Le compte de démonstration facilite les premiers tests des étudiants.
  const demoEmail = "demo@example.com";

  if (await User.exists({ email: demoEmail })) {
    console.log("[startup] Compte de démonstration déjà présent");
  } else {
    const demoUser = await User.register({
      name: "Demo",
      email: demoEmail,
      password: "Demo1234!",
    });
    console.log(`[startup] Compte de démonstration créé : ${demoUser.id}`);
  }
} catch (error) {
  console.error(
    "[startup] Impossible de préparer le compte de démonstration",
    error,
  );
  throw error;
}

console.log(`Guitar Practice Cloud API: http://localhost:${PORT}/api/health`);

/*
 * Bun démarre automatiquement un serveur HTTP quand le module principal
 * exporte un objet { port, fetch }. Il n'y a ni app.listen() ni adaptateur
 * Node à installer.
 */
export default {
  port: PORT,
  fetch: createApp().fetch,
};
