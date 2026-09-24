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
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

Formats acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum.

## `GET /tracks` — liste paginée

La pagination est calculée côté serveur par le plugin Mongoose `mongoose-aggregate-paginate-v2` : une seule agrégation MongoDB lit la page demandée et compte le total (`$facet`).

- **Authentification** : JWT obligatoire. Seules les pistes de l'utilisateur du jeton sont renvoyées.
- **Paramètres de requête** (optionnels) :
  - `page` : numéro de page à partir de 1. Défaut `1`. Une valeur absente, non numérique ou inférieure à 1 donne `1`.
  - `limit` : nombre de pistes par page. Défaut `5`, borné entre `1` et `20`. Une valeur non numérique donne `5`.
- **Tri** : de la piste la plus récente à la plus ancienne (`createdAt` décroissant).
- **Réponse** `200 Page<Track>` :

| Champ | Type | Description |
|---|---|---|
| `items` | `Track[]` | Pistes de la page. Chaque `Track` contient `id`, `ownerId`, `title`, `originalName`, `mimeType`, `size` (octets) et `createdAt`. |
| `page` | `number` | Page renvoyée (après bornage). |
| `limit` | `number` | Taille de page appliquée (après bornage). |
| `total` | `number` | Nombre total de pistes de l'utilisateur. |
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
  "items": [{ "id": "…", "ownerId": "…", "title": "Piste 2", "originalName": "piste-2.mp3", "mimeType": "audio/mpeg", "size": 3605337, "createdAt": "2026-09-24T08:00:00.000Z" }],
  "page": 2, "limit": 5, "total": 7, "pages": 2,
  "pagingCounter": 6, "hasPrevPage": true, "hasNextPage": false, "prevPage": 1, "nextPage": null
}
```

Une page au-delà de la dernière renvoie `items: []` avec les métadonnées correspondantes.

- **Erreurs** : `401 {"message":"Authentification requise"}` sans jeton, avec un jeton invalide ou expiré, ou si le jeton ne contient pas d'identifiant utilisateur valide.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.
