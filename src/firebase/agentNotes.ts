import { db } from './config'
import { collection, doc, setDoc, serverTimestamp, query, where, onSnapshot, deleteDoc, Timestamp } from 'firebase/firestore'

const COLLECTION = 'agentNotes'

// Obtenir le numéro de semaine au format ISO (YYYY-Www)
export function getCurrentWeek(): string {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  const weekNum = Math.ceil(diff / oneWeek)
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

export interface AgentNote {
  id: string
  agentId: string
  agentName: string
  agentRole: string
  city: string
  week: string
  note: number // 0-10
  comment?: string
  createdAt: any
  createdBy: string
  createdByName: string
}

// Créer ou mettre à jour une note
export async function saveAgentNote(data: {
  agentId: string
  agentName: string
  agentRole: string
  city: string
  week: string
  note: number
  comment?: string
  createdBy: string
  createdByName: string
}): Promise<void> {
  const noteId = `${data.agentId}_${data.week}`
  const noteRef = doc(db, COLLECTION, noteId)
  await setDoc(noteRef, {
    ...data,
    id: noteId,
    createdAt: serverTimestamp(),
  }, { merge: true })
}

// S'abonner aux notes d'une ville (pour chef d'agence)
export function subscribeAgentNotesByCity(
  city: string,
  callback: (notes: AgentNote[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('city', '==', city)
  )
  return onSnapshot(
    q,
    (snap) => {
      const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentNote))
      callback(notes)
    },
    onError
  )
}

// S'abonner à toutes les notes (pour admin)
export function subscribeAllAgentNotes(
  callback: (notes: AgentNote[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentNote))
      callback(notes)
    },
    onError
  )
}

// Supprimer une note
export async function deleteAgentNote(noteId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, noteId))
}
