# Bonnes pratiques backend

Ce document sert de référence pour les travaux dans `backend/`. Les assistants
peuvent proposer du code, mais l’étudiant doit comprendre, tester et expliquer
chaque modification.

## Bun, TypeScript et configuration

- Bun exécute directement le TypeScript : il n'y a pas d'étape de compilation. `bun run typecheck` vérifie les types avec `tsc --noEmit`.
- Garder la configuration dans des variables d’environnement et fournir des valeurs d’exemple dans `.env.example`.
- Ne jamais committer `.env`, une URI MongoDB complète, un mot de passe ou un secret JWT.
- Préférer `async`/`await` et des fonctions courtes dont la responsabilité est identifiable.
- Attendre la connexion à MongoDB avant d’accepter les requêtes qui nécessitent la base.

## Hono : routes et middlewares

Une requête suit généralement ce chemin :

```text
route -> middleware -> handler -> modèle Mongoose -> MongoDB
```

- Les routes décrivent les URL et les méthodes HTTP. Toute route ajoutée ou modifiée doit entraîner la mise à jour de `../API_CONTRACT.md` dans la même mission, avec la méthode, l’URL, l’authentification, les paramètres, le corps, les réponses et les erreurs.
- Hono n'a pas de parseur de corps global : un handler lit `await c.req.json()` ou `await c.req.parseBody()` et traite lui-même un corps absent ou illisible.
- `c.req.query("page")`, `c.req.param("id")` et `c.req.header("Authorization")` remplacent `req.query`, `req.params` et `req.headers`.
- Un handler retourne toujours une `Response` : `return c.json(body, status)`, `return c.body(null, 204)`.
- Un middleware s'écrit avec `createMiddleware<AppEnv>` ; il partage des données via `c.set(...)` / `c.get(...)` au lieu de poser une propriété sur `req`.
- Une erreur se signale avec `throw new HTTPException(status, { message })`, jamais avec `next(error)`.
- Utiliser des codes HTTP cohérents : `2xx` succès, `4xx` requête invalide ou non autorisée, `5xx` erreur serveur.
- Ne pas faire confiance aux données envoyées par le navigateur.

Pour une erreur asynchrone, ne pas l’ignorer :

```ts
try {
  const result = await operation();
  console.log("[operation] succès", { id: result.id });
  return c.json(result);
} catch (error) {
  console.error("[operation] échec", error);
  throw new HTTPException(500, { message: "Erreur interne du serveur" });
}
```

Un gestionnaire centralisé, posé une seule fois avec `app.onError`, reçoit
toute erreur levée par un handler ou un middleware. Il doit journaliser
l’erreur côté serveur, sans révéler la stack ni les secrets au client en
production.

Documentation : [middleware Hono](https://hono.dev/docs/guides/middleware).

## Mongoose et MongoDB

- Définir un schéma Mongoose explicite avec types, champs obligatoires, contraintes et valeurs par défaut utiles.
- Valider les données avant l’écriture et traiter les erreurs de validation.
- Vérifier les identifiants avec `mongoose.isValidObjectId` avant une recherche.
- Ne pas concaténer des fragments de requête à partir d’entrées utilisateur.
- Utiliser `.lean()` pour les lectures qui n’ont pas besoin de méthodes Mongoose.
- Sélectionner uniquement les champs nécessaires, notamment lorsqu’un document contient des informations sensibles.
- Ajouter des index seulement lorsqu’ils correspondent à des recherches réelles et comprendre leur coût en écriture.
- Pour une liste paginée, valider `page` et `limit`, imposer un maximum et retourner des métadonnées cohérentes.
- Ne jamais stocker un mot de passe en clair et ne jamais le renvoyer dans une réponse JSON.

Documentation : [Mongoose Schemas](https://mongoosejs.com/docs/guide.html) et
[sécurité MongoDB](https://www.mongodb.com/docs/manual/core/security/).

## Uploads de fichiers

- `c.req.parseBody()` rend un objet dont chaque champ est une chaîne (champ texte) ou un `File` (champ fichier). Rien n'est validé automatiquement.
- Vérifier d'abord l'en-tête `Content-Length` : `parseBody()` charge tout le corps en mémoire, donc un envoi manifestement trop gros doit être refusé avant d'être lu.
- Vérifier ensuite que le champ est bien une instance de `File`, que son type MIME figure dans la liste autorisée et que sa taille respecte la limite.
- Ne jamais réutiliser le nom d'origine comme nom de stockage : générer un nom avec `crypto.randomUUID()` et ne conserver que l'extension, en minuscules.
- Écrire avec `Bun.write(chemin, file)`, puis enregistrer les métadonnées. Si l'enregistrement échoue, supprimer le fichier orphelin et journaliser l'échec éventuel du nettoyage.
- Servir un fichier avec `c.body(Bun.file(chemin).stream())` après avoir vérifié que la ressource appartient bien à l'utilisateur.

Documentation : [Hono — corps de requête](https://hono.dev/docs/api/request#parsebody).

## Lecture audio et authentification

- Utiliser un chemin de fichier contrôlé par le serveur, jamais un chemin fourni directement par le client.
- Authentifier les pistes protégées avant d’envoyer le fichier.
- Préserver les en-têtes et le comportement nécessaires à la lecture audio, notamment `Range` si pris en charge.
- Vérifier l’identité issue du JWT plutôt que celle fournie par `req.body`.
- Distinguer absence de token, token invalide et utilisateur non autorisé.

## Logs, erreurs et tests

Chaque opération importante doit laisser une trace utile : début, résultat et
erreur éventuelle. Ne jamais utiliser de `catch` vide et ne jamais journaliser
mot de passe, token, secret, URI MongoDB complète ou contenu privé.

Tester les cas nominaux et les erreurs : données invalides, absence de JWT,
ressource inexistante, doublon, fichier trop grand et mauvais type. Vérifier le
code HTTP, le JSON, les effets dans MongoDB ou sur le disque, puis lire les logs
du backend.

## Prompt de travail recommandé

```text
Lis backend/AGENTS.md, backend/best-practices.md et les parties pertinentes de
API_CONTRACT.md. Analyse d’abord la route concernée, décris son flux et propose
les fichiers à modifier. Ne change pas le contrat API sans mettre à jour
`API_CONTRACT.md` dans la même mission et ne touche jamais aux secrets. Après
validation, implémente une modification limitée, lance les tests et signale
chaque erreur.
```
