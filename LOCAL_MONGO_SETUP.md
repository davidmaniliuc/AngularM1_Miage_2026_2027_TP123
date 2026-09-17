# Lancer tout le projet avec Docker (alternative à Atlas)

Ce document **remplace `ATLAS_SETUP.md`** si vous préférez travailler en local
plutôt qu'avec un cluster MongoDB Atlas. `ATLAS_SETUP.md` reste valable et n'a
pas été modifié : les deux approches sont interchangeables, car le backend ne
connaît que la variable `MONGODB_URI`.

Ici, **les trois briques tournent dans Docker** : la base, le backend et le
frontend. Le runtime JavaScript utilisé dans les conteneurs est **Bun**, pas Node.

Prérequis : Docker Desktop installé et démarré. Ni Node ni Bun ne sont
nécessaires sur votre machine.

## 1. Configurer le backend

Dans le dossier `backend` :

```bash
cp .env.local.example .env
```

Puis remplacez `JWT_SECRET` par une valeur locale longue et aléatoire.

Le `MONGODB_URI` de ce fichier (`mongodb://127.0.0.1:27017/...`) sert pour un
lancement **hors Docker**. Quand vous passez par Docker, `docker-compose.yml`
impose `mongodb://mongo:27017/guitar-practice-cloud` : dans le réseau Docker, la
base s'appelle `mongo`, et non `127.0.0.1`. Cette valeur est prioritaire sur
celle du `.env`, il n'y a donc rien à changer quand vous alternez entre les deux
modes.

Il n'y a aucune étape "Network Access" ni "Database User" à faire, contrairement
à Atlas : l'instance n'a ni utilisateur ni mot de passe, et n'écoute que sur
`127.0.0.1`.

## 2. Tout lancer

Depuis la racine du projet :

```bash
docker compose up -d
```

| Service             | Adresse                   | Rôle                                                      |
| ------------------- | ------------------------- | --------------------------------------------------------- |
| `gpc-mongo`         | `localhost:27017`         | La base MongoDB                                            |
| `gpc-backend`       | http://localhost:3000     | L'API Express, exécutée par Bun                            |
| `gpc-frontend`      | http://localhost:4200     | Le serveur de développement Angular, exécuté par Bun       |
| `gpc-mongo-express` | http://localhost:8081     | Interface web, équivalent du "Browse Collections" d'Atlas  |

Le premier démarrage est le plus long : Bun doit installer les dépendances des
deux projets. Suivez la progression avec :

```bash
docker compose logs -f backend frontend
```

Vérifier l'état : `docker compose ps`. La colonne `STATUS` de `gpc-mongo` doit
afficher `(healthy)`.

## 3. Vérifier que tout répond

- http://localhost:3000/api/health doit renvoyer `{"status":"ok"}` ;
- http://localhost:4200 doit afficher l'application Angular ;
- http://localhost:4200/api/health doit aussi renvoyer `{"status":"ok"}` : cela
  prouve que le proxy Angular atteint bien le backend.

Remarque : au démarrage, le backend affiche `[startup] Connecté à MongoDB Atlas`.
Ce message est codé en dur dans `backend/src/server.js` et n'a pas été modifié ;
avec cette configuration, la connexion se fait bien sur la base locale.

## 4. Vérifier les données

Le backend crée automatiquement le compte de démonstration
`demo@example.com` / `Demo1234!`.

Deux façons de le vérifier :

- **Interface web** : ouvrez http://localhost:8081, puis la base
  `guitar-practice-cloud`. Vous devez y voir les collections `tracks` et `users`,
  et un utilisateur `Demo` dans `users`.
- **Ligne de commande** :

  ```bash
  docker exec gpc-mongo mongosh --quiet guitar-practice-cloud \
    --eval 'db.getCollectionNames()'
  ```

## 5. Travailler au quotidien

Le code est monté dans les conteneurs : **vous éditez les fichiers normalement
dans votre IDE**, et le rechargement automatique fonctionne des deux côtés.

- Frontend : `ng serve` reconstruit le bundle à chaque sauvegarde ;
- Backend : `bun --watch` redémarre l'API à chaque sauvegarde.

Les `node_modules` vivent dans des volumes Docker séparés, afin que les
dépendances Linux des conteneurs n'écrasent pas celles de votre machine.

Si vous ajoutez une dépendance dans un `package.json`, recréez le conteneur
concerné pour relancer l'installation :

```bash
docker compose up -d --force-recreate backend    # ou frontend
```

## Cycle de vie

```bash
docker compose stop     # tout arrêter sans perdre les données
docker compose up -d    # redémarrer
docker compose down     # supprimer les conteneurs, garder les données
docker compose down -v  # TOUT supprimer, y compris les données et les node_modules
```

Les données sont stockées dans le volume Docker `mongo-data` et survivent donc
aux redémarrages.

## Lancer sans Docker

Le mode "classique" du TP reste possible. Laissez uniquement la base dans Docker :

```bash
docker compose up -d mongo mongo-express
cd backend && npm install && npm start
cd frontend-starter && npm install && npm start
```

Dans ce cas c'est le `MONGODB_URI` du `.env` (`127.0.0.1:27017`) qui s'applique,
et `proxy.conf.json` cible `http://localhost:3000` : rien à modifier.

## Revenir à MongoDB Atlas

Remettez l'URI `mongodb+srv://...` dans `backend/.env`, lancez le backend hors
Docker (`npm start`), et arrêtez les conteneurs. Rien d'autre à changer.

## À propos des deux fichiers de proxy

| Fichier                  | Cible                   | Utilisé quand                     |
| ------------------------ | ----------------------- | --------------------------------- |
| `proxy.conf.json`        | `http://localhost:3000` | lancement local (`npm start`)     |
| `proxy.conf.docker.json` | `http://backend:3000`   | lancement via `docker compose`    |

`proxy.conf.json`, celui mentionné dans le sujet, n'a pas été modifié.

## Diagnostic rapide

- `ECONNREFUSED 127.0.0.1:27017` : vous lancez le backend hors Docker alors que la
  base est arrêtée. Faites `docker compose up -d mongo` ;
- `port is already allocated` : un service occupe déjà 27017, 3000 ou 4200 sur
  votre machine. Arrêtez-le, ou changez le port publié dans `docker-compose.yml` ;
- le frontend répond mais pas `/api` : le backend n'est pas démarré, regardez
  `docker compose logs backend` ;
- `MONGODB_URI manque dans backend/.env` : le fichier `.env` est absent, refaites
  `cp .env.local.example .env`.

## Pourquoi Bun 1.4.2 et pas `bun:1`

L'image `oven/bun:1` (Bun 1.3.x) **ne fait pas tourner ce backend** : la
bibliothèque `bson`, utilisée par Mongoose, appelle une API Node
(`node:v8 isBuildingSnapshot`) que Bun 1.3 n'implémente pas, et le serveur plante
au démarrage. La version est donc figée à `oven/bun:1.4.2`, où cette API existe.
Ne remplacez pas ce tag par `oven/bun:1`.

## Sécurité

Les règles du TP restent valables : ne publiez jamais un `JWT_SECRET`, ni une URI
Atlas, dans Angular, Git, une capture d'écran ou un prompt envoyé à un assistant IA.
Tous les fichiers `.env*` contenant des secrets sont ignorés par Git.
