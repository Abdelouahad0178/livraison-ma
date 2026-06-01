import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './db'
import { DEFAULT_TARIFF_CONFIG, normalizeTariffConfig } from './constants'

export function subscribeTariffConfig(callback: any, onError: (err?: any) => void = () => {}) {
  return onSnapshot(doc(db, 'settings', 'tariffs'), snap => {
    callback(normalizeTariffConfig(snap.exists() ? snap.data() : DEFAULT_TARIFF_CONFIG))
  }, onError)
}

export async function saveTariffConfig(config: any, updatedBy = 'Admin') {
  const normalized = normalizeTariffConfig(config)
  await setDoc(doc(db, 'settings', 'tariffs'), {
    ...normalized,
    updatedBy,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}
