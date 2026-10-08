# PS1 Library — projet étudiant

L’application évolue vers une bibliothèque de jeux PS1. Cette première étape
permet de créer, consulter, modifier, rechercher et supprimer des fiches
privées (titre, description, région et année), enregistrées dans MongoDB.
La page d’accueil et la connexion ouvrent `/games`. La bibliothèque musicale
reste accessible via **Musique** (`/tracks`) ; ses données sont conservées.

Les comptes existants fonctionnent sans migration. La collection `games` est
créée lors du premier ajout. Aucun fichier de jeu ou BIOS n’est envoyé et
l’émulateur WASM n’est pas encore intégré : cette étape ne dépend pas de sa
publication npm. Voir [PROJECT_CONCEPT.md](PROJECT_CONCEPT.md) pour la suite.

Ce dépôt contient uniquement les ressources nécessaires aux trois TP :
`backend/` et `frontend-starter/`, ainsi que les sujets et documents utiles.

## Prérequis

- Bun 1.4 ou plus récent (ou Docker, qui fournit Bun) ;
- un compte MongoDB Atlas par binôme ;
- Git et un navigateur récent.
- Un IDE de qualité
- Recommandé : un abonnement à un 

Consulter [ATLAS_SETUP.md](ATLAS_SETUP.md) pour créer la base de données.

## Démarrer le backend

```bash
cd backend
cp .env.example .env
```

Renseigner dans `.env` l’URI MongoDB Atlas et le secret JWT. Ne jamais publier
ce fichier ni copier un secret dans le code Angular.

Hors de Docker, le backend a besoin de **ffmpeg** pour convertir les fichiers
ALAC (Apple Lossless) en FLAC : `brew install ffmpeg` sur macOS,
`sudo apt install ffmpeg` sur Debian/Ubuntu. Dans Docker, l'image du backend
l'installe déjà.

Après une mise à jour, les pistes importées avant l'ajout des pochettes se
migrent avec `npm run migrate:media`.

```bash
npm install
npm start
```

Le backend écoute normalement sur `http://localhost:3000`.

## Démarrer le frontend

Dans un autre terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Le compte de démonstration est
`demo@example.com` / `Demo1234!`.

## Vérifier la bibliothèque de jeux

Connectez-vous, ajoutez une fiche, rechargez la page, recherchez son titre,
puis ouvrez-la pour modifier ses informations ou la supprimer après
confirmation. Un autre compte ne peut ni voir ni modifier cette fiche.
Vérifiez également le thème clair/sombre et le lien **Musique**.

Tests (MongoDB local doit être démarré) :

```bash
cd backend
bun run typecheck
bun test
```

```bash
cd frontend-starter
npm test
npm run build
```

Depuis la racine avec Docker, les tests backend utilisent une base séparée :

```bash
docker compose exec -e TEST_MONGODB_URI=mongodb://mongo:27017/guitar-practice-cloud-test backend bun test
```

## Données de démonstration

Pour ajouter 24 pistes de pratique et trois comptes dans la base configurée :

```bash
cd backend
bun run seed
```

Avec la stack Docker déjà démarrée, depuis la racine :

```bash
docker compose exec backend bun run seed
```

Comptes : `demo@example.com` (12 pistes), `camille@example.com` et
`lucas@example.com` (6 pistes chacun). Les nouveaux comptes utilisent le mot
de passe de démonstration `Demo1234!`. Les comptes déjà présents conservent
leur nom et leur mot de passe.

Chaque bibliothèque mélange pistes publiques et privées, avec des titres,
artistes, albums et dates variés. Les WAV sont des motifs **synthétiques de
8 secondes**, sans pochette, générés localement : aucun téléchargement ni
ffmpeg nécessaire. Les titres illustrent des exercices ; les sons sont des
échantillons de démonstration, pas des enregistrements de ces exercices.

Le script écrit dans la base `MONGODB_URI` et le dossier `UPLOADS_DIR` du
backend. Utilisez une base de développement. Une nouvelle exécution ajoute
uniquement les éléments manquants, sans effacer les données ni réinitialiser
les pistes modifiées. Une piste de démonstration supprimée sera recréée au
prochain seed. Exécutez une seule instance de la commande à la fois.

## Documents de travail

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md) et [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : missions des trois séances ;
- [API_CONTRACT.md](API_CONTRACT.md) : endpoints, authentification et formats échangés ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : modèle de compte rendu.
- [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md) : utiliser correctement un assistant IA, quel que soit l’outil choisi.

Le backend contient également ses propres consignes pour les assistants :
[`backend/AGENTS.md`](backend/AGENTS.md), [`backend/CLAUDE.md`](backend/CLAUDE.md),
[`backend/GEMINI.md`](backend/GEMINI.md) et
[`backend/best-practices.md`](backend/best-practices.md). Elles couvrent
Bun, TypeScript, Hono, Mongoose, MongoDB, l’authentification, les uploads,
les logs et les tests.

Les fichiers audio présents dans `frontend-starter/fichiers-audio-de-test/` sont
des fixtures fournies pour les essais. Aucun fichier uploadé, dossier de
dépendances (`node_modules`), fichier `.env` ou identifiant local n’est inclus.
