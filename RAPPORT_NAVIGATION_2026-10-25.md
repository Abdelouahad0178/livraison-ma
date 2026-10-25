# Ouverture et navigation — 25 octobre 2026

Les corrections concernent le premier affichage du site et la navigation Chef d’agence / Agent Pro. Les écritures métier, les filtres, les totaux et les règles Firebase ne sont pas modifiés par cette optimisation.

## Corrections publiées

- Firestore est importé par l’écran de maintenance après le premier rendu. Il ne figure plus parmi les dépendances statiques bloquantes du point d’entrée public. L’écoute de maintenance reste active ; son affichage bloquant pour les comptes connectés et sa désactivation par l’administrateur sont testés.
- Le décor de maintenance est chargé seulement lorsqu’il est affiché.
- Les préchargements anticipés des onglets Expéditions et Caisse sont réservés au PC avec une connexion adaptée. Sur téléphone, avec l’économiseur de données ou une connexion 2G, le code de l’onglet est demandé à son ouverture.
- Le conteneur Agent utilise `overflow-x: clip`, qui permet à son en-tête fixe de rester accessible pendant le défilement. Le défilement horizontal des tableaux reste disponible.
- Les rappels de focus de la saisie s’arrêtent lors d’une interaction clavier/souris et au démontage. Le formulaire ne reprend plus le curseur pendant la navigation.

## Volume de code

Les dépendances JavaScript préchargées statiquement par le HTML passent de **641 253 à 164 381 octets bruts** : 476 872 octets sortent du chemin initial. Firestore reste téléchargé lorsqu’il est utilisé ; cette différence ne représente pas une suppression équivalente du volume total de l’application.

Sur le parcours téléphone testé, désactiver les préchargements d’onglets non ouverts fait passer le JavaScript décodé de **1 967 240 à 1 727 319 octets**, avec 55 requêtes de scripts au lieu de 62. Le code de Caisse Agence n’est pas téléchargé pendant ce parcours où cet onglet n’est jamais ouvert.

## Mesures PC

Comparaison de builds de production servis sur le même serveur local, avec les mêmes données Firebase et le même compte Chef d’agence. Deux passages par version ; cache navigateur vidé, service worker désactivé ; Chromium 1366 × 768, débit 20 Mbit/s, latence 40 ms. La navigation mesurée comprend une pause de survol de 180 ms.

| Parcours | Avant, moyenne | Après, moyenne |
| --- | ---: | ---: |
| Accueil public visible | 0,99 s | 0,96 s |
| Interface Agent utilisable | 3,12 s | 2,84 s |
| Première ouverture Expéditions | 0,62 s | 0,78 s |
| Première ouverture Saisie | 0,84 s | 0,93 s |
| Retour sur Expéditions | 0,55 s | 0,59 s |

Ces petits échantillons ne démontrent pas un gain uniforme de navigation. Le premier affichage Agent est plus court dans cette comparaison ; les clics d’onglets restent sensibles à l’arrivée des données et au travail du navigateur. Aucun multiplicateur de vitesse n’est garanti.

## Contrôle téléphone

Chromium simulant un écran 390 × 844, débit 9 Mbit/s, latence 170 ms, processeur ralenti 4 fois. Un passage avant et après la désactivation des préchargements sur téléphone ; cette comparaison mobile part d’un build où les autres corrections sont déjà présentes.

| Parcours | Avec préchargements | Sans préchargements |
| --- | ---: | ---: |
| Accueil public visible | 2,33 s | 3,04 s |
| Interface Agent utilisable | 5,45 s | 5,57 s |
| Première ouverture Expéditions | 2,93 s | 1,36 s |
| Première ouverture Saisie | 6,36 s | 2,48 s |
| Retour sur Expéditions | 3,38 s | 4,70 s |

Le volume téléchargé et le travail du navigateur diminuent ; certains changements d’écran restent lents dans cette simulation. Une mesure sur téléphone réel et des échantillons plus nombreux seraient nécessaires pour conclure sur les temps habituels.

Les parcours PC et téléphone terminent sans erreur JavaScript et sans débordement horizontal de la page ; l’en-tête reste visible après défilement.

## Validation et reproduction

- Build de production réussi.
- 41 tests ciblés réussis : maintenance, focus, en-tête, conservation des onglets, stabilité du contexte et droits d’agence.
- Le contrôle TypeScript global continue de signaler des erreurs existantes du dépôt ; aucune nouvelle erreur n’a été observée dans le nouveau hook de focus ou l’écran de maintenance.
- Aucun colis, paiement ou paramètre n’est modifié par les mesures. La connexion et la présence suivent le fonctionnement normal de l’application.

Le script `scripts/benchmark-navigation.mjs` accepte `--origin`, `--device desktop|mobile`, `--runs` et `--output`. Il utilise les accès Firebase locaux déjà configurés et n’écrit pas de jeton dans ses résultats. Les mesures brutes sont conservées dans le dossier temporaire Windows sous les noms `livraison-navigation-desktop-before.json`, `livraison-navigation-desktop-after.json` et `livraison-navigation-mobile-after.json`.
