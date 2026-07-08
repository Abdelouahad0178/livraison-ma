# ✅ Checklist Tests Workflows Critiques - Production

## 🎯 Comment utiliser cette checklist

**AVANT chaque déploiement production**:
1. ✅ Cochez chaque élément testé
2. ❌ Notez les bugs trouvés
3. 🔧 Corrigez avant de déployer
4. ♻️ Re-testez après correction

**Rôles nécessaires pour tests**:
- 👔 Chef d'agence
- 🚚 Livreur
- 🚛 Chauffeur

---

## 📋 WORKFLOW 1: Création Expédition (CRITIQUE) ⭐⭐⭐⭐⭐

### Test 1.1: Création Simple

**Rôle**: Chef d'agence  
**Durée**: 2 minutes

- [ ] **Connexion**
  - Se connecter avec compte chef
  - Page d'accueil s'affiche
  
- [ ] **Raccourci Ctrl+Enter**
  - Appuyer Ctrl+Enter depuis accueil
  - Formulaire s'affiche
  - Curseur sur champ "N EXP"

- [ ] **Navigation clavier - Expéditeur**
  - Taper N EXP (ex: 353)
  - Appuyer Enter → Curseur sur "Nom complet"
  - Taper 2 lettres d'un client existant
  - Liste autocomplete s'affiche
  - Flèche Bas → Client surligné
  - Espace → Client sélectionné
  - Tous les champs expéditeur remplis automatiquement

- [ ] **Navigation clavier - Destinataire**
  - Appuyer Enter → Curseur sur "Ville destination"
  - Sélectionner ville
  - Enter → Curseur sur "Nom destinataire"
  - Autocomplete fonctionne
  - Adresse se remplit automatiquement

- [ ] **Détails colis**
  - Enter × N → Tous les champs se remplissent
  - Poids, Nb colis, Nature marchandise
  - Type service sélectionné

- [ ] **Validation**
  - Appuyer Espace sur bouton "Créer Expédition"
  - Modal de confirmation s'affiche
  - Curseur sur bouton "Valider et Imprimer"
  - Enter → Bon de ramassage s'affiche

- [ ] **Nouveau colis rapide**
  - Ctrl+Enter sur bon de ramassage
  - Formulaire vide s'affiche
  - Curseur sur N EXP

**Résultat attendu**: ✅ Colis créé en < 30 secondes

---

### Test 1.2: Autocomplete Navigateur Conditionnel

**Rôle**: Chef d'agence  
**Durée**: 1 minute

- [ ] **Firebase a des résultats**
  - Taper nom client existant
  - Liste Firebase s'affiche
  - Liste navigateur ne s'affiche PAS

- [ ] **Firebase n'a pas de résultats**
  - Taper nom inexistant ("ZZZZZZ")
  - Liste Firebase vide
  - Liste navigateur s'affiche (historique)

**Résultat attendu**: ✅ Autocomplete intelligent

---

### Test 1.3: Port Dû et COD

**Rôle**: Chef d'agence  
**Durée**: 2 minutes

- [ ] **Service C/Espèces**
  - Créer colis type "C/Espèces"
  - Entrer RETOUR FOND (ex: 5000 DH)
  - Valider → Bon affiche montant COD

- [ ] **Port Dû**
  - Créer colis "Port dû"
  - Valider → Bon affiche "Port dû"
  - Prix calculé automatiquement

**Résultat attendu**: ✅ Montants corrects

---

### Test 1.4: En Gare (Adresse Optionnelle)

**Rôle**: Chef d'agence  
**Durée**: 1 minute

- [ ] **Avec En Gare**
  - Créer colis
  - Cocher "En gare"
  - Laisser adresse vide
  - ✅ Validation OK

- [ ] **Sans En Gare ni Livreur**
  - Ne PAS cocher "En gare"
  - Ne PAS sélectionner livreur
  - Laisser adresse vide
  - ❌ Erreur: "Adresse destinataire requise"

**Résultat attendu**: ✅ Validation conditionnelle fonctionne

---

## 📋 WORKFLOW 2: Signature Livreur (CRITIQUE) ⭐⭐⭐⭐⭐

### Test 2.1: Signature Électronique

**Rôle**: Livreur  
**Durée**: 2 minutes

- [ ] **Connexion livreur**
  - Se connecter avec compte livreur
  - Onglet "À livrer" visible

- [ ] **Trouver colis**
  - Créer colis assigné au livreur (en tant que chef)
  - Se reconnecter en tant que livreur
  - Colis apparaît dans "À livrer"

- [ ] **Signature électronique**
  - Clic bouton "Élec." (vert)
  - Modal signature s'affiche
  - Dessiner signature avec souris
  - Valider
  - ✅ Statut → "Livré"

- [ ] **Port dû affiché**
  - Si colis "Port dû"
  - Montant s'affiche dans modal
  - Pour livreur simple ET deliveryDriver

**Résultat attendu**: ✅ Signature OK, Port dû visible

---

### Test 2.2: Signature Papier

**Rôle**: Livreur  
**Durée**: 2 minutes

- [ ] **Bon papier**
  - Clic bouton "Papier"
  - Modal confirmation s'affiche
  - Curseur sur bouton validation
  - Enter → Validation

- [ ] **Port dû visible**
  - Si port dû → Montant affiché
  - Pour livreur simple (pas seulement deliveryDriver)

- [ ] **Statut mis à jour**
  - ✅ Colis → "Livré"
  - Visible dans "Terminés"

**Résultat attendu**: ✅ Papier OK, Port dû visible

---

### Test 2.3: Refus Livraison

**Rôle**: Livreur  
**Durée**: 1 minute

- [ ] **Bouton Refus visible**
  - Bouton "Refus" (rouge) affiché
  - Pour livreur ET chauffeur

- [ ] **Refuser colis**
  - Clic "Refus"
  - Indiquer raison
  - Valider
  - ✅ Statut → "Retour en transit"

**Résultat attendu**: ✅ Refus fonctionne

---

### Test 2.4: Filtrage Retours Finalisés

**Rôle**: Livreur  
**Durée**: 1 minute

- [ ] **Créer retour finalisé**
  - Créer colis
  - Marquer comme "Retour finalisé"

- [ ] **Vérifier filtrage**
  - Onglet "À livrer"
  - ❌ Retour finalisé NE s'affiche PAS
  - Onglet "Terminés"
  - ✅ Retour finalisé s'affiche

**Résultat attendu**: ✅ Filtrage correct

---

## 📋 WORKFLOW 3: Arrivages (CRITIQUE) ⭐⭐⭐⭐

### Test 3.1: Créer Arrivage

**Rôle**: Chef d'agence  
**Durée**: 3 minutes

- [ ] **Nouveau arrivage**
  - Onglet "Arrivage"
  - Entrer N° Tracking (ex: LMA-XXX)
  - Système détecte colis

- [ ] **Colis arrivés**
  - ✅ Colis dans liste "arrivés"
  - Nombre de colis correct

- [ ] **Colis manquants**
  - ❌ Colis manquants détectés
  - Listés séparément

- [ ] **Confirmer arrivage**
  - Valider arrivage
  - ✅ Arrivage créé
  - Visible dans historique

**Résultat attendu**: ✅ Arrivage OK

---

### Test 3.2: Modifier Arrivage Historique ⭐ NOUVEAU

**Rôle**: Chef d'agence  
**Durée**: 3 minutes

- [ ] **Ouvrir historique**
  - Onglet "Arrivage" → "Historique"
  - Sélectionner arrivage finalisé
  - Clic pour déplier

- [ ] **Interface modification visible**
  - Liste colis arrivés affichée
  - Boutons +/- pour multi-colis
  - Bouton X pour retirer
  - Champ recherche pour ajouter

- [ ] **Pointer/Dépointer**
  - Clic sur colis → Pointé
  - Re-clic → Dépointé
  - Checkbox verte/grise

- [ ] **Modifier nombre colis**
  - Colis multi-colis (ex: 4/4)
  - Clic "-" → 3/4
  - Clic "+" → 4/4

- [ ] **Retirer colis**
  - Clic bouton X sur colis
  - Confirmation
  - ✅ Colis retiré de liste

- [ ] **Ajouter colis manquant**
  - Entrer N° Tracking dans recherche
  - Clic "Ajouter"
  - ✅ Colis ajouté à liste

- [ ] **Sauvegarder modifications**
  - Clic "Enregistrer" OU "Valider pointage"
  - ✅ Modifications enregistrées
  - Totaux mis à jour

**Résultat attendu**: ✅ Modification historique OK

---

## 📋 WORKFLOW 4: Tableaux & Impressions (IMPORTANT) ⭐⭐⭐⭐

### Test 4.1: Vue Tableau Expéditions

**Rôle**: Chef d'agence  
**Durée**: 2 minutes

- [ ] **Basculer en tableau**
  - Onglet "Expéditions"
  - Clic bouton "Tableau"
  - Vue tableau s'affiche

- [ ] **Totaux affichés**
  - Section totaux visible en haut
  - 💰 Total RETOUR FOND correct
  - 📮 Total Port dû correct
  - 📦 Nombre expéditions correct

- [ ] **Colonnes visibles**
  - N° EXP (pas 1,2,3...)
  - Date, Statut, Expéditeur, Destinataire
  - Service, COD, Actions

- [ ] **Scroll horizontal**
  - Tableau plus large que écran
  - Scroll horizontal fonctionne

**Résultat attendu**: ✅ Tableau complet

---

### Test 4.2: Impression Tableau

**Rôle**: Chef d'agence  
**Durée**: 1 minute

- [ ] **Bouton imprimer**
  - Vue tableau active
  - Clic "Imprimer"
  - Aperçu impression s'affiche

- [ ] **Contenu impression**
  - N° EXP affichés (pas 1,2,3)
  - Logo BG Express
  - Adresse agence
  - Totaux COD et Port dû
  - Format paysage A4

**Résultat attendu**: ✅ PDF propre

---

### Test 4.3: Tableau Livreur

**Rôle**: Livreur  
**Durée**: 2 minutes

- [ ] **Vue tableau**
  - Page livreur
  - Clic bouton "Tableau"
  - Tableau s'affiche

- [ ] **Totaux**
  - Total COD visible
  - Total Port dû visible

- [ ] **Impression**
  - Clic "Imprimer"
  - Secteur affiché dans en-tête
  - Adresse agence affichée

**Résultat attendu**: ✅ Tableau livreur OK

---

## 📋 WORKFLOW 5: Retours (IMPORTANT) ⭐⭐⭐

### Test 5.1: Créer Retour

**Rôle**: Chef d'agence  
**Durée**: 2 minutes

- [ ] **Initier retour**
  - Sélectionner colis "Livré"
  - Créer retour
  - Raison indiquée

- [ ] **Statut mis à jour**
  - ✅ Statut → "Retour en transit"
  - Visible dans liste retours

**Résultat attendu**: ✅ Retour créé

---

### Test 5.2: Finaliser Retour

**Rôle**: Chef d'agence  
**Durée**: 1 minute

- [ ] **Retour arrive**
  - Marquer retour comme arrivé
  - ✅ Statut → "Retour finalisé"

- [ ] **Filtrage livreur**
  - Se connecter en livreur
  - Onglet "À livrer"
  - ❌ Retour finalisé PAS visible
  - Onglet "Terminés"
  - ✅ Retour finalisé visible

**Résultat attendu**: ✅ Retour finalisé OK

---

## 📋 WORKFLOW 6: Permissions Rôles (SÉCURITÉ) ⭐⭐⭐⭐⭐

### Test 6.1: Livreur - Permissions Limitées

**Rôle**: Livreur  
**Durée**: 2 minutes

- [ ] **Peut faire**:
  - ✅ Voir ses colis assignés
  - ✅ Signer (électronique + papier)
  - ✅ Refuser livraison

- [ ] **Ne peut PAS faire**:
  - ❌ Modifier statut autres colis
  - ❌ Créer expéditions
  - ❌ Accéder caisse
  - ❌ Modifier arrivages

**Résultat attendu**: ✅ Permissions correctes

---

### Test 6.2: Chef - Toutes Permissions

**Rôle**: Chef d'agence  
**Durée**: 2 minutes

- [ ] **Peut tout faire**:
  - ✅ Créer expéditions
  - ✅ Gérer arrivages
  - ✅ Voir caisse
  - ✅ Modifier retours
  - ✅ Imprimer tableaux

**Résultat attendu**: ✅ Accès complet

---

## 📱 WORKFLOW 7: Tests Multi-Navigateurs (COMPATIBILITÉ) ⭐⭐⭐

### Test 7.1: Chrome

**Appareil**: Desktop Chrome  
**Durée**: 5 minutes

- [ ] **Tous workflows principaux**:
  - Création expédition ✅
  - Signature ✅
  - Arrivages ✅
  - Impressions ✅

---

### Test 7.2: Firefox

**Appareil**: Desktop Firefox  
**Durée**: 5 minutes

- [ ] **Même tests que Chrome**

---

### Test 7.3: Mobile (Livreur)

**Appareil**: Smartphone (Chrome/Safari)  
**Durée**: 3 minutes

- [ ] **Interface responsive**
  - Boutons assez grands
  - Texte lisible

- [ ] **Signature tactile**
  - Modal signature s'affiche
  - Dessin au doigt fonctionne
  - Signature enregistrée

- [ ] **Scanner code-barres** (si activé)
  - Caméra s'ouvre
  - Scan QR code fonctionne

**Résultat attendu**: ✅ Mobile OK

---

## 🔒 WORKFLOW 8: Sécurité & Données (CRITIQUE) ⭐⭐⭐⭐⭐

### Test 8.1: Authentification

**Durée**: 2 minutes

- [ ] **Login valide**
  - Email + password corrects
  - ✅ Connexion réussie

- [ ] **Login invalide**
  - Mauvais password
  - ❌ Erreur affichée
  - Pas d'accès

- [ ] **Session expirée**
  - Attendre 1h ou forcer logout
  - ❌ Redirigé vers login
  - Données sauvegardées

**Résultat attendu**: ✅ Auth sécurisée

---

### Test 8.2: Sauvegarde Données

**Durée**: 2 minutes

- [ ] **Créer colis**
  - Remplir formulaire à moitié
  - Rafraîchir page (Ctrl+F5)
  - ⚠️ Données perdues (normal)

- [ ] **Colis créé**
  - Créer colis complet
  - Rafraîchir page
  - ✅ Colis toujours visible

**Résultat attendu**: ✅ Persistence OK

---

## 📊 RÉCAPITULATIF FINAL

### Nombre total de tests: **38 tests**

### Répartition par criticité:
- ⭐⭐⭐⭐⭐ **Critique**: 5 workflows (21 tests)
- ⭐⭐⭐⭐ **Important**: 2 workflows (9 tests)
- ⭐⭐⭐ **Normal**: 1 workflow (2 tests)

### Temps total estimé: **~45 minutes**

---

## ✅ Validation Finale

**AVANT de déployer en production**:

- [ ] ✅ **100% des tests critiques** (⭐⭐⭐⭐⭐) passent
- [ ] ✅ **90%+ des tests importants** (⭐⭐⭐⭐) passent
- [ ] ✅ **Backup Firestore** configuré
- [ ] ✅ **Sentry** configuré
- [ ] ✅ **Guide utilisateur** distribué

---

## 🐛 Template Rapport de Bug

Si vous trouvez un bug:

```
📅 Date: [DATE]
👤 Testeur: [NOM]
🎯 Test: [NUMÉRO TEST]

❌ PROBLÈME:
[Description claire du bug]

📱 ENVIRONNEMENT:
- Navigateur: [Chrome/Firefox/Safari]
- Appareil: [Desktop/Mobile]
- Rôle: [Chef/Livreur/Chauffeur]

🔄 ÉTAPES POUR REPRODUIRE:
1. [Étape 1]
2. [Étape 2]
3. [Étape 3]

✅ ATTENDU:
[Ce qui devrait se passer]

❌ OBTENU:
[Ce qui se passe réellement]

📸 SCREENSHOT: [si possible]
```

---

**Bon courage pour les tests!** 🚀  
**N'hésitez pas si vous trouvez des bugs!** 🐛
