/**
 * 🧾 MÉMOIRE DES COLLECTES RÉCENTES (cartes « Collectes par jour » / « Valeurs collectées par jour », Caisse Agence et
 * Chef d'exploitation) — 24/10/2026.
 *
 * Avant : 16 écoutes relisaient À CHAQUE OUVERTURE toutes les expéditions de la ville collectées / reçues depuis le
 * 05/10 (Agadir : 3 305 expéditions, 7 Mo), et de nouveau à chaque changement de période. Maintenant, par ville :
 *   1. l'ensemble est gardé en mémoire (et dans IndexedDB entre deux chargements de page) ;
 *   2. à l'ouverture : affiché tout de suite (dernière version connue), puis RATTRAPÉ — seules les expéditions
 *      modifiées depuis la dernière synchronisation sont relues (parcelsLite.liteUpdatedAt, posé par syncParcelLite) ;
 *   3. VÉRIFIÉ par comptage serveur (8 comptages, sans téléchargement) : un écart (expédition supprimée, partie vers
 *      une autre ville…) → relecture complète, comme avant ;
 *   4. TEMPS RÉEL : écoute des expéditions de la ville modifiées depuis l'ouverture (départ + arrivée).
 * `ready` (bouton « Verser ») ne passe à vrai qu'après le rattrapage + la vérification (ou la relecture complète)
 * ET la première réponse serveur du temps réel. Mêmes expéditions que les 16 requêtes d'avant (utils/recentCollected).
 * Tout échec (IndexedDB absent, quota, réseau) → relecture complète normale.
 */
import { collection, query, where, getDocs, getDoc, doc as fsDoc, getCountFromServer, onSnapshot, orderBy, limit, Timestamp, GeoPoint } from 'firebase/firestore'
import { db } from './db'
import { encodeLiteValue, decodeLiteValue } from '../utils/liteDayCache'
import { RECENT_SHAPES, RECENT_FORMS, matchesRecentCollected, matchesRecentShape, type RecentCityField, type RecentForm } from '../utils/recentCollected'

const COL = 'parcelsLite'
const MARGIN_MS = 10 * 60 * 1000          // décalage d'horloge / délai de la Cloud Function syncParcelLite
const DELTA_MAX = 2000                    // au-delà : relecture complète
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000 // mémoire enregistrée plus ancienne : relecture complète
const FAR = Timestamp.fromMillis(Date.parse('2100-01-01T00:00:00Z'))
const CITY_FIELDS: RecentCityField[] = ['originCity', 'destinationCity']

export interface RecentCollectedState { docs: any[]; ready: boolean }
type Listener = (s: RecentCollectedState) => void

interface CityState {
  city: string
  sinceMs: number
  docs: Map<string, any>
  syncedAt: number        // 0 : jamais synchronisé
  synced: boolean         // rattrapage / relecture de cette ouverture terminé
  liveOk: boolean         // première réponse serveur du temps réel reçue
  subs: Set<Listener>
  gen: number
  unsubs: (() => void)[]
  notifyTimer?: ReturnType<typeof setTimeout>
  persistTimer?: ReturnType<typeof setTimeout>
}
const STATES = new Map<string, CityState>()
const keyOf = (city: string, sinceMs: number) => `${city}|${sinceMs}`

const sinceValue = (form: RecentForm, sinceMs: number) => (form === 'ts' ? Timestamp.fromMillis(sinceMs) : new Date(sinceMs).toISOString())
const shapeQuery = (city: string, cf: RecentCityField, df: string, form: RecentForm, sinceMs: number) =>
  query(collection(db, COL), where(cf, '==', city), where(df, '>=', sinceValue(form, sinceMs)), where('createdAt', '<', FAR))

function notify(st: CityState, now = false) {
  clearTimeout(st.notifyTimer)
  const run = () => {
    const s = { docs: [...st.docs.values()], ready: st.synced && st.liveOk }
    st.subs.forEach(cb => cb(s))
  }
  if (now) run(); else st.notifyTimer = setTimeout(run, 80)
}

/** Remplace / retire une expédition selon qu'elle fait encore partie de l'ensemble. */
function apply(st: CityState, id: string, data: any) {
  const p = { id, ...data }
  if (matchesRecentCollected(p, st.city, st.sinceMs)) st.docs.set(id, p)
  else st.docs.delete(id)
}

// ── IndexedDB ────────────────────────────────────────────────────────────────────────────────────────────────
const DB_NAME = 'bgx-recent-collected'
const STORE = 'sets'
let idb: Promise<IDBDatabase | null> | null = null
function openIdb(): Promise<IDBDatabase | null> {
  if (idb) return idb
  idb = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' }) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  return idb
}
async function loadSaved(key: string): Promise<{ syncedAt: number; docs: any[] } | null> {
  try {
    const d = await openIdb()
    if (!d) return null
    return await new Promise(resolve => {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result && typeof req.result.syncedAt === 'number' && Array.isArray(req.result.docs) ? req.result : null)
      req.onerror = () => resolve(null)
    })
  } catch { return null }
}
function schedulePersist(st: CityState) {
  if (!st.synced || st.persistTimer) return
  st.persistTimer = setTimeout(async () => {
    st.persistTimer = undefined
    try {
      const d = await openIdb()
      if (!d) return
      const row = { key: keyOf(st.city, st.sinceMs), syncedAt: st.syncedAt, docs: [...st.docs.values()].map(encodeLiteValue) }
      d.transaction(STORE, 'readwrite').objectStore(STORE).put(row)
    } catch (err) { console.warn('Collectes récentes : enregistrement impossible', err) }
  }, 5000)
}
const DEC = { timestamp: (s: number, ns: number) => new Timestamp(s, ns), geoPoint: (a: number, b: number) => new GeoPoint(a, b) }

// ── Synchronisation ──────────────────────────────────────────────────────────────────────────────────────────
/** Rattrapage (modifiées depuis la dernière synchronisation) + vérification par comptage. false → relecture complète. */
async function catchUp(st: CityState): Promise<boolean> {
  const from = Timestamp.fromMillis(st.syncedAt - MARGIN_MS)
  const snaps = await Promise.all(CITY_FIELDS.map(f => getDocs(query(collection(db, COL),
    where(f, '==', st.city), where('liteUpdatedAt', '>', from), orderBy('liteUpdatedAt'), limit(DELTA_MAX)))))
  if (snaps.some(s => s.size >= DELTA_MAX)) return false
  snaps.forEach(s => s.docs.forEach(d => apply(st, d.id, d.data())))
  const checks = await Promise.all(RECENT_SHAPES.flatMap(([cf, df]) => RECENT_FORMS.map(async form => {
    const server = (await getCountFromServer(shapeQuery(st.city, cf, df, form, st.sinceMs))).data().count
    let local = 0
    st.docs.forEach(p => { if (matchesRecentShape(p, st.city, cf, df, form, st.sinceMs)) local++ })
    return server === local
  })))
  return checks.every(Boolean)
}

/** Relecture complète : les 8 requêtes (sans filtre de période, appliqué ensuite par la page). */
async function fullRead(st: CityState) {
  const m = new Map<string, any>()
  await Promise.all(RECENT_SHAPES.flatMap(([cf, df]) => RECENT_FORMS.map(async form => {
    const snap = await getDocs(shapeQuery(st.city, cf, df, form, st.sinceMs))
    snap.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() }))
  })))
  st.docs = m
}

/** Temps réel, lancé EN MÊME TEMPS que le rattrapage. `liveLatest` garde la dernière version reçue de chaque
 *  expédition : réappliquée après le rattrapage / la relecture complète (lue avant) pour ne jamais revenir en arrière. */
function startLive(st: CityState, fromMs: number, gen: number, liveLatest: Map<string, any>) {
  const from = Timestamp.fromMillis(fromMs)
  const answered = new Set<string>()
  for (const f of CITY_FIELDS) {
    st.unsubs.push(onSnapshot(
      query(collection(db, COL), where(f, '==', st.city), where('liteUpdatedAt', '>', from), orderBy('liteUpdatedAt')),
      snap => {
        if (gen !== st.gen) return
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'removed') { liveLatest.set(ch.doc.id, ch.doc.data()); apply(st, ch.doc.id, ch.doc.data()); return }
          // Sortie de la requête = ville changée : l'expédition peut encore compter par l'autre champ ville → relue
          getDoc(fsDoc(db, COL, ch.doc.id)).then(d => {
            if (gen !== st.gen) return
            if (d.exists()) { liveLatest.set(d.id, d.data()); apply(st, d.id, d.data()) } else { liveLatest.delete(ch.doc.id); st.docs.delete(ch.doc.id) }
            notify(st); schedulePersist(st)
          }).catch(() => {})
        })
        if (!snap.metadata.fromCache) {
          answered.add(f)
          if (answered.size === CITY_FIELDS.length) { st.liveOk = true; st.syncedAt = Date.now() }
        }
        notify(st)
        schedulePersist(st)
      },
      err => {
        console.error('Collectes récentes (temps réel) :', err)
        answered.add(f)
        if (answered.size === CITY_FIELDS.length) st.liveOk = true
        notify(st)
      },
    ))
  }
}

async function start(st: CityState) {
  const gen = ++st.gen
  st.synced = false
  st.liveOk = false
  // 1. Mémoire enregistrée (premier passage de cette page) → affichée tout de suite
  if (!st.syncedAt) {
    const saved = await loadSaved(keyOf(st.city, st.sinceMs))
    if (gen !== st.gen) return
    if (saved && Date.now() - saved.syncedAt < MAX_AGE_MS) {
      const m = new Map<string, any>()
      for (const enc of saved.docs) { const p = decodeLiteValue(enc, DEC); if (p?.id) m.set(p.id, p) }
      st.docs = m
      st.syncedAt = saved.syncedAt
      notify(st, true)
    }
  }
  // 2. Temps réel (depuis maintenant, avec marge) lancé tout de suite, EN PARALLÈLE du rattrapage
  const startedAt = Date.now()
  const liveLatest = new Map<string, any>()
  startLive(st, startedAt - MARGIN_MS, gen, liveLatest)
  // 3. Rattrapage + vérification, sinon relecture complète
  let ok = false
  if (st.syncedAt && Date.now() - st.syncedAt < MAX_AGE_MS) {
    try { ok = await catchUp(st) } catch (err) { console.warn('Collectes récentes : rattrapage impossible, relecture complète', err) }
  }
  if (gen !== st.gen) return
  if (!ok) {
    try { await fullRead(st) } catch (err) { console.error('Collectes récentes : lecture impossible', err) }
    if (gen !== st.gen) return
  }
  // Versions temps réel (plus récentes) reçues pendant la lecture : réappliquées
  liveLatest.forEach((data, id) => apply(st, id, data))
  st.syncedAt = startedAt
  st.synced = true
  notify(st, true)
  schedulePersist(st)
}

function stop(st: CityState) {
  st.gen++
  st.unsubs.forEach(u => u())
  st.unsubs = []
  clearTimeout(st.notifyTimer)
}

/**
 * S'abonne à l'ensemble des expéditions de `city` collectées / reçues depuis `sinceMs` (toutes dates de création).
 * La première page abonnée lance la synchronisation ; la mémoire est gardée quand la dernière se désabonne
 * (réouverture : simple rattrapage).
 */
export function subscribeRecentCollected(city: string, sinceMs: number, cb: Listener): () => void {
  const key = keyOf(city, sinceMs)
  let st = STATES.get(key)
  if (!st) {
    st = { city, sinceMs, docs: new Map(), syncedAt: 0, synced: false, liveOk: false, subs: new Set(), gen: 0, unsubs: [] }
    STATES.set(key, st)
  }
  const s = st
  s.subs.add(cb)
  if (s.subs.size === 1) start(s).catch(err => console.error('Collectes récentes :', err))
  else cb({ docs: [...s.docs.values()], ready: s.synced && s.liveOk })
  return () => {
    s.subs.delete(cb)
    if (!s.subs.size) stop(s)
  }
}
