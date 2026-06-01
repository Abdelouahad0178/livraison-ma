#!/bin/bash

# Script de planification automatique pour Linux/Mac

echo "================================================"
echo "  Configuration Archivage Automatique Linux"
echo "================================================"
echo ""

# Aller dans le dossier du script
cd "$(dirname "$0")"
SCRIPT_DIR=$(pwd)

echo "[1/3] Installation des dépendances..."
npm install firebase-admin
echo ""

echo "[2/3] Configuration Firebase..."
echo "IMPORTANT: Placez votre fichier serviceAccountKey.json dans ce dossier"
echo "Pour obtenir ce fichier:"
echo "  1. Firebase Console > Paramètres du projet > Comptes de service"
echo "  2. Générer une nouvelle clé privée"
echo "  3. Renommer en serviceAccountKey.json"
echo ""
read -p "Appuyez sur Entrée quand c'est fait..."

echo ""
echo "[3/3] Configuration du cron job..."
echo ""
echo "Fréquence d'exécution:"
echo "  1. Quotidien (tous les jours à 2h du matin)"
echo "  2. Hebdomadaire (tous les dimanches à 2h)"
echo "  3. Mensuel (le 1er de chaque mois à 2h)"
echo ""
read -p "Choisissez (1, 2 ou 3): " FREQ

# Préparer la ligne cron
CRON_CMD="cd $SCRIPT_DIR && /usr/bin/node $SCRIPT_DIR/archivage-auto.js >> $SCRIPT_DIR/logs/archivage.log 2>&1"

case $FREQ in
    1)
        CRON_LINE="0 2 * * * $CRON_CMD"
        FREQ_TEXT="quotidien"
        ;;
    2)
        CRON_LINE="0 2 * * 0 $CRON_CMD"
        FREQ_TEXT="hebdomadaire (dimanche)"
        ;;
    3)
        CRON_LINE="0 2 1 * * $CRON_CMD"
        FREQ_TEXT="mensuel (1er du mois)"
        ;;
    *)
        echo "Choix invalide"
        exit 1
        ;;
esac

# Créer le dossier logs
mkdir -p logs

# Ajouter au crontab
(crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -

echo ""
echo "================================================"
echo "  Configuration Terminée!"
echo "================================================"
echo ""
echo "Archivage planifié: $FREQ_TEXT à 2h du matin"
echo "Logs: $SCRIPT_DIR/logs/archivage.log"
echo ""
echo "Commandes utiles:"
echo "  - Voir les tâches: crontab -l"
echo "  - Tester maintenant: node $SCRIPT_DIR/archivage-auto.js"
echo "  - Voir les logs: tail -f $SCRIPT_DIR/logs/archivage.log"
echo "  - Supprimer: crontab -e (puis supprimer la ligne)"
echo ""
