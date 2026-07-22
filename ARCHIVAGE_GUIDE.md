# 📦 Guide du Système d'Archivage BG Express

## ✅ Système Complet et Fonctionnel

Le système d'archivage est **déjà implémenté et opérationnel** dans votre application.

---

## 🎯 Fonctionnalités

### 1. **Archivage Automatique**
- **Quand** : Chaque nuit automatiquement
- **Quoi** : Colis avec statut "Livré", "Retourné", "Retour finalisé" de plus de 90 jours
- **Où** : Les colis sont déplacés de `parcels` vers `parcels_archive`
- **Implémentation** : Cloud Function `scheduledArchive` dans `functions/index.js`

### 2. **Archivage Manuel**
- **Interface** : Onglet "🗄️ Archives" dans le panneau Admin
- **Contrôles** :
  - Choix des statuts à archiver
  - Choix de la ville (ou toutes)
  - Choix du délai minimum (jours)
- **Fonction** : `manualArchive` (Cloud Function)

### 3. **Recherche dans les Archives**
- **Interface** : Dans l'onglet "🗄️ Archives"
- **Recherche par** : N° EXP, nom, téléphone, tracking ID
- **Résultats** : Affichage des colis archivés avec tous les détails

### 4. **Suppression des Archives**
- **Options** :
  - Supprimer les archives de plus de X jours
  - Supprimer toutes les archives
- **Fonction** : `deleteArchive` (Cloud Function)
- **Sécurité** : Confirmation requise avant suppression

---

## 🚀 Comment Utiliser

### Interface Admin

1. **Accéder aux Archives**
   ```
   Admin → Onglet "🗄️ Archives"
   ```

2. **Archiver Manuellement**
   ```
   1. Sélectionner les statuts (Livré, Retourné, Retour finalisé)
   2. Choisir la ville (optionnel)
   3. Définir le délai minimum (ex: 90 jours)
   4. Cliquer sur "Archiver"
   ```

3. **Rechercher dans les Archives**
   ```
   1. Entrer un terme de recherche (N° EXP, nom, tel)
   2. Cliquer sur "Rechercher"
   3. Les résultats s'affichent avec tous les détails
   ```

4. **Supprimer les Archives**
   ```
   1. Choisir l'option (par date ou tout)
   2. Confirmer l'action
   3. Les archives sont supprimées de Firestore
   ```

---

## 📊 Politiques d'Archivage

### Politique STANDARD (Par défaut)
```javascript
{
  delaiMinimumJours: 90,  // 3 mois
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true,  // Pour "Livré", archiver seulement si COD payé
  batchSize: 100
}
```

### Politique CONSERVATIVE
```javascript
{
  delaiMinimumJours: 180,  // 6 mois
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true,
  batchSize: 50
}
```

### Politique AGGRESSIVE
```javascript
{
  delaiMinimumJours: 30,  // 1 mois
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: false,  // Archiver même si COD non payé
  batchSize: 200
}
```

---

## 🗂️ Structure de la Base de Données

### Collection `parcels_archive`

Chaque colis archivé contient :
- **Toutes les données originales** du colis
- **archivedAt** : Date/heure d'archivage
- **archivedReason** : Raison (auto_archive_90days, manual_archive)
- **archivedBy** : ID de l'utilisateur (pour archivage manuel)
- **archivedByName** : Nom de l'utilisateur

### Index Firestore

Les index suivants sont configurés pour optimiser les requêtes :
```json
{
  "collectionGroup": "parcels_archive",
  "fields": [
    { "fieldPath": "originCity", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "parcels_archive",
  "fields": [
    { "fieldPath": "destinationCity", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

---

## ⚡ Optimisations Implémentées

### 1. **Chargement Optimisé des Colis**
- **Approche en cascade** avec `useMemo` (comme AdminPortAgenciesTab)
- **3 étapes de filtrage** :
  1. Recherche → `searchFiltered`
  2. Filtres de base (ville, driver) → `baseFiltered`
  3. Filtres avancés (statut, service, port) → `filtered`
- **Limite d'affichage** : 300 expéditions max pour performance

### 2. **Chargement Paginé**
- **Initial** : 500 colis les plus récents
- **Page supplémentaire** : 200 colis par clic "Charger plus"
- **Recherche serveur** : Recherche dans toute la base de données

### 3. **Cache et Mémorisation**
- Tous les calculs utilisent `useMemo` pour éviter les recalculs inutiles
- Dépendances optimisées pour chaque `useMemo`

---

## 📈 Statistiques d'Archivage

### Fonctionnalité `getStatistiquesArchivage()`

Retourne :
- **total** : Nombre total de colis éligibles à l'archivage
- **parStatut** : Répartition par statut
- **parMois** : Répartition par mois de création
- **potentielArchivage** : Économies potentielles de stockage

---

## 🔐 Sécurité

### Permissions
- **Admin** : Accès complet (archivage, recherche, suppression)
- **Directeur** : Accès en lecture seule aux archives
- **Autres rôles** : Pas d'accès aux archives

### Logs
Toutes les opérations d'archivage sont enregistrées dans `directorLogs` avec :
- Type d'opération
- Utilisateur
- Nombre de colis
- Timestamp

---

## 🛠️ Maintenance

### Vérifier les Archives
```javascript
// Dans Firebase Console
db.collection('parcels_archive').count()
```

### Planification de l'Archivage Automatique
```javascript
// Dans functions/index.js
exports.scheduledArchive = onSchedule({
  schedule: '0 3 * * *',  // Chaque nuit à 3h00
  timeZone: 'Africa/Casablanca'
}, async () => { ... })
```

### Déployer les Fonctions
```bash
firebase deploy --only functions
```

---

## 📝 Fichiers Concernés

### Frontend
- `src/firebase/archivage.ts` - Fonctions d'archivage
- `src/pages/admin/tabs/AdminArchivageTab.tsx` - Interface d'archivage
- `src/pages/AdminPage.tsx` - Optimisations de chargement

### Backend
- `functions/index.js` - Cloud Functions (lignes 170-1436)
  - `scheduledArchive` - Archivage automatique
  - `manualArchive` - Archivage manuel
  - `deleteArchive` - Suppression des archives

### Configuration
- `firestore.indexes.json` - Index Firestore pour optimisation

---

## ✨ Améliorations Récentes (2026-07-15)

1. **Optimisation du filtrage en cascade**
   - 3 `useMemo` séparés au lieu d'un seul
   - Réduction des recalculs inutiles
   - Limite augmentée à 300 expéditions (au lieu de 100)

2. **Système d'archivage complètement fonctionnel**
   - Interface admin accessible
   - Cloud Functions déployées
   - Index Firestore configurés

---

## 📞 Support

Pour toute question ou problème :
1. Vérifier les logs Firebase Console
2. Vérifier l'onglet "🗄️ Archives" dans Admin
3. Consulter `directorLogs` pour l'historique des opérations

---

**Dernière mise à jour** : 15 juillet 2026
