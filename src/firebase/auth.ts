import {
  getAuth, inMemoryPersistence, indexedDBLocalPersistence,
  setPersistence, onAuthStateChanged,
} from 'firebase/auth'
import { app, secondaryApp } from './appCore'

export const auth = getAuth(app)
export const authSecondary = getAuth(secondaryApp)

setPersistence(auth, indexedDBLocalPersistence).catch(() => {})
setPersistence(authSecondary, inMemoryPersistence).catch(() => {})

export const authReady = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user) })
})
