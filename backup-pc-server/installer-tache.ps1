# ============================================================
#  BG Express — Installation de la tâche planifiée Windows
#  Exécuter UNE SEULE FOIS en tant qu'Administrateur
# ============================================================

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath = "$ScriptDir\telecharger-backup.ps1"

if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERREUR : telecharger-backup.ps1 introuvable dans $ScriptDir" -ForegroundColor Red
    exit 1
}

$action = New-ScheduledTaskAction `
    -Execute  "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Chaque lundi à 08h00 (le backup Firebase tourne le dimanche à 03h00)
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "08:00"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit        (New-TimeSpan -Hours 1) `
    -StartWhenAvailable        `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances         IgnoreNew

Register-ScheduledTask `
    -TaskName    "BG Express - Backup Hebdomadaire" `
    -Description "Telecharge le backup BG Express depuis Firebase" `
    -Action      $action `
    -Trigger     $trigger `
    -Settings    $settings `
    -RunLevel    Highest `
    -Force | Out-Null

Write-Host ""
Write-Host "Tache planifiee installee avec succes !" -ForegroundColor Green
Write-Host "  Nom     : BG Express - Backup Hebdomadaire" -ForegroundColor Cyan
Write-Host "  Horaire : Chaque lundi a 08h00" -ForegroundColor Cyan
Write-Host "  Dossier : C:\BG-Backups\" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pour tester maintenant :" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$ScriptPath`"" -ForegroundColor White
