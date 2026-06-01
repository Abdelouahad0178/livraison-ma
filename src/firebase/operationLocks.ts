import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './db'

export const DEFAULT_OPERATION_LOCKS = {
  globalStopped: false,
  globalUpdatedAt: null,
  globalUpdatedBy: '',
  agencies: {},
}

const operationLocksRef = doc(db, 'settings', 'operationLocks')

export function subscribeOperationLocks(callback: any, onError: (err?: any) => void = () => {}) {
  return onSnapshot(
    operationLocksRef,
    snap => {
      callback(snap.exists() ? { ...DEFAULT_OPERATION_LOCKS, ...snap.data() } : DEFAULT_OPERATION_LOCKS)
    },
    err => {
      console.warn('subscribeOperationLocks permission denied - using defaults:', err.code)
      callback(DEFAULT_OPERATION_LOCKS)
      onError(err)
    }
  )
}

export async function updateGlobalSiteLock(stopped: any, updatedBy = 'Admin') {
  await setDoc(operationLocksRef, {
    globalStopped: !!stopped,
    globalUpdatedAt: new Date().toISOString(),
    globalUpdatedBy: updatedBy,
  }, { merge: true })
}

export async function updateAgencyLock(city: any, locked: any, updatedBy = 'Admin') {
  if (!city) throw new Error('Agence invalide.')
  await setDoc(operationLocksRef, {
    agencies: {
      [city]: {
        locked: !!locked,
        updatedAt: new Date().toISOString(),
        updatedBy,
      },
    },
  }, { merge: true })
}
