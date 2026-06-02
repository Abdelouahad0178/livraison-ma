# Guide de Migration TypeScript Strict

## 🎯 Objectif
Remplacer progressivement les types `any` par des types stricts pour améliorer la sécurité et la maintenabilité du code.

## 📋 Plan de Migration (4 étapes)

### Étape 1 : Utils & Types (Semaine 1) ✅
- [x] Créer `src/types/firebase.types.ts`
- [ ] Migrer `src/utils/formatNumber.ts`
- [ ] Créer helpers typés dans `src/utils/typeGuards.ts`

### Étape 2 : Firebase Services (Semaines 2-3)
- [ ] `src/firebase/parcels.ts` - Remplacer `any` par `Parcel`
- [ ] `src/firebase/users.ts` - Remplacer `any` par `User`
- [ ] `src/firebase/clients.ts` - Remplacer `any` par `Client`
- [ ] `src/firebase/caisse.ts` - Remplacer `any` par `CaisseEntry`
- [ ] `src/firebase/central.ts` - Remplacer `any` par types centraux

### Étape 3 : Components (Semaine 4)
- [ ] Typer les props de tous les composants
- [ ] Migrer les hooks customs

### Étape 4 : Pages (Semaines 5-6)
- [ ] Typer AdminPage.tsx
- [ ] Typer AgentPage.tsx
- [ ] Typer autres pages

## 📝 Exemples de Migration

### ❌ AVANT (avec any)
\`\`\`typescript
// src/firebase/parcels.ts
export async function updateParcel(parcelId: any, data: any) {
  const ref = doc(db, 'parcels', parcelId)
  await updateDoc(ref, data)
}

export function subscribeAllParcels(callback: any) {
  const q = query(collection(db, 'parcels'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })))
  })
}
\`\`\`

### ✅ APRÈS (avec types stricts)
\`\`\`typescript
import { Parcel } from '../types/firebase.types'
import { DocumentData } from 'firebase/firestore'

export async function updateParcel(
  parcelId: string,
  data: Partial<Parcel>
): Promise<void> {
  const ref = doc(db, 'parcels', parcelId)
  await updateDoc(ref, data as DocumentData)
}

export function subscribeAllParcels(
  callback: (parcels: Parcel[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, 'parcels'))
  return onSnapshot(
    q,
    snap => {
      const parcels = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Parcel))
      callback(parcels)
    },
    onError
  )
}
\`\`\`

### ❌ AVANT (Props non typés)
\`\`\`typescript
function ParcelCard({ parcel, onClick }: any) {
  return <div onClick={() => onClick(parcel)}>{parcel.trackingId}</div>
}
\`\`\`

### ✅ APRÈS (Props typés)
\`\`\`typescript
import { Parcel } from '../types/firebase.types'

interface ParcelCardProps {
  parcel: Parcel
  onClick: (parcel: Parcel) => void
}

function ParcelCard({ parcel, onClick }: ParcelCardProps) {
  return (
    <div onClick={() => onClick(parcel)}>
      {parcel.trackingId}
    </div>
  )
}
\`\`\`

### ❌ AVANT (State non typé)
\`\`\`typescript
const [parcels, setParcels] = useState<any[]>([])
const [user, setUser] = useState<any>(null)
\`\`\`

### ✅ APRÈS (State typé)
\`\`\`typescript
import { Parcel, User } from '../types/firebase.types'

const [parcels, setParcels] = useState<Parcel[]>([])
const [user, setUser] = useState<User | null>(null)
\`\`\`

## 🛠️ Commandes Utiles

### Vérifier les erreurs TypeScript
\`\`\`bash
npm run type-check
\`\`\`

### Compiler avec strict mode
\`\`\`bash
npx tsc --project tsconfig.strict.json --noEmit
\`\`\`

### Trouver tous les 'any' restants
\`\`\`bash
grep -r ": any" src/ --include="*.ts" --include="*.tsx" | wc -l
\`\`\`

## 🎨 Patterns Courants

### Pattern 1 : Callback typé
\`\`\`typescript
// ❌ Avant
function subscribe(callback: any) { ... }

// ✅ Après
function subscribe(callback: (data: Parcel[]) => void) { ... }
\`\`\`

### Pattern 2 : Fonction avec Partial
\`\`\`typescript
// ❌ Avant
function update(id: string, data: any) { ... }

// ✅ Après
function update(id: string, data: Partial<Parcel>) { ... }
\`\`\`

### Pattern 3 : Union Types
\`\`\`typescript
// ✅ Au lieu de any pour status
type Status = 'pending' | 'approved' | 'rejected'
function updateStatus(status: Status) { ... }
\`\`\`

### Pattern 4 : Type Guards
\`\`\`typescript
function isParcel(value: unknown): value is Parcel {
  return (
    typeof value === 'object' &&
    value !== null &&
    'trackingId' in value
  )
}

// Usage
if (isParcel(data)) {
  // TypeScript sait que data est un Parcel
  console.log(data.trackingId)
}
\`\`\`

### Pattern 5 : Generic Functions
\`\`\`typescript
function mapDocs<T>(docs: QueryDocumentSnapshot[]): T[] {
  return docs.map(d => ({ id: d.id, ...d.data() } as T))
}

// Usage
const parcels = mapDocs<Parcel>(snapshot.docs)
\`\`\`

## ⚠️ Pièges à Éviter

### Piège 1 : Cast sans vérification
\`\`\`typescript
// ❌ Dangereux
const parcel = data as Parcel // Pas de vérification runtime

// ✅ Sûr
if (isParcel(data)) {
  const parcel = data // Type narrowing
}
\`\`\`

### Piège 2 : Ignorer les propriétés optionnelles
\`\`\`typescript
// ❌ Peut crasher
console.log(parcel.codAmount.toFixed(2))

// ✅ Sûr
console.log(parcel.codAmount?.toFixed(2) ?? '0.00')
\`\`\`

### Piège 3 : Mutations sans Partial
\`\`\`typescript
// ❌ Force à fournir tous les champs
function update(data: Parcel) { ... }

// ✅ Permet mise à jour partielle
function update(data: Partial<Parcel>) { ... }
\`\`\`

## 📊 Métriques de Progression

Suivre avec cette commande :
\`\`\`bash
echo "any explicites restants:"
grep -r ": any" src/ --include="*.ts" --include="*.tsx" | wc -l

echo "Fichiers migrés avec types stricts:"
grep -r "from.*firebase.types" src/ --include="*.ts" | cut -d: -f1 | sort -u | wc -l
\`\`\`

## 🎯 Priorité de Migration

1. **Haute priorité** (impact sécurité)
   - Firebase mutations (create, update, delete)
   - Logique métier COD
   - Calculs financiers

2. **Moyenne priorité** (impact maintenabilité)
   - Components réutilisables
   - Hooks customs
   - Utils

3. **Basse priorité** (impact UX)
   - Pages simples
   - UI components pures
   - Formatters

## 💡 Conseils

1. **Migrer fichier par fichier** - Ne pas tout faire d'un coup
2. **Commencer par les types** - Créer tous les types avant de migrer
3. **Tester après chaque migration** - S'assurer que rien ne casse
4. **Utiliser `unknown` au lieu de `any`** - Force à faire des vérifications
5. **Documenter les types complexes** - Ajouter des JSDoc

## 🚀 Quick Start

1. Installer les types existants :
\`\`\`bash
# Les types sont déjà créés dans src/types/firebase.types.ts
\`\`\`

2. Migrer un fichier test :
\`\`\`typescript
// Avant
import { updateParcel } from './firebase/parcels'
updateParcel(id, { status: 'Livré' })

// Après
import { Parcel } from './types/firebase.types'
import { updateParcel } from './firebase/parcels'
const update: Partial<Parcel> = { status: 'Livré' }
updateParcel(id, update)
\`\`\`

3. Vérifier la compilation :
\`\`\`bash
npx tsc --noEmit
\`\`\`

---

**Note** : Cette migration peut se faire progressivement sur 4-6 semaines sans impacter la production.
