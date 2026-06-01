@echo off
echo.
echo ========================================
echo   PLANIFICATION ARCHIVAGE AUTOMATIQUE
echo ========================================
echo.
echo Ce script va planifier l'archivage automatique
echo qui s'executera en arriere-plan chaque semaine.
echo.
echo Choix de frequence:
echo   1. Quotidien (tous les jours a 2h)
echo   2. Hebdomadaire (dimanche a 2h) [RECOMMANDE]
echo   3. Mensuel (1er du mois a 2h)
echo.
set /p choix="Votre choix (1-3): "

if "%choix%"=="1" goto daily
if "%choix%"=="2" goto weekly
if "%choix%"=="3" goto monthly
echo Choix invalide
pause
exit /b 1

:daily
set freq=DAILY
set extra=
set desc=quotidien a 2h
goto create

:weekly
set freq=WEEKLY
set extra=/d SUN
set desc=hebdomadaire dimanche 2h
goto create

:monthly
set freq=MONTHLY
set extra=/d 1
set desc=mensuel le 1er a 2h
goto create

:create
echo.
echo Creation de la tache planifiee...
echo.

schtasks /create /tn "Archivage_Livraison_Auto" /tr "node \"%~dp0archivage-sans-index.js\"" /sc %freq% %extra% /st 02:00 /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   PLANIFICATION REUSSIE !
    echo ========================================
    echo   Frequence: %desc%
    echo   Script: archivage-sans-index.js
    echo ========================================
    echo.
    echo Pour verifier:
    echo    Win + R puis tapez: taskschd.msc
    echo    Cherchez "Archivage_Livraison_Auto"
    echo.
    echo Pour supprimer:
    echo    schtasks /delete /tn "Archivage_Livraison_Auto" /f
    echo.
) else (
    echo.
    echo ERREUR lors de la creation de la tache
    echo.
    echo Essayez d'executer ce script en tant qu'Administrateur:
    echo   Clic droit sur le fichier puis "Executer en tant qu'administrateur"
    echo.
)

pause
