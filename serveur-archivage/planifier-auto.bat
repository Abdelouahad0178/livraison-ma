@echo off
chcp 65001 >nul
echo.
echo ╔════════════════════════════════════════╗
echo ║   Planification Archivage Automatique ║
echo ╚════════════════════════════════════════╝
echo.
echo Ce script va planifier l'archivage automatique
echo qui s'exécutera en arrière-plan chaque semaine.
echo.
echo Choix de fréquence:
echo   1. Quotidien (tous les jours à 2h)
echo   2. Hebdomadaire (dimanche à 2h) [RECOMMANDÉ]
echo   3. Mensuel (1er du mois à 2h)
echo.
set /p choix="Votre choix (1-3): "

if "%choix%"=="1" (
    set frequence=DAILY
    set desc=quotidien à 2h
) else if "%choix%"=="2" (
    set frequence=WEEKLY
    set jour=/d SUN
    set desc=hebdomadaire dimanche 2h
) else if "%choix%"=="3" (
    set frequence=MONTHLY
    set jour=/d 1
    set desc=mensuel le 1er à 2h
) else (
    echo ❌ Choix invalide
    pause
    exit /b 1
)

echo.
echo 📅 Création de la tâche planifiée...
echo.

schtasks /create /tn "Archivage_Livraison_Auto" /tr "node \"%~dp0archivage-sans-index.js\"" /sc %frequence% %jour% /st 02:00 /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ╔════════════════════════════════════════╗
    echo ║   ✅ Planification Réussie !          ║
    echo ╠════════════════════════════════════════╣
    echo ║  Fréquence: %desc%
    echo ║  Script: archivage-sans-index.js
    echo ╚════════════════════════════════════════╝
    echo.
    echo 💡 Pour vérifier:
    echo    Win + R → taskschd.msc → Cherchez "Archivage_Livraison_Auto"
    echo.
    echo 🔧 Pour supprimer:
    echo    schtasks /delete /tn "Archivage_Livraison_Auto" /f
    echo.
) else (
    echo.
    echo ❌ Erreur lors de la création de la tâche
    echo.
    echo Essayez d'exécuter ce script en tant qu'Administrateur:
    echo   Clic droit → Exécuter en tant qu'administrateur
    echo.
)

pause
