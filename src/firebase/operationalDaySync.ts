import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { db } from './db'
import { getCurrentOperationalDayString } from '../config/operationalDay'

/**
 * 🔄 Synchronise la journée opérationnelle avec Firestore
 *
 * Garantit que tous les utilisateurs voient la même journée opérationnelle,
 * même après une déconnexion ou un redémarrage.
 */

const OPERATIONAL_DAY_DOC = 'settings/operationalDay'

/**
 * 📅 Récupère la journée opérationnelle depuis Firestore
 */
export async function getStoredOperationalDay(): Promise<string | null> {
  try {
    const docRef = doc(db, OPERATIONAL_DAY_DOC)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return docSnap.data()?.currentDay || null
    }
    return null
  } catch (error) {
    console.error('❌ Erreur lecture journée opérationnelle:', error)
    return null
  }
}

/**
 * 💾 Sauvegarde la journée opérationnelle dans Firestore
 */
export async function saveOperationalDay(dayString: string): Promise<void> {
  try {
    const docRef = doc(db, OPERATIONAL_DAY_DOC)
    await setDoc(docRef, {
      currentDay: dayString,
      updatedAt: serverTimestamp(),
      updatedBy: 'auto-system',
    }, { merge: true })

    console.log('✅ Journée opérationnelle synchronisée:', dayString)
  } catch (error) {
    console.error('❌ Erreur sauvegarde journée opérationnelle:', error)
  }
}

/**
 * 🔍 Vérifie et synchronise la journée opérationnelle
 *
 * Compare l'heure système actuelle avec la valeur stockée dans Firestore.
 * Si différent, met à jour Firestore avec la bonne valeur.
 */
export async function checkAndSyncOperationalDay(): Promise<string> {
  const systemDay = getCurrentOperationalDayString()
  const storedDay = await getStoredOperationalDay()

  // Si pas encore de valeur stockée OU si la date a changé
  if (!storedDay || storedDay !== systemDay) {
    console.log(`🔄 Mise à jour journée: ${storedDay || 'aucune'} → ${systemDay}`)
    await saveOperationalDay(systemDay)
    return systemDay
  }

  return storedDay
}

/**
 * 👂 Écoute les changements de journée opérationnelle en temps réel
 *
 * @param callback Fonction appelée quand la journée change
 * @returns Fonction pour arrêter l'écoute
 */
export function subscribeToOperationalDay(
  callback: (dayString: string) => void
): () => void {
  const docRef = doc(db, OPERATIONAL_DAY_DOC)

  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      const dayString = snapshot.data()?.currentDay
      if (dayString) {
        callback(dayString)
      }
    }
  }, (error) => {
    console.error('❌ Erreur écoute journée opérationnelle:', error)
  })
}

/**
 * ⏰ Démarre la vérification automatique périodique
 *
 * Vérifie chaque minute si la journée a changé et synchronise avec Firestore.
 * À utiliser côté admin pour garantir la mise à jour automatique.
 */
export function startAutoSync(): () => void {
  // Vérification immédiate
  checkAndSyncOperationalDay()

  // Vérifier toutes les minutes
  const interval = setInterval(() => {
    checkAndSyncOperationalDay()
  }, 60000) // 1 minute

  // Vérifier aussi quand la fenêtre redevient active
  const handleFocus = () => {
    console.log('🎯 Focus détecté - Vérification journée opérationnelle')
    checkAndSyncOperationalDay()
  }

  window.addEventListener('focus', handleFocus)

  // Fonction de nettoyage
  return () => {
    clearInterval(interval)
    window.removeEventListener('focus', handleFocus)
  }
}
