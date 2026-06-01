# 🚀 Installation Mode 1 - Guide Rapide

## Étape 1: Télécharger la Clé Firebase (2 minutes)

### 1.1 Ouvrir Firebase Console
**Lien direct:** https://console.firebase.google.com/project/arelanc/settings/serviceaccounts/adminsdk

Vous devriez voir une page avec "Comptes de service"

### 1.2 Générer la Clé
1. Cliquez sur le bouton **"Générer une nouvelle clé privée"**
2. Une popup apparaît → Cliquez **"Générer la clé"**
3. Un fichier JSON se télécharge automatiquement
   - Nom du fichier: `arelanc-firebase-adminsdk-xxxxx.json`
   - Localisation: Dossier `Téléchargements`

### 1.3 Renommer le Fichier
1. Allez dans votre dossier `Téléchargements`
2. Trouvez le fichier `arelanc-firebase-adminsdk-xxxxx.json`
3. **Clic droit** → **Renommer**
4. Nouveau nom: `serviceAccountKey.json`

### 1.4 Déplacer le Fichier
1. **Copiez** le fichier `serviceAccountKey.json`
2. **Collez** dans ce dossier:
   ```
   C:\Users\chaab\Desktop\livraison-ma\serveur-archivage\
   ```

### 1.5 Vérification
Le fichier doit être ici:
```
C:\Users\chaab\Desktop\livraison-ma\serveur-archivage\serviceAccountKey.json
```

**Taille du fichier:** ~2-3 KB

---

## Étape 2: Test (30 secondes)

Ouvrez PowerShell ou CMD dans le dossier `serveur-archivage` et exécutez:

```bash
node test-archivage.js
```

**Résultat attendu:**
```
╔════════════════════════════════════════╗
║   TEST ARCHIVAGE - Simulation         ║
╠════════════════════════════════════════╣
║  Politique: 90 jours
║  Statuts: Livré, Retourné, Annulé
╚════════════════════════════════════════╝

📦 Livré: XX colis
📦 Retourné: XX colis
📦 Annulé: XX colis

╔════════════════════════════════════════╗
║   Résultat du Test                    ║
╠════════════════════════════════════════╣
║  Total à archiver: XXX colis
╚════════════════════════════════════════╝

⚠️  CECI EST UN TEST - Aucun colis n'a été supprimé
```

---

## Étape 3: Planifier l'Automatisation (1 minute)

### Option A: Script Automatique (Recommandé)
Double-cliquez sur:
```
planifier-archivage.bat
```

Choisissez: `2` (Hebdomadaire)

### Option B: Manuel
```bash
schtasks /create /tn "Archivage_Livraison" /tr "node C:\Users\chaab\Desktop\livraison-ma\serveur-archivage\archivage-auto.js" /sc weekly /d SUN /st 02:00
```

---

## Étape 4: Test Manuel (Optionnel)

Pour tester l'archivage RÉEL maintenant:

```bash
node archivage-auto.js
```

**⚠️ ATTENTION:** Cette commande va VRAIMENT archiver et supprimer les colis de Firestore !

---

## ✅ C'est Fait !

Une fois planifié, l'archivage s'exécutera automatiquement:
- **Quand:** Tous les dimanches à 2h du matin
- **Quoi:** Archive les colis de >90 jours
- **Où:** Sauvegarde dans `/serveur-archivage/archives/`

---

## 🔍 Vérification de la Planification

### Windows Task Scheduler
1. `Win + R` → tapez `taskschd.msc` → Entrée
2. Bibliothèque du planificateur de tâches
3. Cherchez "Archivage_Livraison"

**Doit montrer:**
- État: Prêt
- Déclencheur: Hebdomadaire dimanche 2:00
- Dernière exécution: (vide si pas encore exécuté)

---

## ❓ Problèmes Courants

### "Cannot find module 'firebase-admin'"
```bash
cd serveur-archivage
npm install firebase-admin
```

### "Cannot find module './serviceAccountKey.json'"
→ Le fichier n'est pas au bon endroit
→ Revérifiez l'Étape 1.4

### "Permission denied"
→ Exécutez PowerShell/CMD en tant qu'Administrateur

---

## 📞 Test Réussi ?

Si le test affiche des colis à archiver → **C'est bon ! ✅**

Passez à l'Étape 3 pour planifier l'automatisation.
