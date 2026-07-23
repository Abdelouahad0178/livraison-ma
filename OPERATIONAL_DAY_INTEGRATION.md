# 🗓️ Guide d'intégration - Journée d'exploitation

## 📋 **Votre configuration actuelle**

```
Journée opérationnelle: 08:00 → 06:00 (lendemain)
Duration: 22 heures
```

### **Exemples concrets**

| Date/Heure calendaire | Journée opérationnelle |
|-----------------------|------------------------|
| 23 juillet à 20:00    | **23 juillet** ✅       |
| 24 juillet à 02:00    | **23 juillet** ✅ (même journée!) |
| 24 juillet à 05:59    | **23 juillet** ✅       |
| 24 juillet à 06:00    | **24 juillet** 🆕 (nouvelle journée) |
| 24 juillet à 10:00    | **24 juillet** ✅       |

---

## 🎯 **Ce qui a été créé**

### ✅ Fichiers créés

1. **`src/config/operationalDay.ts`**
   - Configuration centralisée (START_HOUR, END_HOUR)
   - Toutes les fonctions utilitaires
   - 10+ fonctions réutilisables

2. **`src/hooks/useOperationalDay.ts`**
   - Hook `useOperationalDay()` - Journée courante auto-update
   - Hook `useOperationalDaySelector()` - Navigation entre journées
   - Hook `useOperationalDayFilter()` - Filtrage et grouping

3. **`src/components/OperationalDaySelector.tsx`**
   - Composant UI complet avec navigation
   - Badge compact pour affichage simple

---

## 🔧 **Intégration dans vos pages**

### **Option 1: Remplacement complet du sélecteur de période**

Remplacer le sélecteur actuel (Aujourd'hui/Hier/Période) par la journée opérationnelle.

#### **AdminPage.tsx - Exemple d'intégration**

```tsx
// ========== IMPORTS ==========
import { useOperationalDaySelector, useOperationalDayFilter } from '../hooks/useOperationalDay'
import { OperationalDaySelector } from '../components/OperationalDaySelector'
import { getOperationalDayRange } from '../config/operationalDay'

// ========== DANS LE COMPOSANT ==========
function AdminPage() {
  // 🗓️ Gestion de la journée opérationnelle
  const {
    selectedDay,
    selectedDayString,
    range,
    formatted,
    goToPrevious,
    goToNext,
    goToToday,
    isToday,
  } = useOperationalDaySelector()

  // 📊 Chargement des expéditions pour la journée sélectionnée
  const { data: parcelsData, isLoading } = useQuery({
    queryKey: ['parcels', 'operational', selectedDayString],
    queryFn: async () => {
      // Requête Firebase avec la plage de la journée opérationnelle
      const { start, end } = range
      
      const parcelsRef = collection(db, 'parcels')
      const q = query(
        parcelsRef,
        where('createdAt', '>=', start),
        where('createdAt', '<', end),
        orderBy('createdAt', 'desc')
      )
      
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    },
    staleTime: 60000,
  })

  const parcels = parcelsData || []

  // ========== UI ==========
  return (
    <div className="p-6">
      {/* Sélecteur de journée opérationnelle */}
      <OperationalDaySelector
        selectedDay={selectedDay}
        showTimeRange={true}
        showTodayButton={true}
        className="mb-6"
      />

      {/* Indicateur */}
      <div className="mb-4 text-sm text-gray-600">
        📦 {parcels.length} expéditions pour la {formatted.toLowerCase()}
      </div>

      {/* Tableau des expéditions */}
      <table>
        {/* ... votre tableau existant ... */}
      </table>
    </div>
  )
}
```

---

### **Option 2: Ajouter la journée opérationnelle EN PLUS du filtre existant**

Garder votre système actuel et ajouter un onglet "Par journée opérationnelle".

```tsx
function AdminPage() {
  const [filterMode, setFilterMode] = useState<'calendar' | 'operational'>('operational')
  
  // Mode calendaire (votre système actuel)
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'range'>('today')
  
  // Mode opérationnel (nouveau)
  const { selectedDay, range: opRange } = useOperationalDaySelector()

  // Requête adaptative selon le mode
  const { data: parcelsData } = useQuery({
    queryKey: ['parcels', filterMode, filterMode === 'operational' ? selectedDay : period],
    queryFn: async () => {
      let startDate: Date, endDate: Date

      if (filterMode === 'operational') {
        // Utiliser la journée opérationnelle
        startDate = opRange.start
        endDate = opRange.end
      } else {
        // Utiliser votre logique actuelle
        if (period === 'today') {
          startDate = new Date()
          startDate.setHours(0, 0, 0, 0)
          endDate = new Date()
          endDate.setHours(23, 59, 59, 999)
        }
        // ... autres cas
      }

      const q = query(
        collection(db, 'parcels'),
        where('createdAt', '>=', startDate),
        where('createdAt', '<', endDate)
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    },
  })

  return (
    <div>
      {/* Sélecteur de mode */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilterMode('operational')}
          className={filterMode === 'operational' ? 'active' : ''}
        >
          📅 Journée d'exploitation
        </button>
        <button
          onClick={() => setFilterMode('calendar')}
          className={filterMode === 'calendar' ? 'active' : ''}
        >
          🗓️ Calendrier classique
        </button>
      </div>

      {/* UI selon le mode */}
      {filterMode === 'operational' ? (
        <OperationalDaySelector selectedDay={selectedDay} />
      ) : (
        // Votre sélecteur actuel (Aujourd'hui/Hier/Période)
        <YourExistingPeriodSelector />
      )}
    </div>
  )
}
```

---

## 📊 **Cas d'usage avancés**

### **1. Grouper les expéditions par journée opérationnelle**

```tsx
import { groupByOperationalDay } from '../config/operationalDay'

function StatisticsPage() {
  const [parcels, setParcels] = useState([])

  // Grouper toutes les expéditions par journée opérationnelle
  const grouped = groupByOperationalDay(parcels)

  return (
    <div>
      {Array.from(grouped.entries()).map(([dayString, dayParcels]) => (
        <div key={dayString}>
          <h3>Journée du {dayString}</h3>
          <p>{dayParcels.length} expéditions</p>
          {/* Liste des expéditions */}
        </div>
      ))}
    </div>
  )
}
```

### **2. Statistiques d'une journée spécifique**

```tsx
import { getOperationalDayStats } from '../config/operationalDay'

function DayReport({ dayString }: { dayString: string }) {
  const [parcels, setParcels] = useState([])

  const stats = getOperationalDayStats(parcels, dayString)

  return (
    <div>
      <h2>{formatOperationalDay(dayString, true)}</h2>
      <p>Total: {stats.total} expéditions</p>
      <p>Période: {stats.startTime.toLocaleString()} → {stats.endTime.toLocaleString()}</p>
      
      {/* Liste filtrée */}
      {stats.items.map(parcel => (
        <div key={parcel.id}>{parcel.trackingId}</div>
      ))}
    </div>
  )
}
```

### **3. Badge compact dans un header**

```tsx
import { OperationalDayBadge } from '../components/OperationalDaySelector'

function PageHeader() {
  return (
    <header className="flex items-center justify-between">
      <h1>Dashboard</h1>
      <OperationalDayBadge showTimeRange={true} />
    </header>
  )
}
```

### **4. Vérifier si une expédition appartient à la journée courante**

```tsx
import { isInOperationalDay, getCurrentOperationalDayString } from '../config/operationalDay'

function ParcelRow({ parcel }: { parcel: Parcel }) {
  const currentDayString = getCurrentOperationalDayString()
  const isFromToday = isInOperationalDay(parcel.createdAt.toDate(), currentDayString)

  return (
    <tr className={isFromToday ? 'bg-green-50' : ''}>
      {/* ... */}
      {isFromToday && <span className="badge">Aujourd'hui</span>}
    </tr>
  )
}
```

---

## 🔄 **Migration de votre code existant**

### **AVANT (système actuel)**

```tsx
// Filtrage par jour calendaire
const today = new Date()
today.setHours(0, 0, 0, 0)

const tomorrow = new Date(today)
tomorrow.setDate(tomorrow.getDate() + 1)

const q = query(
  parcelsRef,
  where('createdAt', '>=', today),
  where('createdAt', '<', tomorrow)
)
```

### **APRÈS (journée opérationnelle)**

```tsx
import { getCurrentOperationalDay, getOperationalDayRange } from '../config/operationalDay'

// Filtrage par journée opérationnelle
const currentOpDay = getCurrentOperationalDay()
const { start, end } = getOperationalDayRange(currentOpDay)

const q = query(
  parcelsRef,
  where('createdAt', '>=', start),
  where('createdAt', '<', end)
)
```

**Résultat:**
- Expédition de 23 juillet à 20:00 → ✅ Incluse
- Expédition de 24 juillet à 02:00 → ✅ Incluse (même journée!)
- Expédition de 24 juillet à 10:00 → ❌ Exclue (journée suivante)

---

## 🎨 **Exemples d'UI**

### **Layout recommandé pour AdminPage**

```tsx
<div className="min-h-screen bg-gray-50 p-6">
  {/* Header avec journée courante */}
  <div className="mb-6 flex items-center justify-between">
    <h1 className="text-3xl font-bold">Administration</h1>
    <OperationalDayBadge showTimeRange={true} />
  </div>

  {/* Sélecteur de journée + Stats */}
  <div className="mb-6 space-y-4">
    <OperationalDaySelector
      selectedDay={selectedDay}
      onDayChange={setSelectedDay}
      showTimeRange={true}
      showTodayButton={true}
    />

    {/* Stats de la journée */}
    <div className="grid grid-cols-4 gap-4">
      <StatCard label="Expéditions" value={parcels.length} />
      <StatCard label="En attente" value={pending.length} />
      <StatCard label="Livrées" value={delivered.length} />
      <StatCard label="Total COD" value={`${totalCod} DH`} />
    </div>
  </div>

  {/* Recherche + Tableau */}
  <div className="bg-white rounded-lg shadow">
    {/* ... votre tableau ... */}
  </div>
</div>
```

---

## ⚙️ **Configuration personnalisée**

Si vous voulez changer les horaires plus tard:

```tsx
// src/config/operationalDay.ts

export const OPERATIONAL_DAY_CONFIG = {
  START_HOUR: 8,  // 👈 Modifier ici
  END_HOUR: 6,    // 👈 Modifier ici
  
  // Tout le reste s'adapte automatiquement!
}
```

**Pas besoin de modifier le code ailleurs!** Tous les hooks et composants utilisent cette config.

---

## 📈 **Tests recommandés**

### **Scénario de test 1: Changement de journée**

1. Ouvrir l'application à **05:55** (juste avant la fin de journée)
2. Vérifier que les expéditions affichées incluent celles de hier soir + cette nuit
3. Attendre jusqu'à **06:00** (début nouvelle journée)
4. Vérifier que l'UI se met à jour automatiquement
5. Les expéditions de la nuit disparaissent (elles sont dans la journée précédente)

### **Scénario de test 2: Expéditions à cheval**

1. Créer une expédition le **23 juillet à 20:00**
2. Créer une expédition le **24 juillet à 02:00**
3. Sélectionner la journée du **23 juillet**
4. ✅ Les DEUX expéditions doivent apparaître
5. Sélectionner la journée du **24 juillet**
6. ❌ Aucune des deux ne doit apparaître

### **Scénario de test 3: Navigation**

1. Bouton "← Jour précédent" fonctionne
2. Bouton "Jour suivant →" fonctionne
3. Bouton "Aujourd'hui" ramène à la journée courante
4. Badge "En cours" apparaît uniquement pour aujourd'hui

---

## 🚀 **Plan de déploiement recommandé**

### **Phase 1: Test sur une seule page (AdminPage)**

1. Intégrer `OperationalDaySelector` dans AdminPage
2. Tester pendant 2-3 jours
3. Recueillir feedback utilisateurs

### **Phase 2: Déploiement progressif**

1. Ajouter à AgentPage (Chef d'agence)
2. Ajouter à CentralCollectorPage (Encaisseur)
3. Unifier l'expérience sur toutes les pages

### **Phase 3: Migration complète**

1. Supprimer l'ancien système de filtrage calendaire
2. Journée opérationnelle devient le standard
3. Former les utilisateurs

---

## 📞 **Support**

En cas de problème:

1. **Vérifier la configuration**: `OPERATIONAL_DAY_CONFIG` dans `operationalDay.ts`
2. **Console logs**: Les hooks logent automatiquement les changements de journée
3. **Tests unitaires**: Utiliser les fonctions utilitaires pour vérifier les calculs

---

## ✅ **Checklist d'intégration**

- [ ] Fichiers créés (config, hooks, composants)
- [ ] Build réussi (`npm run build`)
- [ ] Intégré dans au moins une page (AdminPage recommandé)
- [ ] Testé le changement de journée (avant/après 06:00)
- [ ] Testé la navigation (précédent/suivant/aujourd'hui)
- [ ] Vérifié que les expéditions sont correctement groupées
- [ ] Feedback utilisateurs positif
- [ ] Déployé en production

---

**Voulez-vous que je commence l'intégration dans AdminPage maintenant?** 🚀
