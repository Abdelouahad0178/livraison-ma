// Système de date de travail GLOBAL contrôlé par l'Admin
// Version simple SANS listener en temps réel pour éviter les boucles

import { db } from '../firebase/config'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const WORKING_DATE_KEY = 'bg-express-working-date'

/**
 * Obtenir la date de travail (depuis localStorage)
 * Retourne la date système si aucune date de travail n'est définie
 */
export const getWorkingDateStr = (): string => {
  const stored = localStorage.getItem(WORKING_DATE_KEY)
  if (stored) {
    try {
      const date = new Date(stored)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    } catch {
      // Fallback sur date système en cas d'erreur
    }
  }

  // Fallback: date système
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Obtenir la date de travail au format DD/MM/YYYY (pour affichage)
 */
export const getWorkingDateDisplay = (): string => {
  const dateStr = getWorkingDateStr()
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Charger la date de travail depuis Firestore (ONE-TIME au démarrage)
 * À appeler UNE SEULE FOIS au chargement de l'app
 */
export const loadWorkingDateFromFirestore = async (): Promise<void> => {
  try {
    const docRef = doc(db, 'settings', 'workingDate')
    const snapshot = await getDoc(docRef)

    if (snapshot.exists()) {
      const data = snapshot.data()
      if (data.date) {
        localStorage.setItem(WORKING_DATE_KEY, data.date)
      }
    }
  } catch (error) {
    console.error('Erreur chargement date de travail:', error)
    // Continuer avec localStorage ou date système
  }
}

/**
 * Définir la date de travail (ADMIN SEULEMENT)
 * Sauvegarde dans Firestore ET localStorage
 */
export const setWorkingDate = async (dateStr: string): Promise<void> => {
  try {
    const date = new Date(dateStr + 'T00:00:00')
    const isoDate = date.toISOString()

    // Sauvegarder dans Firestore
    await setDoc(doc(db, 'settings', 'workingDate'), {
      date: isoDate,
      updatedAt: new Date().toISOString(),
    })

    // Sauvegarder dans localStorage
    localStorage.setItem(WORKING_DATE_KEY, isoDate)

    // Recharger la page pour appliquer la nouvelle date partout
    window.location.reload()
  } catch (error) {
    console.error('Erreur sauvegarde date de travail:', error)
    throw error
  }
}

/**
 * Avancer d'un jour
 */
export const nextDay = async (): Promise<void> => {
  const current = new Date(localStorage.getItem(WORKING_DATE_KEY) || new Date())
  current.setDate(current.getDate() + 1)
  const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
  await setWorkingDate(dateStr)
}

/**
 * Reculer d'un jour
 */
export const previousDay = async (): Promise<void> => {
  const current = new Date(localStorage.getItem(WORKING_DATE_KEY) || new Date())
  current.setDate(current.getDate() - 1)
  const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
  await setWorkingDate(dateStr)
}

/**
 * Réinitialiser à la date système du jour
 */
export const resetToToday = async (): Promise<void> => {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await setWorkingDate(dateStr)
}
