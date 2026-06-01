import { collection, query, where, getDocs, writeBatch, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import { db } from './config'

/**
 * Politique d'archivage configurable
 */
export interface ArchivagePolicy {
  // Durée minimum avant archivage (en jours)
  delaiMinimumJours: number

  // Statuts éligibles pour archivage
  statutsArchivables: string[]

  // Archiver seulement si COD payé (pour livrés)
  seulementCodPaye: boolean

  // Taille des batchs d'archivage
  batchSize: number
}

/**
 * Politique par défaut
 */
export const POLITIQUE_ARCHIVAGE_DEFAUT: ArchivagePolicy = {
  delaiMinimumJours: 90,  // 3 mois
  statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
  seulementCodPaye: true,  // Pour "Livré", archiver seulement si COD payé
  batchSize: 100
}

/**
 * Politiques prédéfinies
 */
export const POLITIQUES_PREDEFINIES = {
  CONSERVATIVE: {
    delaiMinimumJours: 180,  // 6 mois
    statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
    seulementCodPaye: true,
    batchSize: 50
  } as ArchivagePolicy,

  STANDARD: {
    delaiMinimumJours: 90,  // 3 mois
    statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
    seulementCodPaye: true,
    batchSize: 100
  } as ArchivagePolicy,

  AGGRESSIVE: {
    delaiMinimumJours: 30,  // 1 mois
    statutsArchivables: ['Livré', 'Retourné', 'Annulé'],
    seulementCodPaye: false,  // Archiver même si COD non payé
    batchSize: 200
  } as ArchivagePolicy
}

/**
 * Vérifie si un colis est éligible pour archivage
 */
export function estArchivable(parcel: any, policy: ArchivagePolicy): boolean {
  // 1. Vérifier le statut
  if (!policy.statutsArchivables.includes(parcel.status)) {
    return false
  }

  // 2. Vérifier le délai minimum
  const createdAt = parcel.createdAt?.toDate ? parcel.createdAt.toDate() : new Date(parcel.createdAt || 0)
  const ageJours = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

  if (ageJours < policy.delaiMinimumJours) {
    return false
  }

  // 3. Pour "Livré", vérifier si COD payé (si politique le requiert)
  if (policy.seulementCodPaye && parcel.status === 'Livré') {
    if (parcel.codAmount > 0) {
      // A du COD - vérifier s'il est payé
      const codPaye = parcel.codStatus === 'settled' || parcel.codStatus === 'paid'
      if (!codPaye) {
        return false  // COD non payé, ne pas archiver
      }
    }
  }

  return true
}

/**
 * Récupère les colis éligibles pour archivage
 */
export async function getColisArchivables(
  city?: string,
  policy: ArchivagePolicy = POLITIQUE_ARCHIVAGE_DEFAUT
): Promise<any[]> {
  const colisArchivables: any[] = []

  // Date limite (il y a X jours)
  const dateLimite = new Date()
  dateLimite.setDate(dateLimite.getDate() - policy.delaiMinimumJours)

  // Pour chaque statut archivable
  for (const status of policy.statutsArchivables) {
    const constraints: any[] = [
      where('status', '==', status),
      where('createdAt', '<', Timestamp.fromDate(dateLimite))
    ]

    if (city) {
      constraints.push(where('originCity', '==', city))
    }

    const q = query(collection(db, 'parcels'), ...constraints)
    const snapshot = await getDocs(q)

    snapshot.docs.forEach(doc => {
      const parcel = { id: doc.id, ...doc.data() }
      if (estArchivable(parcel, policy)) {
        colisArchivables.push(parcel)
      }
    })
  }

  return colisArchivables
}

/**
 * Interface pour résultat d'archivage
 */
export interface ArchivageResult {
  success: boolean
  archived: number
  errors: number
  archivePath?: string
  details: string[]
}

/**
 * Archive les colis vers un serveur local
 */
export async function archiverColis(
  colis: any[],
  serverUrl: string,
  policy: ArchivagePolicy = POLITIQUE_ARCHIVAGE_DEFAUT
): Promise<ArchivageResult> {
  const result: ArchivageResult = {
    success: false,
    archived: 0,
    errors: 0,
    details: []
  }

  try {
    // 1. Préparer les données d'archivage
    const archiveData = {
      date: new Date().toISOString(),
      policy: policy,
      count: colis.length,
      parcels: colis.map(p => ({
        ...p,
        archivedAt: new Date().toISOString(),
        archivedBy: 'system'
      }))
    }

    // 2. Envoyer au serveur local
    const response = await fetch(`${serverUrl}/api/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(archiveData)
    })

    if (!response.ok) {
      throw new Error(`Erreur serveur: ${response.status}`)
    }

    const serverResult = await response.json()
    result.archivePath = serverResult.path

    // 3. Supprimer de Firestore (par batches)
    const batches = []
    for (let i = 0; i < colis.length; i += policy.batchSize) {
      const batch = writeBatch(db)
      const chunk = colis.slice(i, i + policy.batchSize)

      chunk.forEach(parcel => {
        batch.delete(doc(db, 'parcels', parcel.id))
      })

      batches.push(batch.commit())
    }

    await Promise.all(batches)

    result.success = true
    result.archived = colis.length
    result.details.push(`${colis.length} colis archivés avec succès`)
    result.details.push(`Archivés vers: ${result.archivePath}`)

  } catch (error: any) {
    result.errors = colis.length
    result.details.push(`Erreur: ${error.message}`)
  }

  return result
}

/**
 * Export des colis en JSON (pour sauvegarde locale)
 */
export function exporterColisJSON(colis: any[]): string {
  const exportData = {
    exportDate: new Date().toISOString(),
    count: colis.length,
    parcels: colis
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Export des colis en CSV
 */
export function exporterColisCSV(colis: any[]): string {
  if (colis.length === 0) return ''

  // Headers
  const headers = [
    'trackingId', 'status', 'senderName', 'receiverName',
    'originCity', 'destinationCity', 'codAmount', 'codStatus',
    'createdAt', 'deliveredAt'
  ]

  const rows = colis.map(p => [
    p.trackingId || '',
    p.status || '',
    p.sender?.name || p.senderName || '',
    p.receiver?.name || p.receiverName || '',
    p.originCity || '',
    p.destinationCity || '',
    p.codAmount || 0,
    p.codStatus || '',
    p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : '',
    p.deliveredAt?.toDate ? p.deliveredAt.toDate().toISOString() : ''
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  return csv
}

/**
 * Télécharger un fichier
 */
export function telechargerFichier(contenu: string, nomFichier: string, type: string = 'application/json') {
  const blob = new Blob([contenu], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomFichier
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Statistiques d'archivage
 */
export async function getStatistiquesArchivage(city?: string): Promise<{
  total: number
  parStatut: Record<string, number>
  parMois: Record<string, number>
  potentielArchivage: number
}> {
  const policy = POLITIQUE_ARCHIVAGE_DEFAUT
  const archivables = await getColisArchivables(city, policy)

  const stats = {
    total: archivables.length,
    parStatut: {} as Record<string, number>,
    parMois: {} as Record<string, number>,
    potentielArchivage: archivables.length
  }

  archivables.forEach(p => {
    // Par statut
    stats.parStatut[p.status] = (stats.parStatut[p.status] || 0) + 1

    // Par mois
    const date = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
    const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    stats.parMois[mois] = (stats.parMois[mois] || 0) + 1
  })

  return stats
}
