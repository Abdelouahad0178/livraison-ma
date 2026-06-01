# 📜 Scripts de maintenance

## 🗑️ deleteAllDataExceptUsers.mjs

Script pour supprimer **TOUTES** les données Firestore **SAUF** les utilisateurs.

### ⚠️ ATTENTION

**Cette action est IRREVERSIBLE !** Toutes les données suivantes seront définitivement supprimées :
- ✅ Tous les colis (parcels)
- ✅ Tous les clients
- ✅ Toutes les opérations de caisse
- ✅ Tous les versements
- ✅ Tous les rapports
- ✅ Tous les véhicules
- ✅ Toutes les arrivages
- ✅ Tous les secteurs
- ✅ Etc.

**Seule la collection `users` sera préservée.**

### 📋 Prérequis

1. Avoir le fichier `serviceAccount.json` à la racine du projet
2. Avoir Node.js installé
3. Avoir installé `firebase-admin` :
   ```bash
   npm install firebase-admin
   ```

### 🚀 Utilisation

```bash
node deleteAllDataExceptUsers.mjs
```

Le script vous demandera de confirmer en tapant **"OUI SUPPRIMER"** avant de procéder.

### 📊 Collections supprimées

- settings
- parcels
- clients
- payments
- caisseEntries
- agentRemises
- caissierRemarks
- caisseClotures
- caissierTransactions
- caissierRequests
- agentCashRecoveryRequests
- agentCodRequests
- agencyCashes
- vehicles
- directorLogs
- cities
- clientMessages
- clientPortals
- reglements
- reglementsRapports
- bankDeposits
- centralCodDeposits
- centralSupplierPayments
- modifications
- arrivages
- sectors
- bonRamasageBatches
- adminTransfersFromAgents
- operationLocks
- signatures
- tariffs
- archives
- driverPortDuTransactions

### 🔒 Collection préservée

- **users** (tous les comptes utilisateurs restent intacts)

---

## 🧹 deleteAllAuthUsers.mjs

Script pour supprimer tous les utilisateurs Firebase Authentication (Auth).

**⚠️ Ce script supprime UNIQUEMENT Auth, PAS les documents Firestore users !**

### 🚀 Utilisation

```bash
node deleteAllAuthUsers.mjs
```

---

## 💡 Conseils

### Avant de supprimer

1. **Sauvegardez vos données** (export Firestore si nécessaire)
2. **Vérifiez** que vous êtes sur le bon projet Firebase
3. **Testez d'abord** sur un projet de développement

### Après suppression

Pour réinitialiser complètement le site :

1. Supprimer les données : `node deleteAllDataExceptUsers.mjs`
2. Les utilisateurs peuvent se reconnecter immédiatement
3. Créer de nouveaux colis/clients depuis zéro

### Alternative : Seed data

Si vous voulez réinitialiser avec des données de test, créez plutôt un script de seed qui :
1. Supprime les données
2. Crée des données de démonstration

---

## 🛡️ Sécurité

**Ne JAMAIS** commiter `serviceAccount.json` dans Git !

Vérifiez que `.gitignore` contient :
```
serviceAccount.json
*.json
!package.json
!package-lock.json
```
