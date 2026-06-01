# 📦 Serveur d'Archivage Local

Serveur Node.js pour archiver automatiquement les anciens colis et libérer Firestore.

---

## 🚀 Installation

```bash
cd serveur-archivage
npm install
```

---

## ▶️ Démarrage

```bash
npm start
```

Le serveur démarre sur **http://localhost:3001**

---

## 📋 Fonctionnalités

### 1. Archivage Automatique
- Reçoit les colis depuis l'interface admin
- Sauvegarde en JSON dans `/archives`
- Confirmation de succès

### 2. Liste des Archives
```bash
GET http://localhost:3001/api/archives
```

### 3. Récupération d'Archive
```bash
GET http://localhost:3001/api/archives/archive_2026-06-01_100_colis.json
```

---

## 📁 Structure des Archives

Les fichiers sont sauvegardés dans `/serveur-archivage/archives/`

**Format du nom:** `archive_YYYY-MM-DD_HH-MM-SS_XXX_colis.json`

**Exemple:**
```
archives/
  ├── archive_2026-06-01_14-30-00_150_colis.json
  ├── archive_2026-05-15_10-00-00_200_colis.json
  └── archive_2026-05-01_09-00-00_180_colis.json
```

---

## 📊 Format des Données Archivées

```json
{
  "date": "2026-06-01T14:30:00.000Z",
  "policy": {
    "delaiMinimumJours": 90,
    "statutsArchivables": ["Livré", "Retourné", "Annulé"],
    "seulementCodPaye": true
  },
  "count": 150,
  "parcels": [
    {
      "id": "abc123",
      "trackingId": "NEXP12345678",
      "status": "Livré",
      "codAmount": 500,
      "codStatus": "paid",
      "archivedAt": "2026-06-01T14:30:00.000Z",
      "archivedBy": "system"
    }
  ]
}
```

---

## 🔧 Configuration

### Changer le Port
Éditez `server.js`:
```javascript
const PORT = 3001  // Changez ici
```

### Changer le Dossier d'Archives
Éditez `server.js`:
```javascript
const ARCHIVES_DIR = path.join(__dirname, 'archives')  // Changez ici
```

---

## ⚙️ Utilisation depuis l'Interface Admin

1. **Connectez-vous** en tant qu'Admin
2. **Allez sur** l'onglet "Archivage"
3. **Configurez:**
   - URL Serveur: http://localhost:3001
   - Politique: Standard (3 mois)
   - Ville: Toutes ou spécifique

4. **Vérifiez** les statistiques d'archivage
5. **Cliquez** sur "Archiver X colis"

---

## 🔒 Politiques d'Archivage

### Conservative (6 mois)
- Délai: 180 jours
- Statuts: Livré (COD payé), Retourné, Annulé
- Sécuritaire pour données importantes

### Standard (3 mois) - Recommandé
- Délai: 90 jours
- Statuts: Livré (COD payé), Retourné, Annulé
- Bon équilibre performance/sécurité

### Aggressive (1 mois)
- Délai: 30 jours
- Statuts: Livré (même COD non payé), Retourné, Annulé
- Maximum de nettoyage

---

## 📈 Gains Attendus

### Avant Archivage (100,000 colis actifs)
- Firestore: 500 MB
- Queries: Lentes (2-5s)
- Coût: $$$ élevé

### Après Archivage (20,000 colis actifs)
- Firestore: 100 MB (-80%)
- Queries: Rapides (<1s) 
- Coût: $ réduit (-80%)

---

## 🔄 Planification Automatique (Optionnel)

### Windows Task Scheduler
1. Créez un fichier `archivage-auto.bat`:
```batch
cd C:\chemin\vers\livraison-ma\serveur-archivage
node trigger-archivage.js
```

2. Planifiez l'exécution hebdomadaire

### Linux Cron
```bash
# Tous les dimanches à 2h du matin
0 2 * * 0 cd /path/to/serveur-archivage && node trigger-archivage.js
```

---

## 🛡️ Sauvegarde des Archives

### Recommandé: 3-2-1
- **3** copies: Serveur local + Backup 1 + Backup 2
- **2** types de média: HDD + Cloud
- **1** copie hors site: Cloud externe

### Exemple:
1. **Serveur local** → `/serveur-archivage/archives`
2. **Backup externe** → Google Drive / Dropbox
3. **Cloud backup** → AWS S3 / Azure Blob

---

## ❓ FAQ

**Q: Que se passe-t-il si le serveur local est éteint ?**
R: Les colis restent dans Firestore. Aucune perte de données.

**Q: Peut-on restaurer des archives ?**
R: Oui, utilisez la fonction "Restaurer" dans l'interface admin.

**Q: Combien d'espace disque nécessaire ?**
R: ~1 MB pour 100 colis. 10,000 colis = ~100 MB.

**Q: Les archives sont-elles compressées ?**
R: Pas par défaut. Vous pouvez ajouter la compression gzip si besoin.

---

## 🚨 Avertissements

⚠️ **NE PAS** archiver des colis avec COD non payé si vous en avez besoin  
⚠️ **TOUJOURS** sauvegarder les archives régulièrement  
⚠️ **TESTER** d'abord avec une petite quantité  
⚠️ **VÉRIFIER** que le serveur est accessible avant archivage  

---

## 📞 Support

Besoin d'aide ? Consultez les logs du serveur pour diagnostiquer les problèmes.

```bash
npm start  # Les logs s'affichent en temps réel
```
