# Archive des scripts ponctuels

Rangés ici le 01/11/2026 (diagnostic de souplesse, lot E) : réparations, vérifications, mesures et migrations
**déjà exécutées** une fois sur la base. Ils sont gardés pour l'historique (ce qui a été fait, comment, avec quelle
sauvegarde) — ils ne font partie ni du site ni des Cloud Functions.

- `src-scripts/` : anciens scripts qui étaient dans `src/scripts/` (hors du site).
- `firestore.rules.*` : anciennes copies des règles avant certaines modifications.
- Les sauvegardes JSON (`scripts/*backup*.json`) restent dans `scripts/` (non versionnées).

Pour en relancer un : le remettre dans `scripts/` (les chemins relatifs, par exemple `../functions/…`, supposent
cet emplacement) et le lancer depuis la racine du projet.

Outils encore utilisés, restés dans `scripts/` : contrôle avant mise en ligne (`predeploy-check.mjs`,
`tsc-baseline.json`), compilation des règles partagées (`build-functions-shared.mjs`), rattrapages `backfill-*`,
vérifications `verify-*` et `_conformity-*`, sauvegarde `backup-firestore.*`.
