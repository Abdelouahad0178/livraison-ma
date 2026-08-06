# 🧪 Configuration Environnement de Test

## ⚡ Démarrage Rapide

### Option 1 : Création manuelle (RECOMMANDÉ)

Créez les comptes directement depuis Firebase Console :

1. **Firebase Console** → Authentication → Add user
2. Créez chaque compte avec :
   - Email : `test-xxx@arelanc.ma` (voir liste ci-dessous)
   - Password : `Test123456!`

3. **Firestore** → users → Ajoutez un document pour chaque UID créé :
   ```json
   {
     "email": "test-chef-agadir@arelanc.ma",
     "name": "Chef Test Agadir",
     "role": "chef_agence",
     "city": "TEST-AGADIR",
     "isTestAccount": true,
     "createdAt": "2026-08-06T..."
   }
   ```

**Comptes à créer (minimum 2 villes) :**

**TEST-AGADIR :**
- `test-chef-agadir@arelanc.ma` - Chef d'agence
- `test-agentpro-agadir@arelanc.ma` - Agent Pro
- `test-agent-agadir@arelanc.ma` - Agent Simple
- `test-chauffeur-agadir@arelanc.ma` - Chauffeur Local

**TEST-CASABLANCA :**
- `test-chef-casa@arelanc.ma` - Chef d'agence
- `test-agentpro-casa@arelanc.ma` - Agent Pro
- `test-agent-casa@arelanc.ma` - Agent Simple
- `test-chauffeur-casa@arelanc.ma` - Chauffeur Local

**MULTI-VILLES :**
- `test-transport@arelanc.ma` - Chauffeur Transport
- `test-directeur@arelanc.ma` - Directeur

---

### Option 2 : Script automatique (nécessite configuration)

⚠️ **Avant d'exécuter le script :**

1. **Obtenir la configuration Firebase**
   ```bash
   # Lire la config actuelle
   cat src/firebase/config.ts
   ```

2. **Modifier le script**
   - Ouvrir `scripts/creer-environnement-test.ts`
   - Remplacer les placeholders par votre vraie configuration Firebase

3. **Exécuter le script**
   ```bash
   npx tsx scripts/creer-environnement-test.ts
   ```

---

## 📖 Documentation Complète

Voir [GUIDE_ENVIRONNEMENT_TEST.md](./GUIDE_ENVIRONNEMENT_TEST.md) pour :
- Liste complète des comptes
- Instructions d'utilisation
- Scénarios de test
- Bonnes pratiques
- Navigation privée multi-sessions

---

## 🎯 Utilisation Immédiate

### Tester avec un compte

1. Ouvrir : https://arelanc.web.app
2. Se connecter avec : `test-chef@arelanc.ma` / `Test123456!`
3. Créer une expédition de test dans **TEST-AGADIR**

### Tester avec plusieurs rôles simultanément

**Chrome/Edge :**
```
Ctrl + Shift + N (ouvre fenêtre privée)
```

**Utilisation :**
- Fenêtre 1 (normale) : Votre compte principal
- Fenêtre 2 (privée) : `test-chef@arelanc.ma`
- Fenêtre 3 (privée) : `test-agent@arelanc.ma`

Chaque fenêtre = session indépendante = pas de conflit !

---

## 🛡️ Isolation des Données

### Comment ça fonctionne ?

Les données sont isolées par **ville** :
- Comptes de test → `city: "TEST-AGADIR"` ou `"TEST-CASABLANCA"`
- Expéditions de test → `originCity: "TEST-AGADIR"` ou `"TEST-CASABLANCA"`
- Filtres automatiques par ville dans toutes les pages

**Résultat :**
- ✅ Les utilisateurs réels NE VOIENT PAS les données de test
- ✅ Les comptes de test NE VOIENT PAS les données réelles
- ✅ TEST-AGADIR et TEST-CASABLANCA sont isolés des villes réelles
- ✅ Possibilité de tester les expéditions inter-villes (AGADIR ↔ CASA)
- ✅ Aucun risque de contamination

---

## 🔄 Workflow de Test Recommandé

### Avant chaque modification :

1. **Tester d'abord dans TEST-AGADIR**
   ```
   - Se connecter avec test-chef@arelanc.ma
   - Créer une expédition de test
   - Vérifier la fonctionnalité
   ```

2. **Tester avec 2+ rôles**
   ```
   - Fenêtre 1 : test-chef (modifier l'expédition)
   - Fenêtre 2 : test-agent (voir la modification)
   - Vérifier la synchronisation en temps réel
   ```

3. **Tester mobile**
   ```
   - Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M)
   - Tester sur iPhone SE, Pixel, iPad
   ```

4. **Déployer en production**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

5. **Re-tester immédiatement après déploiement**
   ```
   - Se connecter avec test-chef@arelanc.ma
   - Vérifier que tout fonctionne
   - Attendre 5 min, rafraîchir, revérifier
   ```

---

## 🧹 Nettoyage

### Supprimer les données de test

Depuis Firebase Console :

1. **Firestore** → parcels
2. Filtrer : `originCity == "TEST-AGADIR"`
3. Supprimer les documents > 30 jours

### Réinitialiser un compte test

1. **Firebase Console** → Authentication
2. Trouver `test-xxx@arelanc.ma`
3. Réinitialiser le mot de passe si nécessaire

---

## ❓ FAQ

### Q : Les comptes de test interfèrent-ils avec les vrais utilisateurs ?
**R :** Non. Isolation complète par ville (TEST-AGADIR vs villes réelles).

### Q : Puis-je tester en même temps qu'un vrai utilisateur ?
**R :** Oui ! Utilisez les comptes de test dans une fenêtre privée.

### Q : Que se passe-t-il si je modifie la même expédition simultanément ?
**R :** Firebase : last-write-wins. La dernière modification gagne.

### Q : Dois-je supprimer les données de test régulièrement ?
**R :** Recommandé mensuel. Garde la base propre et les tests rapides.

### Q : Puis-je créer des expéditions réelles depuis un compte de test ?
**R :** Techniquement oui, mais NE LE FAITES PAS. Utilisez uniquement TEST-AGADIR.

---

## 📞 Support

Problème avec l'environnement de test ?

1. Vérifier le compte utilisé (test-xxx@arelanc.ma)
2. Vérifier la ville (TEST-AGADIR)
3. Vider le cache navigateur (Ctrl+Shift+Delete)
4. Tester en navigation privée

---

**Créé le :** 2026-08-06
**Par :** Claude Sonnet 4.5
