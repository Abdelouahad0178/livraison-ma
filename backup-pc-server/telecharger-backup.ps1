# ============================================================
#  BG Express — Téléchargement du backup hebdomadaire
#  Placer ce fichier sur le PC serveur et configurer ci-dessous
# ============================================================

# ── CONFIGURATION (à modifier une seule fois) ──────────────
$API_URL    = "https://us-central1-arelanc.cloudfunctions.net/downloadBackup"
$API_KEY    = "5hYgTzDPr7NvO9b6ecqJkZG1jWw28naiVMUsAXpS"   # Clé configurée
$BACKUP_DIR = "C:\BG-Backups"
$MAX_LOCAL  = 10
# ───────────────────────────────────────────────────────────

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$LOG_FILE  = "$BACKUP_DIR\backup.log"

function Write-Log($msg) {
    $line = "[$timestamp] $msg"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

# Créer le dossier si nécessaire
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
}

Write-Log "========================================="
Write-Log "Démarrage du téléchargement backup..."

$filename = "backup-bgexpress-$timestamp.json"
$filepath = "$BACKUP_DIR\$filename"

try {
    # Télécharger depuis Firebase
    $headers = @{ "x-backup-key" = $API_KEY }
    Invoke-WebRequest -Uri $API_URL -Headers $headers -OutFile $filepath -UseBasicParsing -TimeoutSec 300

    if (-not (Test-Path $filepath)) {
        throw "Fichier non créé après téléchargement."
    }

    $sizeKB = [math]::Round((Get-Item $filepath).Length / 1KB, 0)
    Write-Log "Backup sauvegarde : $filename ($sizeKB Ko)"

    # Rotation : garder seulement les MAX_LOCAL derniers
    $allFiles = Get-ChildItem $BACKUP_DIR -Filter "backup-bgexpress-*.json" `
                | Sort-Object LastWriteTime -Descending
    if ($allFiles.Count -gt $MAX_LOCAL) {
        $toDelete = $allFiles | Select-Object -Skip $MAX_LOCAL
        foreach ($f in $toDelete) {
            Remove-Item -Path $f.FullName -Force
            Write-Log "Ancien backup supprime : $($f.Name)"
        }
    }

    Write-Log "Termine. Backups conserves : $([math]::Min($allFiles.Count, $MAX_LOCAL))/$MAX_LOCAL"

} catch {
    Write-Log "ERREUR : $_"
    # Supprimer le fichier vide en cas d'erreur partielle
    if (Test-Path $filepath) { Remove-Item $filepath -Force }
    exit 1
}
