import { db } from './db'
import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, Timestamp, serverTimestamp } from 'firebase/firestore'

export interface LostParcelDeclaration {
  id: string
  parcelId: string
  trackingId: string
  declaredBy: {
    uid: string
    name: string
    role: string
    city: string
  }
  declaredAt: Timestamp
  lastKnownLocation: string
  details: string
  status: 'declared' | 'searching' | 'found' | 'confirmed_lost'
  urgentAlert: boolean
  urgentAlertSentAt?: Timestamp
  responses: {
    [agencyCity: string]: {
      responded: boolean
      respondedAt?: Timestamp
      found: boolean
      comment: string
      respondedBy?: {
        uid: string
        name: string
      }
    }
  }
}

export interface AgencyResponse {
  agencyCity: string
  found: boolean
  comment: string
  respondedBy: {
    uid: string
    name: string
  }
}

/**
 * Déclarer un colis comme perdu
 */
export async function declareLostParcel(
  parcelId: string,
  trackingId: string,
  declaredBy: { uid: string; name: string; role: string; city: string },
  lastKnownLocation: string,
  details: string,
  allAgencies: string[]
): Promise<string> {
  const lostParcelId = `lost_${parcelId}_${Date.now()}`

  // Créer les réponses vides pour toutes les agences
  const responses: any = {}
  allAgencies.forEach(city => {
    responses[city] = {
      responded: false,
      found: false,
      comment: ''
    }
  })

  const declaration: Omit<LostParcelDeclaration, 'id'> = {
    parcelId,
    trackingId,
    declaredBy,
    declaredAt: Timestamp.now(),
    lastKnownLocation,
    details,
    status: 'declared',
    urgentAlert: false,
    responses
  }

  await setDoc(doc(db, 'lostParcels', lostParcelId), declaration)

  // Mettre à jour le statut du colis
  await updateDoc(doc(db, 'parcels', parcelId), {
    status: 'Déclaré perdu',
    lostDeclarationId: lostParcelId,
    updatedAt: serverTimestamp()
  })

  return lostParcelId
}

/**
 * Une agence répond sur un colis perdu
 */
export async function respondToLostParcel(
  lostParcelId: string,
  response: AgencyResponse
): Promise<void> {
  const { agencyCity, found, comment, respondedBy } = response

  const lostParcelRef = doc(db, 'lostParcels', lostParcelId)
  const lostParcelDoc = await getDoc(lostParcelRef)

  if (!lostParcelDoc.exists()) {
    throw new Error('Déclaration de perte introuvable')
  }

  const data = lostParcelDoc.data() as LostParcelDeclaration

  // Mettre à jour la réponse de cette agence
  const updatedResponses = {
    ...data.responses,
    [agencyCity]: {
      responded: true,
      respondedAt: Timestamp.now(),
      found,
      comment,
      respondedBy
    }
  }

  // Si le colis est trouvé, mettre à jour le statut
  const newStatus = found ? 'found' : data.status

  await updateDoc(lostParcelRef, {
    responses: updatedResponses,
    status: newStatus
  })

  // Si trouvé, mettre à jour le colis aussi
  if (found) {
    await updateDoc(doc(db, 'parcels', data.parcelId), {
      status: 'Retrouvé',
      foundAt: serverTimestamp(),
      foundBy: agencyCity
    })
  }
}

/**
 * Lancer une alerte d'urgence à toutes les agences
 */
export async function sendUrgentAlert(lostParcelId: string): Promise<void> {
  await updateDoc(doc(db, 'lostParcels', lostParcelId), {
    urgentAlert: true,
    urgentAlertSentAt: Timestamp.now()
  })
}

/**
 * Récupérer toutes les déclarations de perte
 */
export async function getAllLostParcels(): Promise<LostParcelDeclaration[]> {
  const q = query(collection(db, 'lostParcels'))
  const snapshot = await getDocs(q)

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as LostParcelDeclaration))
}

/**
 * Récupérer les colis perdus nécessitant une réponse d'une agence spécifique
 */
export async function getLostParcelsForAgency(agencyCity: string): Promise<LostParcelDeclaration[]> {
  const allLostParcels = await getAllLostParcels()

  return allLostParcels.filter(lp => {
    const response = lp.responses[agencyCity]
    return response && !response.responded && lp.status !== 'found'
  })
}

/**
 * Vérifier si une agence a des colis perdus en attente de réponse
 */
export async function hasUnrespondedLostParcels(agencyCity: string): Promise<number> {
  const pending = await getLostParcelsForAgency(agencyCity)
  return pending.length
}

/**
 * Vérifier les délais de 48h et retourner les agences en retard
 */
export function getOverdueAgencies(lostParcel: LostParcelDeclaration): string[] {
  const now = Date.now()
  const declaredTime = lostParcel.declaredAt.toMillis()
  const fortyEightHours = 48 * 60 * 60 * 1000

  const overdueAgencies: string[] = []

  Object.entries(lostParcel.responses).forEach(([city, response]) => {
    if (!response.responded && (now - declaredTime) > fortyEightHours) {
      overdueAgencies.push(city)
    }
  })

  return overdueAgencies
}

/**
 * Supprimer une déclaration de colis perdu
 * Peut être supprimé par : le déclarateur, un chef d'agence, ou un admin
 */
export async function deleteLostParcel(
  lostParcelId: string,
  parcelId: string,
  previousStatus?: string
): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore')

  // Supprimer la déclaration
  await deleteDoc(doc(db, 'lostParcels', lostParcelId))

  // Restaurer le statut du colis
  await updateDoc(doc(db, 'parcels', parcelId), {
    status: previousStatus || 'En transit',
    lostDeclarationId: null,
    updatedAt: serverTimestamp()
  })
}
