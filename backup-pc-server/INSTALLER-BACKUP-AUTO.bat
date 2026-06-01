@echo off
:: BG Express - Installation automatique du backup
:: Double-cliquez sur ce fichier et cliquez "Oui" quand demandé

echo ============================================
echo  BG Express - Installation Backup Auto
echo ============================================
echo.

powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0installer-tache.ps1\"' -Verb RunAs"

echo.
echo Attendez que la fenetre PowerShell se ferme...
timeout /t 3 >nul
