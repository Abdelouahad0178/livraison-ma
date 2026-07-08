# ============================================
# Script de Backup Automatique Firestore
# BG Express - Production (Version PowerShell)
# ============================================

# Configuration
$PROJECT_ID = "arelanc"
$BUCKET = "gs://$PROJECT_ID.appspot.com"
$BACKUP_DIR = "backups"
$DATE = Get-Date -Format "yyyyMMdd-HHmmss"
$BACKUP_PATH = "$BUCKET/$BACKUP_DIR/backup-$DATE"

# Nombre de jours de rétention (défaut: 7 jours)
$RETENTION_DAYS = 7

# ============================================
# Fonctions Logger
# ============================================
function Write-Log {
    param($Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -ForegroundColor Green
}

function Write-Error-Log {
    param($Message)
    Write-Host "[ERREUR] $Message" -ForegroundColor Red
}

function Write-Warning-Log {
    param($Message)
    Write-Host "[ATTENTION] $Message" -ForegroundColor Yellow
}

# ============================================
# Vérification pré-requis
# ============================================
Write-Log "🔍 Vérification des pré-requis..."

# Vérifier que gcloud est installé
try {
    $null = gcloud --version
} catch {
    Write-Error-Log "gcloud CLI n'est pas installé!"
    Write-Host "Installez-le depuis: https://cloud.google.com/sdk/docs/install"
    exit 1
}

# Vérifier l'authentification
$authAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $authAccount) {
    Write-Error-Log "Vous n'êtes pas authentifié à gcloud!"
    Write-Host "Exécutez: gcloud auth login"
    exit 1
}

Write-Log "✅ Pré-requis OK"

# ============================================
# Début du Backup
# ============================================
Write-Log "🚀 Démarrage du backup Firestore..."
Write-Log "📂 Destination: $BACKUP_PATH"

# Export Firestore
gcloud firestore export $BACKUP_PATH --project=$PROJECT_ID --async

if ($LASTEXITCODE -eq 0) {
    Write-Log "✅ Backup lancé avec succès!"
    Write-Log "⏳ Le backup se poursuit en arrière-plan..."
    Write-Log "📊 Vérifiez le statut: gcloud firestore operations list --project=$PROJECT_ID"
} else {
    Write-Error-Log "❌ Échec du backup!"
    exit 1
}

# ============================================
# Nettoyage des anciens backups
# ============================================
Write-Log "🧹 Nettoyage des backups de plus de $RETENTION_DAYS jours..."

# Date limite (X jours en arrière)
$CUTOFF_DATE = (Get-Date).AddDays(-$RETENTION_DAYS).ToString("yyyyMMdd")

# Lister tous les backups
$BACKUPS = gsutil ls "$BUCKET/$BACKUP_DIR/" | Where-Object { $_ -match 'backup-\d{8}' }

$OLD_BACKUPS_COUNT = 0

foreach ($BACKUP in $BACKUPS) {
    # Extraire la date du nom du backup (format: backup-YYYYMMDD-HHMMSS)
    if ($BACKUP -match 'backup-(\d{8})') {
        $BACKUP_DATE = $matches[1]

        if ([int]$BACKUP_DATE -lt [int]$CUTOFF_DATE) {
            Write-Log "🗑️  Suppression ancien backup: $BACKUP"
            gsutil -m rm -r $BACKUP
            $OLD_BACKUPS_COUNT++
        }
    }
}

if ($OLD_BACKUPS_COUNT -gt 0) {
    Write-Log "✅ $OLD_BACKUPS_COUNT ancien(s) backup(s) supprimé(s)"
} else {
    Write-Log "ℹ️  Aucun ancien backup à supprimer"
}

# ============================================
# Statistiques finales
# ============================================
Write-Log "📊 Statistiques:"
Write-Log "   - Date: $DATE"
Write-Log "   - Destination: $BACKUP_PATH"
Write-Log "   - Rétention: $RETENTION_DAYS jours"
Write-Log ""
Write-Log "✅ Script terminé avec succès!"
Write-Log ""
Write-Log "🔍 Pour vérifier le statut du backup:"
Write-Log "   gcloud firestore operations list --project=$PROJECT_ID"
Write-Log ""
Write-Log "📥 Pour restaurer ce backup:"
Write-Log "   gcloud firestore import $BACKUP_PATH --project=$PROJECT_ID"

exit 0
