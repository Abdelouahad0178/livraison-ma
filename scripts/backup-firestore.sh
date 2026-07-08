#!/bin/bash

# ============================================
# Script de Backup Automatique Firestore
# BG Express - Production
# ============================================

# Configuration
PROJECT_ID="arelanc"
BUCKET="gs://${PROJECT_ID}.appspot.com"
BACKUP_DIR="backups"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BUCKET}/${BACKUP_DIR}/backup-${DATE}"

# Nombre de jours de rétention (défaut: 7 jours)
RETENTION_DAYS=7

# Couleurs pour output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ============================================
# Fonction: Logger
# ============================================
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERREUR]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[ATTENTION]${NC} $1"
}

# ============================================
# Vérification pré-requis
# ============================================
log "🔍 Vérification des pré-requis..."

# Vérifier que gcloud est installé
if ! command -v gcloud &> /dev/null; then
    error "gcloud CLI n'est pas installé!"
    echo "Installez-le depuis: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Vérifier l'authentification
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    error "Vous n'êtes pas authentifié à gcloud!"
    echo "Exécutez: gcloud auth login"
    exit 1
fi

log "✅ Pré-requis OK"

# ============================================
# Début du Backup
# ============================================
log "🚀 Démarrage du backup Firestore..."
log "📂 Destination: ${BACKUP_PATH}"

# Export Firestore
gcloud firestore export ${BACKUP_PATH} \
    --project=${PROJECT_ID} \
    --async

if [ $? -eq 0 ]; then
    log "✅ Backup lancé avec succès!"
    log "⏳ Le backup se poursuit en arrière-plan..."
    log "📊 Vérifiez le statut: gcloud firestore operations list --project=${PROJECT_ID}"
else
    error "❌ Échec du backup!"
    exit 1
fi

# ============================================
# Nettoyage des anciens backups
# ============================================
log "🧹 Nettoyage des backups de plus de ${RETENTION_DAYS} jours..."

# Date limite (X jours en arrière)
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || date -v -${RETENTION_DAYS}d +%Y%m%d)

# Lister tous les backups
BACKUPS=$(gsutil ls ${BUCKET}/${BACKUP_DIR}/ | grep -E 'backup-[0-9]{8}')

OLD_BACKUPS_COUNT=0

for BACKUP in $BACKUPS; do
    # Extraire la date du nom du backup (format: backup-YYYYMMDD-HHMMSS)
    BACKUP_DATE=$(echo $BACKUP | grep -oP 'backup-\K[0-9]{8}')

    if [ ! -z "$BACKUP_DATE" ] && [ "$BACKUP_DATE" -lt "$CUTOFF_DATE" ]; then
        log "🗑️  Suppression ancien backup: $BACKUP"
        gsutil -m rm -r $BACKUP
        ((OLD_BACKUPS_COUNT++))
    fi
done

if [ $OLD_BACKUPS_COUNT -gt 0 ]; then
    log "✅ ${OLD_BACKUPS_COUNT} ancien(s) backup(s) supprimé(s)"
else
    log "ℹ️  Aucun ancien backup à supprimer"
fi

# ============================================
# Statistiques finales
# ============================================
log "📊 Statistiques:"
log "   - Date: ${DATE}"
log "   - Destination: ${BACKUP_PATH}"
log "   - Rétention: ${RETENTION_DAYS} jours"
log ""
log "✅ Script terminé avec succès!"
log ""
log "🔍 Pour vérifier le statut du backup:"
log "   gcloud firestore operations list --project=${PROJECT_ID}"
log ""
log "📥 Pour restaurer ce backup:"
log "   gcloud firestore import ${BACKUP_PATH} --project=${PROJECT_ID}"

exit 0
