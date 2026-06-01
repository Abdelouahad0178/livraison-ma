@echo off
REM Script de planification automatique pour Windows

echo ================================================
echo   Configuration Archivage Automatique Windows
echo ================================================
echo.

REM Aller dans le dossier du serveur
cd /d "%~dp0"

echo [1/3] Installation des dependances...
call npm install firebase-admin
echo.

echo [2/3] Configuration Firebase...
echo IMPORTANT: Placez votre fichier serviceAccountKey.json dans ce dossier
echo Pour obtenir ce fichier:
echo   1. Firebase Console ^> Parametres du projet ^> Comptes de service
echo   2. Generer une nouvelle cle privee
echo   3. Renommer en serviceAccountKey.json
echo.
pause

echo [3/3] Creation de la tache planifiee...
echo.
echo Frequence d'execution:
echo   1. Quotidien (tous les jours a 2h du matin)
echo   2. Hebdomadaire (tous les dimanches a 2h)
echo   3. Mensuel (le 1er de chaque mois a 2h)
echo.
set /p FREQ="Choisissez (1, 2 ou 3): "

if "%FREQ%"=="1" (
    schtasks /create /tn "Archivage_Livraison_Quotidien" /tr "node \"%~dp0archivage-auto.js\"" /sc daily /st 02:00 /f
    echo Tache quotidienne creee
) else if "%FREQ%"=="2" (
    schtasks /create /tn "Archivage_Livraison_Hebdo" /tr "node \"%~dp0archivage-auto.js\"" /sc weekly /d SUN /st 02:00 /f
    echo Tache hebdomadaire creee
) else if "%FREQ%"=="3" (
    schtasks /create /tn "Archivage_Livraison_Mensuel" /tr "node \"%~dp0archivage-auto.js\"" /sc monthly /d 1 /st 02:00 /f
    echo Tache mensuelle creee
) else (
    echo Choix invalide
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Configuration Terminee!
echo ================================================
echo.
echo Pour verifier la tache: Gestionnaire des taches ^> Bibliotheque du planificateur
echo Pour tester maintenant: schtasks /run /tn "Archivage_Livraison_XXX"
echo Pour desactiver: schtasks /delete /tn "Archivage_Livraison_XXX"
echo.
pause
