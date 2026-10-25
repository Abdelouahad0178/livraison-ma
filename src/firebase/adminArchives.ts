import { deleteField, doc, runTransaction } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import app from './appCore'
import { db } from './db'

export type AdminArchive = {
  id: string
  archiveSource: 'parcels' | 'parcels_archive'
  trackingId: string
  senderNic: string
  sender: { name: string; tel: string }
  receiver: { name: string; tel: string }
  originCity: string
  destinationCity: string
  status: string
  codAmount: number
  shipmentDay: string
  archiveDay: string
  archivedAt: string | null
}

export type ArchiveFilters = {
  search: string
  status: string
  city: string
  dateField: 'createdAt' | 'archivedAt'
  dateFrom: string
  dateTo: string
  page: number
  pageSize: number
  refresh?: boolean
}

export type ArchiveBrowseResult = {
  parcels: AdminArchive[]
  total: number
  totalArchived: number
  page: number
  pageSize: number
  cities: string[]
  statuses: string[]
  updatedAt: string
}

export async function browseAdminArchives(filters: ArchiveFilters) {
  const callable = httpsCallable<ArchiveFilters, ArchiveBrowseResult>(
    getFunctions(app), 'browseAdminArchives', { timeout: 120000 }
  )
  return (await callable(filters)).data
}

// Never write the projected table row back into Firestore: it omits parcel data.
export async function restoreAdminArchive(parcel: Pick<AdminArchive, 'id' | 'archiveSource'>) {
  await runTransaction(db, async transaction => {
    const source = doc(db, parcel.archiveSource, parcel.id)
    const snapshot = await transaction.get(source)
    if (!snapshot.exists()) throw new Error('Cette archive n’existe plus. Actualisez la liste.')
    if (parcel.archiveSource === 'parcels') {
      if (snapshot.data().isArchived !== true) throw new Error('Cette expédition est déjà désarchivée.')
      transaction.update(source, {
        isArchived: false, archivedAt: deleteField(), archivedBy: deleteField(),
        archivedByName: deleteField(), archivedReason: deleteField(), _archivedAt: deleteField(),
      })
      return
    }
    const destination = doc(db, 'parcels', parcel.id)
    const existing = await transaction.get(destination)
    if (existing.exists()) throw new Error('Une expédition portant cet identifiant existe déjà. Restauration annulée pour préserver ses données.')
    const { archivedAt, archivedBy, archivedByName, archivedReason, _archivedAt, ...data } = snapshot.data()
    transaction.set(destination, { ...data, isArchived: false })
    transaction.delete(source)
  })
}
