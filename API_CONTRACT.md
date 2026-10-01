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
