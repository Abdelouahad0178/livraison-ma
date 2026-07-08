# 💾 Guide Backup Automatique Firestore

## 📋 Vue d'ensemble

Ce guide vous explique comment:
1. ✅ Configurer les backups automatiques
2. ✅ Exécuter un backup manuel
3. ✅ Restaurer depuis un backup
4. ✅ Programmer des backups quotidiens

---

## 🚀 Installation Rapide (5 minutes)

### Prérequis

1. **Google Cloud SDK (gcloud CLI)**
   - **Windows**: https://cloud.google.com/sdk/docs/install#windows
   - **Mac/Linux**: https://cloud.google.com/sdk/docs/install

2. **Authentification**
   ```bash
   # Se connecter à Google Cloud
   gcloud auth login
   
   # Définir le projet par défaut
   gcloud config set project arelanc
   ```

---

## 📥 BACKUP MANUEL (Exécution Unique)

### Windows (PowerShell)

```powershell
# Naviguer vers le dossier scripts
cd C:\Users\chaab\Desktop\livraison-ma\scripts

# Exécuter le script
.\backup-firestore.ps1
```

### Mac/Linux (Bash)

```bash
# Naviguer vers le dossier scripts
cd /path/to/livraison-ma/scripts

# Rendre exécutable
chmod +x backup-firestore.sh

# Exécuter le script
./backup-firestore.sh
```

### Output Attendu

```
[2026-06-28 10:30:00] 🔍 Vérification des pré-requis...
[2026-06-28 10:30:01] ✅ Pré-requis OK
[2026-06-28 10:30:01] 🚀 Démarrage du backup Firestore...
[2026-06-28 10:30:01] 📂 Destination: gs://arelanc.appspot.com/backups/backup-20260628-103001
[2026-06-28 10:30:05] ✅ Backup lancé avec succès!
[2026-06-28 10:30:05] ⏳ Le backup se poursuit en arrière-plan...
[2026-06-28 10:30:05] 🧹 Nettoyage des backups de plus de 7 jours...
[2026-06-28 10:30:10] ✅ 2 ancien(s) backup(s) supprimé(s)
[2026-06-28 10:30:10] ✅ Script terminé avec succès!
```

---

## ⏰ BACKUP AUTOMATIQUE (Quotidien)

### Option 1: Tâche Planifiée Windows

1. **Ouvrir** le Planificateur de tâches Windows
2. **Créer une tâche de base**:
   ```
   Nom: Backup Firestore BG Express
   Description: Backup quotidien base de données
   ```

3. **Déclencheur**: Quotidien
   ```
   Heure: 03:00 (3h du matin)
   Récurrence: Chaque jour
   ```

4. **Action**: Démarrer un programme
   ```
   Programme: powershell.exe
   Arguments: -ExecutionPolicy Bypass -File "C:\Users\chaab\Desktop\livraison-ma\scripts\backup-firestore.ps1"
   ```

5. **Conditions**:
   - ✅ Réveiller l'ordinateur si nécessaire
   - ✅ Exécuter même si utilisateur absent

6. **Sauvegarder**

### Option 2: Cron Job (Mac/Linux)

```bash
# Éditer crontab
crontab -e

# Ajouter cette ligne (backup quotidien à 3h du matin)
0 3 * * * /path/to/livraison-ma/scripts/backup-firestore.sh >> /var/log/firestore-backup.log 2>&1
```

### Option 3: GitHub Actions (Cloud, Gratuit!)

Créez `.github/workflows/firestore-backup.yml`:

```yaml
name: Daily Firestore Backup

on:
  schedule:
    # Tous les jours à 3h00 UTC
    - cron: '0 3 * * *'
  workflow_dispatch: # Permet exécution manuelle

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3

      - name: Setup gcloud
        uses: google-github-actions/setup-gcloud@v1
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: arelanc

      - name: Run Backup
        run: |
          chmod +x scripts/backup-firestore.sh
          ./scripts/backup-firestore.sh
```

**Configuration secrets GitHub**:
1. Créer service account GCP
2. Télécharger clé JSON
3. GitHub → Settings → Secrets → New secret:
   ```
   Name: GCP_SA_KEY
   Value: [contenu du fichier JSON]
   ```

---

## 🔍 Vérifier le Statut d'un Backup

### En cours

```bash
# Lister les opérations en cours
gcloud firestore operations list --project=arelanc

# Détails d'une opération
gcloud firestore operations describe [OPERATION_NAME] --project=arelanc
```

### Terminé

```bash
# Lister tous les backups
gsutil ls gs://arelanc.appspot.com/backups/

# Voir détails d'un backup
gsutil ls -l gs://arelanc.appspot.com/backups/backup-20260628-103001/
```

---

## 📥 RESTAURER depuis un Backup

### ⚠️ ATTENTION: Restauration = Écrase données actuelles!

### Étapes de Restauration

1. **Lister les backups disponibles**:
   ```bash
   gsutil ls gs://arelanc.appspot.com/backups/
   ```

2. **Choisir le backup à restaurer**:
   ```
   Exemple: gs://arelanc.appspot.com/backups/backup-20260628-103001/
   ```

3. **IMPORTANT: Faire backup de sécurité AVANT**:
   ```bash
   # Backup de sécurité avant restauration
   gcloud firestore export gs://arelanc.appspot.com/backups/before-restore-$(date +%Y%m%d-%H%M%S) --project=arelanc
   ```

4. **Restaurer** (⚠️ DESTRUCTIF!):
   ```bash
   gcloud firestore import gs://arelanc.appspot.com/backups/backup-20260628-103001/ --project=arelanc
   ```

5. **Vérifier**:
   - Ouvrir Firebase Console
   - Vérifier les données dans Firestore
   - Tester le site

### Restauration Partielle (Collections Spécifiques)

```bash
# Restaurer seulement la collection "parcels"
gcloud firestore import gs://arelanc.appspot.com/backups/backup-20260628-103001/ \
  --collection-ids=parcels \
  --project=arelanc
```

---

## 🧹 Gestion des Backups

### Nettoyage Manuel

```bash
# Supprimer un backup spécifique
gsutil -m rm -r gs://arelanc.appspot.com/backups/backup-20260601-030000/

# Supprimer tous les backups de plus de 30 jours
# (Utilisez avec PRÉCAUTION!)
gsutil ls gs://arelanc.appspot.com/backups/ | \
  while read backup; do
    # Extraire date et comparer...
    # Code de suppression ici
  done
```

**Le script automatique nettoie déjà les backups > 7 jours** ✅

### Modifier la Rétention

Dans le script (`backup-firestore.sh` ou `.ps1`):

```bash
# Changer cette ligne:
RETENTION_DAYS=7   # De 7 à 30 jours par exemple
```

---

## 💰 Coûts

### Estimation Mensuelle

**Storage Cloud** (stockage backups):
- Taille backup moyenne: ~500 MB (dépend de vos données)
- Rétention: 7 jours
- Coût: ~0.026$/GB/mois
- **Total**: ~0.09$ / mois (quasi gratuit!)

**Opérations**:
- Export: 0.026$ / GB exporté
- Import: 0.026$ / GB importé
- Backup quotidien (500MB): ~0.78$ / mois

**Total mensuel estimé: ~1$ / mois** 💸

**Gratuit** si < 1GB et opérations limitées!

---

## 🚨 Plan d'Urgence - Perte de Données

### Si données corrompues/supprimées

1. **NE RIEN TOUCHER** ⚠️
2. **Identifier le dernier bon backup**:
   ```bash
   gsutil ls -l gs://arelanc.appspot.com/backups/
   ```
3. **Backup de sécurité de l'état actuel** (même corrompu):
   ```bash
   gcloud firestore export gs://arelanc.appspot.com/backups/corrupted-$(date +%Y%m%d) --project=arelanc
   ```
4. **Restaurer le bon backup**
5. **Vérifier + Tester**

### Si backup corrompu

- Vous avez **7 jours** de backups
- Restaurer un backup plus ancien
- Accepter perte de données récentes

---

## ✅ Checklist Maintenance Mensuelle

- [ ] Vérifier que les backups quotidiens s'exécutent
- [ ] Tester une restauration sur projet test
- [ ] Vérifier l'espace storage utilisé
- [ ] Ajuster rétention si nécessaire
- [ ] Documenter tout incident

---

## 📊 Monitoring des Backups

### Dashboard Google Cloud

1. **Cloud Console**: https://console.cloud.google.com/
2. **Firestore** → **Import/Export**
3. Voir:
   - ✅ Derniers backups
   - ⏱️ Statut opérations
   - 📊 Taille backups

### Notifications Email (Optionnel)

Configurez Cloud Monitoring pour recevoir emails si backup échoue.

---

## 🆘 Dépannage

### Problème: "Permission denied"

**Solution**:
```bash
# Se ré-authentifier
gcloud auth login

# Vérifier les permissions
gcloud projects get-iam-policy arelanc
```

### Problème: "Operation already in progress"

**Solution**:
- Attendez fin du backup en cours
- OU annulez: `gcloud firestore operations cancel [OPERATION_NAME]`

### Problème: "Not enough quota"

**Solution**:
- Passer au plan Blaze (facturation activée)
- Quota backups augmente automatiquement

---

## 📞 Support

**Questions backup?**
- Documentation: https://cloud.google.com/firestore/docs/manage-data/export-import
- Support: support@google.com

---

## ✅ Résumé Commandes Essentielles

```bash
# Backup manuel
./scripts/backup-firestore.sh

# Lister backups
gsutil ls gs://arelanc.appspot.com/backups/

# Vérifier statut
gcloud firestore operations list --project=arelanc

# Restaurer
gcloud firestore import gs://arelanc.appspot.com/backups/[backup-name]/ --project=arelanc
```

---

**Vos données sont maintenant protégées!** 🛡️  
**Dormez tranquille!** 😴
