import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore'
import app from './appCore'

// ⚡ Cache Firestore :
// - Livreurs / chauffeurs : cache PERSISTANT (IndexedDB) — utile sur le terrain quand le réseau coupe.
// - Autres rôles (bureau) : cache en MÉMOIRE — le cache persistant réécrivait dans le navigateur
//   chaque expédition lue (20 000+ sur un mois), ce qui alourdissait fortement la page.
// Le rôle est mémorisé à la connexion (App.tsx) et pris en compte au chargement suivant.
const FIELD_ROLES = ['livreur', 'chauffeur', 'livreur-gare']
let usePersistent = false
try { usePersistent = FIELD_ROLES.includes(localStorage.getItem('bg-cache-role') || '') } catch { /* navigation privée */ }

export const db = initializeFirestore(app, {
  localCache: usePersistent
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache(),
})
