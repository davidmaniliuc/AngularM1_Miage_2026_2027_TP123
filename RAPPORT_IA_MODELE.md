# Rapport d'usage de l'IA - TP1

Pour chaque mission, détailler et fournir des explications concernant : objectif; prompt principal; plan proposé par l'agent; vérifications réalisées par le binôme; erreurs ou propositions rejetées; fichiers effectivement modifiés; preuve de fonctionnement; ce que chaque membre sait maintenant expliquer sans l'agent.

Préparation obligatoire avant la séance

_Prompt pour mongo db en local :_ there is this assignement but I want to run mongo db in local instead with docker compose can you do the thing for the projet to use local mogo db but don't update the assigment

_Prompt pour completer le compose et usiliser bun :_ yes make the compose launch the whole app front back + bd : and use bun insead of node

## Mission 1 — Inscription, Connexion et Profil

_Objectif, prompt principal, plan, vérifications, erreurs rejetées, fichiers modifiés, ce que chaque membre sait expliquer : à compléter par le binôme._

Preuves Network (JWT et mot de passe caviardés avant capture) :

- [Connexion réussie — `POST /api/auth/login` → `200 OK`](screenshots/tp1-mission1/network-login-succes-200.png)
- [Connexion refusée — `POST /api/auth/login` → `401 Unauthorized`](screenshots/tp1-mission1/network-login-refuse-401.png)
- [`GET /api/users/me` sans token → `401 {"message":"Authentification requise"}`](screenshots/tp1-mission1/users-me-401-sans-token.png)

Capture manquante à ajouter : une requête `/api/users/me` **authentifiée** (avec en-tête `Authorization` visible), pour couvrir le 3e point du Checkpoint ("lecture ou modification de `/api/users/me`").
