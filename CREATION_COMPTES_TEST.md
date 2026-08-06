# 🛠️ Guide de Création des Comptes de Test - Étape par Étape

## 🎯 Objectif
Créer 10 comptes de test pour 2 villes (TEST-AGADIR et TEST-CASABLANCA)

---

## 📋 Étape 1 : Créer les Comptes dans Firebase Authentication

### 1.1 Ouvrir Firebase Console

1. Aller sur : https://console.firebase.google.com/
2. Sélectionner votre projet **arelanc**
3. Menu gauche → **Authentication**
4. Onglet **Users**
5. Cliquer **Add user**

---

### 1.2 Créer les Comptes (un par un)

Pour CHAQUE compte ci-dessous, cliquer **Add user** et remplir :

#### Agence TEST-AGADIR (4 comptes)

**Compte 1/10 - Chef d'Agence Agadir**
```
Email: test-chef-agadir@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

**Compte 2/10 - Agent Pro Agadir**
```
Email: test-agentpro-agadir@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

**Compte 3/10 - Agent Simple Agadir**
```
Email: test-agent-agadir@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

**Compte 4/10 - Chauffeur Agadir**
```
Email: test-chauffeur-agadir@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

---

#### Agence TEST-CASABLANCA (4 comptes)

**Compte 5/10 - Chef d'Agence Casa**
```
Email: test-chef-casa@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

**Compte 6/10 - Agent Pro Casa**
```
Email: test-agentpro-casa@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

**Compte 7/10 - Agent Simple Casa**
```
Email: test-agent-casa@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

**Compte 8/10 - Chauffeur Casa**
```
Email: test-chauffeur-casa@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

---

#### Comptes Multi-villes (2 comptes)

**Compte 9/10 - Chauffeur Transport**
```
Email: test-transport@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

**Compte 10/10 - Directeur**
```
Email: test-directeur@arelanc.ma
Password: Test123456!
```
→ Cliquer **Add user**

---

## ✅ Vérification Étape 1
Vous devriez avoir **10 nouveaux utilisateurs** dans Authentication.

---

## 📋 Étape 2 : Créer les Profils dans Firestore

### 2.1 Ouvrir Firestore

1. Menu gauche → **Firestore Database**
2. Chercher la collection **users**
3. Pour CHAQUE compte créé, **copier son UID** et créer le profil

---

### 2.2 Comment trouver l'UID d'un utilisateur

1. **Authentication** → **Users**
2. Trouver `test-chef-agadir@arelanc.ma`
3. Copier son **User UID** (exemple: `abc123def456...`)

---

### 2.3 Créer les Documents Firestore

Pour CHAQUE utilisateur, aller dans **Firestore Database** → **users** → **Add document** :

#### Compte 1/10 - Chef Agadir

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-chef-agadir@arelanc.ma
name (string): Chef Test Agadir
role (string): chef_agence
city (string): TEST-AGADIR
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 2/10 - Agent Pro Agadir

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-agentpro-agadir@arelanc.ma
name (string): Agent Pro Test Agadir
role (string): agentpro
city (string): TEST-AGADIR
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 3/10 - Agent Simple Agadir

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-agent-agadir@arelanc.ma
name (string): Agent Test Agadir
role (string): agent
city (string): TEST-AGADIR
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 4/10 - Chauffeur Agadir

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-chauffeur-agadir@arelanc.ma
name (string): Chauffeur Test Agadir
role (string): chauffeur
city (string): TEST-AGADIR
chauffeurType (string): local
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 5/10 - Chef Casa

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-chef-casa@arelanc.ma
name (string): Chef Test Casablanca
role (string): chef_agence
city (string): TEST-CASABLANCA
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 6/10 - Agent Pro Casa

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-agentpro-casa@arelanc.ma
name (string): Agent Pro Test Casablanca
role (string): agentpro
city (string): TEST-CASABLANCA
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 7/10 - Agent Simple Casa

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-agent-casa@arelanc.ma
name (string): Agent Test Casablanca
role (string): agent
city (string): TEST-CASABLANCA
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 8/10 - Chauffeur Casa

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-chauffeur-casa@arelanc.ma
name (string): Chauffeur Test Casablanca
role (string): chauffeur
city (string): TEST-CASABLANCA
chauffeurType (string): local
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 9/10 - Chauffeur Transport

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-transport@arelanc.ma
name (string): Transport Test
role (string): chauffeur
city (string): TEST-AGADIR
chauffeurType (string): transport
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

#### Compte 10/10 - Directeur

```
Document ID: [UID copié depuis Authentication]

Champs :
email (string): test-directeur@arelanc.ma
name (string): Directeur Test
role (string): directeur
city (string): TEST-AGADIR
isTestAccount (boolean): true
createdAt (timestamp): [Date actuelle]
```

---

## ✅ Vérification Étape 2

Dans **Firestore Database** → **users**, vous devriez avoir **10 nouveaux documents**.

---

## 📋 Étape 3 : Tester un Compte

### 3.1 Test de Connexion

1. Ouvrir : https://arelanc.web.app
2. Se déconnecter si connecté
3. Email : `test-chef-agadir@arelanc.ma`
4. Mot de passe : `Test123456!`
5. Se connecter

### 3.2 Vérifications

✅ Connexion réussie
✅ Nom affiché : "Chef Test Agadir"
✅ Ville : "TEST-AGADIR"
✅ Page : Chef d'Agence

---

## 📋 Étape 4 (OPTIONNEL) : Créer une Expédition de Test

### 4.1 Se connecter avec test-agent-agadir@arelanc.ma

### 4.2 Créer une expédition locale

**Nouvelle Expédition :**
```
Expéditeur :
  - Nom: TEST-CLIENT-AGADIR
  - Ville: TEST-AGADIR
  - Téléphone: 0600000001

Destinataire :
  - Nom: TEST-DEST-AGADIR
  - Ville: TEST-AGADIR
  - Téléphone: 0600000002

Type de service: Simple
Type de port: Port payé
Poids: 1 kg
Prix: 50 DH
```

### 4.3 Vérifier l'expédition

✅ Expédition créée
✅ Visible dans la liste
✅ Statut : Initialisé
✅ Ville : TEST-AGADIR

---

## 🎉 Environnement de Test Prêt !

Vous pouvez maintenant :

1. ✅ Tester avec plusieurs rôles (fenêtres privées)
2. ✅ Créer des expéditions de test
3. ✅ Tester les modifications (Simple → Chèque, etc.)
4. ✅ Tester les expéditions inter-villes (AGADIR → CASA)
5. ✅ Isoler vos tests des données réelles

---

## 📚 Prochaines Étapes

Consultez :
- [GUIDE_ENVIRONNEMENT_TEST.md](./GUIDE_ENVIRONNEMENT_TEST.md) - Scénarios de test
- [README_ENVIRONNEMENT_TEST.md](./README_ENVIRONNEMENT_TEST.md) - Utilisation quotidienne

---

**Date :** 2026-08-06
**Créé par :** Claude Sonnet 4.5
