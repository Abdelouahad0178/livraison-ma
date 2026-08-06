# 🧪 Guide Environnement de Test

## Vue d'ensemble

Environnement de test séparé avec une ville dédiée et des comptes pour chaque rôle.

---

## 📋 Comptes de Test

### 🏙️ Villes de Test : **TEST-AGADIR** et **TEST-CASABLANCA**

#### Agence TEST-AGADIR

| Rôle | Email | Mot de passe | Ville |
|------|-------|--------------|-------|
| **Chef d'Agence** | test-chef-agadir@arelanc.ma | Test123456! | TEST-AGADIR |
| **Agent Pro** | test-agentpro-agadir@arelanc.ma | Test123456! | TEST-AGADIR |
| **Agent Simple** | test-agent-agadir@arelanc.ma | Test123456! | TEST-AGADIR |
| **Aide Agent** | test-aide-agadir@arelanc.ma | Test123456! | TEST-AGADIR |
| **Chauffeur Local** | test-chauffeur-agadir@arelanc.ma | Test123456! | TEST-AGADIR |
| **Caissier** | test-caissier-agadir@arelanc.ma | Test123456! | TEST-AGADIR |

#### Agence TEST-CASABLANCA

| Rôle | Email | Mot de passe | Ville |
|------|-------|--------------|-------|
| **Chef d'Agence** | test-chef-casa@arelanc.ma | Test123456! | TEST-CASABLANCA |
| **Agent Pro** | test-agentpro-casa@arelanc.ma | Test123456! | TEST-CASABLANCA |
| **Agent Simple** | test-agent-casa@arelanc.ma | Test123456! | TEST-CASABLANCA |
| **Chauffeur Local** | test-chauffeur-casa@arelanc.ma | Test123456! | TEST-CASABLANCA |
| **Caissier** | test-caissier-casa@arelanc.ma | Test123456! | TEST-CASABLANCA |

#### Comptes Globaux (multi-villes)

| Rôle | Email | Mot de passe | Type |
|------|-------|--------------|------|
| **Chauffeur Transport** | test-transport@arelanc.ma | Test123456! | Inter-villes |
| **Directeur** | test-directeur@arelanc.ma | Test123456! | Toutes villes |

---

## 🎯 Utilisation

### 1. Se connecter à un compte test

```
1. Ouvrir le site : https://arelanc.web.app
2. Cliquer sur "Déconnexion" si connecté
3. Utiliser un des emails ci-dessus
4. Mot de passe : Test123456!
```

### 2. Navigation Privée (Recommandé)

Pour tester plusieurs rôles en même temps :

**Chrome/Edge :**
```
Ctrl + Shift + N (Windows)
Cmd + Shift + N (Mac)
```

**Firefox :**
```
Ctrl + Shift + P (Windows)
Cmd + Shift + P (Mac)
```

**Utilisation :**
- Fenêtre normale : Votre compte principal
- Fenêtre privée 1 : test-chef@arelanc.ma
- Fenêtre privée 2 : test-agent@arelanc.ma
- etc.

---

## 📦 Données de Test

### Clients de Test

#### Clients TEST-AGADIR
- **TEST-CLIENT-AGADIR-1** : Destinataire à TEST-AGADIR
- **TEST-CLIENT-AGADIR-2** : Destinataire à TEST-AGADIR
- **TEST-CLIENT-AGADIR-EXP** : Expéditeur à TEST-AGADIR

#### Clients TEST-CASABLANCA
- **TEST-CLIENT-CASA-1** : Destinataire à TEST-CASABLANCA
- **TEST-CLIENT-CASA-2** : Destinataire à TEST-CASABLANCA
- **TEST-CLIENT-CASA-EXP** : Expéditeur à TEST-CASABLANCA

### Expéditions de Test

**Types d'expéditions à tester :**
- 📍 **Locales** : TEST-AGADIR → TEST-AGADIR
- 🚚 **Inter-villes** : TEST-AGADIR → TEST-CASABLANCA
- 🔄 **Retour** : TEST-CASABLANCA → TEST-AGADIR

**Comment identifier une expédition de test :**
- Ville origine : TEST-AGADIR ou TEST-CASABLANCA
- Ville destination : TEST-AGADIR ou TEST-CASABLANCA
- N° EXP commence par "TEST-"
- Expéditeur/Destinataire contient "TEST"

---

## ⚠️ Règles Importantes

### ✅ À FAIRE :
- ✅ Utiliser UNIQUEMENT les comptes test pour vos tests
- ✅ Créer des expéditions dans TEST-AGADIR
- ✅ Tester les nouvelles fonctionnalités d'abord ici
- ✅ Supprimer les données de test inutiles régulièrement

### ❌ NE PAS FAIRE :
- ❌ Modifier les expéditions réelles pendant les tests
- ❌ Utiliser les comptes réels pendant les heures de travail
- ❌ Mélanger données de test et données réelles
- ❌ Partager les mots de passe des comptes de test

---

## 🔧 Maintenance

### Nettoyage mensuel

```bash
# Supprimer les expéditions de test > 30 jours
# Garder uniquement les données récentes
```

### Réinitialisation

Si l'environnement de test devient encombré :
1. Supprimer toutes les expéditions de TEST-AGADIR
2. Réinitialiser les comptes test (si nécessaire)
3. Recréer les clients de test

---

## 🚀 Scénarios de Test Courants

### Test 1 : Expédition Locale (même ville)
```
1. Se connecter : test-agent-agadir@arelanc.ma
2. Onglet : Nouvelle Expédition
3. Expéditeur : TEST-CLIENT-AGADIR-EXP
4. Destinataire : TEST-CLIENT-AGADIR-1
5. Origine : TEST-AGADIR
6. Destination : TEST-AGADIR
7. Type : Simple ou avec COD
8. Sauvegarder
```

### Test 2 : Expédition Inter-villes
```
1. Se connecter : test-agent-agadir@arelanc.ma
2. Onglet : Nouvelle Expédition
3. Expéditeur : TEST-CLIENT-AGADIR-EXP
4. Destinataire : TEST-CLIENT-CASA-1
5. Origine : TEST-AGADIR
6. Destination : TEST-CASABLANCA
7. Type : Chèque (COD 500 DH)
8. Sauvegarder
```

### Test 3 : Modifier Type de Service
```
1. Se connecter : test-chef-agadir@arelanc.ma
2. Onglet : Expéditions
3. Cliquer "Éditer" sur une expédition
4. Modifier Type de service (Simple → Chèque)
5. Vérifier que Montant COD apparaît
6. Entrer montant : 300 DH
7. Sauvegarder
8. Vérifier affichage dans tableau
```

### Test 4 : Chauffeur Transport (inter-villes)
```
1. Se connecter : test-transport@arelanc.ma
2. Voir expéditions TEST-AGADIR → TEST-CASABLANCA
3. Assigner à soi-même
4. Changer statut "En Transit"
5. Marquer comme "Arrivé à TEST-CASABLANCA"
```

### Test 5 : Réception à destination
```
1. Se connecter : test-agent-casa@arelanc.ma
2. Voir les expéditions arrivées de TEST-AGADIR
3. Assigner au chauffeur local
4. Se connecter : test-chauffeur-casa@arelanc.ma
5. Livrer l'expédition
6. Collecter le COD si applicable
```

### Test 6 : Multi-sessions (temps réel)
```
1. Fenêtre normale : test-chef-agadir@arelanc.ma
2. Fenêtre privée : test-agent-agadir@arelanc.ma
3. L'agent crée une expédition
4. Le chef la voit apparaître en temps réel
5. Le chef modifie l'expédition
6. L'agent voit la modification instantanément
```

### Test 7 : Service "Retour BL"
```
1. Se connecter : test-agentpro-agadir@arelanc.ma
2. Créer expédition avec Type de service : Retour BL
3. Vérifier que Montant COD n'apparaît PAS
4. Sauvegarder
5. Vérifier dans tableau : Service = "🧾 Retour BL", COD = vide
```

---

## 📊 Dashboard de Test

### Statistiques à vérifier par ville :

**TEST-AGADIR :**
- Nombre d'expéditions créées
- Expéditions locales (TEST-AGADIR → TEST-AGADIR)
- Expéditions envoyées vers TEST-CASABLANCA
- Expéditions reçues de TEST-CASABLANCA
- Montant COD total
- Expéditions par statut
- Livreurs actifs

**TEST-CASABLANCA :**
- Nombre d'expéditions créées
- Expéditions locales (TEST-CASABLANCA → TEST-CASABLANCA)
- Expéditions envoyées vers TEST-AGADIR
- Expéditions reçues de TEST-AGADIR
- Montant COD total
- Expéditions par statut

---

## 🔐 Sécurité

### Isolation des données :
- ✅ Les comptes de TEST-AGADIR voient uniquement les données de TEST-AGADIR
- ✅ Les comptes de TEST-CASABLANCA voient uniquement les données de TEST-CASABLANCA
- ✅ Les comptes réels (villes réelles) ne voient PAS les données de test
- ✅ Les comptes de test ne voient PAS les données réelles
- ✅ Le Directeur et Chauffeur Transport voient les deux villes de test
- ✅ Aucun risque de contamination entre test et production

### Mots de passe :
- Changez `Test123456!` après la création si nécessaire
- Ne partagez pas ces comptes avec les utilisateurs finaux

---

## 📞 Support

Si vous rencontrez un problème avec l'environnement de test :
1. Vérifiez que vous êtes connecté au bon compte
2. Vérifiez que la ville est bien TEST-AGADIR
3. Nettoyez le cache du navigateur (Ctrl+Shift+Delete)
4. Essayez en navigation privée

---

## 🎓 Bonnes Pratiques

### Avant de déployer en production :
1. ✅ Tester d'abord dans TEST-AGADIR
2. ✅ Vérifier avec au moins 2 rôles différents
3. ✅ Tester les cas limites (COD = 0, texte vide, etc.)
4. ✅ Vérifier l'affichage mobile ET desktop
5. ✅ Attendre 5 minutes, rafraîchir, revérifier

### Après un déploiement :
1. ✅ Tester en TEST-AGADIR immédiatement
2. ✅ Demander à un utilisateur réel de vérifier
3. ✅ Monitorer les erreurs pendant 1 heure

---

**Date de création :** 2026-08-06
**Dernière mise à jour :** 2026-08-06
**Créé par :** Claude Sonnet 4.5
