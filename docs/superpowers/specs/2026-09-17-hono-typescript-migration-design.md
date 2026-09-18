# Migration du backend vers Hono + TypeScript

Date : 2026-09-17
Statut : validé, prêt pour le plan d'implémentation

## Objectif

Remplacer le backend Express/JavaScript par une API Hono écrite en TypeScript,
exécutée par Bun, **sans modifier le contrat HTTP**. `API_CONTRACT.md` ne change
pas : c'est le critère de réussite de la migration.

## Décisions validées

| Sujet | Décision |
|---|---|
| Runtime | Bun uniquement, pas d'étape de build (Bun exécute `.ts` nativement) |
| Adaptateur | `export default { port, fetch }` (serveur Bun natif), pas `@hono/node-server` |
| Organisation | Découpage en modules : `routes/`, `middleware/`, `lib/`, `models/` |
| Tests | Suite de contrat complète sur les 9 routes, contre le MongoDB de docker-compose |
| Handouts | `SUJET_ETUDIANT_TP*.md` et `CONSEILS_POUR_UTIISER_ASSISTANT_AI.md` non modifiés |

Versions vérifiées à la conception : Bun 1.4.2, Hono 4.13.8, Mongoose 9.10.1,
bcryptjs 3.0.3.

## Dépendances

Retirées : `express`, `cors`, `multer`, `jsonwebtoken`.
Conservées : `mongoose`, `bcryptjs` (les deux embarquent leurs propres types).
Ajoutée : `hono`.
Dev : `typescript`, `@types/bun`.

CORS et JWT proviennent du cœur de Hono (`hono/cors`, `hono/jwt`). Le multipart
provient de `c.req.parseBody()`. Multer disparaît complètement.

Les jetons restent compatibles : `hono/jwt` vérifie un jeton signé par
`jsonwebtoken` et inversement (même HS256, même secret). Aucun utilisateur
connecté n'est déconnecté par la migration. Vérifié par un probe jetable pendant
la conception.

## Arborescence cible

```
backend/
  package.json             scripts Bun
  tsconfig.json            nouveau : strict, moduleResolution bundler, noEmit
  src/
    config.ts              PORT, MONGODB_URI, JWT_SECRET, UPLOADS_DIR,
                           MAX_FILE_SIZE, ALLOWED_MIME
    types.ts               AppEnv (Variables Hono), PublicUser, PublicTrack, Page<T>
    app.ts                 createApp() : logger -> cors -> routes -> onError
    server.ts              connexion Mongo + compte démo + export default
    middleware/
      auth.ts              requireAuth -> c.set("auth", payload)
      request-log.ts       remplace le logger res.on("finish")
    lib/
      jwt.ts               createToken / verifyToken
      uploads.ts           création du dossier, validateAudio, saveAudio, removeAudio
    routes/
      health.ts            GET /api/health
      auth.ts              POST /api/auth/register, POST /api/auth/login
      users.ts             GET /api/users/me, PUT /api/users/me
      tracks.ts            GET /api/tracks, POST /api/tracks,
                           GET /api/tracks/:id/audio, DELETE /api/tracks/:id
    models/
      User.ts              schéma + toPublic() typé
      Track.ts             schéma + toPublic() typé
  test/
    helpers.ts             connexion base de test, purge des collections, requête authentifiée
    contract.test.ts       les 9 routes
    models.test.ts         test de schéma porté depuis api.test.js
```

Les commentaires pédagogiques français suivent leur code. Toute explication de
`app.js` est reprise à côté de son équivalent Hono, et réécrite lorsqu'elle
décrivait un détail propre à Express ou à Multer.

## Correspondance Express -> Hono

| Express | Hono |
|---|---|
| `express.json()` global | `await c.req.json()` par route (Hono n'a pas de parseur global) |
| `req.body` | `await c.req.json()` ou `await c.req.parseBody()` |
| `req.query.page` | `c.req.query("page")` |
| `req.params.id` | `c.req.param("id")` |
| `res.status(400).json(x)` | `return c.json(x, 400)` |
| `res.status(204).end()` | `return c.body(null, 204)` |
| `cors()` | `cors()` de `hono/cors` |
| `req.auth = …; next()` | `c.set("auth", …)`, typé via `Hono<AppEnv>` |
| `next(error)` + middleware d'erreur | `throw new HTTPException(…)` + `app.onError` |
| `upload.single("audio")` | `parseBody()` -> `File`, contrôle taille/MIME, `Bun.write` |
| `res.sendFile(path)` | `c.body(Bun.file(path).stream())` |
| `res.on("finish")` | middleware : `await next()` puis log de `c.res.status` |

## Contrat HTTP préservé

Les 9 routes, leurs méthodes, leurs corps et tous leurs codes de statut restent
identiques : 200, 201, 204, 400, 401, 404, 409.

- `GET /api/health` -> `{ status: "ok" }`, sans authentification ni MongoDB.
- `POST /api/auth/register` -> 201 `{token, user}` ; 400 si nom, email ou mot de
  passe de 8 caractères manquant ; 409 si l'email existe déjà.
- `POST /api/auth/login` -> 200 `{token, user}` ; 401 si identifiants incorrects.
- `GET /api/users/me` -> 200 `User` ; 401 sans jeton valide ; 404 si inconnu.
- `PUT /api/users/me` -> 200 `User` ; 404 si inconnu.
- `GET /api/tracks?page&limit` -> `Page<Track>` ; `page` minimum 1, `limit` borné
  entre 1 et 20, défaut 5 ; tri `createdAt` décroissant ; filtré sur `ownerId`.
- `POST /api/tracks` -> 201 `Track` ; 400 sans fichier, type refusé ou trop gros.
- `GET /api/tracks/:id/audio` -> flux audio ; 404 si la piste n'appartient pas à
  l'utilisateur.
- `DELETE /api/tracks/:id` -> 204 ; 404 si inconnue ; 500 si la métadonnée est
  supprimée mais pas le fichier.

`storedName` n'est jamais exposé. `passwordHash` n'est jamais renvoyé.

## Écarts de comportement assumés

### 1. Le contrôle de taille d'upload se déplace après la réception

Multer coupait le flux à 25 Mo pendant l'écriture. `c.req.parseBody()` met tout
le corps multipart en mémoire avant que la taille puisse être lue.

Mitigation retenue : lire l'en-tête `Content-Length` **avant** d'appeler
`parseBody()` et répondre 400 immédiatement s'il dépasse la limite. Le contrôle
sur `file.size` reste ensuite comme filet de sécurité. Le résultat HTTP est
inchangé (400, « Fichier trop volumineux »). Écrire un parseur multipart en flux
n'est pas justifié pour ce TP.

### 2. Les erreurs JWT ne doivent jamais être journalisées telles quelles

`JwtTokenExpired.message` de `hono/jwt` **contient le jeton complet** (vérifié
pendant la conception). Journaliser l'objet d'erreur ferait fuiter un jeton dans
les logs, ce qu'interdit `AGENTS.md`.

Règle : `lib/jwt.ts` et `middleware/auth.ts` ne journalisent que le nom de la
classe d'erreur (`JwtTokenExpired`, `JwtTokenInvalid`), jamais `error.message`,
jamais l'objet complet.

### 3. Les erreurs 500 inattendues deviennent du JSON

Express terminait par sa page d'erreur HTML par défaut. `app.onError` renvoie
`{ "message": "Erreur interne du serveur" }`. Plus cohérent pour un client
Angular, mais c'est un changement.

## Gestion des erreurs

`app.onError` centralise, dans cet ordre :

1. `HTTPException` -> son statut et son message.
2. Mongoose `ValidationError` -> 400 avec le message de validation.
3. Mongoose `CastError` -> 404 « Ressource inconnue » (couvre un `:id` malformé).
4. Sinon -> 500 « Erreur interne du serveur », l'erreur complète étant
   journalisée côté serveur uniquement.

Aucun `catch` vide. Aucune stack renvoyée au client.

## Upload : flux détaillé

```
multipart/form-data
  -> contrôle Content-Length (400 si > 25 Mo)
  -> c.req.parseBody()
  -> le champ "audio" doit être une instance de File (400 sinon)
  -> contrôle du type MIME contre ALLOWED_MIME (400 sinon)
  -> contrôle de file.size (400 sinon)
  -> nom de stockage = crypto.randomUUID() + extension d'origine en minuscules
  -> Bun.write(UPLOADS_DIR/storedName, file)
  -> Track.create(métadonnées)
  -> 201 track.toPublic()
```

Si `Track.create` échoue après l'écriture, le fichier orphelin est supprimé et
l'échec du nettoyage est journalisé, comme dans la version Express.

Types MIME acceptés, inchangés : `audio/mpeg`, `audio/wav`, `audio/x-wav`,
`audio/ogg`, `audio/mp4`, `audio/x-m4a`. Taille maximale : 25 Mo.

## Tests

`bun test`, en appelant `app.fetch(new Request(...))` directement : pas de port
ouvert, pas de supertest.

- Base dédiée `guitar-practice-cloud-test`, distincte de la base de développement.
- Collections purgées entre les tests.
- `UPLOADS_DIR` pointe sur un dossier temporaire, supprimé à la fin.
- Prérequis : `docker compose up -d mongo`.

Couverture :

- `health` sans MongoDB.
- `register` : succès, 400 (champs manquants, mot de passe trop court), 409.
- `login` : succès, 401 mauvais mot de passe, 401 email inconnu.
- `users/me` : 200, 401 sans en-tête, 401 jeton invalide, PUT du nom.
- `tracks` : pagination, bornage de `limit`, isolation entre propriétaires.
- `POST tracks` : succès, 400 sans fichier, 400 type refusé, 400 trop gros.
- `tracks/:id/audio` : 200 avec le bon Content-Type, 404 sur la piste d'autrui.
- `DELETE tracks/:id` : 204, puis 404, et le fichier disparaît du disque.
- Schémas Mongoose : normalisation de l'email en minuscules, relation `ownerId`.

## Fichiers hors `src/` à mettre à jour

- `docker-compose.yml` : `src/server.js` -> `src/server.ts`.
- `backend/package.json` : `start`, `dev`, `test`, `typecheck` en Bun.
- `backend/AGENTS.md`, `backend/CLAUDE.md`, `backend/GEMINI.md` : Express -> Hono,
  Multer -> `parseBody`, JavaScript -> TypeScript.
- `backend/best-practices.md` : sections « Express : routes et middlewares » et
  « Multer et les uploads » réécrites pour Hono.
- `LOCAL_MONGO_SETUP.md` : « L'API Express » et la référence à `src/server.js`.
- `README.md` ligne 57 : liste des technologies enseignées.

Non modifiés, ce sont des énoncés de cours : `SUJET_ETUDIANT_TP1.md`,
`SUJET_ETUDIANT_TP2.md`, `SUJET_ETUDIANT_TP3.md`,
`CONSEILS_POUR_UTIISER_ASSISTANT_AI.md`. `SUJET_ETUDIANT_TP1.md` continuera donc
de mentionner « API Express ».

`API_CONTRACT.md` n'est pas modifié : c'est le résultat attendu.

## Critères de réussite

1. `bun run typecheck` passe sans erreur, en mode strict.
2. `bun test` passe, suite de contrat comprise.
3. `docker compose up -d` démarre la stack et `GET /api/health` répond 200.
4. Le frontend Angular fonctionne sans aucune modification : connexion,
   inscription, profil, liste paginée, upload, lecture audio, suppression.
5. `API_CONTRACT.md` est inchangé.
6. Plus aucune référence à `express`, `multer`, `jsonwebtoken` ou `cors` dans
   `backend/package.json`.
7. Aucun fichier `.js` restant dans `backend/src/` ni `backend/test/`.
