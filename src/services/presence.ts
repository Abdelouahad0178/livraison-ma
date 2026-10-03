/**
 * 👁️ Présence en temps réel — heartbeat client (tous les rôles connectés).
 *
 * Écrit/fusionne presence/{uid} :
 *  - toutes les 60 s quand l'onglet est visible (120 s quand il est masqué),
 *  - au changement de page / d'onglet / de visibilité (au plus une écriture toutes les 10 s),
 *  - online=false au pagehide et à la déconnexion (au mieux).
 * Une seule écriture fusionnée par heartbeat ; les compteurs du jour sont accumulés
 * localement (presenceCounters.ts) puis envoyés avec increment().
 * Toute erreur est silencieuse : la présence ne doit JAMAIS casser l'application.
 */
import { doc, getDoc, setDoc, serverTimestamp, increment, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/db'
import { getCurrentOperationalDayString } from '../config/operationalDay'
import {
  takePending, restorePending, recordUserInput, getLastInputAt, getActivityWindow,
  getPresenceTab, onPresenceTabChange, type PresencePending,
} from './presenceCounters'

const VISIBLE_INTERVAL_MS = 20_000 // temps réel : signal toutes les 20 s quand la page est visible
const HIDDEN_INTERVAL_MS = 45_000
const MIN_GAP_MS = 3_000

const PAGE_LABELS: Record<string, string> = {
  '/admin': 'Administration',
  '/agent': 'Agence',
  '/exploitation': "Chef d'exploitation",
  '/clients': 'Clients',
  '/fleet': 'Flotte',
  '/director': 'Direction',
  '/dashboard': 'Tableau de bord',
  '/caissier': 'Caisse',
  '/driver': 'Chauffeur / Livreur',
  '/gare-driver': 'Livreur gare',
  '/caisse-admin': 'Caisse admin',
  '/arrivage': 'Arrivage',
  '/central': 'Encaisseur central',
  '/analyseur-cheque': 'Analyse chèques',
  '/analyseur-espece': 'Analyse espèces',
  '/archive': 'Archives',
  '/drfe': 'DRFE (espèces)',
  '/drfc': 'DRFC (chèques)',
  '/facturier': 'Facturation',
  '/seed': 'Seed',
}

export function presencePageLabel(path: string): string {
  if (!path) return ''
  if (PAGE_LABELS[path]) return PAGE_LABELS[path]
  if (path.startsWith('/client/')) return 'Portail client'
  return path
}

export interface PresenceProfile {
  uid: string
  name?: string
  role?: string
  city?: string
}

const isMobile = () => {
  try { return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) } catch { return false }
}

let active: {
  profile: PresenceProfile
  stop: () => void
  beat: (force?: boolean) => void
  offline: () => Promise<void>
} | null = null
let currentPath = typeof window !== 'undefined' ? window.location.pathname : ''

/** Mise à jour de la route courante (appelée par App au changement de location). */
export function setPresenceRoute(pathname: string): void {
  try {
    if (pathname === currentPath) return
    currentPath = pathname
    active?.beat()
  } catch { /* silencieux */ }
}

/** Marque l'utilisateur hors ligne (déconnexion) — au mieux, sans jamais lever. */
export async function markPresenceOffline(): Promise<void> {
  try { await active?.offline() } catch { /* silencieux */ }
}

export function stopPresence(): void {
  try { active?.stop() } catch { /* silencieux */ }
  active = null
}

/** Démarre (ou met à jour) le heartbeat pour l'utilisateur connecté. Idempotent. */
export function startPresence(profile: PresenceProfile): void {
  try {
    if (!profile?.uid) return
    if (active && active.profile.uid === profile.uid) {
      active.profile = { ...active.profile, ...profile }
      return
    }
    stopPresence()

    const ref = doc(db, 'presence', profile.uid)
    let stopped = false
    let sessionWritten = false
    let knownDay: string | null = null
    let dayChecked = false
    let lastWriteAt = 0
    let inFlight = false
    let queued = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let deferTimer: ReturnType<typeof setTimeout> | null = null

    const visible = () => {
      try { return document.visibilityState !== 'hidden' } catch { return true }
    }

    const schedule = () => {
      if (stopped) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => beat(true), visible() ? VISIBLE_INTERVAL_MS : HIDDEN_INTERVAL_MS)
    }

    const write = async () => {
      if (stopped) return
      if (inFlight) { queued = true; return }
      inFlight = true
      let p: PresencePending | null = null
      try {
        const day = getCurrentOperationalDayString()
        if (!dayChecked) {
          dayChecked = true
          try {
            const snap = await getDoc(ref)
            knownDay = snap.exists() ? String(snap.data()?.day || '') : ''
          } catch {
            knownDay = day // en cas d'échec de lecture : on incrémente (pas de remise à zéro)
          }
        }
        if (stopped) return
        const newDay = knownDay !== day
        p = takePending()
        const now = Date.now()
        const lastInput = getLastInputAt()
        const idleSec = lastInput ? Math.max(0, Math.round((now - lastInput) / 1000)) : 999_999
        const win = getActivityWindow(now)
        const cur = active?.profile || profile
        const data: Record<string, unknown> = {
          uid: cur.uid,
          name: String(cur.name || '').slice(0, 120),
          role: String(cur.role || '').slice(0, 40),
          city: String(cur.city || '').slice(0, 60),
          currentPage: String(currentPath || '').slice(0, 120),
          pageLabel: presencePageLabel(currentPath).slice(0, 60),
          tab: getPresenceTab(),
          online: true,
          visible: visible(),
          lastSeen: serverTimestamp(),
          idleSec,
          lastActivityAt: lastInput ? Timestamp.fromMillis(lastInput) : null,
          device: isMobile() ? 'mobile' : 'desktop',
          day,
          activity15: win.values,
          activityMinute: win.minute,
        }
        if (!sessionWritten) data.sessionStart = serverTimestamp()
        if (newDay) {
          data.actionsToday = p.actions
          data.parcelsCreatedToday = p.created
          data.parcelsUpdatedToday = p.updated
          data.codCollectedToday = p.cod
          data.firstSeenToday = serverTimestamp()
        } else {
          if (p.actions) data.actionsToday = increment(p.actions)
          if (p.created) data.parcelsCreatedToday = increment(p.created)
          if (p.updated) data.parcelsUpdatedToday = increment(p.updated)
          if (p.cod) data.codCollectedToday = increment(p.cod)
        }
        await setDoc(ref, data, { merge: true })
        sessionWritten = true
        knownDay = day
        p = null
      } catch {
        if (p) restorePending(p)
      } finally {
        inFlight = false
        lastWriteAt = Date.now()
        if (queued && !stopped) { queued = false; beat() }
      }
    }

    // force=true : heartbeat périodique ; sinon événement (route/onglet/visibilité) limité à 1 / 10 s
    const beat = (force = false) => {
      if (stopped) return
      try {
        const since = Date.now() - lastWriteAt
        if (!force && since < MIN_GAP_MS) {
          if (!deferTimer) deferTimer = setTimeout(() => { deferTimer = null; beat() }, MIN_GAP_MS - since)
          return
        }
        schedule()
        void write()
      } catch { /* silencieux */ }
    }

    const offline = async () => {
      if (stopped) return
      try {
        const p = takePending()
        const data: Record<string, unknown> = { online: false, visible: false, lastSeen: serverTimestamp() }
        if (knownDay === getCurrentOperationalDayString()) {
          if (p.actions) data.actionsToday = increment(p.actions)
          if (p.created) data.parcelsCreatedToday = increment(p.created)
          if (p.updated) data.parcelsUpdatedToday = increment(p.updated)
          if (p.cod) data.codCollectedToday = increment(p.cod)
        }
        await Promise.race([
          setDoc(ref, data, { merge: true }),
          new Promise(res => setTimeout(res, 1500)),
        ])
      } catch { /* silencieux */ }
    }

    // Reprise d'activité après >60 s sans saisie : signal immédiat (passe tout de suite en 🟢 Actif)
    let lastInputAt = Date.now()
    const onInput = () => {
      recordUserInput()
      const now = Date.now()
      if (now - lastInputAt > 60_000) beat()
      lastInputAt = now
    }
    const onVisibility = () => { beat() }
    const onPageHide = () => { void offline() }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) beat(true) }
    const inputEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const
    inputEvents.forEach(ev => window.addEventListener(ev, onInput, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    const unsubTab = onPresenceTabChange(() => beat())

    const stop = () => {
      stopped = true
      if (timer) clearTimeout(timer)
      if (deferTimer) clearTimeout(deferTimer)
      inputEvents.forEach(ev => window.removeEventListener(ev, onInput, { capture: true }))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      unsubTab()
    }

    active = { profile: { ...profile }, stop, beat, offline }
    recordUserInput() // l'ouverture de session compte comme une activité
    beat(true)
  } catch { /* silencieux */ }
}
