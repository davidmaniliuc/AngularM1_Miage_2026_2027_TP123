import mongoose from "mongoose";
import { MONGODB_URI } from "../src/config";
import { User } from "../src/models/User";
import { Track } from "../src/models/Track";
import { audioPath, discardFiles, ensureUploadsDir, saveAudio } from "../src/lib/uploads";

const accounts = [
  { name: "Demo", email: "demo@example.com", count: 12 },
  { name: "Camille Martin", email: "camille@example.com", count: 6 },
  { name: "Lucas Bernard", email: "lucas@example.com", count: 6 },
];
const exercises = [
  "Échauffement chromatique", "Pentatonique en la mineur", "Blues en mi",
  "Arpèges en do majeur", "Rythme bossa nova", "Accords ouverts",
  "Aller-retour au médiator", "Balade acoustique", "Walking bass",
  "Improvisation dorienne", "Riff syncopé", "Étude fingerstyle",
];

/** Petit motif synthétique autonome : WAV PCM mono, 8 secondes, sans dépendance externe. */
function practiceAudio(variation: number): Uint8Array {
  const sampleRate = 22050;
  const sampleCount = sampleRate * 8;
  const wav = Buffer.alloc(44 + sampleCount * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(sampleCount * 2, 40);
  const notes = [0, 3, 5, 7, 10, 7, 5, 3];
  for (let i = 0; i < sampleCount; i++) {
    const time = i / sampleRate;
    const beatTime = time % 0.5;
    const semitone = notes[Math.floor(time * 2) % notes.length]! + variation;
    const frequency = 110 * 2 ** (semitone / 12);
    const envelope = Math.min(1, beatTime / 0.008) * Math.exp(-8 * beatTime)
      * Math.min(1, (8 - time) / 0.05);
    const tone = Math.sin(2 * Math.PI * frequency * time)
      + 0.25 * Math.sin(4 * Math.PI * frequency * time);
    wav.writeInt16LE(Math.round(tone * envelope * 6500), 44 + i * 2);
  }
  return wav;
}

/** Ajoute les données manquantes ; ne réinitialise jamais une collection ou un compte. */
export async function seedDemo(): Promise<{ usersCreated: number; tracksCreated: number }> {
  ensureUploadsDir();
  let usersCreated = 0;
  let tracksCreated = 0;
  for (const [accountIndex, account] of accounts.entries()) {
    let user = await User.findOne({ email: account.email });
    if (!user) {
      user = await User.register({ ...account, password: "Demo1234!" });
      usersCreated++;
    }
    for (let index = 0; index < account.count; index++) {
      // Identifiants réservés au seed : titres/visibilités restent modifiables sans doublons.
      const id = new mongoose.Types.ObjectId(
        `de00000000000000${(accountIndex * 100 + index).toString(16).padStart(8, "0")}`,
      );
      if (await Track.exists({ _id: id })) continue;
      const originalName = `exercice-${accountIndex + 1}-${index + 1}.wav`;
      const bytes = practiceAudio(accountIndex * 3 + index);
      const storedName = await saveAudio(new File([bytes], originalName, { type: "audio/wav" }));
      try {
        await Track.create({
          _id: id,
          ownerId: user._id,
          title: `${exercises[(index + accountIndex * 3) % exercises.length]} — prise ${accountIndex + 1}`,
          artist: account.name,
          album: accountIndex === 0 ? "Carnet de pratique" : "Atelier partagé",
          originalName,
          storedName,
          mimeType: "audio/wav",
          size: bytes.length,
          visibility: index % 2 === 0 ? "public" : "private",
          createdAt: new Date(Date.UTC(2026, 8, 1 + index, 10, accountIndex)),
        });
        tracksCreated++;
      } catch (error) {
        await discardFiles([audioPath(storedName)]);
        throw error;
      }
    }
  }
  return { usersCreated, tracksCreated };
}

if (import.meta.main) {
  try {
    if (!MONGODB_URI) throw new Error("Configuration MongoDB absente");
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const result = await seedDemo();
    console.log("[seed] Terminé", result);
  } catch (error) {
    // Les erreurs MongoDB peuvent contenir l'URI : ne pas les afficher intégralement.
    console.error("[seed] Échec ; vérifier la configuration, MongoDB et les droits d'écriture.",
      { type: error instanceof Error ? error.name : "UnknownError" });
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
