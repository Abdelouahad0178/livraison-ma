import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, memoryLruGarbageCollector } from 'firebase/firestore'
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
    // LRU (100 Mo) : les documents lus restent en mémoire pendant la session → en revenant sur un
    // onglet / filtre, l'écoute reprend avec un jeton de reprise (seuls les changements sont
    // retéléchargés) au lieu de tout relire. Rien n'est écrit sur disque.
    : memoryLocalCache({ garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: 100 * 1024 * 1024 }) }),
})
