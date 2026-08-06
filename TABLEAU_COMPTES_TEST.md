# 📊 Tableau Récapitulatif - Comptes de Test

## 🔐 Mot de passe universel : `Test123456!`

---

## 📋 Liste Complète des Comptes à Créer

| # | Email | Nom Firestore | Rôle | Ville | Type Chauffeur |
|---|-------|---------------|------|-------|----------------|
| 1 | test-chef-agadir@arelanc.ma | Chef Test Agadir | chef_agence | TEST-AGADIR | - |
| 2 | test-agentpro-agadir@arelanc.ma | Agent Pro Test Agadir | agentpro | TEST-AGADIR | - |
| 3 | test-agent-agadir@arelanc.ma | Agent Test Agadir | agent | TEST-AGADIR | - |
| 4 | test-chauffeur-agadir@arelanc.ma | Chauffeur Test Agadir | chauffeur | TEST-AGADIR | local |
| 5 | test-chef-casa@arelanc.ma | Chef Test Casablanca | chef_agence | TEST-CASABLANCA | - |
| 6 | test-agentpro-casa@arelanc.ma | Agent Pro Test Casablanca | agentpro | TEST-CASABLANCA | - |
| 7 | test-agent-casa@arelanc.ma | Agent Test Casablanca | agent | TEST-CASABLANCA | - |
| 8 | test-chauffeur-casa@arelanc.ma | Chauffeur Test Casablanca | chauffeur | TEST-CASABLANCA | local |
| 9 | test-transport@arelanc.ma | Transport Test | chauffeur | TEST-AGADIR | transport |
| 10 | test-directeur@arelanc.ma | Directeur Test | directeur | TEST-AGADIR | - |

---

## ✅ Checklist de Création

### Firebase Authentication (10 comptes)

- [ ] test-chef-agadir@arelanc.ma
- [ ] test-agentpro-agadir@arelanc.ma
- [ ] test-agent-agadir@arelanc.ma
- [ ] test-chauffeur-agadir@arelanc.ma
- [ ] test-chef-casa@arelanc.ma
- [ ] test-agentpro-casa@arelanc.ma
- [ ] test-agent-casa@arelanc.ma
- [ ] test-chauffeur-casa@arelanc.ma
- [ ] test-transport@arelanc.ma
- [ ] test-directeur@arelanc.ma

### Firestore users (10 documents)

- [ ] Chef Agadir (chef_agence, TEST-AGADIR)
- [ ] Agent Pro Agadir (agentpro, TEST-AGADIR)
- [ ] Agent Agadir (agent, TEST-AGADIR)
- [ ] Chauffeur Agadir (chauffeur, TEST-AGADIR, local)
- [ ] Chef Casa (chef_agence, TEST-CASABLANCA)
- [ ] Agent Pro Casa (agentpro, TEST-CASABLANCA)
- [ ] Agent Casa (agent, TEST-CASABLANCA)
- [ ] Chauffeur Casa (chauffeur, TEST-CASABLANCA, local)
- [ ] Transport (chauffeur, TEST-AGADIR, transport)
- [ ] Directeur (directeur, TEST-AGADIR)

### Tests de Connexion

- [ ] Test connexion test-chef-agadir@arelanc.ma
- [ ] Test connexion test-agent-agadir@arelanc.ma
- [ ] Créer une expédition de test

---

## 🎯 Template pour Copier-Coller (Firestore)

### Pour comptes SANS chauffeurType :

```
email: [voir tableau ci-dessus]
name: [voir tableau ci-dessus]
role: [voir tableau ci-dessus]
city: [voir tableau ci-dessus]
isTestAccount: true
createdAt: [timestamp actuel]
```

### Pour comptes chauffeur (avec chauffeurType) :

```
email: [voir tableau ci-dessus]
name: [voir tableau ci-dessus]
role: chauffeur
city: [voir tableau ci-dessus]
chauffeurType: [local ou transport - voir tableau]
isTestAccount: true
createdAt: [timestamp actuel]
```

---

## 🔍 Vérification Rapide

Après création, dans Firebase Console :

**Authentication :**
```
Nombre d'utilisateurs avec @arelanc.ma et "test-" : 10
```

**Firestore → users :**
```
Filtrer : isTestAccount == true
Résultat : 10 documents
```

---

## 🧪 Premier Test Recommandé

```
URL: https://arelanc.web.app
Email: test-chef-agadir@arelanc.ma
Password: Test123456!

Attendu:
✅ Connexion réussie
✅ Nom: "Chef Test Agadir"
✅ Ville: "TEST-AGADIR"
✅ Page: Chef d'Agence avec tous les onglets
```

---

**Utilisez ce tableau pour cocher au fur et à mesure !**
