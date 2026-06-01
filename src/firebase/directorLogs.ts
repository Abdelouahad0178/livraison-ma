import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { db } from './db'

export const DIRECTOR_ACTION_ICONS = {
  status_update: '📦',
  cod_remit:     '💰',
  user_edit:     '👤',
  page_clients:  '🤝',
  page_fleet:    '🚗',
  client_create: '➕',
  client_update: '✏️',
  client_delete: '🗑️',
  backup_export: '🛡️',
}

export async function logDirectorAction(uid: any, name: any, actionKey: any, details: any, meta = {}) {
  await addDoc(collection(db, 'directorLogs'), {
    uid, name, actionKey, details, meta,
    timestamp: serverTimestamp(),
  })
}

export function subscribeDirectorLogs(callback: any) {
  const q = query(collection(db, 'directorLogs'), orderBy('timestamp', 'desc'))
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}
