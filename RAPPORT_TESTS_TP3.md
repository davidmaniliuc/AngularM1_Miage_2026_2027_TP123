# Rapport des tests — TP3

Date d'exécution : 1er octobre 2026.

## Commandes

```bash
cd frontend-starter && npm test        # Vitest, réponses HTTP simulées
cd frontend-starter && npm run build
cd backend && bun test                 # base MongoDB de test séparée
```

| Suite | Résultat observé |
|---|---|
| Frontend (`npm test`) | 10 fichiers, **66 tests réussis**, 0 échec |
| Build (`npm run build`) | réussi, aucune erreur |
| Backend (`bun test`) | 14 fichiers, **116 tests réussis**, 0 échec |

Les tests frontend n'ont besoin ni du backend ni de MongoDB : `HttpTestingController` intercepte chaque requête, le test vérifie l'URL, la méthode, les paramètres, les headers et le corps, puis renvoie une réponse simulée (`flush`).

## Tests frontend exigés par le sujet

| Test (fichier) | Ce qu'on simule | Résultat attendu | Observé |
|---|---|---|---|
| `AuthService.login()` utilise `POST /api/auth/login` (`auth.service.spec.ts`) | réponse 200 `{ token, user }` | une requête `POST /api/auth/login` avec le corps `{ email, password }`, puis le token est stocké dans le signal et dans `localStorage` | ✅ |
| Connexion refusée (`auth.service.spec.ts`) | réponse 401 | rien n'est stocké (token et utilisateur à `null`) | ✅ |
| `TrackService.list()` transmet `page` et `limit` (`tracks-page.spec.ts`) | ouverture de la page puis clic sur « page suivante » | `GET /api/tracks?page=1&limit=5`, puis `page=2` | ✅ |
| L'intercepteur ajoute `Authorization` (`auth.interceptor.spec.ts`) | un token est présent | header `Authorization: Bearer jwt-123` | ✅ |
| Pas de header sans token (`auth.interceptor.spec.ts`) | aucun token | aucun header `Authorization` | ✅ |
| 401 sur une route protégée (`auth.interceptor.spec.ts`) | réponse 401 sur `/api/tracks` | session effacée et redirection vers `/login` | ✅ |
| Le guard redirige sans token (`auth.guard.spec.ts`) | aucun token | le guard renvoie un `UrlTree` vers `/login` | ✅ |
| Le guard laisse passer avec un token (`auth.guard.spec.ts`) | un token est présent | le guard renvoie `true` | ✅ |
| Le composant affiche une erreur après un échec HTTP (`tracks-page.spec.ts`) | réponse 500 `{ message: 'Erreur serveur' }` sur la liste | chargement terminé, message « Erreur serveur » affiché dans une alerte (`role="alert"`) | ✅ |
| La suppression appelle `DELETE` et recharge (`tracks-page.spec.ts`) | confirmation, puis réponse 204 | `DELETE /api/tracks/t1`, puis un nouveau `GET /api/tracks`, et le lecteur s'arrête si la piste était en cours | ✅ |
| Double clic sur Supprimer (`tracks-page.spec.ts`) | deux confirmations de suite | un seul `DELETE` est envoyé et le bouton de la card est désactivé pendant l'appel | ✅ |
| Piste déjà supprimée ou appartenant à un autre (`tracks-page.spec.ts`) | réponse 404 | snackbar « n'existe plus ou ne vous appartient pas », liste rechargée, la piste disparaît | ✅ |
| Autre erreur de suppression (`tracks-page.spec.ts`) | réponse 500 avec `{ message }` | le message du backend s'affiche dans la snackbar, sans rechargement | ✅ |
| Annulation (`tracks-page.spec.ts`) | la boîte de confirmation renvoie `false` | aucun `DELETE` envoyé | ✅ |
| L'upload met à jour la progression (`upload-dialog.spec.ts`) | événement `UploadProgress` avec 32 octets sur 50, puis réponse 201 | progression à 64 %, barre affichée, titre, case et bouton désactivés, une seule requête malgré deux soumissions, boîte fermée avec la piste créée | ✅ |
| L'upload traite l'erreur (`upload-dialog.spec.ts`) | réponse 400 `Format audio non accepté` | message affiché, formulaire réactivé, nouvel essai possible | ✅ |

### Vérification que les tests détectent une erreur

On a supprimé exprès la ligne `if (this.deletingId()) return;` dans `tracks-page.ts`. Résultat attendu : le test du double clic échoue. Résultat observé : **1 test en échec** (« sends a single DELETE… »). On a ensuite remis la ligne et les 66 tests passent de nouveau.

### Ce que les tests unitaires n'ont pas vu

La progression de l'upload restait bloquée à 0 % dans le navigateur, alors que tous les tests passaient. Angular 22 utilise `fetch` par défaut, et `fetch` ne remonte pas la progression d'un envoi. `HttpTestingController` remplace ce backend dans les tests : le problème ne pouvait donc se voir que dans le vrai navigateur. On l'a corrigé avec `withXhr()` dans `main.ts`, puis vérifié dans l'onglet Network (type `xhr`, barre qui avance, réponse 201).

## Extension backend (facultative), déjà couverte

| Cas demandé | Test existant | Attendu | Observé |
|---|---|---|---|
| 401 sans JWT | `tracks-list.test.ts` « sans jeton : 401 », `tracks-upload.test.ts` « upload sans jeton : 401 » | 401 | ✅ |
| 401 avec un JWT invalide | `users.test.ts` « un jeton illisible donne 401 » | 401 `Jeton invalide ou expiré` | ✅ |
| Upload sans fichier | `tracks-upload.test.ts` « upload sans fichier : 400 » | 400 | ✅ |
| Type MIME refusé | `tracks-upload.test.ts` « type MIME refusé : 400 et aucune piste créée » | 400, aucune piste en base | ✅ |
| Pagination `page` / `limit` | `tracks-list.test.ts` « liste paginée par défaut », « limit est borné à 20 et page à 1 minimum » | 5 par défaut, limit ≤ 20, page ≥ 1 | ✅ |
| Piste d'un autre utilisateur | `tracks-upload.test.ts` « un utilisateur ne peut pas supprimer la piste d'un autre » | 404, la piste existe toujours | ✅ |

## Vérifications manuelles (navigateur)

| Vérification | Attendu | Observé | Preuve |
|---|---|---|---|
| Suppression | `DELETE` après confirmation, 204, puis liste rechargée | ✅ | `screenshots/tp3-mission5/delete-204.png` |
| Upload | `POST /api/tracks` en `xhr`, barre qui avance, 201 | ✅ | `screenshots/tp3-mission6/apres-xhr-progression.png`, `upload-post-201.png` |
| Console | aucune erreur, aucun token ni mot de passe affiché | ✅ | `screenshots/tp3-mission6/console-vide.png` |
