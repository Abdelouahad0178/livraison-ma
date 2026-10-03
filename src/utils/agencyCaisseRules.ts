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
import { getCurrentOperationalDay, getOperationalDayRange, getOperationalDayString, formatOperationalDay } from '../config/operationalDay'
import { codSplitAmount } from './codParts'

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
/** Journée d'opération d'hier (défaut des pages Caisse Agence et Chef d'exploitation). */
export function caisseDefaultOperationalDay(): Date {
  const d = getCurrentOperationalDay()
  d.setDate(d.getDate() - 1)
  return d
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
  if (preset === 'all') return list
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
    const range = getOperationalDayRange(operationalDay)
    start = range.start
    end = range.end
  } else if (preset === 'day') {
    start = from ? new Date(from) : null
    if (start) { start.setHours(0, 0, 0, 0); end = new Date(from + 'T23:59:59') }
  } else if (preset === 'custom') {
    start = from ? new Date(from + 'T00:00:00') : null
    end = to ? new Date(to + 'T23:59:59') : endOfToday
  }
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
) => (p: any): boolean => {
  if (!datePreset || datePreset === 'all') return true
  const isExplicitDateFilter = ['today', 'operational', 'day', 'custom'].includes(datePreset as string)
  const isPortDu = p.portType === 'port_du' && !p.portPayeMethod
  const isNotCollected = !p.portStatus
  if (isPortDu && isNotCollected && !isExplicitDateFilter) return true
  const d = caisseParcelDate(p)
  if (!d) return true
  return caisseFilterByDate([d], datePreset, dateFrom, dateTo, (x) => x, operationalDay || undefined).length > 0
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
    const range = getOperationalDayRange(operationalDay)
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
  if (datePreset === 'operational' && operationalDay) return formatOperationalDay(operationalDay, true)
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

// ── Statuts / montants ───────────────────────────────────────────────────────

const RETURN_STATUSES = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
const isReturnedForGroup = (p: any) => !!(p.returnedAt || p.wasReturned || p.status === 'Retourné')
const isPortDuParcel = (p: any) => p.portType === 'port_du' && !p.portPayeMethod
const isPortPayeParcel = (p: any) => p.portType === 'port_paye' && !p.portPayeMethod
const sumPrice = (list: any[]) => list.reduce((s: number, p: any) => s + safeParseAmount(p.price), 0)
const toAssignDate = (v: any) => (v?.toDate ? v.toDate() : new Date(v))

/** Type de RF retenu par Caisse Agence pour un colis mono-type. */
export const caisseCodLegacyType = (p: any): string => (p?.codPaymentType || p?.serviceType)
/** Montant COD d'un type ('especes' | 'cheque' | 'traite') — mixte : la part du type. */
export const caisseCodAmountOfType = (p: any, type: string): number => codSplitAmount(p, type, caisseCodLegacyType(p))

/** Totaux COD d'une liste (colonnes COD / Espèces / Chèque / Traite de Caisse Agence). */
export const caisseCodTotals = (parcels: any[]) => ({
  total: parcels.reduce((s: number, p: any) => s + (parseFloat(p.codAmount) || 0), 0),
  especes: parcels.reduce((s: number, p: any) => s + caisseCodAmountOfType(p, 'especes'), 0),
  cheque: parcels.reduce((s: number, p: any) => s + caisseCodAmountOfType(p, 'cheque'), 0),
  traite: parcels.reduce((s: number, p: any) => s + caisseCodAmountOfType(p, 'traite'), 0),
})

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
  (p.portStatus === 'collected' || p.portStatus === 'received') && !RETURN_STATUSES.includes(p.status) &&
  !(p.portAdminTransferred || p.adminTransferred))
const enRetardOf = (portDuParcels: any[], now: Date) => {
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return portDuParcels.filter((p: any) => {
    if (p.portType !== 'port_du' || p.portPayeMethod) return false
    if (p.status !== 'En cours de livraison' || !p.deliveryAssignedAt) return false
    return toAssignDate(p.deliveryAssignedAt) < oneDayAgo
  })
}
const portsPayesTotals = (parcels: any[], city: string) => {
  const portsPayesParcels = parcels.filter(isPortPayeParcel)
  const aRecevoir = portsPayesParcels.filter((p: any) =>
    p.originCity === city && (p.portStatus === 'collected' || !p.portStatus) && (p.pickupDriverId || p.status === 'En cours de ramassage'))
  const recus = portsPayesParcels.filter((p: any) => p.originCity === city && p.portStatus === 'received')
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
  const unknownParcels = allParcels.filter((p: any) => {
    const isInMyCity = p.destinationCity === city
    const isLocalPickup = p.status === 'En cours de ramassage' && (p.createdByCity === city || p.originCity === city)
    const isLocalPortPayeReceivedNoPickup = isPortPayeParcel(p) &&
      (p.createdByCity === city || p.originCity === city) && p.portStatus === 'received' && !p.pickupDriverId
    const hasNoDriver = !p.deliveryDriverId && !p.pickupDriverId
    return ((hasNoDriver && (isInMyCity || isLocalPickup)) || isLocalPortPayeReceivedNoPickup) && !isReturnedForGroup(p)
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
      ...portsPayesTotals(parcels, city),
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
  { key: 'ramasse', label: '📬 Ramassé (port payé)' },
]

export const caisseStatusFilterLabel = (statusFilter: string): string => {
  if (statusFilter === 'a_collecter') return 'À collecter'
  if (statusFilter === 'collecte') return 'Collecté'
  if (statusFilter === 'en_retard') return 'En retard'
  if (statusFilter === 'en_compte') return 'En compte'
  if (statusFilter === 'ramasse') return 'Ramassé'
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
      if (driverId === GARE_GROUP_ID) return isPortDu && !p.portStatus && !isReturned
      return isPortDu && !p.portStatus && isInDelivery && !isReturned
    case 'collecte':
      return isPortDu && isCollected
    case 'en_compte':
      return String(p.portType || '').startsWith('port_en_compte') && !(p.returnedAt || p.wasReturned || p.status === 'Retourné')
    case 'ramasse':
      return isPortPayeParcel(p) && !(p.returnedAt || p.wasReturned || p.status === 'Retourné')
    case 'en_retard':
      return isPortDu && isLate && !isReturned
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
    if (extraFilter) Object.assign(out, portsPayesTotals(statusFilteredParcels, city), { portDuParcels: filteredPortDuParcels })
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
    totalParcels: sum(d => d.parcels.length),
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
  livresNonCollectes: any[]
  montantManquant: number
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
      const livresNonCollectes = portDu.filter((p: any) => p.status === 'Livré' && !p.portStatus)
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
        montantManquant: sumPrice(livresNonCollectes),
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
    return isPortDuParcel(p) && !p.portStatus && notReturned && enCours && p.destinationCity === city && matchesDriver &&
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
  depotIds?: Set<string>
  deliveryDelays?: any[]
  /** Filtres supplémentaires propres au Chef d'exploitation (origine / service / port / recherche). */
  extraFilter?: ((p: any) => boolean) | null
  now?: Date
}

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
  p.destinationCity === city && !RETURN_STATUSES.includes(p.status)

/**
 * 🧮 Calcule TOUT l'écran Caisse Agence pour une agence et des filtres donnés.
 * Appelé tel quel par CaisseChefTab ET par le Chef d'exploitation.
 */
export const computeCaisseView = (input: CaisseViewInput) => {
  const {
    city, allDisplayParcels, datePreset, dateFrom = '', dateTo = '', operationalDay = null,
    driverFilter = 'all', statusFilter = 'all', searchResults = null, modifiedParcels = {},
    extraCollectedParcels = {}, depotIds, deliveryDelays = [], extraFilter = null, now = new Date(),
  } = input
  const searchMode = searchResults !== null
  const passesDateFilter = makePassesDateFilter(datePreset, dateFrom, dateTo, operationalDay)
  const dataSource = caisseDataSource(input, passesDateFilter)
  const extra = Object.values(extraCollectedParcels)

  // Stats globales de la source datée (plafond du versement)
  const portsCollectesDs = dataSource.filter(p => isCollectedPortDuForCaisse(p, city))
  const portsPayesRecusDs = dataSource.filter(p => isPortPayeParcel(p) && p.originCity === city && p.portStatus === 'received')
  const stats = {
    portsCollectesMontant: sumPrice(portsCollectesDs),
    portsPayesRecusMontant: sumPrice(portsPayesRecusDs),
    soldeAVerser: Math.max(0, sumPrice(portsCollectesDs) + sumPrice(portsPayesRecusDs)),
  }

  // Solde de caisse (toutes données chargées, hors filtre de date)
  const allWithExtra = withMods([...(allDisplayParcels || []), ...extra], modifiedParcels)
  const notTransferred = (p: any) => !(p.portAdminTransferred || p.adminTransferred)
  const soldeCaisseGlobal = Math.max(0,
    sumPrice(allWithExtra.filter(p => isCollectedPortDuForCaisse(p, city) && notTransferred(p))) +
    sumPrice(allWithExtra.filter(p => isPortPayeParcel(p) && p.originCity === city && p.portStatus === 'received')))
  const soldeLivreur = driverFilter === 'all' ? 0 :
    sumPrice(allWithExtra.filter(p => isCollectedPortDuForCaisse(p, city) && p.deliveryDriverId === driverFilter && notTransferred(p))) +
    sumPrice(allWithExtra.filter(p => isPortPayeParcel(p) && p.originCity === city && p.portStatus === 'received' &&
      (p.pickupDriverId === driverFilter || (!p.pickupDriverId && p.deliveryDriverId === driverFilter))))

  // Ports collectés à imprimer / à verser (source datée)
  const portsCollectesForPrint = withMods([...dataSource, ...extra], modifiedParcels)
    .filter(p => isCollectedPortDuForCaisse(p, city) && notTransferred(p))

  const drivers = buildCaisseDrivers([...dataSource, ...extra], city, { depotIds, modifiedParcels, now })
  const filteredDrivers = filterCaisseDrivers(drivers, { city, passesDateFilter, statusFilter, driverFilter, searchMode, extraFilter, now })
  const filteredStats = caisseFilteredStats(filteredDrivers, driverFilter)
  const bilanJournee = caisseBilanJournee(drivers, { passesDateFilter, driverFilter, searchMode, extraFilter })
  const instances = caisseInstances(dataSource, { city, driverFilter, deliveryDelays, drivers, extraFilter, now })

  // Collectes par journée d'opération (14 dernières)
  const parJour = new Map<string, { count: number; montant: number; parcels: any[] }>()
  allWithExtra.forEach((p: any) => {
    if (!isPortDuParcel(p)) return
    if (p.portStatus !== 'collected' && p.portStatus !== 'received') return
    if (p.destinationCity !== city) return
    if (driverFilter !== 'all' && p.deliveryDriverId !== driverFilter) return
    const d = toDateSafe(p.portCollectedAt) ?? toDateSafe(p.portReceivedAt)
    if (!d) return
    const key = getOperationalDayString(d)
    const cur = parJour.get(key) || { count: 0, montant: 0, parcels: [] as any[] }
    cur.parcels.push(p)
    parJour.set(key, { count: cur.count + 1, montant: cur.montant + safeParseAmount(p.price), parcels: cur.parcels })
  })
  const collectesParJour = [...parJour.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14)

  return {
    passesDateFilter, dataSource, stats, soldeCaisseGlobal, soldeLivreur, portsCollectesForPrint,
    drivers, filteredDrivers, filteredStats, bilanJournee, instances, collectesParJour,
    periodLabel: caissePeriodLabel(datePreset, dateFrom, dateTo, operationalDay),
    statusFilterLabel: caisseStatusFilterLabel(statusFilter),
  }
}

export type CaisseView = ReturnType<typeof computeCaisseView>
