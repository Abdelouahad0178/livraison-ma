/**
 * Utilitaire pour nettoyer les clients de passage de Firestore
 *
 * Cette fonction identifie et supprime les clients qui ont été créés automatiquement
 * lors de la création de colis (clients de passage) et qui ne devraient exister
 * que dans localStorage, pas dans Firestore.
 */

import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase/db'

export interface PassageClient {
  id: string
  name: string
  tel: string
  city: string
  email?: string
  nic?: string
  accountType: string
  remise: number
  createdByRole?: string
}

/**
 * Trouve tous les clients de passage dans Firestore
 *
 * Critères d'identification:
 * - accountType = 'cash'
 * - Pas d'email OU email vide
 * - Pas de NIC OU NIC vide
 * - remise = 0
 * - createdByRole = 'agent' (créé automatiquement lors de création de colis)
 */
export async function findPassageClients(): Promise<PassageClient[]> {
  const clientsRef = collection(db, 'clients')
  const snapshot = await getDocs(clientsRef)

  const passageClients: PassageClient[] = []

  snapshot.docs.forEach(doc => {
    const data = doc.data()

    // Critères pour identifier un client de passage
    const isCash = data.accountType === 'cash'
    const noEmail = !data.email || data.email.trim() === ''
    const noNIC = !data.nic || data.nic.trim() === ''
    const noRemise = !data.remise || data.remise === 0
    const createdByAgent = data.createdByRole === 'agent'

    if (isCash && noEmail && noNIC && noRemise && createdByAgent) {
      passageClients.push({
        id: doc.id,
        name: data.name,
        tel: data.tel,
        city: data.city,
        email: data.email,
        nic: data.nic,
        accountType: data.accountType,
        remise: data.remise,
        createdByRole: data.createdByRole,
      })
    }
  })

  return passageClients
}

/**
 * Supprime les clients de passage de Firestore
 */
export async function deletePassageClients(clients: PassageClient[]): Promise<{
  deleted: number
  errors: number
  errorMessages: string[]
}> {
  let deleted = 0
  let errors = 0
  const errorMessages: string[] = []

  for (const client of clients) {
    try {
      await deleteDoc(doc(db, 'clients', client.id))
      deleted++
    } catch (error: any) {
      errors++
      errorMessages.push(`${client.name} (${client.tel}): ${error.message}`)
    }
  }

  return { deleted, errors, errorMessages }
}

/**
 * Trouve et supprime tous les clients de passage
 */
export async function cleanupAllPassageClients(): Promise<{
  found: number
  deleted: number
  errors: number
  errorMessages: string[]
}> {
  const clients = await findPassageClients()
  const result = await deletePassageClients(clients)

  return {
    found: clients.length,
    ...result,
  }
}
