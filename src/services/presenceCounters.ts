/**
 * 👁️ Compteurs de présence (cadence de travail) — module LÉGER, sans dépendance Firebase.
 *
 * Les fonctions d'écriture partagées (createParcel, updateParcel, collectCod…) appellent
 * bumpPresence() : les compteurs s'accumulent en mémoire et sont envoyés par le heartbeat
 * de présence (src/services/presence.ts) en UNE seule écriture fusionnée avec increment().
 * Aucune lecture, aucune écriture supplémentaire. Ne lève jamais d'exception.
 */

export type PresenceCounterKind = 'created' | 'updated' | 'cod'

export interface PresencePending {
  actions: number
  created: number
  updated: number
  cod: number
}

const SLOT_MS = 10_000 // 1 « action » max par tranche de 10 s d'activité
const WINDOW_MIN = 15

let pending: PresencePending = { actions: 0, created: 0, updated: 0, cod: 0 }
let lastSlot = -1
let lastInputAt = 0
// Activité minute par minute (nombre de tranches de 10 s actives, 0..6) — clé = minute epoch
const minuteBuckets = new Map<number, number>()

let currentTab = ''
const tabListeners = new Set<() => void>()
let notifyTimer: ReturnType<typeof setTimeout> | null = null

// Libellés lisibles des onglets (clé interne → affichage)
const TAB_LABELS: Record<string, string> = {
  home: 'Accueil', new: 'Nouvelle expédition', parcels: 'Expéditions', expeditions: 'Expéditions',
  dashboard: 'Tableau de bord', arrivage: 'Arrivage', caisse: 'Caisse', charge: 'Feuille de charge',
  clients: 'Clients', clientportdu: 'Port dû clients', cod: 'Retour de fonds', deliverysheets: 'Feuilles de livraison',
  invoices: 'Factures', lostparcels: 'Colis perdus', modifications: 'Modifications', notes: 'Notes',
  portducheque: 'Port dû chèque', portdu: 'Port dû', retours: 'Retours', returns: 'Retours', secteurs: 'Secteurs',
  valeurs: 'Valeurs', versements: 'Versements', aideagents: 'Aides agents', scan: 'Scan',
  mouvements: 'Mouvements', recoveries: 'Recouvrements', remarques: 'Remarques', transactions: 'Transactions',
  matin: 'Assignation matin', apresmidi: 'Collecte après-midi', activity: 'Activité', agencies: 'Agences',
  alerts: 'Alertes', archivage: 'Archives', banque: 'Banque', employees: 'Employés', exports: 'Exports',
  permissions: 'Permissions', port_agencies: 'Port par agence', tariffs: 'Tarifs', users: 'Utilisateurs',
}

export function bumpPresence(kind: PresenceCounterKind, n = 1): void {
  try {
    if (kind in pending) pending[kind] += Math.max(0, n | 0)
  } catch { /* silencieux */ }
}

/** Enregistre une saisie utilisateur réelle (souris/clavier/tactile/défilement). */
export function recordUserInput(now = Date.now()): void {
  try {
    lastInputAt = now
    const slot = Math.floor(now / SLOT_MS)
    if (slot === lastSlot) return
    lastSlot = slot
    pending.actions += 1
    const minute = Math.floor(now / 60_000)
    minuteBuckets.set(minute, (minuteBuckets.get(minute) || 0) + 1)
    // Purge des minutes trop anciennes
    for (const k of minuteBuckets.keys()) if (k < minute - WINDOW_MIN) minuteBuckets.delete(k)
  } catch { /* silencieux */ }
}

export function getLastInputAt(): number {
  return lastInputAt
}

/** 15 valeurs (de la plus ancienne à la plus récente), la dernière = minute courante. */
export function getActivityWindow(now = Date.now()): { minute: number; values: number[] } {
  const minute = Math.floor(now / 60_000)
  const values: number[] = []
  for (let m = minute - WINDOW_MIN + 1; m <= minute; m++) values.push(Math.min(6, minuteBuckets.get(m) || 0))
  return { minute, values }
}

export function takePending(): PresencePending {
  const out = pending
  pending = { actions: 0, created: 0, updated: 0, cod: 0 }
  return out
}

/** Remet des compteurs non envoyés (échec d'écriture) dans la file. */
export function restorePending(p: PresencePending): void {
  try {
    pending.actions += p.actions
    pending.created += p.created
    pending.updated += p.updated
    pending.cod += p.cod
  } catch { /* silencieux */ }
}

/** Onglet / section courante de la page (libellé lisible), ex. AgentPage → « Nouvelle expédition ». */
export function setPresenceTab(label: string | null | undefined): void {
  try {
    const raw = String(label || '')
    const next = (TAB_LABELS[raw] || raw).slice(0, 60)
    if (next === currentTab) return
    currentTab = next
    // Regroupe les changements rapprochés (démontage + montage) en une seule notification
    if (notifyTimer) clearTimeout(notifyTimer)
    notifyTimer = setTimeout(() => {
      notifyTimer = null
      tabListeners.forEach(fn => { try { fn() } catch { /* */ } })
    }, 400)
  } catch { /* silencieux */ }
}

export function getPresenceTab(): string {
  return currentTab
}

export function onPresenceTabChange(fn: () => void): () => void {
  tabListeners.add(fn)
  return () => { tabListeners.delete(fn) }
}
