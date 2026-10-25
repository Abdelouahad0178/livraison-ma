/**
 * ⚖️ RÈGLES DE CALCUL « CAISSE AGENCE » — SOURCE UNIQUE DE VÉRITÉ
 *
 * Utilisé À L'IDENTIQUE par :
 *   - la page Chef d'agence, onglet Caisse Agence (src/pages/agent/tabs/CaisseChefTab.tsx) ;
 *   - la page Chef d'exploitation (src/pages/ChefExploitationPage.tsx + src/pages/exploitation/*).
 *
 * Même agence + même période + mêmes filtres ⇒ mêmes nombres et mêmes listes sur les deux pages :
 * groupes par livreur (dont « En gare - <ville> »), nombre d'expéditions, ports dus à collecter /
 * collectés, ports payés à recevoir / reçus, en retard, COD par type (mixte : une part par type),
 * bilan de journée, instances, soldes.
 *
 * Fonctions PURES (aucun React, aucun Firestore) : rejouées sur données réelles par
 * scripts/_verify-conformite.ts. Toute évolution d'une règle se fait ICI, jamais dans une page.
 *
 * 📅 Base de date : journée d'opération de CRÉATION (workDate, 08:00 → 06:00) — caisseParcelDate.
 */
import { getCurrentOperationalDay, getOperationalDayRange, getOperationalDayString, formatOperationalDay, previousWorkedOperationalDays } from '../config/operationalDay'
import { codSplitAmount } from './codParts'
import { isCodMoneyBeforeStart, isPortDuMoneyBeforeStart, isPortPayeMoneyBeforeStart } from './moneyFlow'

// ── Dates ────────────────────────────────────────────────────────────────────

/** Date de référence d'un colis : journée d'opération via workDate (sinon createdAt / 1er historique). */
export const caisseParcelDate = (p: any): Date => {
  if (p?.workDate) return new Date(p.workDate + 'T12:00:00')
  const ca = p?.createdAt as { toDate?: () => Date } | undefined | null
  if (ca?.toDate) return ca.toDate()
  const ts = p?.history?.[0]?.timestamp
  if (ts) return new Date(ts)
  return new Date(0)
}

/** Conversion robuste vers Date (Timestamp Firestore, Date, chaîne, nombre). */
export const toDateSafe = (v: any): Date | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v?.toDate === 'function') return v.toDate()
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000)
  if (typeof v === 'number') return new Date(v)
  if (typeof v === 'string') {
    // workDate 'YYYY-MM-DD' : midi LOCAL pour éviter le décalage UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T12:00:00')
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Montant sûr (négatif / invalide → 0). */
export const safeParseAmount = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0
  const num = parseFloat(String(value).replace(',', '.'))
  return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
}

export type CaissePreset = 'all' | 'today' | 'week' | 'month' | 'day' | 'operational' | 'custom'

/** Preset par défaut du filtre de date (identique sur les deux pages). */
// ⚡ Défaut : la journée d'opération d'HIER (léger : une seule journée chargée au lieu de 45 jours).
// « Tout » (45 jours) reste disponible d'un clic.
export const CAISSE_DEFAULT_PRESET: CaissePreset = 'operational'
/** Veille travaillée (défaut des pages Caisse Agence et Chef d'exploitation) : la journée d'opération d'hier ;
 *  le lundi (dimanche non travaillé), le SAMEDI — même règle que l'onglet Expéditions (23/10/2026). */
export function caisseDefaultOperationalDay(): Date {
  return previousWorkedOperationalDays().from
}

/** 📅 Journée d'opération des pages de caisse : le SAMEDI couvre aussi le dimanche (non travaillé), jusqu'au lundi
 *  6 h — le lundi, la veille travaillée affichée par défaut (le samedi) comprend les expéditions du dimanche
 *  (demande du 23/10/2026). Les autres jours : 08:00 → 06:00 le lendemain, inchangé. */
export const caisseOpDayRange = (operationalDay: Date): { start: Date; end: Date } => {
  const range = getOperationalDayRange(operationalDay)
  if (operationalDay.getDay() !== 6) return range
  const sunday = new Date(operationalDay); sunday.setDate(sunday.getDate() + 1)
  return { start: range.start, end: getOperationalDayRange(sunday).end }
}

/** ⚡ Bornes [start, end] d'un preset de date, calculées UNE fois (null = « Tout »). */
export const caisseDateBounds = (
  preset: CaissePreset | string,
  from?: string | null,
  to?: string | null,
  operationalDay?: Date,
): { start: Date | null; end: Date } | null => {
  if (preset === 'all') return null
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
  let start: Date | null = null
  let end: Date = endOfToday
  if (preset === 'today') {
    const range = getOperationalDayRange(getCurrentOperationalDay())
    start = range.start
    end = range.end
  } else if (preset === 'week') {
    // 7 derniers JOURS D'OPÉRATION
    const todayOp = getCurrentOperationalDay()
    const weekAgoOp = new Date(todayOp); weekAgoOp.setDate(weekAgoOp.getDate() - 6)
    start = getOperationalDayRange(weekAgoOp).start
    end = getOperationalDayRange(todayOp).end
  } else if (preset === 'month') {
    const todayOp = getCurrentOperationalDay()
    const firstOfMonth = new Date(todayOp.getFullYear(), todayOp.getMonth(), 1)
    start = getOperationalDayRange(firstOfMonth).start
    end = getOperationalDayRange(todayOp).end
  } else if (preset === 'operational' && operationalDay) {
    const range = caisseOpDayRange(operationalDay)
    start = range.start
    end = range.end
  } else if (preset === 'day') {
    start = from ? new Date(from) : null
    if (start) { start.setHours(0, 0, 0, 0); end = new Date(from + 'T23:59:59') }
  } else if (preset === 'custom') {
    start = from ? new Date(from + 'T00:00:00') : null
    end = to ? new Date(to + 'T23:59:59') : endOfToday
  }
  return { start, end }
}

/** Filtre une liste par preset de date (« Période » = bornes CALENDAIRES sur la date de référence). */
export const caisseFilterByDate = <T,>(
  list: T[],
  preset: CaissePreset | string,
  from?: string | null,
  to?: string | null,
  getDate: (item: T) => Date = caisseParcelDate as unknown as (item: T) => Date,
  operationalDay?: Date,
): T[] => {
  const bounds = caisseDateBounds(preset, from, to, operationalDay)
  if (!bounds) return list
  const { start, end } = bounds
  return list.filter(item => {
    const d = getDate(item)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
}

/**
 * Prédicat de date d'un colis.
 * 🚨 Filets LARGES (Tout / 7 jours / Ce mois) : les ports dus NON collectés restent visibles même hors
 * période. Filtres EXPLICITES (Aujourd'hui, Journée d'opération, Jour, Période) : pas d'exception.
 * « En gare » suit exactement le même filtre (date de création / journée d'opération).
 */
export const makePassesDateFilter = (
  datePreset: CaissePreset | string,
  dateFrom?: string,
  dateTo?: string,
  operationalDay?: Date | null,
  _city?: string,
) => {
  if (!datePreset || datePreset === 'all') return (_p: any): boolean => true
  const isExplicitDateFilter = ['today', 'operational', 'day', 'custom'].includes(datePreset as string)
  // ⚡ Bornes calculées une seule fois pour toute la liste (avant : recalculées pour CHAQUE expédition)
  const bounds = caisseDateBounds(datePreset, dateFrom, dateTo, operationalDay || undefined)
  return (p: any): boolean => {
    const isPortDu = p.portType === 'port_du' && !p.portPayeMethod
    const isNotCollected = portNotCollected(p)
    if (isPortDu && isNotCollected && !isExplicitDateFilter) return true
    const d = caisseParcelDate(p)
    if (!d) return true
    if (!bounds) return true
    if (bounds.start && d < bounds.start) return false
    if (bounds.end && d > bounds.end) return false
    return true
  }
}

/** Jours chargés pour les filtres larges (durée maximale avant archivage automatique). */
export const CAISSE_WIDE_DAYS = 45

/**
 * Bornes Firestore (createdAt) à charger pour un filtre — SUR-ENSEMBLE de ce que le filtre de date
 * garde ensuite (borne haute = fin de journée d'opération ; filets larges = 45 derniers jours).
 */
export const firestoreBoundsFor = (
  datePreset: CaissePreset | string,
  dateFrom?: string,
  dateTo?: string,
  operationalDay?: Date | null,
): { from: Date | null; to: Date | null } => {
  const todayOp = getCurrentOperationalDay()
  const wideStartOp = new Date(todayOp); wideStartOp.setDate(wideStartOp.getDate() - CAISSE_WIDE_DAYS)
  const wideFrom = getOperationalDayRange(wideStartOp).start
  const opEnd = (ymd: string) => getOperationalDayRange(new Date(ymd + 'T12:00:00')).end
  if (datePreset === 'custom' && (dateFrom || dateTo)) {
    return {
      from: dateFrom ? new Date(dateFrom + 'T00:00:00') : wideFrom,
      to: dateTo ? opEnd(dateTo) : null,
    }
  }
  if (datePreset === 'day' && dateFrom) {
    return { from: new Date(dateFrom + 'T00:00:00'), to: opEnd(dateFrom) }
  }
  if (datePreset === 'operational' && operationalDay) {
    const range = caisseOpDayRange(operationalDay)
    return { from: range.start, to: range.end }
  }
  if (datePreset === 'today') {
    const range = getOperationalDayRange(todayOp)
    return { from: range.start, to: range.end }
  }
  return { from: wideFrom, to: null }
}

/** Libellé de la période sélectionnée. */
export const caissePeriodLabel = (
  datePreset: CaissePreset | string, dateFrom?: string, dateTo?: string, operationalDay?: Date | null,
): string => {
  if (datePreset === 'operational' && operationalDay) {
    return operationalDay.getDay() === 6
      ? `${formatOperationalDay(operationalDay, false)} + dimanche (08:00 → lundi 06:00)`
      : formatOperationalDay(operationalDay, true)
  }
  if (datePreset === 'today') return "Aujourd'hui"
  if (datePreset === 'week') return '7 derniers jours'
  if (datePreset === 'month') return 'Ce mois'
  if (datePreset === 'day' && dateFrom) return new Date(dateFrom).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  if (datePreset === 'custom' && dateFrom && dateTo) {
    return `${new Date(dateFrom).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${new Date(dateTo).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  return 'Toutes périodes'
}

// ── « En gare » ──────────────────────────────────────────────────────────────

/** Colis arrivé et en attente en « En gare - <ville> ». */
export const isGarePending = (p: any, city?: string): boolean =>
  !!city && p.destinationCity === city && p.status === 'Arrivé en agence' && !p.pickupDriverId &&
  !(p.returnedAt || p.wasReturned) && (!p.deliveryDriverId || p.deliveryDriverName === `En gare - ${city}`)

/** Date d'ARRIVÉE à l'agence (pointage) d'un colis, ou null. */
export const arrivalDateOf = (p: any): Date | null => {
  const v = p?.destinationArrivedAt
  if (!v) return null
  const d = v?.toDate ? v.toDate() : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Id du groupe « En gare - <ville> » (colis sans livreur + compte(s) « Livreur en gare »). */
export const GARE_GROUP_ID = 'unknown'

/**
 * 📬 État de l'ARGENT d'un port payé encaissé au guichet (« En gare »), affiché dans la carte du LIVREUR qui livre
 * l'expédition (l'argent n'est pas chez lui) — même texte dans Caisse Agence et la Collecte du soir, et DYNAMIQUE :
 * suit la remise au chef d'exploitation et son annulation.
 */
export const ramasseGuichetEtat = (p: any): { label: string; tone: 'gare' | 'exp' | 'chef' } =>
  p?.portStatus === 'received'
    ? { label: `reçu chef d'agence${p.portReceivedBy ? ` · ${p.portReceivedBy}` : ''}`, tone: 'chef' }
    : p?.portPayeExpReceivedAt
      ? { label: `remis au chef d'exploitation${p.portPayeExpReceivedBy ? ` · ${p.portPayeExpReceivedBy}` : ''}`, tone: 'exp' }
      : { label: p?.portGuichetHolderName ? `chez ${p.portGuichetHolderName} (à remettre)` : 'chez « En gare » (à remettre)', tone: 'gare' }

// ── Statuts / montants ───────────────────────────────────────────────────────

const RETURN_STATUSES = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const isReturnedForGroup = (p: any) => !!(p.returnedAt || p.wasReturned || p.status === 'Retourné')
const isPortDuParcel = (p: any) => p.portType === 'port_du' && !p.portPayeMethod
/** Port pas encore encaissé : aucun état, ou état « pending » (42 expéditions l'ont : elles étaient oubliées). */
const portNotCollected = (p: any) => !p.portStatus || p.portStatus === 'pending'
const isPortPayeParcel = (p: any) => p.portType === 'port_paye' && !p.portPayeMethod
// 📅 Le vrai calcul commence au jour d'opération du 05/10/2026 (src/utils/moneyFlow.ts, MONEY_START) :
// l'argent encaissé avant (essais) est exclu de tous les montants de caisse ; les expéditions restent.
const isPortPayeCounted = (p: any) => isPortPayeParcel(p) && !isPortPayeMoneyBeforeStart(p)
const sumPrice = (list: any[]) => list.reduce((s: number, p: any) => s + safeParseAmount(p.price), 0)
const toAssignDate = (v: any) => (v?.toDate ? v.toDate() : new Date(v))

/** Type de RF retenu par Caisse Agence pour un colis mono-type. */
export const caisseCodLegacyType = (p: any): string => (p?.codPaymentType || p?.serviceType)
/** Montant COD d'un type ('especes' | 'cheque' | 'traite') — mixte : la part du type. */
export const caisseCodAmountOfType = (p: any, type: string): number => codSplitAmount(p, type, caisseCodLegacyType(p))

/** Totaux COD d'une liste (colonnes COD / Espèces / Chèque / Traite de Caisse Agence). */
// 📅 COD encaissés avant le 05/10/2026 (essais) exclus des montants
export const caisseCodTotals = (all: any[]) => { const parcels = all.filter((p: any) => !isCodMoneyBeforeStart(p)); return {
  total: parcels.reduce((s: number, p: any) => s + (parseFloat(p.codAmount) || 0), 0),
  especes: parcels.reduce((s: number, p: any) => s + caisseCodAmountOfType(p, 'especes'), 0),
  cheque: parcels.reduce((s: number, p: any) => s + caisseCodAmountOfType(p, 'cheque'), 0),
  traite: parcels.reduce((s: number, p: any) => s + caisseCodAmountOfType(p, 'traite'), 0),
} }

/** Montant des VALEURS d'un COD = espèces + chèque + traite (mixte : les deux parts) — Retour BL exclu (pas d'argent). */
export const caisseCodValueTotal = (p: any): number =>
  caisseCodAmountOfType(p, 'especes') + caisseCodAmountOfType(p, 'cheque') + caisseCodAmountOfType(p, 'traite')

/**
 * 💰 « COD collecté » d'une agence — règle UNIQUE du bloc « Valeurs (COD) collectées par jour » (Caisse Agence,
 * Collecte du soir) et de la page admin « Contre Remboursement » : valeur encaissée (codStatus ≠ pending) à
 * DESTINATION de la ville, hors expéditions retournées et hors argent d'avant le 05/10/2026 (MONEY_START).
 * Rangée au jour d'opération de sa COLLECTE (codCollectDayKey).
 */
export const isCaisseCodCollecte = (p: any, city: string): boolean =>
  !!p?.codStatus && p.codStatus !== 'pending' && !isCodMoneyBeforeStart(p)
  && safeParseAmount(p.codAmount) > 0 && !isReturnedForGroup(p) && p.destinationCity === city

/** Journée d'opération ('YYYY-MM-DD') de la collecte du COD (codCollectedAt), ou null.
 *  Collecte enregistrée sans date (ancienne modification admin) : date de réception par le chef d'exploitation —
 *  MÊME repli que le Bilan (utils/bilanPeriode : codCollectedAt || codExpReceivedAt), mêmes montants partout. */
export const codCollectDayKey = (p: any): string | null => {
  const d = toDateSafe(p?.codCollectedAt) || toDateSafe(p?.codExpReceivedAt)
  return d ? getOperationalDayString(d) : null
}

/**
 * Valeurs (COD) collectées d'une agence, par journée d'opération de collecte (la plus récente d'abord).
 * `keep` : filtres supplémentaires de la page (livreur, filtres de l'exploitation…).
 */
export const groupCodCollectesParJour = (
  list: any[], city: string, keep: ((p: any) => boolean) | null = null,
): [string, CodCollecteJour][] => {
  const codParJour = new Map<string, CodCollecteJour>()
  list.forEach((p: any) => {
    if (!isCaisseCodCollecte(p, city)) return
    if (keep && !keep(p)) return
    const key = codCollectDayKey(p)
    if (!key) return
    const cur = codParJour.get(key) || { count: 0, montant: 0, especes: 0, cheque: 0, traite: 0, parcels: [] as any[] }
    const especes = caisseCodAmountOfType(p, 'especes'), cheque = caisseCodAmountOfType(p, 'cheque'), traite = caisseCodAmountOfType(p, 'traite')
    codParJour.set(key, {
      count: cur.count + 1, montant: cur.montant + especes + cheque + traite,
      especes: cur.especes + especes, cheque: cur.cheque + cheque, traite: cur.traite + traite,
      parcels: [...cur.parcels, p],
    })
  })
  return [...codParJour.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

/** 🚨 Expédition LIVRÉE dont le COD (valeurs) n'est pas encore collecté — « Livrés non encaissés » du bilan. */
export const isCodLivreNonCollecte = (p: any): boolean =>
  p?.status === 'Livré' && (!p.codStatus || p.codStatus === 'pending') && caisseCodValueTotal(p) > 0

// ── Regroupement par livreur ─────────────────────────────────────────────────

export interface CaisseDriverGroup {
  id: string
  name: string
  parcels: any[]
  portDuParcels: any[]
  portsPayesParcels: any[]
  assignedTodayCount: number
  portsACollecterCount: number
  portsACollecterMontant: number
  portsCollectesCount: number
  portsCollectesMontant: number
  portsPayesARecevoirCount: number
  portsPayesARecevoirMontant: number
  portsPayesRecusCount: number
  portsPayesRecusMontant: number
  enRetardCount: number
}

const assignedTodayOf = (parcels: any[], now: Date) => {
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  return parcels.filter((p: any) => !p.deliveryAssignedAt || toAssignDate(p.deliveryAssignedAt) >= today)
}
const portsACollecterOf = (portDuParcels: any[], driverId: string) => portDuParcels.filter((p: any) => {
  const isCollected = p.portStatus === 'collected' || p.portStatus === 'received'
  if (isReturnedForGroup(p) || isCollected) return false
  if (driverId === GARE_GROUP_ID) return true
  return p.status === 'Arrivé en agence' || p.status === 'En cours de livraison' || p.status === 'Livré'
})
const portsCollectesOf = (portDuParcels: any[]) => portDuParcels.filter((p: any) =>
  (p.portStatus === 'collected' || p.portStatus === 'received') && !RETURN_STATUSES.includes(p.status) && !isPortDuMoneyBeforeStart(p) &&
  !(p.portAdminTransferred || p.adminTransferred))
const enRetardOf = (portDuParcels: any[], now: Date) => {
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return portDuParcels.filter((p: any) => {
    if (p.portType !== 'port_du' || p.portPayeMethod) return false
    if (p.status !== 'En cours de livraison' || !p.deliveryAssignedAt) return false
    // En retard = port dû ENCORE À COLLECTER (un port déjà collecté n'est plus en retard) → toujours ≤ « À collecter »
    if (p.portStatus === 'collected' || p.portStatus === 'received' || isReturnedForGroup(p)) return false
    return toAssignDate(p.deliveryAssignedAt) < oneDayAgo
  })
}
/**
 * 📬 Port payé RAMASSÉ au guichet de l'agence (expédition saisie dans la ville, toutes destinations,
 * sans livreur de ramassage) : encaissé par « En gare - <ville> », remis le soir au chef d'exploitation.
 * Fait partie du groupe « En gare » dans Caisse Agence ET dans la Collecte du soir (même règle).
 */
export const isRamasseGuichet = (p: any, city: string): boolean =>
  isPortPayeParcel(p) && p.originCity === city && !p.pickupDriverId
  && p.status !== 'En cours de ramassage' && p.status !== 'Annulé'
  && safeParseAmount(p.price) > 0 && !isPortPayeMoneyBeforeStart(p)

/**
 * 🏬 Carte où se REÇOIT un port payé encaissé au guichet : la personne en gare de la ville qui détient l'argent
 * (portGuichetHolderId, config/guichetHolders — 23/10/2026), sinon « En gare - <ville> ». null = pas un port du guichet.
 */
export const guichetGroupIdOf = (p: any, city: string): string | null =>
  isRamasseGuichet(p, city) ? (p.portGuichetHolderId || GARE_GROUP_ID) : null

const portsPayesTotals = (parcels: any[], city: string, groupId: string) => {
  const portsPayesParcels = parcels.filter(isPortPayeParcel)
  // « Ramassés » à recevoir : livreur de ramassage, ou guichet — dans la carte de son détenteur (« En gare » sans
  // détenteur) — pas encore reçu par le chef d'agence : chez la gare / le détenteur ou chez le chef d'exploitation
  const aRecevoir = portsPayesParcels.filter((p: any) => !isPortPayeMoneyBeforeStart(p) &&
    p.originCity === city && (p.portStatus === 'collected' || portNotCollected(p))
    && (p.pickupDriverId || p.status === 'En cours de ramassage' || guichetGroupIdOf(p, city) === groupId))
  const recus = portsPayesParcels.filter((p: any) => !isPortPayeMoneyBeforeStart(p) && p.originCity === city && p.portStatus === 'received')
  return {
    portsPayesParcels,
    portsPayesARecevoirCount: aRecevoir.length,
    portsPayesARecevoirMontant: sumPrice(aRecevoir),
    portsPayesRecusCount: recus.length,
    portsPayesRecusMontant: sumPrice(recus),
  }
}

/**
 * Groupes par livreur (onglet Livreurs de Caisse Agence) à partir de la source datée.
 * - livreur = pickupDriverId pour un ramassage local / port payé local reçu, sinon deliveryDriverId ;
 * - « En gare - <ville> » (id 'unknown') = colis sans livreur local + compte(s) « Livreur en gare »
 *   (nom « En gare - <ville> » ou id dans depotIds), fusionnés en UN seul groupe.
 */
export const buildCaisseDrivers = (
  allParcels: any[],
  city: string,
  opts: { depotIds?: Set<string>; modifiedParcels?: Record<string, any>; now?: Date } = {},
): CaisseDriverGroup[] => {
  const { depotIds, modifiedParcels = {}, now = new Date() } = opts
  const driversMap = new Map<string, { id: string; name: any; parcels: any[] }>()

  allParcels.forEach((p: any) => {
    const isReturned = isReturnedForGroup(p)
    const isLocalPickup = p.status === 'En cours de ramassage' && (p.createdByCity === city || p.originCity === city)
    const isLocalPortPayeReceived = isPortPayeParcel(p) &&
      (p.createdByCity === city || p.originCity === city) && p.portStatus === 'received'
    const driverId = (isLocalPickup || isLocalPortPayeReceived) ? p.pickupDriverId : p.deliveryDriverId
    const driverName = (isLocalPickup || isLocalPortPayeReceived) ? p.pickupDriverName : p.deliveryDriverName
    const isInMyCity = p.destinationCity === city
    if (driverId && (isInMyCity || isLocalPickup || isLocalPortPayeReceived) && !isReturned) {
      if (!driversMap.has(driverId)) driversMap.set(driverId, { id: driverId, name: driverName, parcels: [] })
      driversMap.get(driverId)!.parcels.push(p)
    }
  })

  // Colis sans livreur local (chauffeurId inter-agences ignoré : seul un livreur local encaisse)
  // + ports payés RAMASSÉS au guichet de l'agence (toutes destinations) : « En gare » les a encaissés
  //   (une expédition de la ville livrée par un livreur figure aussi dans la carte de ce livreur)
  const unknownParcels = allParcels.filter((p: any) => {
    const isInMyCity = p.destinationCity === city
    const isLocalPickup = p.status === 'En cours de ramassage' && (p.createdByCity === city || p.originCity === city)
    const isLocalPortPayeReceivedNoPickup = isPortPayeParcel(p) &&
      (p.createdByCity === city || p.originCity === city) && p.portStatus === 'received' && !p.pickupDriverId
    const hasNoDriver = !p.deliveryDriverId && !p.pickupDriverId
    // Port du guichet AVEC détenteur (rachida, ENGAREAGA6017…) : dans la carte du détenteur, plus dans « En gare »
    const guichetHere = isRamasseGuichet(p, city) && !p.portGuichetHolderId
    const receivedNoPickupHere = isLocalPortPayeReceivedNoPickup && !(isRamasseGuichet(p, city) && p.portGuichetHolderId)
    return ((hasNoDriver && (isInMyCity || isLocalPickup)) || receivedNoPickupHere || guichetHere)
      && !isReturnedForGroup(p)
  })

  // 🏬 Ports payés du guichet tenus par la personne en gare de la ville : carte de cette personne (23/10/2026)
  allParcels.forEach((p: any) => {
    const holder = guichetGroupIdOf(p, city)
    if (!holder || holder === GARE_GROUP_ID || isReturnedForGroup(p)) return
    if (!driversMap.has(holder)) driversMap.set(holder, { id: holder, name: p.portGuichetHolderName || 'En gare', parcels: [] })
    const g = driversMap.get(holder)!
    if (!g.parcels.some((x: any) => x.id === p.id)) g.parcels.push(p)
  })

  const gareName = `En gare - ${city || ''}`
  const isDepotGroup = (id: string, g: { name: any }) => id !== GARE_GROUP_ID && (g.name === gareName || !!depotIds?.has(id))
  if (unknownParcels.length > 0) {
    driversMap.set(GARE_GROUP_ID, { id: GARE_GROUP_ID, name: gareName, parcels: unknownParcels })
  } else if ([...driversMap.entries()].some(([id, g]) => isDepotGroup(id, g))) {
    // Compte « en gare » seul (aucun colis sans livreur) : même groupe « En gare », mêmes règles
    driversMap.set(GARE_GROUP_ID, { id: GARE_GROUP_ID, name: gareName, parcels: [] })
  }
  const unknownGroup = driversMap.get(GARE_GROUP_ID)
  if (unknownGroup) {
    for (const [id, g] of [...driversMap.entries()]) {
      if (isDepotGroup(id, g)) {
        const seenIds = new Set(unknownGroup.parcels.map((p: any) => p.id))
        g.parcels.forEach((p: any) => { if (!seenIds.has(p.id)) unknownGroup.parcels.push(p) })
        driversMap.delete(id)
      }
    }
  }

  return Array.from(driversMap.values()).map(driver => {
    const parcels = driver.parcels.map((p: any) => (modifiedParcels[p.id] ? { ...p, ...modifiedParcels[p.id] } : p))
    const portDuParcels = parcels.filter(isPortDuParcel)
    const portsACollecter = portsACollecterOf(portDuParcels, driver.id)
    const portsCollectes = portsCollectesOf(portDuParcels)
    return {
      ...driver,
      name: driver.name,
      parcels,
      portDuParcels,
      ...portsPayesTotals(parcels, city, driver.id),
      assignedTodayCount: assignedTodayOf(parcels, now).length,
      portsACollecterCount: portsACollecter.length,
      portsACollecterMontant: sumPrice(portsACollecter),
      portsCollectesCount: portsCollectes.length,
      portsCollectesMontant: sumPrice(portsCollectes),
      enRetardCount: enRetardOf(portDuParcels, now).length,
    }
  }).sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))
}

export type CaisseStatusFilter = 'all' | 'a_collecter' | 'collecte' | 'en_retard' | 'en_compte' | 'ramasse'

export const CAISSE_STATUS_OPTIONS: { key: CaisseStatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous les statuts' },
  { key: 'a_collecter', label: '📦 À collecter' },
  { key: 'collecte', label: '✅ Collecté' },
  { key: 'en_retard', label: '⏰ En retard' },
  { key: 'en_compte', label: '🏦 En compte' },
  { key: 'ramasse', label: '📬 À ramasser (port payé)' },
]

export const caisseStatusFilterLabel = (statusFilter: string): string => {
  if (statusFilter === 'a_collecter') return 'À collecter'
  if (statusFilter === 'collecte') return 'Collecté'
  if (statusFilter === 'en_retard') return 'En retard'
  if (statusFilter === 'en_compte') return 'En compte'
  if (statusFilter === 'ramasse') return 'À ramasser'
  return 'Tous statuts'
}

/** Filtre de statut de Caisse Agence pour un colis d'un groupe livreur. */
export const caisseStatusMatches = (p: any, statusFilter: string, driverId: string, now: Date = new Date()): boolean => {
  if (statusFilter === 'all') return true
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const isPortDu = isPortDuParcel(p)
  const isCollected = p.portStatus === 'collected' || p.portStatus === 'received'
  const isReturned = p.status?.toLowerCase().trim() === 'retourné'
  const isInDelivery = p.status === 'En cours de livraison' || p.status === 'Livré' || p.status === 'Arrivé en agence'
  let isLate = false
  if (isPortDu && p.status === 'En cours de livraison' && p.deliveryAssignedAt) isLate = toAssignDate(p.deliveryAssignedAt) < oneDayAgo
  switch (statusFilter) {
    case 'a_collecter':
      if (driverId === GARE_GROUP_ID) return isPortDu && portNotCollected(p) && !isReturned
      return isPortDu && portNotCollected(p) && isInDelivery && !isReturned
    case 'collecte':
      return isPortDu && isCollected
    case 'en_compte':
      return String(p.portType || '').startsWith('port_en_compte') && !(p.returnedAt || p.wasReturned || p.status === 'Retourné')
    case 'ramasse':
      return isPortPayeParcel(p) && !(p.returnedAt || p.wasReturned || p.status === 'Retourné')
    case 'en_retard':
      return isPortDu && isLate && !isCollected && !isReturned
    default:
      return true
  }
}

/**
 * Groupes filtrés (période + statut + livreur) — onglet Livreurs. Les totaux ports dus / retard sont
 * recalculés sur les colis filtrés ; ports payés à recevoir / reçus restent ceux de la période
 * (règle Caisse Agence). `extraFilter` (Chef d'exploitation : origine / service / port / recherche)
 * s'applique en plus ; il recalcule alors aussi les ports payés.
 */
export const filterCaisseDrivers = (
  drivers: CaisseDriverGroup[],
  opts: {
    city: string
    passesDateFilter: (p: any) => boolean
    statusFilter?: string
    driverFilter?: string
    searchMode?: boolean
    extraFilter?: ((p: any) => boolean) | null
    now?: Date
  },
): CaisseDriverGroup[] => {
  const { city, passesDateFilter, statusFilter = 'all', driverFilter = 'all', searchMode = false, extraFilter = null, now = new Date() } = opts
  let result = drivers.map(driver => {
    const filteredParcels = driver.parcels.filter((p: any) => searchMode || passesDateFilter(p))
    let statusFilteredParcels = statusFilter !== 'all'
      ? filteredParcels.filter((p: any) => caisseStatusMatches(p, statusFilter, driver.id, now))
      : filteredParcels
    if (extraFilter) statusFilteredParcels = statusFilteredParcels.filter(extraFilter)
    const filteredPortDuParcels = statusFilteredParcels.filter(isPortDuParcel)
    const portsACollecter = portsACollecterOf(filteredPortDuParcels, driver.id)
    const portsCollectes = portsCollectesOf(filteredPortDuParcels)
    const out: CaisseDriverGroup = {
      ...driver,
      parcels: statusFilteredParcels,
      assignedTodayCount: assignedTodayOf(statusFilteredParcels, now).length,
      portsACollecterCount: portsACollecter.length,
      portsACollecterMontant: sumPrice(portsACollecter),
      portsCollectesCount: portsCollectes.length,
      portsCollectesMontant: sumPrice(portsCollectes),
      enRetardCount: enRetardOf(filteredPortDuParcels, now).length,
    }
    if (extraFilter) Object.assign(out, portsPayesTotals(statusFilteredParcels, city, driver.id), { portDuParcels: filteredPortDuParcels })
    return out
  }).filter(d => d.parcels.length > 0)
  if (driverFilter !== 'all') result = result.filter(d => d.id === driverFilter)
  return result
}

/** Cartes du haut (Caisse Agence) — agrégat des groupes filtrés. */
export const caisseFilteredStats = (filteredDrivers: CaisseDriverGroup[], driverFilter: string) => {
  const sum = (f: (d: CaisseDriverGroup) => number) => filteredDrivers.reduce((s, d) => s + (f(d) || 0), 0)
  const montantCollectes = sum(d => d.portsCollectesMontant)
  const montantPortsPayesRecus = sum(d => d.portsPayesRecusMontant)
  return {
    portsACollecterCount: sum(d => d.portsACollecterCount),
    portsACollecterMontant: sum(d => d.portsACollecterMontant),
    portsCollectes: sum(d => d.portsCollectesCount),
    portsCollectesMontant: montantCollectes,
    portsPayesARecevoirCount: sum(d => d.portsPayesARecevoirCount),
    portsPayesARecevoirMontant: sum(d => d.portsPayesARecevoirMontant),
    portsPayesRecusCount: sum(d => d.portsPayesRecusCount),
    portsPayesRecusMontant: montantPortsPayesRecus,
    enRetardCount: sum(d => d.enRetardCount),
    // Sans doublon : un port payé ramassé de la ville peut figurer chez son livreur ET dans « En gare »
    totalParcels: new Set(filteredDrivers.flatMap(d => d.parcels.map((p: any) => p.id))).size,
    soldeAVerser: driverFilter === 'all' ? Math.max(0, montantCollectes + montantPortsPayesRecus) : Math.max(0, montantCollectes),
  }
}

/** Nombre d'expéditions affiché sous le nom d'un livreur (même total que l'onglet Journée). */
export const caisseDriverHeaderCount = (driver: CaisseDriverGroup, statusFilter: string) => {
  const total = driver.parcels.length
  if (statusFilter !== 'all') return { total, base: total, enCompte: 0 }
  const base = driver.portDuParcels.length + driver.portsPayesParcels.length
  return { total, base, enCompte: Math.max(0, total - base) }
}

// ── Bilan de journée ─────────────────────────────────────────────────────────

export interface CaisseBilanRow {
  id: string
  name: string
  parcels: any[]
  total: number
  enCompteCount: number
  enAgenceCount: number
  livresCount: number
  enCoursCount: number
  tauxLivraison: number
  /** Livrées avec un port dû NON collecté et/ou un COD NON collecté (chaque expédition une seule fois). */
  livresNonCollectes: any[]
  /** Total non encaissé = ports dus + COD non collectés des expéditions livrées. */
  montantManquant: number
  montantManquantPort: number
  montantManquantCod: number
  livresNonCollectesPortCount: number
  livresNonCollectesCodCount: number
  portsCollectesCount: number
  portsCollectesMontant: number
}

/** Bilan par livreur : PÉRIODE uniquement (jamais le filtre de statut). « En gare » exclu. */
export const caisseBilanJournee = (
  drivers: CaisseDriverGroup[],
  opts: { passesDateFilter: (p: any) => boolean; driverFilter?: string; searchMode?: boolean; extraFilter?: ((p: any) => boolean) | null },
): CaisseBilanRow[] => {
  const { passesDateFilter, driverFilter = 'all', searchMode = false, extraFilter = null } = opts
  return drivers
    .filter(d => d.id !== GARE_GROUP_ID && (driverFilter === 'all' || d.id === driverFilter))
    .map(d => {
      const parcels = d.parcels.filter((p: any) => (searchMode || passesDateFilter(p)) && (!extraFilter || extraFilter(p)))
      const portDu = parcels.filter(isPortDuParcel)
      const livres = parcels.filter((p: any) => p.status === 'Livré')
      const enCours = parcels.filter((p: any) => p.status === 'En cours de livraison')
      // 🚨 Livrés non encaissés : port dû ET COD (RETOUR FOND) livrés mais pas encore collectés
      const portsManquants = portDu.filter((p: any) => p.status === 'Livré' && portNotCollected(p))
      const codTotal = caisseCodValueTotal
      const codsManquants = livres.filter(isCodLivreNonCollecte)
      const livresNonCollectes = [...new Map([...portsManquants, ...codsManquants].map((p: any) => [p.id, p])).values()]
      const montantManquantPort = sumPrice(portsManquants)
      const montantManquantCod = codsManquants.reduce((s: number, p: any) => s + codTotal(p), 0)
      const collectes = portsCollectesOf(portDu)
      const total = parcels.length
      return {
        id: d.id,
        name: d.name,
        parcels,
        total,
        enCompteCount: parcels.filter((p: any) => !isPortDuParcel(p) && !isPortPayeParcel(p)).length,
        enAgenceCount: parcels.filter((p: any) => p.status === 'Arrivé en agence').length,
        livresCount: livres.length,
        enCoursCount: enCours.length,
        tauxLivraison: total ? Math.round(livres.length / total * 100) : 0,
        livresNonCollectes,
        montantManquant: montantManquantPort + montantManquantCod,
        montantManquantPort,
        montantManquantCod,
        livresNonCollectesPortCount: portsManquants.length,
        livresNonCollectesCodCount: codsManquants.length,
        portsCollectesCount: collectes.length,
        portsCollectesMontant: sumPrice(collectes),
      }
    })
    .filter(b => b.total > 0)
}

// ── Instances (ports dus non collectés par ancienneté) ───────────────────────

export type InstanceBucket = '<24h' | '1-7j' | '7-30j' | '30j+'
export const INSTANCE_BUCKETS: { key: InstanceBucket; label: string }[] = [
  { key: '<24h', label: 'Moins de 24h' },
  { key: '1-7j', label: '1 à 7 jours' },
  { key: '7-30j', label: '7 à 30 jours' },
  { key: '30j+', label: 'Plus de 30 jours' },
]

export const caisseInstances = (
  dataSource: any[],
  opts: { city: string; driverFilter?: string; deliveryDelays?: any[]; drivers?: CaisseDriverGroup[]; extraFilter?: ((p: any) => boolean) | null; now?: Date },
) => {
  const { city, driverFilter = 'all', deliveryDelays = [], drivers = [], extraFilter = null, now = new Date() } = opts
  const nowMs = now.getTime()
  return dataSource.filter((p: any) => {
    const notReturned = !RETURN_STATUSES.includes(p.status)
    const enCours = p.status === 'En cours de livraison' || p.status === 'Arrivé en agence'
    const matchesDriver = driverFilter === 'all' || p.deliveryDriverId === driverFilter
    return isPortDuParcel(p) && portNotCollected(p) && notReturned && enCours && p.destinationCity === city && matchesDriver &&
      (!extraFilter || extraFilter(p))
  }).map((p: any) => {
    const ref = caisseParcelDate(p)
    const ageJours = ref ? Math.floor((nowMs - ref.getTime()) / 86400000) : 0
    const delay = deliveryDelays.find((d: any) => d.parcelId === p.id && !d.resolvedAt)
    const bucket: InstanceBucket = ageJours >= 30 ? '30j+' : ageJours >= 7 ? '7-30j' : ageJours >= 1 ? '1-7j' : '<24h'
    const driver = drivers.find(d => d.id === p.deliveryDriverId)
    return { parcel: p, ageJours, delay, bucket, driver, driverName: driver?.name || '—' }
  }).sort((a, b) => b.ageJours - a.ageJours)
}

// ── Vue complète (les deux pages) ────────────────────────────────────────────

/** Ports collectés sur une journée d'opération : ports dus + ports payés ramassés au guichet. */
export interface CollecteJour {
  count: number; montant: number; parcels: any[]
  portDu: { count: number; montant: number }
  portPaye: { count: number; montant: number }
  /** 💼 Versement à l'admin PAR JOUR DE COLLECTE : déjà versé / reste à verser (expéditions non encore versées) */
  verse?: number
  aVerser?: number
  aVerserIds?: string[]
  /** ⏳ Ports dus collectés ce jour-là mais PAS ENCORE REÇUS par le chef d'agence (chez le chef d'exploitation
   *  ou les livreurs) — non versables tant qu'ils ne sont pas reçus (Caisse Agence seulement). */
  nonRecu?: number
}
/** Expédition déjà comprise dans un versement à l'admin. */
export const isAdminTransferred = (p: any): boolean => !!(p?.portAdminTransferred || p?.adminTransferred)

/** Valeurs (COD) collectées sur une journée d'opération — montants par type (mixte : chaque part dans son type). */
export interface CodCollecteJour { count: number; montant: number; especes: number; cheque: number; traite: number; parcels: any[] }

export interface CaisseViewInput {
  city: string
  /** Colis de l'agence (useAgencyParcelsFull) fusionnés avec les retours (subscribeAgencyReturnParcels). */
  allDisplayParcels: any[]
  /** Colis arrivés en attente « En gare » (useGarePending), ajoutés même hors fenêtre de chargement. */
  garePending: any[]
  datePreset: CaissePreset | string
  dateFrom?: string
  dateTo?: string
  operationalDay?: Date | null
  driverFilter?: string
  statusFilter?: string
  /** Mode recherche (Caisse Agence) : null hors recherche. */
  searchResults?: any[] | null
  /** Modifications locales (optimistes) appliquées en dernier — Chef d'exploitation : versions temps réel. */
  modifiedParcels?: Record<string, any>
  /** Colis collectés en mode recherche hors données chargées (Caisse Agence). */
  extraCollectedParcels?: Record<string, any>
  /** Expéditions collectées / reçues pendant les 14 dernières journées mais créées HORS de la période chargée
   *  (useRecentCollected) : complètent UNIQUEMENT « Collectes par jour » et « Valeurs (COD) collectées par jour ». */
  recentCollected?: any[]
  depotIds?: Set<string>
  deliveryDelays?: any[]
  /** Filtres supplémentaires propres au Chef d'exploitation (origine / service / port / recherche). */
  extraFilter?: ((p: any) => boolean) | null
  now?: Date
  /** 💼 Caisse Agence : comptes chef d'agence / agent pro de la ville. Fourni → « à verser » et solde ne comptent
   *  que les ports dus RÉELLEMENT entre les mains du chef d'agence (reçus, ou encaissés par lui-même). Absent
   *  (Chef d'exploitation) → tous les ports dus collectés, comme avant. */
  agencyHolderIds?: Set<string> | null
}

/** 💼 Port dû entre les mains du chef d'agence : reçu (envoi validé / réception du livreur / ancien « received »)
 *  ou encaissé directement par un compte chef d'agence / agent pro de la ville. Sans liste : toujours vrai. */
export const isPortDuHeldByAgency = (p: any, agencyHolderIds?: Set<string> | null): boolean =>
  !agencyHolderIds || !!p?.portChefReceivedAt || p?.portStatus === 'received' ||
  (!!p?.portCollectedById && agencyHolderIds.has(p.portCollectedById))

/** Source datée (onglet Livreurs) : période + « En gare » en attente + modifications locales. */
export const caisseDataSource = (input: CaisseViewInput, passesDateFilter: (p: any) => boolean): any[] => {
  const { allDisplayParcels, garePending, datePreset, searchResults = null, modifiedParcels = {} } = input
  let source = searchResults !== null ? [...searchResults] : [...(allDisplayParcels || [])]
  if (searchResults === null && datePreset !== 'all') source = source.filter(passesDateFilter)
  if (searchResults === null) {
    const known = new Set(source.map((p: any) => p.id))
    ;(garePending || []).forEach((p: any) => { if (!known.has(p.id) && (datePreset === 'all' || passesDateFilter(p))) source.push(p) })
  }
  return source.map((p: any) => (modifiedParcels[p.id] ? { ...p, ...modifiedParcels[p.id] } : p))
}

const withMods = (list: any[], mods: Record<string, any>) => list.map((p: any) => (mods[p.id] ? { ...p, ...mods[p.id] } : p))
const isCollectedPortDuForCaisse = (p: any, city: string) =>
  isPortDuParcel(p) && (p.portStatus === 'collected' || p.portStatus === 'received') &&
  p.destinationCity === city && !RETURN_STATUSES.includes(p.status) && !isPortDuMoneyBeforeStart(p)

/**
 * 🧮 Calcule TOUT l'écran Caisse Agence pour une agence et des filtres donnés.
 * Appelé tel quel par CaisseChefTab ET par le Chef d'exploitation.
 */
export const computeCaisseView = (input: CaisseViewInput) => {
  const {
    city, allDisplayParcels, datePreset, dateFrom = '', dateTo = '', operationalDay = null,
    driverFilter = 'all', statusFilter = 'all', searchResults = null, modifiedParcels = {},
    extraCollectedParcels = {}, depotIds, deliveryDelays = [], extraFilter = null, now = new Date(),
    recentCollected = [], agencyHolderIds = null,
  } = input
  const held = (p: any) => isPortDuHeldByAgency(p, agencyHolderIds)
  const searchMode = searchResults !== null
  const passesDateFilter = makePassesDateFilter(datePreset, dateFrom, dateTo, operationalDay)
  const dataSource = caisseDataSource(input, passesDateFilter)
  const extra = Object.values(extraCollectedParcels)

  // Stats globales de la source datée (plafond du versement)
  const portsCollectesDs = dataSource.filter(p => isCollectedPortDuForCaisse(p, city) && held(p))
  const portsPayesRecusDs = dataSource.filter(p => isPortPayeCounted(p) && p.originCity === city && p.portStatus === 'received')
  const stats = {
    portsCollectesMontant: sumPrice(portsCollectesDs),
    portsPayesRecusMontant: sumPrice(portsPayesRecusDs),
    soldeAVerser: Math.max(0, sumPrice(portsCollectesDs) + sumPrice(portsPayesRecusDs)),
  }

  // Solde de caisse (toutes données chargées, hors filtre de date)
  const allWithExtra = withMods([...(allDisplayParcels || []), ...extra], modifiedParcels)
  // 🧾 Cartes « par jour » (rangées par JOUR DE COLLECTE) : données chargées + expéditions collectées ces 14 derniers
  // jours mais créées hors période — une collecte d'aujourd'hui apparaît TOUJOURS dans la carte du jour, quel que
  // soit le filtre de date (les cartes du haut, elles, restent celles des expéditions de la période)
  const knownIds = new Set(allWithExtra.map((p: any) => p.id))
  const recentExtra = withMods((recentCollected || []).filter((p: any) => !knownIds.has(p.id)), modifiedParcels)
  const collectSource = recentExtra.length ? [...allWithExtra, ...recentExtra] : allWithExtra
  const notTransferred = (p: any) => !(p.portAdminTransferred || p.adminTransferred)
  // 📬 Ports payés ramassés au guichet à verser : seulement une fois REMIS par la gare au chef d'exploitation
  // (portPayeExpReceivedAt) — une annulation de cette réception les retire. Ceux « reçus » par le chef
  // d'agence (portStatus 'received') sont déjà comptés ci-dessous avec les ports payés reçus.
  const isRamasseRemis = (p: any) => isRamasseGuichet(p, city) && !isReturnedForGroup(p) && p.portStatus === 'collected' && !!p.portPayeExpReceivedAt
  const ramassesAVerser = sumPrice(allWithExtra.filter(isRamasseRemis))
  const soldeCaisseGlobal = Math.max(0,
    sumPrice(allWithExtra.filter(p => isCollectedPortDuForCaisse(p, city) && notTransferred(p) && held(p))) +
    sumPrice(allWithExtra.filter(p => isPortPayeCounted(p) && p.originCity === city && p.portStatus === 'received')) +
    ramassesAVerser)
  // 🏬 Appartenance au livreur filtré. « En gare - <ville> » (GARE_GROUP_ID) n'est jamais un deliveryDriverId : le
  // groupe réunit les expéditions SANS livreur et celles des comptes « en gare » (depotIds / nom « En gare - ville »),
  // comme buildCaisseDrivers — avant, ce filtre montrait 0 port dû / COD encaissé au guichet dans « À verser » et
  // dans les cartes « par jour ».
  const gareName = `En gare - ${city || ''}`
  const ofFilteredDriver = (p: any) => driverFilter === GARE_GROUP_ID
    ? (!p.deliveryDriverId || !!depotIds?.has(p.deliveryDriverId) || p.deliveryDriverName === gareName)
    : p.deliveryDriverId === driverFilter
  const soldeLivreur = driverFilter === 'all' ? 0 :
    sumPrice(allWithExtra.filter(p => isCollectedPortDuForCaisse(p, city) && ofFilteredDriver(p) && notTransferred(p) && held(p))) +
    sumPrice(allWithExtra.filter(p => isPortPayeCounted(p) && p.originCity === city && p.portStatus === 'received' &&
      (p.pickupDriverId ? p.pickupDriverId === driverFilter : ofFilteredDriver(p)))) +
    // Ramassés au guichet remis : dans la carte de leur détenteur (« En gare » sans détenteur)
    sumPrice(allWithExtra.filter(p => isRamasseRemis(p) && guichetGroupIdOf(p, city) === driverFilter))

  // Ports collectés à imprimer / à verser (source datée)
  const portsCollectesForPrint = withMods([...dataSource, ...extra], modifiedParcels)
    .filter(p => isCollectedPortDuForCaisse(p, city) && notTransferred(p))

  const drivers = buildCaisseDrivers([...dataSource, ...extra], city, { depotIds, modifiedParcels, now })
  const filteredDrivers = filterCaisseDrivers(drivers, { city, passesDateFilter, statusFilter, driverFilter, searchMode, extraFilter, now })
  // 📬 Carte « Ramassés (En gare) » : ports payés ramassés au guichet, encaissés, sur la période / les filtres
  // (« En gare » ET cartes des détenteurs du guichet — rachida, ENGAREAGA6017… : même total qu'avant le déplacement)
  const ramassesGare = filteredDrivers.flatMap(d => d.parcels.filter((p: any) =>
    guichetGroupIdOf(p, city) === d.id && (p.portStatus === 'collected' || p.portStatus === 'received')))
  const ramassesRemis = ramassesGare.filter((p: any) => p.portStatus === 'collected' && !!p.portPayeExpReceivedAt)
  const ramassesGareAVerser = sumPrice(ramassesRemis)
  const baseStats = caisseFilteredStats(filteredDrivers, driverFilter)
  const filteredStats = {
    ...baseStats,
    ramassesGareCount: ramassesGare.length,
    ramassesGareMontant: sumPrice(ramassesGare),
    // Ramassés au guichet déjà remis au chef d'exploitation (pas encore « reçus » par le chef d'agence)
    ramassesRemisCount: ramassesRemis.length,
    ramassesRemisMontant: ramassesGareAVerser,
    // « À verser » (mode recherche) : ports collectés + ports payés reçus + ramassés au guichet encore à verser
    soldeAVerser: baseStats.soldeAVerser + ramassesGareAVerser,
  }
  const bilanJournee = caisseBilanJournee(drivers, { passesDateFilter, driverFilter, searchMode, extraFilter })
  const instances = caisseInstances(dataSource, { city, driverFilter, deliveryDelays, drivers, extraFilter, now })

  // Collectes par journée d'opération (14 dernières) : ports dus collectés (livreurs, guichet) + ports
  // payés RAMASSÉS au guichet par « En gare - <ville> » (encaissés à la création)
  const parJour = new Map<string, CollecteJour>()
  const addJour = (p: any, d: Date | null, kind: 'portDu' | 'portPaye') => {
    if (!d) return
    const key = getOperationalDayString(d)
    const cur = parJour.get(key) || { count: 0, montant: 0, parcels: [] as any[], portDu: { count: 0, montant: 0 }, portPaye: { count: 0, montant: 0 }, verse: 0, aVerser: 0, aVerserIds: [] as string[], nonRecu: 0 }
    const m = safeParseAmount(p.price)
    cur.parcels.push(p)
    cur.count++; cur.montant += m
    cur[kind].count++; cur[kind].montant += m
    // 💼 Déjà versé à l'admin, encore à verser (versement par jour de collecte), ou pas encore reçu par le chef
    // d'agence (port dû chez le chef d'exploitation / le livreur : non versable)
    if (isAdminTransferred(p)) cur.verse = (cur.verse || 0) + m
    else if (kind === 'portDu' && !held(p)) cur.nonRecu = (cur.nonRecu || 0) + m
    // Caisse Agence : port payé ramassé pas encore REÇU par le chef d'agence (au guichet / chez le chef d'exploitation)
    else if (kind === 'portPaye' && agencyHolderIds && p.portStatus !== 'received') cur.nonRecu = (cur.nonRecu || 0) + m
    else { cur.aVerser = (cur.aVerser || 0) + m; cur.aVerserIds!.push(p.id) }
    parJour.set(key, cur)
  }
  collectSource.forEach((p: any) => {
    if (p.portStatus !== 'collected' && p.portStatus !== 'received') return
    if (isPortDuParcel(p) && !isPortDuMoneyBeforeStart(p) && p.destinationCity === city) {
      if (driverFilter !== 'all' && !ofFilteredDriver(p)) return
      addJour(p, toDateSafe(p.portCollectedAt) ?? toDateSafe(p.portReceivedAt), 'portDu')
    } else if (isRamasseGuichet(p, city) && !isReturnedForGroup(p)) {
      if (driverFilter !== 'all' && driverFilter !== GARE_GROUP_ID) return
      // 📅 Une somme = UNE journée : le jour d'ENCAISSEMENT au guichet (portCollectedAt), même si elle n'est remise au
      // chef d'exploitation que plus tard (avant : jour de la remise — la même somme tombait sur une autre journée que
      // dans le bilan). Anciennes données sans date d'encaissement : jour de la réception.
      const when = toDateSafe(p.portCollectedAt) ?? toDateSafe(p.portPayeExpReceivedAt) ?? (p.portStatus === 'received' ? toDateSafe(p.portReceivedAt) : null)
      if (!when) return
      addJour(p, when, 'portPaye')
    }
  })
  // 14 dernières journées + (Caisse Agence) toute journée plus ancienne qui a encore quelque chose à verser ou à
  // recevoir : une journée non versée ne disparaît jamais de l'écran du chef d'agence.
  const collectesParJour = [...parJour.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .filter(([, d], i) => i < 14 || (!!agencyHolderIds && ((d.aVerser || 0) > 0 || (d.nonRecu || 0) > 0)))
  // ⏳ Ports dus collectés, pas encore reçus par le chef d'agence (toutes journées chargées)
  const nonRecuTotal = agencyHolderIds
    ? sumPrice(collectSource.filter(p => isCollectedPortDuForCaisse(p, city) && notTransferred(p) && !held(p)))
    : 0

  // Valeurs (COD) collectées par journée d'opération (14 dernières) — montants par type comme Caisse Agence
  // Bloc COD : rangé par JOUR DE COLLECTE comme « Collectes par jour » (complet sur 14 jours, quelle que soit la
  // période) ; filtres de l'exploitation conservés (type de service, origine, port, recherche).
  // Règle « COD collecté » partagée avec la page admin « Contre Remboursement » (groupCodCollectesParJour).
  const codCollectesParJour = groupCodCollectesParJour(collectSource, city, (p: any) =>
    (!extraFilter || extraFilter(p)) && (driverFilter === 'all' || ofFilteredDriver(p))).slice(0, 14)

  return {
    passesDateFilter, dataSource, stats, soldeCaisseGlobal, soldeLivreur, portsCollectesForPrint,
    drivers, filteredDrivers, filteredStats, bilanJournee, instances, collectesParJour, codCollectesParJour, nonRecuTotal,
    /** Données chargées + collectées récemment hors période (envoi des valeurs du chef d'exploitation). */
    collectSource,
    periodLabel: caissePeriodLabel(datePreset, dateFrom, dateTo, operationalDay),
    statusFilterLabel: caisseStatusFilterLabel(statusFilter),
  }
}

export type CaisseView = ReturnType<typeof computeCaisseView>
