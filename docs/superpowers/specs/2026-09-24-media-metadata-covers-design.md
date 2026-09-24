# Métadonnées, pochettes et formats sans perte

Date : 2026-09-24
Statut : en relecture

## Objectif

Réaliser l'option « AVANCÉ — Image de couverture » du TP2 (`SUJET_ETUDIANT_TP2.md`)
et rendre les formats sans perte utilisables de bout en bout :

1. chaque piste affiche la pochette intégrée à son fichier audio, si elle existe ;
2. les tags `title`, `artist` et `album` sont lus et conservés ;
3. un fichier ALAC (`.m4a` sans perte) est lisible dans Chrome et Firefox ;
4. un fichier FLAC est accepté à l'upload.

Le sujet exige d'identifier les modifications de données et d'API avant
l'implémentation, et de respecter la sécurité, l'accessibilité et les droits
d'utilisation des images. Ce document sert de réponse écrite à cette exigence.

## Constat de départ

- Les `.m4a` importés sont en codec **ALAC** (vérifié avec `ffprobe`). Chrome et
  Firefox ne décodent pas l'ALAC : `<audio>` échoue avec « Lecture impossible ».
  Seul Safari les lit. Le backend n'est pas en cause.
- `ALLOWED_MIME` (`backend/src/config.ts`) ne contient pas `audio/flac` : tout
  FLAC est refusé en 400.
- `MAX_FILE_SIZE` vaut 25 Mo, ce qui refuse la plupart des morceaux sans perte.
- Ces fichiers contiennent déjà des tags (`Frank Ocean` / `Endless` / `Wither`)
  et une pochette JPEG intégrée.
- Mesure : convertir un ALAC de 22,6 Mo en FLAC prend 0,44 s (20,6 Mo en sortie).

## Décisions validées

| Sujet | Décision |
|---|---|
| ALAC | Converti en FLAC à l'upload avec ffmpeg (sans perte, lisible partout) |
| Exécutable ffmpeg | Celui du système, lancé avec `Bun.spawn`. Installé par `apt-get` dans le Dockerfile backend, et par Homebrew en local. `ffmpeg-static` et les modules natifs (`node-av`) sont écartés. |
| Moment du traitement | Pendant `POST /tracks`, avant la réponse 201 (pas de file d'attente) |
| Source des pochettes | Pochette intégrée au fichier uniquement |
| Tags texte | `artist` et `album` stockés ; `title` sert de titre si le formulaire n'en fournit pas |
| Taille maximale | 100 Mo au lieu de 25 Mo |
| Pistes existantes | Script de migration idempotent |
| Lecture des métadonnées | Librairie `music-metadata` (JavaScript pur, pas de ffmpeg) |

Hors périmètre : upload d'une pochette par l'utilisateur, recherche d'images sur
le Web (MusicBrainz / Cover Art Archive), modification des tags, file d'attente
de traitement.

## Dépendances

- Ajoutée : `music-metadata` (ESM, types inclus). Elle lit ID3v1/v2 (MP3),
  les atomes MP4 (`covr`, `©nam`…), les blocs FLAC (`PICTURE`,
  `VORBIS_COMMENT`), Ogg et WAV.
- Binaire système : **ffmpeg**, obligatoire pour le backend et ses tests.
  - En local : `brew install ffmpeg`.
  - Dans Docker : installé par un nouveau `backend/Dockerfile` (voir plus bas).

ffmpeg sert **uniquement** à convertir l'ALAC. Les métadonnées et les pochettes
ne passent jamais par lui.

## Modèle de données

Nouveaux champs de `Track` (`backend/src/models/Track.ts`), tous optionnels pour
rester compatibles avec les documents existants :

| Champ | Type | Exposé | Rôle |
|---|---|---|---|
| `artist` | `string` | oui | Tag artiste, nettoyé (`trim`), absent si vide |
| `album` | `string` | oui | Tag album, nettoyé (`trim`), absent si vide |
| `coverStoredName` | `string` | **non** (`select: false`) | Nom UUID de l'image sur le disque |
| `coverMimeType` | `string` | non | `image/jpeg`, `image/png` ou `image/webp` |
| `transcodedFrom` | `string` | oui | `"alac"` si le fichier a été converti |

Champs existants dont le sens est précisé :

- `mimeType` et `size` décrivent le **fichier stocké** (donc `audio/flac` et la
  taille du FLAC après conversion), pas le fichier envoyé.
- `originalName` reste le nom du fichier envoyé par l'utilisateur.
- `storedName` prend l'extension du fichier stocké (`.flac` après conversion).

`PublicTrack` (`backend/src/types.ts`) gagne `artist?`, `album?`,
`transcodedFrom?` et `hasCover: boolean`. `coverStoredName` n'est jamais exposé.

Dans le pipeline d'agrégation de `GET /tracks`, `$project` ajoute :

```ts
artist: 1,
album: 1,
transcodedFrom: 1,
hasCover: { $ne: [{ $type: "$coverStoredName" }, "missing"] },
```

`toPublic()` calcule `hasCover` de la même façon (`Boolean(coverStoredName)`,
après un `select("+coverStoredName")`).

## Contrat d'API

`API_CONTRACT.md` est mis à jour dans le même commit que l'implémentation.

### `POST /tracks` (modifié)

Même multipart qu'avant : `audio` (fichier) et `title` (texte, **désormais
facultatif**).

Règle du titre : champ `title` non vide, sinon tag `title` du fichier, sinon
nom du fichier.

Formats acceptés, **déterminés par le contenu** (lu par `music-metadata`), et
non par le MIME déclaré par le navigateur :

| Contenu détecté | Stocké tel quel | `mimeType` stocké |
|---|---|---|
| MP3 | oui | `audio/mpeg` |
| WAV | oui | `audio/wav` |
| Ogg (Vorbis, Opus) | oui | `audio/ogg` |
| MP4 / M4A en AAC | oui | `audio/mp4` |
| MP4 / M4A en **ALAC** | **non, converti en FLAC** | `audio/flac` |
| FLAC | oui | `audio/flac` |
| autre chose | refusé, 400 « Format audio non accepté » | — |

Le MIME déclaré reste un premier filtre bon marché. La liste autorisée devient :
`audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/mp4`,
`audio/x-m4a`, `audio/flac`, `audio/x-flac`. Si le contenu détecté ne correspond
à aucune ligne du tableau, le fichier est refusé, même si son MIME était autorisé.

Taille maximale : 100 Mo (vérification de `Content-Length` puis de `file.size`,
comme aujourd'hui). Limite connue : `parseBody()` charge tout le fichier en
mémoire. C'est acceptable pour un TP, pas pour une production.

Réponse `201` : le `Track` public, qui contient déjà `artist`, `album`,
`hasCover` et `transcodedFrom`. Le frontend n'a rien à redemander.

### `GET /tracks/:id/cover` (nouveau)

- JWT obligatoire. Même contrôle de propriété que `/audio`.
- `404 { message: "Pochette inconnue" }` si l'identifiant est invalide, si la
  piste appartient à un autre utilisateur, si la piste n'a pas de pochette ou si
  le fichier image manque sur le disque. On ne distingue pas ces cas, pour ne pas
  révéler l'existence de la piste d'un autre utilisateur.
- `200` avec le binaire de l'image et les en-têtes :
  - `Content-Type`: `coverMimeType` ;
  - `Content-Length` ;
  - `Cache-Control: private, max-age=86400` ;
  - `X-Content-Type-Options: nosniff`.

### `DELETE /tracks/:id` (modifié)

Supprime aussi la pochette. Si la suppression de la pochette échoue, l'erreur est
journalisée mais la réponse reste `204` : une image orpheline est moins grave
qu'un fichier audio orphelin, qui garde son traitement actuel (`500`).

### `GET /tracks/:id/audio`

Inchangé. Le `Content-Type` renvoyé est `audio/flac` pour une piste convertie.

## Backend : découpage

Trois modules dans `backend/src/lib/`, chacun testable séparément.

### `lib/metadata.ts`

```ts
export type AudioKind = "mp3" | "wav" | "ogg" | "aac" | "alac" | "flac";

export interface AudioMetadata {
  kind: AudioKind | null;        // null = format non accepté
  title?: string;
  artist?: string;
  album?: string;
  picture?: { format: string; data: Uint8Array };
}

export async function readMetadata(filePath: string): Promise<AudioMetadata>;
```

- Appelle `parseFile(filePath)` de `music-metadata`, qui ne lit que les en-têtes
  et pas tout le flux audio.
- Déduit `kind` de `format.container` et `format.codec`. Les chaînes exactes
  renvoyées par la librairie sont figées dans les tests à partir des fichiers de
  référence.
- Prend `common.picture` : la première image de type « Cover (front) », sinon la
  première image tout court.
- Une exception de `music-metadata` (fichier corrompu) donne `kind: null`.

### `lib/transcode.ts`

```ts
export async function alacToFlac(src: string, dst: string): Promise<void>;
```

- Lance
  `ffmpeg -nostdin -v error -y -i <src> -map 0:a -map 0:v? -c:a flac -c:v copy -disposition:v attached_pic <dst>`
  avec `Bun.spawn`, en passant un tableau d'arguments (jamais une chaîne shell).
- La pochette est **conservée dans le FLAC** : ffmpeg voit la pochette ALAC
  comme un flux vidéo `mjpeg`. `-map 0:v?` le garde s'il existe, sans échouer
  s'il est absent. `-c:v copy` recopie l'image sans la réencoder.
  `-disposition:v attached_pic` l'écrit dans un bloc `PICTURE` du FLAC.
  Vérifié à la conception : le FLAC produit contient la même image JPEG
  (2 917 860 octets) et les mêmes tags.
- Les tags texte sont recopiés par défaut par ffmpeg.
- La pochette est tout de même extraite à part par `readMetadata` et `saveCover`
  pour servir `GET /tracks/:id/cover`, sans relire le fichier audio à chaque
  affichage.
- Délai maximum : 60 s, puis `kill()` et erreur.
- Code de sortie non nul : erreur contenant le `stderr` de ffmpeg.
- ffmpeg introuvable : erreur explicite « ffmpeg n'est pas installé ».

### `lib/covers.ts`

```ts
export const MAX_COVER_SIZE = 5 * 1024 * 1024;
export function detectImageType(data: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null;
export async function saveCover(data: Uint8Array): Promise<{ storedName: string; mimeType: string } | null>;
export function coverPath(storedName: string): string;
export async function removeCover(storedName: string): Promise<void>;
```

- `detectImageType` lit les premiers octets : JPEG `FF D8 FF`, PNG
  `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF????WEBP`. Le format annoncé dans le tag
  est ignoré.
- `saveCover` renvoie `null` (sans erreur) si le type est inconnu ou si l'image
  dépasse 5 Mo : une pochette refusée ne bloque jamais l'upload.
- Nom de stockage : `crypto.randomUUID()` + `.jpg` / `.png` / `.webp`.
- Emplacement : `UPLOADS_DIR/covers/`, créé au démarrage par `ensureUploadsDir()`.

### Déroulé de `POST /tracks`

1. Contrôles actuels : `Content-Length`, champ `audio`, MIME déclaré, taille.
2. `saveAudio(file)` écrit le fichier sous un nom UUID (comportement actuel).
3. `readMetadata(chemin)`. Si `kind === null` : suppression du fichier, puis 400.
4. Si `kind === "alac"` : `alacToFlac` vers `<uuid>.flac`, suppression de
   l'original, puis `storedName`, `mimeType` et `size` pris sur le FLAC.
5. Si `picture` existe : `saveCover(picture.data)`.
6. `Track.create(...)` avec tous les champs.
7. En cas d'erreur à l'une des étapes 4 à 6, tous les fichiers déjà écrits
   (original, FLAC, pochette) sont supprimés, puis l'erreur remonte en 500. Le
   nettoyage de chaque fichier est journalisé, comme aujourd'hui.

Journalisation : une ligne `[upload]` par étape (format détecté, conversion et sa
durée, pochette trouvée ou non), dans le style actuel.

## Docker

Nouveau `backend/Dockerfile` :

```dockerfile
FROM oven/bun:1.4.2
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
```

Dans `docker-compose.yml`, le service `backend` remplace
`image: oven/bun:1.4.2` par `build: ./backend`. La commande, les volumes et
l'environnement ne changent pas. `README.md` signale que ffmpeg est requis pour
lancer le backend hors de Docker.

## Migration des pistes existantes

Script `backend/scripts/migrate-media.ts`, lancé avec
`bun run scripts/migrate-media.ts` (ajouté aux scripts de `package.json` sous le
nom `migrate:media`).

Pour chaque `Track` :

- si le fichier audio est absent : journalisé, piste ignorée ;
- `readMetadata` sur le fichier stocké ;
- ALAC : conversion, mise à jour de `storedName`, `mimeType`, `size` et
  `transcodedFrom`, suppression de l'ancien fichier **après** la mise à jour en
  base ;
- `artist` / `album` renseignés s'ils sont absents ;
- pochette extraite si `coverStoredName` est absent ;
- le `title` existant n'est **jamais** modifié.

Le script est idempotent : un FLAC n'est pas reconverti, une pochette présente
n'est pas réextraite. Il affiche un bilan (pistes converties, pochettes
ajoutées, erreurs) et se termine avec un code non nul si au moins une piste a
échoué.

## Frontend

- `Track` (`shared/models/track.model.ts`) : ajout de `artist?`, `album?`,
  `transcodedFrom?` et `hasCover`.
- `audio-file.ts` : ajout de `audio/flac` et `audio/x-flac` aux types acceptés,
  limite à 100 Mo, libellé `FLAC` dans `FORMAT_LABELS`, message d'erreur mis à
  jour. Le backend reste la seule autorité : la conversion ALAC est invisible
  côté navigateur.
- `upload-dialog` : `accept` ajoute `.flac`. Si le champ titre est vide, le
  formulaire envoie un titre **vide** au lieu de `file.name`, pour que le
  backend puisse utiliser le tag `title`.
- `TrackService.cover(id)` : `GET /api/tracks/:id/cover` en `responseType: 'blob'`.
  Une balise `<img src="/api/...">` ne peut pas envoyer l'en-tête
  `Authorization`, d'où le passage par un Blob et un ObjectURL, comme pour
  l'audio.
- `track-card` :
  - si `hasCover`, charge la pochette, crée l'ObjectURL et l'affiche en fond du
    bouton de lecture ; l'étiquette de format (`M4A`, `FLAC`…) reste le repli
    tant que l'image n'est pas chargée, ou en cas d'erreur ;
  - `URL.revokeObjectURL` à la destruction du composant (`DestroyRef`) ;
  - sous-titre : « Artiste · Album » si au moins l'un des deux existe, sinon le
    nom du fichier comme aujourd'hui.
- `audio-player` : même affichage de la pochette pour la piste en cours, avec la
  même logique de repli et de libération.

## Sécurité, accessibilité, droits

- **Sécurité**
  - Le type de l'image est déterminé par ses octets, jamais par le tag ni par le
    navigateur.
  - Réponse servie avec `nosniff`.
  - Noms de fichiers en UUID.
  - ffmpeg est lancé sans shell, avec des chemins générés par le serveur.
  - Délai maximum sur la conversion.
  - Une pochette n'est servie qu'au propriétaire de la piste.
- **Accessibilité**
  - La pochette est décorative (`alt=""`) : le bouton de lecture porte déjà son
    `aria-label` avec le titre.
  - Le repli textuel (format) garantit une carte lisible sans image.
  - Aucune information n'est transmise uniquement par l'image.
- **Droits**
  - Les images proviennent des fichiers que l'utilisateur a lui-même importés.
  - Elles ne sont ni republiées ni partagées : seul le propriétaire y accède, et
    `Cache-Control: private` interdit leur mise en cache par un proxy.
  - Aucune image n'est récupérée auprès d'un service tiers.

## Tests (`bun test`)

Fichiers de référence de quelques Ko dans `backend/test/fixtures/`, générés une
fois par ffmpeg. La commande exacte est notée dans `fixtures/README.md` :
1 s de sinus, avec ou sans tags et pochette.

| Fichier | Contenu |
|---|---|
| `alac-cover.m4a` | ALAC + tags + pochette JPEG |
| `aac.m4a` | AAC, sans pochette |
| `flac-cover.flac` | FLAC + tags + pochette PNG |
| `plain.mp3` | MP3 sans tags |
| `not-audio.m4a` | texte renommé en `.m4a` |

Cas testés :

- **`metadata.test.ts`**
  - `kind` correct pour chaque fixture ;
  - tags et pochette lus ;
  - `not-audio.m4a` donne `kind: null`.
- **`transcode.test.ts`**
  - `alac-cover.m4a` converti en un fichier que `readMetadata` reconnaît comme
    `flac`, avec les tags et la pochette conservés ;
  - un fichier sans pochette se convertit sans erreur ;
  - source invalide : erreur.
- **`covers.test.ts`**
  - `detectImageType` sur JPEG, PNG, WebP et des octets aléatoires ;
  - `saveCover` renvoie `null` au-delà de 5 Mo.
- **`tracks-upload.test.ts`**
  - ALAC : piste en `audio/flac`, `transcodedFrom: "alac"`, `hasCover: true`,
    fichier `.flac` sur le disque, original supprimé ;
  - FLAC accepté tel quel ;
  - titre vide : titre repris du tag ;
  - `not-audio.m4a` : 400 et aucun fichier restant.
- **`tracks-cover.test.ts`** (nouveau)
  - 200 avec le bon `Content-Type` ;
  - 404 pour la piste d'un autre utilisateur, pour une piste sans pochette et
    pour un identifiant invalide ;
  - 401 sans jeton.
- **Suppression** : la pochette disparaît du disque.
- **`migrate-media`** : un second passage ne modifie rien.

Frontend : `audio-file.spec.ts` couvre FLAC et la nouvelle limite ;
`upload-dialog.spec.ts` vérifie l'envoi d'un titre vide.

## Critères de réussite

- Les 5 pistes ALAC existantes, après migration, se lisent dans Chrome et
  affichent la pochette d'« Endless » et le sous-titre « Frank Ocean · Endless ».
- Un FLAC de plus de 25 Mo s'importe et se lit.
- `bun test` et `ng test` passent.
- `API_CONTRACT.md` décrit les nouveaux champs et la route `/cover`.
