# MongoDB en local avec Docker (alternative à Atlas)

Ce document **remplace `ATLAS_SETUP.md`** si vous préférez travailler avec une base
MongoDB locale plutôt qu'avec un cluster MongoDB Atlas. `ATLAS_SETUP.md` reste
valable et n'a pas été modifié : les deux approches sont interchangeables, car le
backend ne connaît que la variable `MONGODB_URI`.

Prérequis : Docker Desktop installé et démarré.

## 1. Lancer la base

Depuis la racine du projet :

```bash
docker compose up -d
```

Deux conteneurs démarrent :

| Service         | Adresse                  | Rôle                                              |
| --------------- | ------------------------ | ------------------------------------------------- |
| `gpc-mongo`     | `localhost:27017`        | La base MongoDB                                   |
| `gpc-mongo-express` | http://localhost:8081 | Interface web, équivalent du "Browse Collections" d'Atlas |

Vérifier que la base est saine :

```bash
docker compose ps
```

La colonne `STATUS` de `gpc-mongo` doit afficher `(healthy)`.

## 2. Configurer le backend

Dans le dossier `backend` :

```bash
cp .env.local.example .env
```

Puis remplacez `JWT_SECRET` par une valeur locale longue et aléatoire.

L'URI est :

```text
mongodb://127.0.0.1:27017/guitar-practice-cloud
```

Pas d'utilisateur ni de mot de passe : l'instance n'écoute que sur `127.0.0.1`
et n'est donc pas joignable depuis l'extérieur de votre machine.

Il n'y a aucune étape "Network Access" ni "Database User" à faire, contrairement
à Atlas.

## 3. Tester le backend

```bash
cd backend
npm install
npm start
```

Ouvrez http://localhost:3000/api/health : la réponse doit être `{"status":"ok"}`.

Remarque : au démarrage, le backend affiche `[startup] Connecté à MongoDB Atlas`.
Ce message est codé en dur dans `src/server.js` et n'a pas été modifié ; avec cette
configuration, la connexion se fait bien sur la base locale.

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

## 5. Tester le frontend

Dans un autre terminal, backend toujours lancé :

```bash
cd frontend-starter
npm install
npm start
```

L'application est servie sur http://localhost:4200. Le fichier
`frontend-starter/proxy.conf.json` cible déjà `http://localhost:3000`, ce qui
correspond au `PORT=3000` du backend : aucune modification n'est nécessaire.
Si vous changez le port du backend, adaptez `target` en conséquence.

## Cycle de vie de la base

```bash
docker compose stop     # arrêter sans perdre les données
docker compose up -d    # redémarrer
docker compose down     # supprimer les conteneurs, garder les données
docker compose down -v  # TOUT supprimer, y compris les données
```

Les données sont stockées dans le volume Docker `mongo-data` et survivent donc
aux redémarrages.

## Revenir à MongoDB Atlas

Remettez l'URI `mongodb+srv://...` dans `backend/.env` et relancez le backend.
Rien d'autre à changer.

## Diagnostic rapide

- `ECONNREFUSED 127.0.0.1:27017` : la base n'est pas lancée, faites `docker compose up -d` ;
- `port is already allocated` : un MongoDB tourne déjà sur votre machine, arrêtez-le
  ou changez le port publié dans `docker-compose.yml` (et dans `MONGODB_URI`) ;
- `MONGODB_URI manque dans backend/.env` : le fichier `.env` est absent, refaites
  `cp .env.local.example .env`.

## Sécurité

Les règles du TP restent valables : ne publiez jamais un `JWT_SECRET`, ni une URI
Atlas, dans Angular, Git, une capture d'écran ou un prompt envoyé à un assistant IA.
Tous les fichiers `.env*` contenant des secrets sont ignorés par Git.
