import mongoose from "mongoose";
import { MONGODB_URI } from "../src/config";
import { User } from "../src/models/User";
import { ensureUploadsDir } from "../src/lib/uploads";
import { seedDemoLibrary } from "../src/lib/demo-library";

/** Ajoute les jeux de démonstration au compte demo@example.com (idempotent). */
ensureUploadsDir();
if (!MONGODB_URI) throw new Error("MONGODB_URI manque dans backend/.env");
await mongoose.connect(MONGODB_URI);

try {
  const demo = await User.findOne({ email: "demo@example.com" });
  if (!demo) throw new Error("Compte demo@example.com introuvable : démarrez d'abord le backend.");
  await seedDemoLibrary(demo.id);
} finally {
  await mongoose.disconnect();
}
