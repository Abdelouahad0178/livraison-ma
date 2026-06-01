# ✅ Archivage Automatique - Prêt à Utiliser

## 📋 Résumé

Votre système d'archivage automatique **sans index Firestore** est prêt !

- ✅ Archivage **local** (pas cloud)
- ✅ Politique: **90 jours minimum**
- ✅ Statuts: **Livré** (COD payé), **Retourné**, **Annulé**
- ✅ Fonctionne **immédiatement** (pas besoin d'attendre index)

---

## 🚀 Planification Automatique (1 clic)

### Pour Windows:

**Double-cliquez sur:**
```
planifier-auto.bat
```

**Choisissez:**
- Option `2` = Hebdomadaire (dimanche 2h) **[RECOMMANDÉ]**

**C'est tout !** L'archivage sera automatique.

---

## 📂 Emplacement des Archives

Les archives sont sauvegardées dans:
```
C:\Users\chaab\Desktop\livraison-ma\serveur-archivage\archives\
```

**Format de fichier:**
```
archive_2026-05-31T02-00-00_15_colis.json
```

---

## 🔬 Test Manuel (Optionnel)

### 1. Test SANS suppression (simulation)

```bash
cd serveur-archivage
node test-simple.js
```

**Affiche:** Combien de colis seraient archivés (0 suppression)

---

### 2. Archivage RÉEL (avec suppression)

⚠️ **ATTENTION:** Cette commande archive ET supprime de Firestore !

```bash
cd serveur-archivage
node archivage-sans-index.js
```

**Fait:**
1. Récupère les colis de >90 jours
2. Sauvegarde en JSON local
3. **SUPPRIME** de Firestore

**N'utilisez cette commande que si:**
- Vous voulez vraiment archiver maintenant
- OU pour tester une fois avant la planification

---

## 🔍 Vérifier la Planification

### Windows Task Scheduler

1. Appuyez `Win + R`
2. Tapez: `taskschd.msc`
3. Entrée
4. Cherchez: **"Archivage_Livraison_Auto"**

**Doit montrer:**
- État: ✅ Prêt
- Déclencheur: Dimanche 2:00
- Action: `node archivage-sans-index.js`

---

## ⚙️ Configuration (Optionnel)

Si vous voulez changer le délai (90 jours par défaut):

**Éditez:** `archivage-sans-index.js`

**Ligne 14:**
```javascript
delaiMinimumJours: 90,  // ← Changez ce nombre
```

**Options courantes:**
- `30` = 1 mois
- `90` = 3 mois (par défaut)
- `180` = 6 mois
- `365` = 1 an

---

## 📊 Résultat Actuel

**Test du 2026-05-31:**
```
Total colis: 5
Plus de 90 jours: 0 colis
```

**Conclusion:** Rien à archiver pour le moment (tous récents).

**L'archivage s'activera automatiquement** quand des colis auront >90 jours.

---

## 🗑️ Supprimer la Planification

Si vous voulez arrêter l'archivage automatique:

```bash
schtasks /delete /tn "Archivage_Livraison_Auto" /f
```

---

## 📁 Fichiers Créés

```
serveur-archivage/
│
├── archivage-sans-index.js     ← Script automatique (sans index)
├── test-simple.js              ← Test simulation (sans index)
├── planifier-auto.bat          ← Planification 1-clic
├── serviceAccountKey.json      ← Clé Firebase (créée par vous)
│
└── archives/                   ← Dossier de sauvegarde
    └── archive_*.json          ← Fichiers d'archives
```

---

## ✅ Étapes Suivantes

1. **Maintenant:** Double-cliquez `planifier-auto.bat` → Choisissez `2`
2. **Vérifiez:** Task Scheduler montre la tâche
3. **Attendez:** Le système archive automatiquement chaque dimanche

**C'est tout !** 🎉

---

## ❓ Questions Fréquentes

### "Pourquoi 0 colis archivés ?"
→ Normal ! Vos colis ont moins de 90 jours.
→ L'archivage s'activera automatiquement dans ~3 mois.

### "Où sont les archives ?"
→ `serveur-archivage/archives/` sur VOTRE disque local
→ PAS dans le cloud, économie garantie !

### "Comment restaurer des archives ?"
→ Les fichiers JSON peuvent être réimportés manuellement
→ Ou utilisez un script de restauration (à créer si besoin)

### "L'archivage fonctionne en arrière-plan ?"
→ Oui ! Tâche planifiée Windows s'exécute même si vous êtes déconnecté
→ Logs dans le fichier d'archive pour traçabilité

---

## 🎯 Résumé Ultra-Court

1. **Double-clic:** `planifier-auto.bat`
2. **Choix:** `2` (hebdomadaire)
3. **Terminé !** 🚀

Les colis de >90 jours seront archivés automatiquement chaque dimanche à 2h.
