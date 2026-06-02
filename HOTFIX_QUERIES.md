# 🚨 HOTFIX - Queries Firestore Crashent

## Problème
Erreur: `FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state`

## Cause
Queries sans filtre de date + limits trop grandes (500-1000)
→ Trop de données chargées → Firestore crashe

## Solution
Remettre filtres 180 jours (au lieu de 90) + réduire limits à 200-300

## Queries à Fixer
- [x] caisse.ts: 1000 → 300 + filtre 180j
- [ ] Toutes les autres: 500 → 200 + filtre 180j
