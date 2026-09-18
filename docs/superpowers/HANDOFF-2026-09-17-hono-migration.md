# Handoff — migration backend Express/JS → Hono/TypeScript

**Date:** 2026-09-17
**État:** interrompue volontairement après la tâche 2 sur 12. Le dépôt est dans un état cohérent et commité, mais **le backend ne démarre pas** — c'est attendu, voir « Ce qui est cassé ».
**Branche:** `main` (choix explicite de l'étudiant, pas de worktree)

---

## 1. Où en est le travail

| Tâche | Sujet | État |
|---|---|---|
| 1 | Outillage Bun + TypeScript, `config.ts`, `types.ts` | ✅ terminée, revue propre |
| 2 | Modèles Mongoose en TypeScript + harnais de test | ⚠️ **quasi terminée** — voir §4 |
| 3 | Helper JWT + middlewares Hono | ⬜ non commencée |
| 4 | Helper d'upload (remplace Multer) | ⬜ non commencée |
| 5 | Squelette de l'app, route health, `onError` | ⬜ non commencée |
| 6 | Routes d'authentification | ⬜ non commencée |
| 7 | Routes de profil utilisateur | ⬜ non commencée |
| 8 | Liste paginée des pistes | ⬜ non commencée |
| 9 | Upload, streaming, suppression | ⬜ non commencée |
| 10 | Point d'entrée Bun + Docker | ⬜ non commencée |
| 11 | Documentation | ⬜ non commencée |
| 12 | Vérification complète | ⬜ non commencée |

### Commits produits

```
226c9f9 fix(task-2): remove legacy Express JS files superseded by TS models
155e0e2 feat(backend): modèles Mongoose User et Track en TypeScript
2791d95 fix(task-1): remove unrequested test/setup.ts stub
3b9ad4c chore(backend): outillage Bun + TypeScript et configuration partagée
7d5e8b3 docs: plan d'implémentation de la migration Hono + TypeScript
84f15f6 docs: spec de migration du backend vers Hono + TypeScript
```

Dernier commit avant la migration : `2a3fad8`. Pour tout annuler : `git reset --hard 2a3fad8`.

### État vérifié au moment de l'arrêt

```
cd backend && bun test        → 4 pass, 0 fail, 8 expect() calls
cd backend && bun run typecheck → exit 0
```

`backend/src/` ne contient plus aucun fichier `.js`.

---

## 2. Documents de référence

| Fichier | Rôle |
|---|---|
| `docs/superpowers/specs/2026-09-17-hono-typescript-migration-design.md` | **La spec.** Autorité de référence : décisions validées, écarts assumés, contrat préservé. |
| `docs/superpowers/plans/2026-09-17-hono-typescript-migration.md` | **Le plan.** 12 tâches en TDD, code complet pour chacune. |
| `.superpowers/sdd/2026-09-17-hono-typescript-migration/progress.md` | **Le journal.** Scan de conflits, décisions, avancement. Non versionné (git-ignoré). |

Le plan contient le code intégral de chaque tâche restante. Il n'y a rien à réinventer : les tâches 3 à 12 sont de la transcription plus des tests.

---

## 3. Ce qui est cassé, et pourquoi c'est normal

`backend/package.json` pointe vers `src/server.ts`, **qui n'existe pas encore** (tâche 10). `docker-compose.yml` pointe toujours vers `src/server.js`, **qui a été supprimé** (commit `226c9f9`).

Conséquence : `docker compose up backend` échoue, et `bun run start` aussi. C'est l'état normal d'une migration arrêtée en milieu de parcours.

Le frontend Angular et MongoDB ne sont pas affectés. `docker compose up -d mongo frontend` fonctionne, mais le frontend n'aura pas d'API à appeler.

**Pour retrouver une application qui tourne sans finir la migration :** `git reset --hard 2a3fad8`.

---

## 4. Le point exact de reprise

La tâche 2 est dans un état particulier qu'il faut comprendre avant de reprendre.

Sa revue a renvoyé **spec ✅ / qualité approuvée**, avec une réserve importante : le test de `Track` **passait déjà pendant la phase RED**, parce que l'ancien `Track.js` satisfaisait toutes ses assertions. Ce test ne démontrait donc rien.

Le correctif décidé a été de supprimer les fichiers `.js` hérités immédiatement, puis de relancer la suite : une suite verte sans aucun `.js` prouve que les tests s'exécutent bien contre les modèles TypeScript.

**Ce correctif a été appliqué et commité (`226c9f9`), et sa preuve a été vérifiée** (`bun test` 4/4 vert, `typecheck` 0, plus aucun `.js` dans `src/`).

**Ce qui manque :** l'agent a été arrêté avant d'écrire son rapport de correctif, et la re-revue formelle de ce correctif n'a jamais été lancée.

### Reprendre proprement

Deux options, au choix :

**Option A — considérer la tâche 2 comme terminée.** La preuve substantielle existe (suite verte, typecheck propre, plus de `.js`). Passer directement à la tâche 3. C'est défendable : la re-revue n'aurait fait que confirmer ce qui a déjà été mesuré.

**Option B — lancer la re-revue manquante**, puis passer à la tâche 3 :

```bash
SKILL=~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development
"$SKILL/scripts/review-package" docs/superpowers/plans/2026-09-17-hono-typescript-migration.md 155e0e2 226c9f9
```

puis dispatcher `re-review-prompt.md` avec la constatation « le test Track n'est jamais passé en RED » et le diff produit.

### Puis, pour chaque tâche 3 → 12

```bash
SKILL=~/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/subagent-driven-development
PLAN=docs/superpowers/plans/2026-09-17-hono-typescript-migration.md

"$SKILL/scripts/task-brief" $PLAN 3          # extrait le texte de la tâche
BASE=$(git rev-parse HEAD)                    # à noter AVANT de dispatcher
# … implémenter …
"$SKILL/scripts/review-package" $PLAN $BASE HEAD
```

Prérequis permanent : `docker compose up -d mongo` (les tests des tâches 2 à 9 en dépendent).

---

## 5. Décisions prises (à relire, et à défaire si l'une est mauvaise)

Ces décisions ont été prises sans validation préalable, pendant l'exécution. Elles modifient le plan.

1. **Suppression de `backend/test/api.test.js` en tâche 1** au lieu de la tâche 10.
   *Pourquoi :* la tâche 1 désinstalle Express, et cet ancien test importait `../src/app.js` → Express. À partir de là, `bun test` collectait un fichier définitivement cassé.
   *Coût si mauvais :* l'ancien test disparaît une tâche plus tôt ; son remplaçant (`models.test.ts`) arrive en tâche 2.

2. **Suppression du stub `test/setup.ts` créé hors périmètre en tâche 1**, plutôt que traduction de ses commentaires.
   *Pourquoi :* il affirmait « no explicit configuration needed here », l'exact contraire de son rôle réel. Un implémenteur ultérieur qui lui aurait fait confiance aurait lancé la suite sur la base de **développement**, que `resetDb()` vide entre les tests.
   *Coût si mauvais :* nul, la tâche 2 recrée le fichier.

3. **Suppression des fichiers `.js` hérités en tâche 2** au lieu de la tâche 10. *(Cette décision en annule une précédente, prise plus tôt dans la même session.)*
   *Pourquoi :* d'abord jugée inoffensive parce que Bun résout `.ts` avant `.js` — ce qui était vrai mais répondait à la mauvaise question. La revue a montré que l'ambiguïté corrompait la preuve TDD, et l'aurait fait pour les tâches 3 à 9.
   *Coût si mauvais :* la tâche 10 liste des suppressions déjà faites ; son brief doit le préciser, sinon son implémenteur signalera un no-op comme un échec.

4. **Déplacement de deux tests de la tâche 5 vers la tâche 7.**
   *Pourquoi :* le plan laissait sciemment les tâches 5 et 6 avec une suite rouge (deux tests visant `/api/users/me`, créée en tâche 7). Chaque tâche doit se terminer verte.
   *Coût si mauvais :* nul, assertions identiques dans un autre fichier.

5. **La tâche 8 devra rendre son test d'ordre déterministe.**
   *Pourquoi :* `seedTracks` écrit un `createdAt` explicite, mais `timestamps: true` peut l'écraser. Des dates identiques rendent le tri arbitraire et le test instable.
   *Coût si mauvais :* un test intermittent apparaîtra en tâche 8 ou 12.

6. **La vérification d'intégrité du contrat en tâche 11 est ancrée sur `2a3fad8`.**
   *Pourquoi :* le plan comparait l'arbre de travail à `HEAD`, toujours vide après un commit — la vérification ne vérifiait rien.
   *Coût si mauvais :* garantie plus faible que `API_CONTRACT.md` et les énoncés n'ont pas bougé ; la tâche 12 le revérifie de toute façon par le comportement.

### Écart de conception assumé, décidé pendant la planification

Le hachage du mot de passe passe du hook `pre("validate")` + virtual `password` à une méthode statique explicite `User.register()`. Le motif virtual+hook exige des casts peu sûrs sous TypeScript strict. Invisible côté HTTP. Documenté dans la spec comme « écart délibéré 1 ».

---

## 6. Points de vigilance pour la suite

- **La base de test est isolée** (`guitar-practice-cloud-test`), et les uploads de test vont dans `os.tmpdir()`. C'est `backend/test/setup.ts`, préchargé par `bunfig.toml`, qui l'assure. **Ne jamais affaiblir ce fichier** : la suite appelle `resetDb()`, qui vide toutes les collections. Données de développement vérifiées intactes à l'arrêt (1 utilisateur, 1 piste).
- **Ne jamais journaliser une erreur `hono/jwt` ni son `.message`** : `JwtTokenExpired.message` contient le jeton complet. Vérifié pendant la conception. La tâche 3 en dépend directement.
- **`API_CONTRACT.md` ne doit pas changer.** C'est le critère de réussite de la migration.
- Les énoncés `SUJET_ETUDIANT_TP*.md` et `CONSEILS_POUR_UTIISER_ASSISTANT_AI.md` ne sont pas modifiés. `SUJET_ETUDIANT_TP1.md` continuera donc de mentionner « API Express ».
- Les commentaires sont en français, comme le reste du dépôt.

---

## 7. Versions vérifiées

Bun 1.4.2 · Hono 4.13.8 · Mongoose 9.10.1 · bcryptjs 3.0.3 · TypeScript 7.0.2

Les API Hono sur lesquelles repose le plan ont été vérifiées par un probe jetable pendant la conception : `c.req.parseBody()` rend bien des `File`, `c.body(Bun.file(p).stream())` diffuse, `app.onError` + `HTTPException` produisent du JSON, et `hono/jwt` vérifie un jeton signé par `jsonwebtoken` (et inversement) — donc aucun utilisateur connecté n'est déconnecté par la migration.
