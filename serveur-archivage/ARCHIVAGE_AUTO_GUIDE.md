# 🤖 Guide d'Archivage Automatique

Configurez l'archivage pour qu'il s'exécute automatiquement sans intervention manuelle.

---

## 📋 Vue d'Ensemble

**Actuellement:**
```
Manuel → Admin clique "Archiver" → Colis archivés
```

**Avec Automatisation:**
```
Planification → Script s'exécute → Colis archivés automatiquement
Tous les dimanches à 2h du matin (exemple)
```

---

## 🚀 Installation (Windows)

### Étape 1: Obtenir la Clé Firebase Admin

1. **Ouvrez** [Firebase Console](https://console.firebase.google.com)
2. **Sélectionnez** votre projet "arelanc"
3. **Allez dans** ⚙️ Paramètres du projet → Comptes de service
4. **Cliquez** "Générer une nouvelle clé privée"
5. **Téléchargez** le fichier JSON
6. **Renommez-le** en `serviceAccountKey.json`
7. **Placez-le** dans `serveur-archivage/`

```
serveur-archivage/
  ├── archivage-auto.js
  ├── serviceAccountKey.json  ← ICI
  ├── server.js
  └── ...
```

---

### Étape 2: Exécuter le Script de Configuration

**Double-cliquez** sur `planifier-archivage.bat`

Ou en ligne de commande:
```bash
cd serveur-archivage
planifier-archivage.bat
```

**Choisissez la fréquence:**
- `1` = Quotidien (tous les jours à 2h)
- `2` = Hebdomadaire (dimanches à 2h) ⭐ Recommandé
- `3` = Mensuel (1er du mois à 2h)

---

### Étape 3: Vérification

**Ouvrir le Gestionnaire des tâches:**
1. `Win + R` → `taskschd.msc`
2. Bibliothèque du planificateur de tâches
3. Chercher "Archivage_Livraison_XXX"

**Tester maintenant:**
```bash
schtasks /run /tn "Archivage_Livraison_Hebdo"
```

**Vérifier le résultat:**
```
serveur-archivage/archives/
  └── archive_2026-06-01_XXX_colis.json  ← Nouveau fichier
```

---

## 🐧 Installation (Linux/Mac)

### Étape 1: Obtenir la Clé Firebase (même que Windows)

### Étape 2: Exécuter le Script

```bash
cd serveur-archivage
chmod +x planifier-archivage.sh
./planifier-archivage.sh
```

### Étape 3: Vérification

**Voir les tâches planifiées:**
```bash
crontab -l
```

**Tester maintenant:**
```bash
node archivage-auto.js
```

**Voir les logs:**
```bash
tail -f logs/archivage.log
```

---

## ⚙️ Configuration Avancée

### Changer la Politique d'Archivage

Éditez `archivage-auto.js`:

```javascript
const CONFIG = {
  delaiMinimumJours: 90,  // ← Changez ici (30, 60, 90, 180)
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true,  // false pour archiver même COD non payé
  batchSize: 100,
  // ...
}
```

**Politiques Recommandées:**

| Usage | Délai | COD Payé |
|-------|-------|----------|
| **Croissance rapide** | 30 jours | Non |
| **Standard** | 90 jours | Oui ⭐ |
| **Sécuritaire** | 180 jours | Oui |

---

### Changer l'Heure d'Exécution

#### Windows - Modifier la tâche
1. Gestionnaire des tâches
2. Clic droit sur la tâche → Propriétés
3. Déclencheurs → Modifier
4. Changer l'heure

#### Linux - Éditer crontab
```bash
crontab -e
```

Modifier la ligne:
```
0 2 * * 0  → 0 3 * * 0  (3h au lieu de 2h)
│ │ │ │ │
│ │ │ │ └─ Jour de la semaine (0=dimanche, 1=lundi...)
│ │ │ └─── Mois
│ │ └───── Jour du mois
│ └─────── Heure
└───────── Minute
```

**Exemples:**
```bash
0 2 * * 0     # Dimanche 2h
0 2 * * 1     # Lundi 2h
0 2 1 * *     # 1er du mois 2h
0 2 */7 * *   # Tous les 7 jours 2h
30 14 * * *   # Tous les jours 14h30
```

---

## 📊 Monitoring

### Vérifier que l'Archivage Fonctionne

**Windows - Historique des tâches:**
1. Gestionnaire des tâches
2. Clic droit → Afficher toutes les tâches en cours d'exécution
3. Historique (onglet)

**Linux - Logs:**
```bash
tail -100 serveur-archivage/logs/archivage.log
```

**Vérifier les archives:**
```bash
ls -lh serveur-archivage/archives/
```

---

### Notifications Email (Optionnel)

Ajoutez à `archivage-auto.js`:

```javascript
// Installer nodemailer
// npm install nodemailer

const nodemailer = require('nodemailer')

async function envoyerNotification(result) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'votre-email@gmail.com',
      pass: 'votre-mot-de-passe-app'
    }
  })

  await transporter.sendMail({
    from: 'votre-email@gmail.com',
    to: 'admin@votre-domaine.com',
    subject: `Archivage: ${result.archived} colis`,
    text: `
      Archivage automatique terminé
      
      Colis archivés: ${result.archived}
      Fichier: ${result.filepath}
      Date: ${new Date().toLocaleString('fr-FR')}
    `
  })
}

// Dans la fonction main(), après archiverColis():
if (result.success && result.archived > 0) {
  await envoyerNotification(result)
}
```

---

## 🛡️ Sécurité

### ⚠️ IMPORTANT

**Le fichier `serviceAccountKey.json` donne accès COMPLET à Firebase !**

**Protégez-le:**
```bash
# Ne JAMAIS commit dans Git
echo "serviceAccountKey.json" >> .gitignore

# Permissions restrictives (Linux)
chmod 600 serviceAccountKey.json

# Backup sécurisé
# Gardez une copie dans un endroit sûr (coffre-fort de mots de passe)
```

---

## 📈 Exemple d'Exécution

```
╔════════════════════════════════════════╗
║   Archivage Automatique Démarré       ║
╠════════════════════════════════════════╣
║  Date: 01/06/2026 02:00:00
║  Politique: 90 jours
║  Statuts: Livré, Retourné, Annulé
╚════════════════════════════════════════╝

🔍 Recherche des colis archivables...
✅ 1,247 colis éligibles trouvés

📦 Archivage de 1,247 colis...
💾 Sauvegardé: archive_2026-06-01T02-00-15_1247_colis.json
🗑️  Supprimés: 100/1247
🗑️  Supprimés: 200/1247
...
🗑️  Supprimés: 1247/1247
✅ Archivage terminé: 1,247 colis

╔════════════════════════════════════════╗
║   Rapport d'Archivage                 ║
╠════════════════════════════════════════╣
║  Statut: ✅ SUCCÈS
║  Archivés: 1247 colis
║  Fichier: archive_2026-06-01T02-00-15_1247_colis.json
╚════════════════════════════════════════╝

📧 Notification envoyée
```

---

## ❓ FAQ

**Q: L'ordinateur doit-il être allumé ?**
R: **OUI** pour Windows Task Scheduler. Non pour un serveur Linux dédié.

**Q: Que se passe-t-il si l'archivage échoue ?**
R: Les colis restent dans Firestore. Aucune perte. Le script réessaiera la prochaine fois.

**Q: Peut-on annuler un archivage ?**
R: Les colis sont supprimés de Firestore, mais le fichier JSON permet la restauration.

**Q: Combien d'espace disque nécessaire ?**
R: ~1MB pour 100 colis. 1,000 colis/semaine = ~500MB/an.

**Q: Performance impactée pendant l'archivage ?**
R: Non, l'archivage se fait par batches de 100. Exécution à 2h du matin (faible trafic).

---

## 🚨 Dépannage

### Erreur: "Cannot find module 'firebase-admin'"
```bash
cd serveur-archivage
npm install firebase-admin
```

### Erreur: "serviceAccountKey.json not found"
Vérifiez que le fichier est dans le bon dossier:
```bash
ls -la serveur-archivage/serviceAccountKey.json
```

### Erreur: "Permission denied"
**Windows:** Exécutez en tant qu'administrateur  
**Linux:**
```bash
chmod +x archivage-auto.js
chmod +x planifier-archivage.sh
```

### La tâche ne s'exécute pas
**Windows:** Vérifiez que l'ordinateur est allumé à l'heure prévue  
**Linux:** Vérifiez les logs cron
```bash
grep CRON /var/log/syslog
```

---

## ✅ Checklist de Vérification

- [ ] serviceAccountKey.json placé
- [ ] npm install firebase-admin exécuté
- [ ] Politique configurée (délai, statuts)
- [ ] Tâche planifiée créée
- [ ] Test d'exécution manuel réussi
- [ ] Archives créées dans /archives
- [ ] Backup des archives configuré
- [ ] Notifications email configurées (optionnel)

---

## 🎯 Résultat Final

**Archivage 100% Automatique !**

✅ Colis anciens archivés automatiquement  
✅ Firestore nettoyé régulièrement  
✅ Performance optimale maintenue  
✅ Coûts Firebase réduits  
✅ Aucune intervention manuelle requise  

**Set it and forget it! 🚀**
