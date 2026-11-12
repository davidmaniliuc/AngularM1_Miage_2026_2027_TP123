# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5&scope=mine` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` (facultatif), `visibility` (facultatif) | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT | image (JPEG, PNG ou WebP) |
| PATCH | `/tracks/:id` | `{visibility}` + JWT | `200 Track` |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |
| GET | `/games` | JWT ; query : `q`, `region`, `genre`, `favorite`, `sort`, `order`, `page`, `limit` | `200 Page<Game>` |
| POST | `/games` | multipart : `title`, `serial`, `genre`, `region`, `year`, `favorite`, `cover` | `201 Game` |
| GET | `/games/:id` | JWT | `200 Game` |
| PATCH | `/games/:id` | multipart : `title`, `serial`, `genre`, `region`, `year`, `favorite`, `cover`, `removeCover` | `200 Game` |
| GET | `/games/:id/cover` | JWT | image (JPEG, PNG ou WebP) |
| DELETE | `/games/:id` | JWT | `204` |

Formats acceptés : MP3, WAV, OGG, M4A (AAC ou ALAC) et FLAC, 100 Mo maximum.
Le format est déterminé par le contenu du fichier, pas par le type MIME envoyé.
Un M4A en ALAC est converti en FLAC à l'upload : la piste renvoyée a alors
`mimeType: "audio/flac"` et `transcodedFrom: "alac"`.

Sans `title`, le titre est le tag `title` du fichier, sinon son nom.

## Pistes privées et publiques

Chaque piste a un champ `visibility` : `"private"` (défaut) ou `"public"`.

- Une piste **privée** n'est visible que par son propriétaire : pour les autres, `audio` et `cover` répondent `404`, comme si elle n'existait pas.
- Une piste **publique** peut être listée (`scope=others` ou `all`) et écoutée (`audio`, `cover`) par tout utilisateur connecté.
- Seul le propriétaire peut changer la visibilité (`PATCH`) ou supprimer la piste (`DELETE`), même si elle est publique.

À l'upload, le champ multipart `visibility=public` rend la piste publique ; toute autre valeur ou son absence la laisse privée. Les pistes créées avant cette option n'ont pas le champ et sont traitées comme privées.

## `GET /tracks` — liste paginée

La pagination est calculée côté serveur par le plugin Mongoose `mongoose-aggregate-paginate-v2` : une seule agrégation MongoDB lit la page demandée et compte le total (`$facet`).

- **Authentification** : JWT obligatoire.
- **Paramètres de requête** (optionnels) :
  - `scope` : pistes renvoyées. `mine` (défaut) : toutes les pistes de l'utilisateur du jeton, privées et publiques ; `others` : les pistes publiques des autres utilisateurs ; `all` : les deux. Une valeur inconnue donne `mine`. Sans `scope`, le comportement est celui du TP2.
  - `page` : numéro de page à partir de 1. Défaut `1`. Une valeur absente, non numérique ou inférieure à 1 donne `1`.
  - `limit` : nombre de pistes par page. Défaut `5`, borné entre `1` et `20`. Une valeur non numérique donne `5`.
- **Tri** : de la piste la plus récente à la plus ancienne (`createdAt` décroissant).
- **Réponse** `200 Page<Track>` :

| Champ | Type | Description |
|---|---|---|
| `items` | `Track[]` | Pistes de la page. Chaque `Track` contient `id`, `ownerId`, `title`, `originalName`, `mimeType` (type du fichier stocké), `size` (octets), `createdAt`, `hasCover` (booléen), `visibility`, `ownerName` (nom du propriétaire) et, s'ils existent, `artist`, `album` et `transcodedFrom`. |
| `page` | `number` | Page renvoyée (après bornage). |
| `limit` | `number` | Taille de page appliquée (après bornage). |
| `total` | `number` | Nombre total de pistes correspondant au `scope`. |
| `pages` | `number` | Nombre total de pages, `1` minimum même si la liste est vide. |
| `pagingCounter` | `number` | Position (à partir de 1) du premier élément de la page dans la liste complète. |
| `hasPrevPage` | `boolean` | Une page précédente existe. |
| `hasNextPage` | `boolean` | Une page suivante existe. |
| `prevPage` | `number \| null` | Numéro de la page précédente, ou `null`. |
| `nextPage` | `number \| null` | Numéro de la page suivante, ou `null`. |

Les cinq premiers champs existaient déjà ; les cinq suivants ont été ajoutés avec le plugin. Le changement est rétrocompatible : un client qui ne lit que les cinq premiers continue de fonctionner.

Exemple : `GET /api/tracks?page=2&limit=5` pour 7 pistes :

```json
{
  "items": [{ "id": "…", "ownerId": "…", "title": "Piste 2", "originalName": "piste-2.mp3", "mimeType": "audio/mpeg", "size": 3605337, "hasCover": false, "createdAt": "2026-09-24T08:00:00.000Z" }],
  "page": 2, "limit": 5, "total": 7, "pages": 2,
  "pagingCounter": 6, "hasPrevPage": true, "hasNextPage": false, "prevPage": 1, "nextPage": null
}
```

Une page au-delà de la dernière renvoie `items: []` avec les métadonnées correspondantes.

- **Erreurs** : `401 {"message":"Authentification requise"}` sans jeton, avec un jeton invalide ou expiré, ou si le jeton ne contient pas d'identifiant utilisateur valide.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.

## `GET /tracks/:id/cover` — pochette

Pochette extraite du fichier audio (tag ID3 `APIC`, atome MP4 `covr` ou bloc
FLAC `PICTURE`). Réservée au propriétaire, sauf si la piste est publique.

- `200` : binaire de l'image, avec `Content-Type` (`image/jpeg`, `image/png` ou
  `image/webp`), `Content-Length`, `Cache-Control: private, max-age=86400` et
  `X-Content-Type-Options: nosniff`.
- `404 { "message": "Pochette inconnue" }` : identifiant invalide, piste privée
  d'un autre utilisateur, piste sans pochette (`hasCover: false`) ou fichier absent.
- `401` sans jeton.

Une balise `<img src>` ne peut pas envoyer l'en-tête `Authorization` : le
frontend télécharge l'image en `Blob`, puis l'affiche avec un ObjectURL.

## `PATCH /tracks/:id` — visibilité

Rend une piste publique ou privée.

- **Authentification** : JWT obligatoire. Seul le propriétaire peut modifier sa piste.
- **Corps** JSON : `{ "visibility": "public" }` ou `{ "visibility": "private" }`.
- `200 Track` : la piste mise à jour.
- `400 { "message": "visibility doit valoir private ou public" }` : corps absent, JSON invalide ou valeur inconnue.
- `404 { "message": "Piste inconnue" }` : identifiant invalide, piste inexistante ou appartenant à un autre utilisateur (même publique).
- `401` sans jeton.

## Jeux (`/games`)

Un jeu appartient à son créateur : les autres utilisateurs ne le voient pas (`404` sur toutes les routes). Tous les accès exigent un JWT (`401` sinon).

`Game` : `id`, `ownerId`, `title`, `favorite` (booléen), `hasCover` (booléen), `createdAt` et, s'ils existent, `serial`, `genre`, `region`, `year` et `disc`.

- `serial` : numéro de série PS1, quatre lettres, un tiret, cinq chiffres (`SCUS-94163`). Les minuscules sont mises en majuscules.
- `genre` : `rpg`, `course`, `plateforme`, `action`, `aventure`, `combat`, `sport`, `puzzle`, `strategie` ou `autre`.
- `region` : `ntsc-u`, `ntsc-j` ou `pal`.
- `year` : entier de 1994 à 2100.
- `favorite` : `true` ou `false` (faux par défaut).
- `cover` : image JPEG, PNG ou WebP de 5 Mo maximum, identifiée par son contenu.
- `disc` : l'image disque envoyée par `POST /games/disc`, `{ "name": "suikoden.chd", "size": 329653141, "format": "chd" | "bin", "cue"?: "FILE ..." }`. `cue` n'existe que pour un `.bin` envoyé avec son `.cue`.

`POST /games` et `PATCH /games/:id` reçoivent un formulaire multipart. `title` est obligatoire à la création. Au `PATCH`, un champ absent ne change pas ; `serial`, `genre`, `region` ou `year` vide l'efface ; `cover` remplace la pochette et `removeCover=true` la retire.

`GET /games` renvoie une page de mes jeux (même enveloppe que `GET /tracks`). Paramètres, tous facultatifs :

- `q` : recherche, sans casse, dans le titre ou le numéro de série ;
- `region`, `genre` : filtre exact (`400` si la valeur est inconnue) ;
- `favorite=true` : seulement les favoris ;
- `sort` : `title` (insensible à la casse), `year` ou `added` (date d'ajout, défaut) ; `order` : `asc` ou `desc` (défaut : `asc` pour `title`, `desc` sinon). Les jeux sans année passent en premier en tri croissant et en dernier en tri décroissant ;
- `page` (défaut 1) et `limit` (défaut 24, maximum 60).

Les filtres se combinent entre eux et avec la pagination ; `total` compte les jeux filtrés.

`GET /games/:id/cover` renvoie l'image avec `Content-Type`, `Cache-Control: private, max-age=86400` et `X-Content-Type-Options: nosniff`. `404 { "message": "Pochette inconnue" }` si le jeu n'a pas de pochette.

Erreurs : `400 { "message": "Le titre est obligatoire" }`, `"Numéro de série invalide (ex. SCUS-94163)"`, `"Genre inconnu"`, `"Région inconnue"`, `"Année invalide (1994 à 2100)"` ou `"Pochette invalide (JPEG, PNG ou WebP, 5 Mo maximum)"` ; `404 { "message": "Jeu inconnu" }` (identifiant invalide, inexistant ou d'un autre utilisateur).

### `POST /games/disc` — créer un jeu depuis son image disque

JWT obligatoire. Le corps est **le fichier lui-même** (`Content-Type: application/octet-stream`), pas un formulaire multipart : le serveur l'écrit sur le disque au fil de l'eau, sans le charger en mémoire.

- `?name=` (obligatoire) : nom du fichier, qui finit par `.chd` ou `.bin`. Le `.chd` est conseillé (deux à trois fois plus petit).
- En-tête `X-Cue` (facultatif, `.bin` seulement) : le texte du `.cue`, en UTF-8 encodé en base64. Il est gardé avec le jeu pour l'émulateur.
- Taille maximale : 1 Go (la limite de 100 Mo des pistes audio ne change pas).

Le serveur lit l'image avec `identifyDisc` (`@davidmaniliuc/substation`) et remplit `title` (titre catalogué, sinon volume du disque, sinon nom du fichier), `region` et `serial`. Réponse `201` : le `Game` créé.

Erreurs `400` :

- `{ "message": "Envoyez un .chd, un .bin seul ou un .cue avec son .bin" }` : `name` absent ou autre extension ;
- `{ "message": "Fichier du jeu requis" }` : corps absent ou vide ;
- `{ "message": "Fichier trop volumineux (1 Go maximum)" }` ;
- `{ "message": "Fichier .cue illisible" }` : `X-Cue` n'est pas du base64 UTF-8 ou dépasse 64 Ko ;
- `{ "message": "...", "code": "MULTI_FILE_CUE" }` : le `.cue` référence plusieurs fichiers `.bin` ; le message conseille de convertir en `.chd` ;
- `{ "message": "...", "code": "BAD_CHD" | "BAD_CUE" | ... }` : image refusée par `identifyDisc`.

### `GET /games/:id/disc` — télécharger l'image

JWT obligatoire, propriétaire seulement. `200` avec le fichier (`application/octet-stream`, `Content-Length`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`). `404 { "message": "Fichier du jeu inconnu" }` si le jeu n'a pas d'image, n'existe pas ou appartient à un autre compte.

`DELETE /games/:id` supprime aussi l'image disque.
