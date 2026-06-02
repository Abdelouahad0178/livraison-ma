# 📊 Progression vers 9/10

**Note actuelle :** 8.0/10 (confirmé par 2 IA)  
**Objectif intermédiaire :** 8.5/10 (typecheck:strict ✅)  
**Objectif final :** 9.0/10  
**Deadline :** 15 jours (17 juin 2026)  
**Démarré :** 2 juin 2026

---

## 🎯 Vue d'Ensemble

| Priorité | Pour | Status | Progression | Temps estimé | Temps réel |
|----------|------|--------|-------------|--------------|------------|
| **P0: typecheck:strict** | 8.5/10 | ⏳ NEXT | 0% ░░░░░░░░░░░░ | 3 jours | - |
| **P1: Réduire any** | 9.0/10 | ⏳ TODO | 0% ░░░░░░░░░░░░ | 10 jours | - |
| **P2: Découper pages** | 9.0/10 | ⏳ TODO | 0% ░░░░░░░░░░░░ | 7 jours | - |
| ~~P-1: Encodage~~ | - | ✅ DONE | 100% ████████████ | 1 jour | 30 min ⚡ |

**Progression globale : 0% ░░░░░░░░░░░░░░░░░░░░**  
**Note actuelle : 8.0/10**

---

## ✅ P1: Encodage - TERMINÉ

### Checklist
- [x] Créer `.gitattributes`
- [x] Configurer `core.autocrlf = true`
- [x] Re-normaliser fichiers existants
- [x] Vérifier plus de warnings ✅
- [x] Commit `2eda6e4`

### Résultat
```bash
# Avant
git status
# warning: LF will be replaced by CRLF (100+ warnings)

# Après
git status
# Clean, no warnings ✅
```

**Impact :** Plus de confusion Git, diffs propres, collaboration facilitée

---

## 🟡 P2: Réduire les 'any' - EN COURS

### Baseline
```bash
npm run count-any
# Résultat: ~350 occurrences
```

### Objectif
```bash
npm run count-any
# Objectif: <10 occurrences
```

### Plan Détaillé (10 jours)

#### Semaine 1: Firebase Services

**Jour 1-2 : src/firebase/parcels.ts** (⏳ TODO)
- [ ] Importer types : `import { Parcel } from '../types/firebase.types'`
- [ ] Remplacer callback: `any` → `(parcels: Parcel[]) => void`
- [ ] Typer createParcel: `data: any` → `data: Omit<Parcel, 'id'>`
- [ ] Typer updateParcel: `data: any` → `data: Partial<Parcel>`
- [ ] Typer subscriptions
- [ ] Tester en dev
- [ ] Commit

Estimation : 40 any → 0 any

**Jour 3 : src/firebase/users.ts + clients.ts** (⏳ TODO)
- [ ] Importer `User` et `Client`
- [ ] Typer toutes les fonctions
- [ ] Remplacer callbacks
- [ ] Tester
- [ ] Commit

Estimation : 25 any → 0 any

**Jour 4 : src/firebase/caisse.ts + central.ts** (⏳ TODO)
- [ ] Importer `CaisseEntry`, `CentralPayment`
- [ ] Typer créations/updates
- [ ] Typer subscriptions
- [ ] Tester
- [ ] Commit

Estimation : 30 any → 0 any

**Jour 5 : src/firebase/delivery.ts + cod.ts + finance.ts** (⏳ TODO)
- [ ] Typer fonctions restantes
- [ ] Vérifier cohérence
- [ ] Tester
- [ ] Commit

Estimation : 35 any → 0 any

#### Semaine 2: Components & Pages

**Jour 6-7 : Components** (⏳ TODO)
- [ ] Typer props de tous les composants
- [ ] Créer interfaces Props
- [ ] Tester
- [ ] Commit

Estimation : 40 any → 0 any

**Jour 8-9 : Hooks & Utils** (⏳ TODO)
- [ ] Typer hooks customs
- [ ] Typer utils
- [ ] Tester
- [ ] Commit

Estimation : 20 any → 0 any

**Jour 10 : Pages** (⏳ TODO)
- [ ] Typer state des pages principales
- [ ] Typer props
- [ ] Vérification finale
- [ ] Commit

Estimation : 160 any → types stricts

### Commandes de Suivi

```bash
# Vérifier progression quotidienne
npm run count-any

# Logger dans fichier
echo "$(date +%Y-%m-%d): $(npm run count-any 2>/dev/null | tail -1) any" >> progress.log

# Voir progression
cat progress.log
```

### Progression Détaillée

| Fichier | any Avant | any Après | Status |
|---------|-----------|-----------|--------|
| parcels.ts | ~40 | - | ⏳ TODO |
| users.ts | ~15 | - | ⏳ TODO |
| clients.ts | ~10 | - | ⏳ TODO |
| caisse.ts | ~20 | - | ⏳ TODO |
| central.ts | ~10 | - | ⏳ TODO |
| delivery.ts | ~15 | - | ⏳ TODO |
| cod.ts | ~10 | - | ⏳ TODO |
| finance.ts | ~10 | - | ⏳ TODO |
| Components | ~40 | - | ⏳ TODO |
| Hooks | ~10 | - | ⏳ TODO |
| Utils | ~10 | - | ⏳ TODO |
| Pages | ~160 | - | ⏳ TODO |
| **TOTAL** | **~350** | **<10** | **0%** |

---

## ⏳ P3: typecheck:strict - À FAIRE

### Checklist
- [ ] Lancer `npm run typecheck:strict 2>&1 | tee strict-errors.log`
- [ ] Analyser types d'erreurs
- [ ] Corriger erreurs critiques (TS2xxx)
- [ ] Corriger erreurs secondaires (TS7xxx)
- [ ] Vérifier passe ✅
- [ ] Intégrer dans CI

### Erreurs Attendues
```bash
# Catégories probables
TS2322: Type not assignable
TS2345: Argument type incorrect
TS2339: Property does not exist
TS7053: Element has any type
```

---

## ⏳ P4: Découper Grosses Pages - À FAIRE

### Fichiers Cibles

| Fichier | Lignes Avant | Lignes Après | Réduction |
|---------|--------------|--------------|-----------|
| AdminPage.tsx | 4127 | ~500 | -87% |
| AgentPage.tsx | 2856 | ~400 | -86% |
| DirectorPage.tsx | 1923 | ~600 | -69% |
| CaissierPage.tsx | 1654 | ~500 | -70% |
| DriverPage.tsx | 1342 | ~400 | -70% |

### Checklist AdminPage
- [ ] Créer `hooks/useAdminData.ts`
- [ ] Créer `hooks/useAdminFilters.ts`
- [ ] Créer `components/AdminHeader.tsx`
- [ ] Créer `components/AdminSidebar.tsx`
- [ ] Refactorer AdminPage.tsx
- [ ] Tester
- [ ] Commit

### Checklist AgentPage
- [ ] Créer hooks
- [ ] Créer components
- [ ] Refactorer
- [ ] Tester
- [ ] Commit

---

## 📈 Métriques Quotidiennes

### 2 Juin 2026 (Jour 0)
```
Encodage warnings : 100+ → 0 ✅
Types any         : ~350
typecheck:strict  : ❌
Fichiers >1000L   : 5
Note              : 8.5/10
```

### Template Quotidien
```bash
# À exécuter chaque jour
echo "=== $(date +%Y-%m-%d) ===" >> daily-metrics.log
echo "any count: $(npm run count-any 2>/dev/null | tail -1)" >> daily-metrics.log
echo "typecheck:strict: $(npm run typecheck:strict >/dev/null 2>&1 && echo 'PASS' || echo 'FAIL')" >> daily-metrics.log
echo "" >> daily-metrics.log
```

---

## 🎯 Objectif Final (17 Juin 2026)

```
✅ Encodage warnings : 0
✅ Types any         : <10
✅ typecheck:strict  : PASS
✅ Fichiers >1000L   : 0
✅ Note              : 9.0/10 🏆
```

---

## 📝 Notes & Blockers

### Jour 0 (2 Juin)
- ✅ P1 Encodage terminé en 30 min (estimé 1 jour)
- 🎉 Gain de temps : 7h30
- Prochaine étape : Démarrer P2 avec parcels.ts

### Templates pour journée type

**Matin :**
```bash
# 1. Pull dernières modifs
git pull

# 2. Check métriques
npm run count-any
npm run typecheck:strict

# 3. Choisir fichier du jour (voir plan P2)
# Exemple: src/firebase/parcels.ts
```

**Fin de journée :**
```bash
# 1. Tests
npm run build
npm run typecheck

# 2. Métriques
npm run count-any

# 3. Commit
git add .
git commit -m "refactor(types): parcels.ts - 40 any → 0"

# 4. Logger progression
echo "$(date): parcels.ts done ✅" >> PROGRESS.md
```

---

## 🏆 Célébrations

- [x] 🎉 P1 Encodage - TERMINÉ en 30 min !
- [ ] 🎊 Premier fichier 0 any
- [ ] 🚀 typecheck:strict PASS
- [ ] 🎯 AdminPage <500 lignes
- [ ] 🏆 Note 9.0/10

---

*Mis à jour automatiquement - Dernière modification : 2 juin 2026*
