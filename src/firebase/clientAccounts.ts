/**
 * 📝 Comptes clients (fiches « Demande d'ouverture de compte client ») — gestion simple par le chef d'agence :
 * la fiche papier remplie par le client est saisie ici, retrouvée par N° de compte ou nom, modifiée, réimprimée.
 * Collection `clientAccounts` (règles : chef d'agence / agent pro de la ville, admin).
 */
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from './db'

export interface Person { nom?: string; cin?: string; gsm?: string; email?: string }
export interface ClientAccount {
  id?: string
  accountNumber: string
  city: string
  dateOuverture?: string
  agence?: string
  statut?: 'actif' | 'en_attente' | 'suspendu'
  type?: string
  raisonSociale: string
  enseigne?: string
  formeJuridique?: string
  activite?: string
  adresse?: string
  ville?: string
  rc?: string
  tribunal?: string
  ifiscal?: string
  ice?: string
  patente?: string
  cnss?: string
  capital?: string
  tel?: string
  gsm?: string
  email?: string
  gerant?: Person
  contactExp?: Person
  contactCompta?: Person
  ramassageAdresse?: string
  ramassageHoraires?: string
  services?: string[]
  codModes?: string[]
  volumeMensuel?: string
  poidsMoyen?: string
  portModes?: string[]
  delaiPaiement?: string
  reglementModes?: string[]
  plafondCredit?: string
  restitutionMode?: string
  restitutionPeriodicite?: string
  banque?: string
  titulaire?: string
  rib?: string
  documents?: string[]
  commercial?: string
  notes?: string
  createdAt?: any
  createdBy?: string
  updatedAt?: any
  updatedBy?: string
}

const COL = 'clientAccounts'
/** Préfixe du N° de compte par ville (ex. Agadir → AGA). */
export const cityPrefix = (city: string) => (city || 'BG').normalize('NFD').replace(/[^\p{L}]/gu, '').slice(0, 3).toUpperCase()

export function subscribeClientAccounts(city: string, cb: (rows: ClientAccount[]) => void, onError: (e: any) => void = () => {}) {
  return onSnapshot(query(collection(db, COL), where('city', '==', city)),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).sort((a: any, b: any) => String(b.accountNumber).localeCompare(String(a.accountNumber)))),
    onError)
}

/** Prochain N° de compte de la ville : PRÉFIXE-0001, -0002… (à partir des comptes déjà chargés). */
export function nextAccountNumber(city: string, existing: ClientAccount[]): string {
  const p = cityPrefix(city)
  const max = existing.reduce((m, a) => {
    const r = new RegExp(`^${p}-(\\d+)$`).exec(String(a.accountNumber || ''))
    return r ? Math.max(m, Number(r[1])) : m
  }, 0)
  return `${p}-${String(max + 1).padStart(4, '0')}`
}

const clean = (o: any): any => {
  if (Array.isArray(o)) return o.map(clean)
  if (o && typeof o === 'object' && !(o instanceof Date) && !('_methodName' in o)) {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]))
  }
  return typeof o === 'string' ? o.trim() : o
}

export async function createClientAccount(data: ClientAccount, by: string): Promise<string> {
  const { id: _id, ...rest } = data; void _id
  const ref = await addDoc(collection(db, COL), clean({ ...rest, createdAt: serverTimestamp(), createdBy: by, updatedAt: serverTimestamp(), updatedBy: by }))
  return ref.id
}

export async function updateClientAccount(id: string, data: ClientAccount, by: string) {
  const { id: _id, createdAt: _c, createdBy: _b, ...rest } = data; void _id; void _c; void _b
  await updateDoc(doc(db, COL, id), clean({ ...rest, updatedAt: serverTimestamp(), updatedBy: by }))
}
