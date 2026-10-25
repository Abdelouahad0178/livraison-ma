# Proposition d’optimisation de livraison-ma

Diagnostic du code local : 17 octobre 2026.

## Périmètre et conclusion

Cette proposition repose sur la lecture du code et des fichiers déjà présents dans `dist`. Aucun benchmark de production ni parcours authentifié n’a été exécuté pendant cet audit. Les tailles ci-dessous sont celles du build existant, en octets bruts ; elles ne représentent pas toutes des téléchargements au premier affichage.

Le rapport antérieur `RAPPORT_PERFORMANCE.md`, daté du 10 octobre, indique un score Lighthouse local de 96 pour la page publique. C’est une mesure historique, qui ne permet pas de conclure sur la rapidité actuelle des écrans connectés.

La priorité proposée est de réduire les lectures nécessaires à chaque écran connecté, tout en conservant des chiffres complets. Les gros fichiers et les recalculs React viennent ensuite. Une migration de framework ou de base ne se justifie pas sur les seules observations disponibles.

## Ce qui existe déjà

- Routes principales et plusieurs onglets chargés avec `React.lazy`.
- Firebase réparti en plusieurs fichiers JavaScript.
- Import dynamique de la bibliothèque Excel via `loadExcel` et scanner chargé à la demande sur certains parcours.
- Collection `parcelsLite`, cache de journées et limitation de la cadence des mises à jour.
- Cache Firestore adapté aux rôles terrain et bureau.
- Cache PWA et en-têtes de cache longue durée pour `/assets/**`.
- Limitation du nombre de lignes affichées dans certains parcours Admin.

Il faut compléter ces mécanismes plutôt que les recréer.

## 1. Réduire le volume des lectures : impact attendu très élevé

Constats vérifiés :

- `src/pages/DirectorPage.tsx:207` passe de 500 à 10 000 colis quand une recherche devient active. La requête élargit la liste des colis récents ; elle ne cible pas directement le terme recherché.
- `src/firebase/parcels.ts:591` définit `getAllParcels()` sans filtre ni limite. `src/pages/admin/tabs/AdminDiagnosticTab.tsx:16` l’utilise.
- `src/pages/AnalyseurEspecePage.tsx:41` utilise des tranches de 800 documents.
- `subscribeAgencyParcelsFull`, dans `src/firebase/parcels.ts:1766`, charge toute la période demandée, avec des pages de 2 000 par défaut et plusieurs journées en parallèle. Ce comportement sert notamment à obtenir des totaux complets.
- `src/pages/exploitation/useExploitationData.ts` écoute les colis actifs de la ville sur 90 jours, sans plafond de résultats. L’ouverture de certains onglets peut donc déclencher des lectures importantes.

Proposition :

1. Remplacer la recherche Directeur par des requêtes ciblées : numéro exact, téléphone normalisé, préfixe de nom selon les possibilités déjà présentes dans le projet. Réutiliser et adapter les recherches serveur existantes.
2. Pour les listes ordinaires, commencer par 50 à 100 résultats, puis paginer avec des curseurs et un ordre stable. Les filtres agence, période et statut doivent être appliqués avant la limite, côté Firestore.
3. Traiter le diagnostic complet et les exports volumineux comme des opérations explicites : lots bornés, progression et possibilité d’annuler ; tâche serveur pour les plus gros volumes.
4. Réserver le chargement intégral d’une période aux traitements qui l’exigent encore. Mesurer la concurrence des lectures journalières sur mobile avant de modifier son réglage.
5. Vérifier les index correspondant aux requêtes retenues. Ne pas multiplier les index sans requête réelle à servir.

La pagination doit rester exhaustive : accès aux pages suivantes, recherche des anciens colis et tri déterministe même lorsque plusieurs colis ont la même date. Les colis actifs anciens doivent rester accessibles.

Référence : [bonnes pratiques Firestore](https://firebase.google.com/docs/firestore/best-practices), notamment les curseurs et les appels indépendants asynchrones.

## 2. Séparer les listes des totaux : impact attendu très élevé

Une liste de 100 colis ne peut pas fournir à elle seule le total d’un mois. Réduire les limites actuelles sans changer les calculs risquerait de produire des résultats incomplets.

Architecture proposée :

- Une requête paginée pour les lignes visibles.
- Un résumé distinct pour les indicateurs de la période et de l’agence.
- Un chargement du document complet à l’ouverture du détail d’un colis.
- Un export qui parcourt l’ensemble des résultats correspondant aux filtres, indépendamment des lignes affichées.

Pour les compteurs et sommes simples, évaluer les agrégations Firestore. Elles ne fournissent ni écoute temps réel ni résultats hors ligne. Pour les calculs métier complexes et fréquemment consultés, envisager des résumés par agence et journée opérationnelle.

Ces résumés doivent intégrer les corrections tardives, annulations, changements d’agence, retours et paiements mixtes. Si leur maintenance utilise des déclencheurs, prévoir une mise à jour idempotente, une gestion des événements désordonnés et une réconciliation avec les documents sources. Afficher leur état de synchronisation lorsqu’il importe pour une décision de caisse.

Références : [agrégations Firestore](https://firebase.google.com/docs/firestore/query-data/aggregation-queries) et [comportement des déclencheurs](https://firebase.google.com/docs/functions/firestore-events).

## 3. Réduire le travail en arrière-plan : impact attendu élevé

Dans `src/pages/AgentPage.tsx:1737`, plusieurs abonnements démarrent à la première visite d’un onglet, puis restent actifs jusqu’au démontage de la page. C’est notamment le cas des arrivages, de la caisse et de la charge. L’onglet retour fond possède déjà une gestion plus ciblée avec désabonnement à la sortie.

Proposition :

- Conserver les abonnements nécessaires à la session : droits, blocages, alertes essentielles.
- Attacher les données propres à un onglet à son cycle de vie et partager les abonnements identiques.
- Garder un cache borné des données déjà affichées, puis les revalider au retour.
- Réduire les traitements secondaires lorsque la page est masquée, en préservant les besoins opérationnels des livreurs.
- Mesurer le nombre d’abonnements après plusieurs allers-retours entre onglets pour détecter les doublons et les accumulations.

## 4. Accélérer les interactions et le rendu : impact à mesurer par écran

Le composant `src/components/VirtualizedParcelList.tsx` ne virtualise pas réellement les lignes : il utilise `parcels.map`. Aucun usage de ce composant n’a été trouvé pendant la recherche dans `src`. Le remplacer ne suffirait donc pas à accélérer les listes actuellement affichées.

Proposition :

- Profiler les tableaux réellement utilisés, puis virtualiser ceux dont le nombre de lignes bloque le défilement ou les clics.
- Préserver sélection, navigation clavier, recherche et impression. L’impression et l’export doivent couvrir les résultats demandés, pas seulement les lignes visibles à l’écran.
- Répartir l’état et les abonnements par onglet ; limiter les mises à jour du contexte aux données consommées.
- Éviter les reconstructions complètes de listes lorsque seules quelques lignes changent ; conserver des références stables lorsque c’est possible.
- Déplacer vers un Web Worker les calculs ou exports dont le profilage montre qu’ils bloquent le navigateur.

`src/utils/liveThrottle.ts:13` espace certaines mises à jour jusqu’à une seconde après stabilisation. Ce choix réduit les recalculs mais peut contribuer à une impression de lenteur. Pour une action locale, afficher immédiatement un état « en cours », puis confirmer ou restaurer la valeur après la réponse serveur ; conserver le regroupement des mises à jour externes.

`React.memo` ne bloque pas les mises à jour dues à un contexte consommé qui change. Référence : [documentation React](https://react.dev/reference/react/memo).

## 5. Alléger les écrans et leurs ressources : impact attendu moyen à élevé

Tailles brutes relevées dans le build existant :

| Ressource | Octets |
| --- | ---: |
| Firestore | 434 096 |
| Scanner | 374 388 |
| Excel | 282 159 |
| CSS global | 270 658 |
| Onglet colis Agent | 236 848 |
| Page Admin | 232 350 |
| Page Agent | 183 115 |

Proposition :

- Extraire les modales et outils volumineux des grands écrans ; les charger lorsqu’ils sont demandés.
- Vérifier dans l’onglet Réseau que scanner, Excel et graphiques ne sont chargés que sur les parcours qui les utilisent. Leur présence dans `dist` ne prouve pas un chargement initial.
- Examiner les styles globaux et les effets graphiques coûteux sur les tableaux. Le CSS compressé et son coût de rendu doivent être mesurés avant une refonte.
- Si Sentry est configuré, mesurer son démarrage et son Replay ; différer les intégrations secondaires lorsque cela améliore le premier affichage sans perdre le suivi nécessaire.
- Précharger avec parcimonie le prochain écran probable, après le contenu essentiel et seulement si le réseau le permet.

Les fichiers d’image publics observés sont modestes ; leur optimisation paraît secondaire face aux lectures de données.

## 6. Vérifier le cache et la latence : impact dépendant des mesures

`firebase.json` configure déjà un cache d’un an pour les ressources de `/assets/**`. Vérifier les en-têtes effectivement reçus en production, le cache PWA et les parcours après un nouveau déploiement.

Pour les données métier, afficher rapidement les données en cache en indiquant leur état de synchronisation. Une journée passée peut encore être corrigée : son cache doit être invalidé ou revalidé selon les règles métier.

Vérifier la région réelle de Firestore et celle des fonctions sollicitées par les parcours lents. Une localisation inadaptée peut augmenter la latence, mais une migration nécessite des mesures et un plan distinct. Firebase recommande de rapprocher base, utilisateurs et ressources de calcul : [localisation et bonnes pratiques](https://firebase.google.com/docs/firestore/best-practices).

## 7. Mesurer et valider

Établir une référence avant modification pour les parcours Admin, Directeur, Agent, Exploitation et Livreur. Tester une première visite et une visite avec cache, sur ordinateur et téléphone représentatif avec un réseau limité.

Mesurer :

- Temps jusqu’aux premières lignes utilisables et jusqu’aux résultats complets.
- Délai de recherche, changement de filtre et confirmation d’une action.
- Documents lus, octets transférés et abonnements actifs par parcours.
- Temps de calcul, tâches longues, fluidité et évolution de la mémoire après une session prolongée.
- Cohérence des totaux, exports, anciens colis et corrections historiques.

Cibles Web Vitals : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 au 75e percentile, en distinguant mobile et ordinateur. Ces seuils sont des objectifs, pas des résultats constatés. Référence : [Web Vitals](https://web.dev/articles/vitals).

Pour les écrans métier, fixer les budgets après la mesure initiale : premières lignes, résultat complet, coût de lecture et délai d’action. Un bon score de la page publique ne suffit pas.

## Ordre de réalisation proposé

| Étape | Travail | Condition de validation |
| --- | --- | --- |
| 1 | Mesurer les parcours connectés et leurs lectures | Référence reproductible par rôle et volume |
| 2 | Recherche Directeur ciblée, diagnostic par lots, abonnements par onglet | Moins de lectures et de travail inactif, résultats toujours accessibles |
| 3 | Séparer les totaux des listes, paginer les parcours encore exhaustifs | Totaux identiques sur périodes complètes et cas de correction |
| 4 | Découper les gros écrans et virtualiser les tableaux nécessaires | Réduction mesurée du travail navigateur, impression et sélection correctes |
| 5 | Ajuster cache, concurrence réseau et surveillance | Parcours avec cache, hors ligne prévu et mise à jour validés |

La première intervention recommandée est la recherche Directeur, suivie du cycle de vie des abonnements Agent. Ces changements ont un périmètre identifiable. La séparation des totaux et des listes constitue ensuite le chantier structurel principal.

Aucun code applicatif ni déploiement n’a été modifié pour cette proposition. Les gains doivent être établis par comparaison avant/après ; aucun multiplicateur de vitesse ne peut être garanti à ce stade.
