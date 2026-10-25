# Rapport performance - livraison-ma

Date du diagnostic: 2026-10-10

## Resume

La page publique est rapide en build local, mais le back-office peut devenir lourd apres connexion. Les causes principales sont les gros chunks metier, le CSS global unique, certains imports de modules lourds, et des lectures Firestore larges sur quelques pages.

## Mesures effectuees

- Build production: `npm run build` reussi.
- Modules transformes: 2274.
- Lighthouse local sur `/`: performance 96/100.
- FCP: 1.9 s.
- LCP: 2.1 s.
- Speed Index: 3.7 s.
- TBT: 40 ms.
- CLS: 0.006.

Note: Lighthouse mesure surtout la page publique non connectee. La lourdeur signalee vient probablement des routes privees apres authentification.

## Plus gros fichiers generes

| Fichier | Taille brute | Gzip |
|---|---:|---:|
| `firebaseDb-*.js` | 434.10 kB | 106.85 kB |
| `scanner-*.js` | 374.39 kB | 110.29 kB |
| `excelLibrary-*.js` | 281.86 kB | 94.78 kB |
| `index-*.css` | 265.40 kB | 30.09 kB |
| `ParcelsTab-*.js` | 229.11 kB | 50.81 kB |
| `AdminPage-*.js` | 228.17 kB | 57.63 kB |
| `firebaseAuth-*.js` | 189.41 kB | 37.33 kB |
| `chartjs-*.js` | 184.83 kB | 64.39 kB |
| `AgentPage-*.js` | 172.52 kB | 47.99 kB |
| `react-*.js` | 163.92 kB | 53.38 kB |

## Points positifs deja en place

- Les routes principales utilisent `React.lazy`, donc les pages ne sont pas toutes chargees au premier affichage.
- Firebase est deja separe en chunks (`firebaseCore`, `firebaseAuth`, `firebaseDb`, `firebaseStorage`, etc.).
- `html5-qrcode` est importe dynamiquement dans `DriverPage`, ce qui evite de charger le scanner partout.
- `parcelsLite` existe pour alleger certains flux de colis.
- Firestore persistant est limite aux roles terrain; les roles bureau utilisent un cache memoire.
- Le service worker/PWA est configure avec cache de chunks.

## Causes probables de lourdeur

1. Gros ecrans metier

Les fichiers source suivants sont tres volumineux:

- `src/pages/agent/tabs/ParcelsTab.tsx`: environ 387 kB.
- `src/pages/DriverPage.tsx`: environ 199 kB.
- `src/pages/AdminPage.tsx`: environ 187 kB.
- `src/pages/AgentPage.tsx`: environ 174 kB.
- `src/pages/CentralCollectorPage.tsx`: environ 165 kB.

Quand un utilisateur ouvre ces pages, le navigateur doit telecharger, parser et executer beaucoup de JavaScript.

2. Firestore peut charger beaucoup de documents

Plusieurs flux ont ete limites, mais il reste des lectures larges:

- `getAllParcels()` lit toute la collection `parcels`.
- `AdminDiagnosticTab` appelle `getAllParcels()`.
- `DirectorPage` peut charger 500 colis, et 10000 en mode recherche.
- `AnalyseurChequePage` et `AnalyseurEspecePage` demarrent avec `PAGE_SIZE = 800`.
- Certaines pages passent a 1000, 2000 ou 5000 documents avec filtres.
- Plusieurs abonnements `onSnapshot` peuvent rester couteux si la collection grandit.

3. CSS global unique

Le CSS final fait 265 kB brut. Meme s'il gzippe bien, il est global pour toute l'app. Les nombreuses classes Tailwind issues des grands composants gonflent le fichier.

4. Modules lourds utiles mais a charger au dernier moment

- `xlsx`: 281.86 kB brut / 94.78 kB gzip.
- `html5-qrcode`: 374.39 kB brut / 110.29 kB gzip.
- `chart.js`: 184.83 kB brut / 64.39 kB gzip.
- `firebase/firestore`: 434.10 kB brut / 106.85 kB gzip.

5. Sentry peut impacter le demarrage

`src/utils/monitoring.ts` charge Sentry au demarrage si `VITE_SENTRY_DSN` est defini, avec tracing et replay. C'est utile, mais a surveiller sur mobile et connexions faibles.

## Priorites recommandees

### Priorite 1

- Eviter les lectures completes de `parcels` dans les ecrans de diagnostic/export.
- Remplacer `getAllParcels()` par des requetes paginees, datees, ou agregees.
- Reduire les `PAGE_SIZE` initiaux les plus hauts (`800`, `1000`, `2000`, `5000`, `10000`) quand ce n'est pas indispensable.
- Ajouter un chargement progressif visible partout ou un filtre peut ramener beaucoup de documents.

### Priorite 2

- Decouper `ParcelsTab.tsx`, `AdminPage.tsx`, `AgentPage.tsx` et `DriverPage.tsx` en sous-composants lazy par onglet/modal/action.
- Charger les exports Excel uniquement au clic sur export, pas au chargement de la page.
- Charger les graphiques uniquement quand l'onglet dashboard est ouvert.

### Priorite 3

- Faire un audit des imports depuis `src/firebase/firestore.ts` car ce barrel re-exporte beaucoup de domaines et peut tirer plus de code que necessaire.
- Preferer des imports domaine directs (`parcels`, `clients`, `caisse`, etc.) sur les pages critiques.
- Verifier les logs de production: `console.log` est retire par esbuild, mais `console.warn` et `console.error` restent.

### Priorite 4

- Reporter l'initialisation Sentry apres le premier rendu, ou desactiver Replay sur les appareils lents.
- Surveiller le Service Worker: il cache jusqu'a 250 chunks JS, ce qui est pratique, mais peut garder beaucoup de fichiers sur les terminaux modestes.

## Plan d'action conseille

1. Optimiser d'abord les lectures Firestore larges: c'est probablement le plus gros gain ressenti.
2. Decouper `ParcelsTab.tsx` et `AdminPage.tsx` par onglet/modal.
3. Transformer les exports Excel en imports dynamiques au clic.
4. Ajouter un profilage Lighthouse ou Playwright apres connexion avec un compte test par role.
5. Rebuild et comparer les tailles de chunks apres chaque changement.

## Conclusion

Le site n'est pas lourd sur la page publique. Le probleme est concentre dans l'application connectee: gros ecrans, gros chunks, et volume de donnees Firestore. Les gains les plus importants viendront de la pagination stricte, des filtres serveur par date/statut/ville, et du chargement paresseux des outils lourds.
