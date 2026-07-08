# 📖 Guide Utilisateur BG Express - Version 2.0

## 🎯 Guide Rapide de Démarrage

### 🔐 Connexion
1. Ouvrez **https://arelanc.web.app**
2. Entrez votre email et mot de passe
3. Cliquez sur "Se connecter"

---

## ⌨️ RACCOURCIS CLAVIER ESSENTIELS

### 🚀 Navigation Globale
| Raccourci | Action | Où l'utiliser |
|-----------|--------|---------------|
| **Ctrl + Entrée** | Nouvelle expédition | Depuis l'accueil |
| **Ctrl + Entrée** | Nouveau colis (après création) | Écran bon de ramassage |

### 📝 Dans le Formulaire de Création
| Raccourci | Action |
|-----------|--------|
| **Entrée** | Passer au champ suivant |
| **Ctrl + Entrée** | Retourner au champ précédent |
| **Espace** | Valider un bouton (quand il a le focus) |

### 🔍 Autocomplete Clients
| Raccourci | Action |
|-----------|--------|
| **Tapez 2-3 lettres** | Liste des clients s'affiche |
| **↓ ↑ Flèches** | Naviguer dans la liste |
| **Espace** | Sélectionner le client surligné |
| **Échap** | Fermer la liste |

### ✅ Modal de Validation
| Raccourci | Action |
|-----------|--------|
| **Entrée** | Valider et imprimer (focus auto sur bouton) |

---

## 📦 WORKFLOW: Créer une Expédition

### Méthode Rapide (Tout au clavier)
```
1. Page d'accueil → Ctrl+Entrée
2. Curseur déjà sur "N EXP"
3. Tapez le numéro → Entrée
4. Tapez nom expéditeur (2 lettres)
5. Flèche Bas → Espace (sélectionner)
6. Entrée → Remplir destinataire
7. Entrée × N (remplir autres champs)
8. Espace (sur bouton Créer)
9. Entrée (valider impression)
10. Ctrl+Entrée (nouveau colis)
```

### ⏱️ Temps moyen: **30 secondes** par colis!

### Étapes Détaillées

#### 1️⃣ Accéder au Formulaire
- **Option A**: Clic sur onglet "Nouveau colis"
- **Option B**: **Ctrl+Entrée** depuis l'accueil ⭐ (PLUS RAPIDE)

#### 2️⃣ Remplir Expéditeur
- **N EXP**: Numéro client (353, etc.)
- **Nom complet**: 
  - Tapez 2-3 lettres
  - Liste s'affiche automatiquement
  - **Flèches** pour naviguer
  - **Espace** pour sélectionner
  - ✨ Tous les champs se remplissent auto!

#### 3️⃣ Remplir Destinataire
- **Ville destination**: Choisir dans liste
- **Nom destinataire**: 
  - Même système autocomplete
  - Tapez → Flèches → Espace
- **Adresse**: Facultative si "Livreur" ou "En gare" sélectionné

#### 4️⃣ Détails Colis
- **Poids**: En kg
- **Nb colis**: Par défaut 1
- **Nature**: Description marchandise

#### 5️⃣ Service & Paiement
- **Type**: Simple / C/Espèces / C/Chèque / C/Traite
- **RETOUR FOND**: Montant à encaisser (si applicable)
- **Port**: Port payé / Port dû

#### 6️⃣ Valider
- Clic sur **✨Créer l'Expédition📦**
- Modal de vérification s'affiche
- Curseur déjà sur bouton "Valider"
- **Entrée** pour confirmer
- Bon de ramassage s'affiche ✅

#### 7️⃣ Nouveau Colis Rapide
- **Ctrl+Entrée** pour créer un nouveau
- Curseur revient sur N EXP
- Recommencez! 🚀

---

## 🚚 WORKFLOW: Livreur - Signer une Livraison

### Signature Électronique
1. Page livreur → Onglet "À livrer"
2. Trouver le colis
3. Clic **"Élec."** (bouton vert)
4. Dessiner signature avec souris/doigt
5. Valider
6. ✅ Statut → "Livré"

### Signature Papier
1. Même processus
2. Clic **"Papier"** au lieu de "Élec."
3. Confirmer que client a signé bon papier
4. ✅ Statut → "Livré"

### ⚠️ Refus de Livraison
1. Clic bouton **"Refus"** (rouge)
2. Indiquer raison
3. ✅ Statut → "Retour en transit"

### 💰 Port Dû
- Si colis en "Port dû":
  - Montant s'affiche automatiquement
  - À encaisser du client
  - Noté sur bon de livraison

---

## 📥 WORKFLOW: Gérer les Arrivages

### Créer un Arrivage
1. Onglet "Arrivage"
2. Scanner/entrer les N° Tracking
3. Système détecte:
   - ✅ Colis arrivés
   - ❌ Colis manquants
4. Confirmer l'arrivage

### Modifier un Arrivage (Historique)
**Nouvelle fonctionnalité!** ✨

1. Onglet "Arrivage" → "Historique"
2. Clic sur arrivage à corriger
3. Interface de modification s'affiche
4. Actions possibles:
   - ✅ Pointer/dépointer colis
   - ➕➖ Modifier nombre de colis
   - ❌ Retirer un colis
   - 🔍 Ajouter colis manquant
5. Clic **"Enregistrer"** ou **"Valider pointage"**

---

## 📊 WORKFLOW: Consulter les Tableaux

### Vue Tableau (Excel-like)
1. Onglets "Expéditions" ou "Livreur"
2. Clic bouton **"Tableau"**
3. Navigation horizontale (scroll)
4. **Totaux affichés**: 
   - 💰 Total RETOUR FOND
   - 📮 Total Port dû
   - 📦 Nombre expéditions

### Imprimer
1. Vue Tableau activée
2. Clic **"Imprimer"**
3. Aperçu → Imprimer
4. Format optimisé A4 paysage

---

## 🎨 CODES COULEURS & STATUTS

### Statuts Expédition
| Statut | Couleur | Signification |
|--------|---------|---------------|
| **Initialisé** | Gris | Créé, pas encore en transit |
| **En transit** | Bleu | Sur la route |
| **Arrivé en agence** | Violet | À l'agence destination |
| **En cours de livraison** | Orange | Assigné au livreur |
| **Livré** | Vert | Livré avec succès ✅ |
| **Retourné** | Rouge | Retour à l'expéditeur |
| **Retour finalisé** | Vert | Retour complété |

### Services
| Type | Badge | Signification |
|------|-------|---------------|
| 📦 Simple | Bleu | Livraison simple |
| 💵 C/Espèces | Vert | Contre espèces |
| 📋 C/Chèque | Jaune | Contre chèque |
| 📝 C/Traite | Orange | Contre traite |
| 🧾 Retour BL | Violet | Retour bon de livraison |

---

## 🆘 FAQ - Questions Fréquentes

### ❓ L'autocomplete ne marche pas?
**Réponse**: 
- Tapez au moins **2 lettres**
- Attendez 0.5 seconde (recherche en cours)
- Si aucun résultat → Client n'existe pas → Créez-le

### ❓ Adresse destinataire obligatoire?
**Réponse**: 
- **NON** si:
  - Livreur/Secteur sélectionné
  - OU "En gare" coché
- **OUI** sinon

### ❓ Ctrl+Entrée ne fonctionne pas?
**Réponse**: 
- Assurez-vous d'être sur l'onglet **Accueil**
- Si sur bon de ramassage: fenêtre doit avoir le focus

### ❓ Signature tactile ne marche pas?
**Réponse**: 
- Vérifiez que le navigateur autorise le tactile
- Essayez avec le doigt (pas stylet)
- Alternative: Signature papier

### ❓ Port dû ne s'affiche pas?
**Réponse**: 
- Corrigé dans dernière version!
- Rafraîchir la page (Ctrl+F5)

### ❓ Modifier un arrivage finalisé?
**Réponse**: 
- ✅ Possible maintenant!
- Historique → Clic sur arrivage → Modifier

---

## 📱 SUPPORT & CONTACT

### 💬 Support Technique
- **WhatsApp**: [Votre numéro]
- **Email**: [Votre email]
- **Disponibilité**: Lun-Sam, 8h-18h

### 🐛 Signaler un Bug
1. Notez:
   - Ce que vous faisiez
   - Message d'erreur (screenshot)
   - Heure exacte
2. Envoyez par WhatsApp
3. Correction sous 24h (urgent) / 72h (normal)

### 💡 Suggérer une Amélioration
- Envoyez vos idées par WhatsApp/Email
- On étudie toutes les suggestions!

---

## 🔄 MISES À JOUR

### Dernières Nouveautés (v2.0)
- ✅ Navigation clavier complète
- ✅ Autocomplete intelligent
- ✅ Modification arrivages historique
- ✅ Totaux COD/Port dû dans tableaux
- ✅ Ctrl+Enter depuis accueil
- ✅ Focus automatique optimisé
- ✅ Correction port dû pour livreurs

### À Venir
- 📊 Export Excel tableaux
- 📱 Application mobile native
- 🔔 Notifications push
- 📈 Statistiques avancées

---

## ⭐ ASTUCES PRO

### 🚀 Pour aller ENCORE plus vite:

1. **Apprenez les raccourcis par cœur**
   - 3 jours d'utilisation = automatique!
   - Gain: 50% de temps

2. **Utilisez toujours l'autocomplete**
   - 2 lettres → Espace
   - Plus rapide que de tout taper

3. **Ctrl+Entrée est votre ami**
   - Accueil → Nouveau colis
   - Bon créé → Encore un colis
   - Enchaînez sans cliquer!

4. **Tablette pour livreurs**
   - Signature tactile plus facile
   - Scanner intégré plus rapide

5. **Imprimez par lots**
   - Vue Tableau
   - Sélectionnez période/livreur
   - 1 clic = tout imprimé

---

## 📄 Annexe: Référence Rapide

### Raccourcis - Carte de Référence
```
┌─────────────────────────────────────────┐
│     RACCOURCIS BG EXPRESS v2.0          │
├─────────────────────────────────────────┤
│ Ctrl+Enter (accueil) → Nouveau colis    │
│ Ctrl+Enter (bon)     → Encore un colis  │
│ Enter                → Champ suivant    │
│ Ctrl+Enter (champ)   → Champ précédent  │
│ Espace               → Valider bouton   │
│ ↑↓ Flèches          → Navigation liste │
│ Espace (liste)       → Sélectionner     │
│ Échap                → Fermer liste     │
└─────────────────────────────────────────┘
```

**Imprimez et collez près de votre écran!** 📌

---

## 📞 URGENCE / PROBLÈME BLOQUANT

**Système ne répond plus?**
1. Rafraîchir: **Ctrl + F5**
2. Si persiste: Fermer/rouvrir navigateur
3. Encore bloqué: WhatsApp support

**Perte de connexion?**
1. Vérifier internet
2. Recharger page
3. Données sauvegardées automatiquement ✅

---

**Version**: 2.0  
**Dernière mise à jour**: 28 juin 2026  
**BG Express** - Votre partenaire livraison 🚀

---

*Pour convertir en PDF: Utilisez un outil comme https://www.markdowntopdf.com/ ou imprimez cette page en PDF depuis votre navigateur.*
