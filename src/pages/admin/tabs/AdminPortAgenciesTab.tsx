import { useMemo, useState, useEffect, useRef, useDeferredValue, startTransition } from 'react'
import PendingBadge from '../../../components/PendingBadge'
import { Building2, TrendingUp, Package, Printer, Filter, X, Calendar, ChevronDown, Loader2, AlertCircle, Eye } from 'lucide-react'
import { CITIES } from '../../../firebase/constants'
import { collection, query, orderBy, onSnapshot, where, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { getOperationalDayRange, getCurrentOperationalDay } from '../../../config/operationalDay'
import { useOperationalDay } from '../../../hooks/useOperationalDay'
import { buildDaySlices } from '../../../utils/daySlices'
import { parcelDate } from '../../../utils/dateFilter'
import { agencyPortAmounts, isInAgencyScope, isSentFromAgency, isReceivedInAgency, type AgencyDirection } from '../../../utils/billingAgency'
import AdminCaisseView from '../components/AdminCaisseView'
import HScrollArrows from '../../../components/HScrollArrows'
import LoadProgress from '../../../components/LoadProgress'

interface Props {
  datePreset: string
  setDatePreset: (preset: string) => void
  dateFrom: string
  setDateFrom: (date: string) => void
  dateTo: string
  setDateTo: (date: string) => void
  operationalDay: Date | null
  setOperationalDay: (day: Date | null) => void
}

// 📅 Période par défaut (« 10j ») et période maximale chargeable (Période personnalisée)
const DEFAULT_DAYS = 10
const MAX_DAYS = 45
// Journées en attente de la 1re réponse serveur en même temps (écoutes temps réel jour par jour)
const SLICE_CONCURRENCY = 12

const DAY_MS = 24 * 60 * 60 * 1000
const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtDay = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

interface Period {
  /** Bornes EXACTES (journées d'opération 8h → 6h lendemain), utilisées pour la requête ET le filtre */
  start: Date
  end: Date
  days: number
  label: string
  /** Dates personnalisées incohérentes (début > fin) → repli sur la période par défaut */
  invalid: boolean
  /** Nombre de jours demandés quand la période a été plafonnée à MAX_DAYS */
  cappedFrom: number | null
}

/**
 * 🗓️ UNE SEULE définition de la période, partagée par le chargement Firestore et par le filtrage
 * (avant : bornes calendaires ± 1 jour de marge pour la requête, autres bornes pour le filtre).
 * Règles identiques à la page Chef d'agence (utils/dateFilter + AgentPage) : journées d'opération.
 */
function computePeriod(preset: string, dateFrom: string, dateTo: string, operationalDay: Date | null): Period {
  const todayOp = getCurrentOperationalDay()
  let first: Date = addDays(todayOp, -(DEFAULT_DAYS - 1))
  let last: Date = todayOp
  let invalid = false
  let label = `${DEFAULT_DAYS} derniers jours`

  if (preset === 'today') {
    first = last = todayOp
    label = "Aujourd'hui"
  } else if (preset === 'week') {
    first = addDays(todayOp, -6)
    label = '7 derniers jours'
  } else if (preset === 'month') {
    first = new Date(todayOp.getFullYear(), todayOp.getMonth(), 1, 12)
    label = 'Ce mois'
  } else if (preset === 'operational') {
    first = last = operationalDay || todayOp
    label = "Journée d'opération"
  } else if (preset === 'custom') {
    const f = dateFrom ? new Date(dateFrom + 'T12:00:00') : null
    const t = dateTo ? new Date(dateTo + 'T12:00:00') : null
    if (f && t && f > t) {
      invalid = true // repli sur la période par défaut (bandeau d'avertissement)
    } else if (f || t) {
      first = f || (t as Date)
      last = t || (f && f > todayOp ? f : todayOp)
      label = 'Période'
    }
  }

  const dayCount = (a: Date, b: Date) =>
    Math.round((getOperationalDayRange(b).start.getTime() - getOperationalDayRange(a).start.getTime()) / DAY_MS) + 1
  let days = dayCount(first, last)
  let cappedFrom: number | null = null
  if (days > MAX_DAYS) {
    cappedFrom = days
    last = addDays(first, MAX_DAYS - 1)
    days = MAX_DAYS
  }
  const start = getOperationalDayRange(first).start
  const end = getOperationalDayRange(last).end
  return { start, end, days, label, invalid, cappedFrom }
}

export default function AdminPortAgenciesTab({
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  operationalDay,
  setOperationalDay
}: Props) {
  // États pour filtres
  const [selectedCity, setSelectedCity] = useState<string>('all') // all ou nom de ville
  const [portTypeFilter, setPortTypeFilter] = useState('all') // all, port_paye, port_du, port_en_compte_expediteur
  const [directionFilter, setDirectionFilter] = useState<string>('all') // all, sent (envoyées), received (reçues)
  const [originCityFilter, setOriginCityFilter] = useState<string>('all') // Filtre ville d'origine (pour mode "Reçues")
  const [showFilters, setShowFilters] = useState(true)
  const [viewMode, setViewMode] = useState<'theoretical' | 'physical'>('theoretical') // theoretical = tous les ports, physical = argent physique en caisse

  // État pour la modale Caisse Agence
  const [showCaisseModal, setShowCaisseModal] = useState(false)

  // 📅 Période active (recalculée aussi au changement de journée d'opération)
  const { dayString: currentOpDay } = useOperationalDay()
  const operationalDayMs = operationalDay ? operationalDay.getTime() : null
  const period = useMemo(
    () => computePeriod(datePreset, dateFrom, dateTo, operationalDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datePreset, dateFrom, dateTo, operationalDayMs, currentOpDay]
  )
  const periodStartMs = period.start.getTime()
  const periodEndMs = period.end.getTime()

  // États de chargement
  // ⚡ TEMPS RÉEL sur TOUTE la période : une écoute onSnapshot par journée d'opération (mêmes
  // bornes que l'ancienne lecture ponctuelle jour par jour). Toute modification faite ailleurs
  // (Chef d'agence, Agent pro, livreurs… : port encaissé, statut, prix, affectation) sur un colis
  // de la période — y compris des journées passées — est reflétée sans recharger la page.
  const [periodParcels, setPeriodParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // ⚠️ Avec le cache local Firestore, un onSnapshot renvoie d'abord un résultat depuis le CACHE
  // (potentiellement incomplet) : ce flag reste true tant que le serveur n'a pas confirmé.
  const [syncing, setSyncing] = useState(false)
  const [loadedCount, setLoadedCount] = useState(0)
  const [dayProgress, setDayProgress] = useState<{ done: number; total: number; label: string } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 🔢 Génération : toute réponse d'un chargement précédent (autre période) est ignorée
  const loadGenRef = useRef(0)

  // 🔄 Réinitialiser le filtre ville d'origine quand on quitte le mode "Reçues"
  useEffect(() => {
    if (directionFilter !== 'received') {
      setOriginCityFilter('all')
    }
  }, [directionFilter])

  // ⚡ CHARGEMENT de la période : mêmes requêtes que la page Chef d'agence (createdAt dans
  // [début, fin] exacts de la période, archivés inclus), découpées par journée d'opération.
  // Chaque journée est une écoute TEMPS RÉEL (onSnapshot, includeMetadataChanges) :
  // - chargement initial : au plus SLICE_CONCURRENCY journées en attente du serveur à la fois
  //   (la suivante démarre dès qu'une journée est confirmée par le serveur) ;
  // - « chargé » = TOUTES les journées confirmées par le serveur (pas seulement le cache local) ;
  // - ensuite, chaque modification (n'importe quelle page) met à jour les totaux (regroupées
  //   toutes les ~250 ms, en transition React pour ne pas bloquer les clics).
  // À CHAQUE changement de période : écoutes coupées, données vidées, progression affichée, aucune
  // donnée de l'ancienne période ne peut revenir (génération).
  useEffect(() => {
    const gen = ++loadGenRef.current
    const start = new Date(periodStartMs)
    const end = new Date(periodEndMs)

    // ⚡ Données en TRANSITION : le recalcul des statistiques ne bloque pas les clics
    startTransition(() => setPeriodParcels([]))
    setLoading(true)
    setSyncing(false)
    setLoadedCount(0)
    setLoadError(null)

    // Tranches contiguës (union = exactement [start, end]), de la plus récente à la plus ancienne :
    // la journée en cours (si incluse) démarre en premier.
    const slices = buildDaySlices(start, end)
    const sliceDocs: any[][] = slices.map(() => [])
    const confirmed: boolean[] = slices.map(() => false)
    const fromCacheFlags: boolean[] = slices.map(() => true)
    const unsubs: (() => void)[] = []
    let confirmedCount = 0
    let started = 0
    let allReady = false
    let publishTimer: ReturnType<typeof setTimeout> | null = null
    const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine

    const total = () => sliceDocs.reduce((n, a) => n + a.length, 0)
    const publish = () => {
      publishTimer = null
      if (gen !== loadGenRef.current) return
      const merged: any[] = []
      for (const arr of sliceDocs) for (const d of arr) merged.push(d)
      startTransition(() => setPeriodParcels(merged))
    }
    const schedulePublish = () => {
      if (publishTimer) return
      publishTimer = setTimeout(publish, 250)
    }

    const startNext = () => {
      while (started < slices.length && started - confirmedCount < SLICE_CONCURRENCY) startSlice(started++)
    }
    const markConfirmed = (i: number) => {
      if (confirmed[i]) return
      confirmed[i] = true
      confirmedCount += 1
      if (!allReady) {
        setDayProgress({ done: confirmedCount, total: slices.length, label: slices[i].label })
        startNext()
        if (confirmedCount === slices.length) {
          allReady = true
          setDayProgress(null)
          publish() // résultat complet, publié d'un seul coup (comme avant)
          setLoading(false)
        }
      }
    }

    function startSlice(i: number) {
      const s = slices[i]
      const q = query(
        collection(db, 'parcels'),
        where('createdAt', '>=', Timestamp.fromDate(s.start)),
        where('createdAt', s.endInclusive ? '<=' : '<', Timestamp.fromDate(s.end)),
        orderBy('createdAt', 'desc')
        // Pas de limite : une tranche = une journée d'opération (≈ 500-1 500 colis)
      )
      const unsub = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => {
          if (gen !== loadGenRef.current) return
          const wasReady = allReady
          // Pas de nouvelle liste si seules les métadonnées ont changé (ex. écriture confirmée)
          const dataChanged = snap.docChanges().length > 0
          if (dataChanged || !confirmed[i]) {
            sliceDocs[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          }
          fromCacheFlags[i] = snap.metadata.fromCache
          // ⚠️ Badge « Synchronisation… » : au moins une journée encore servie par le cache local
          setSyncing(fromCacheFlags.some((f, k) => f && k < started))
          setLoadedCount(total())
          // Résultat définitif seulement une fois confirmé par le serveur (ou hors ligne)
          if (!snap.metadata.fromCache || isOffline()) markConfirmed(i)
          // Après le chargement complet : chaque modification → totaux recalculés (regroupés)
          if (wasReady && dataChanged) schedulePublish()
        },
        (err) => {
          console.error(`Port par Agence - erreur temps réel (${s.label}):`, err)
          if (gen !== loadGenRef.current) return
          setLoadError(err?.message || 'Erreur de chargement')
          fromCacheFlags[i] = false
          setSyncing(fromCacheFlags.some((f, k) => f && k < started))
          markConfirmed(i)
        }
      )
      unsubs.push(unsub)
    }

    setDayProgress({ done: 0, total: slices.length, label: slices[0].label })
    startNext()

    return () => {
      loadGenRef.current += 1 // ignore toute réponse tardive de cette période
      if (publishTimer) clearTimeout(publishTimer)
      unsubs.forEach((u) => u())
    }
  }, [periodStartMs, periodEndMs])
  // Note: ville, type de port, direction et mode sont appliqués côté frontend (useMemo) : pas de
  // rechargement Firestore pour ces filtres.

  // 🔒 Fonction sécurisée pour parser les nombres
  const safeParseFloat = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0
    const num = parseFloat(String(value).replace(',', '.'))
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
  }

  // ✅ Filtrer les colis par période - parcelDate (workDate = jour d'opération, repli createdAt),
  // mêmes bornes EXACTES que la requête et que la page Chef d'agence.
  // 🗄️ Les colis archivés (isArchived, toujours dans 'parcels') sont INCLUS.
  // ⚡ RÉACTIVITÉ DES BOUTONS : les filtres (période, direction, ville, type de port, mode) restent
  // URGENTS — le bouton cliqué s'allume immédiatement et le chargement de la nouvelle période part
  // aussitôt — tandis que les calculs lourds (statistiques par agence sur toute la période) lisent
  // leur copie DIFFÉRÉE, recalculée en arrière-plan (interruptible). Mêmes résultats.
  const urgentFilters = useMemo(
    () => ({ periodStartMs, periodEndMs, directionFilter, originCityFilter, viewMode, selectedCity, portTypeFilter }),
    [periodStartMs, periodEndMs, directionFilter, originCityFilter, viewMode, selectedCity, portTypeFilter]
  )
  const deferredFilters = useDeferredValue(urgentFilters)
  const filtersPending = deferredFilters !== urgentFilters

  const filteredByDate = useMemo(() => {
    const { periodStartMs, periodEndMs } = deferredFilters
    const out: any[] = []
    // Tranches disjointes : pas de doublon possible (un colis = un seul createdAt)
    for (const p of periodParcels) {
      const t = parcelDate(p).getTime()
      if (t >= periodStartMs && t <= periodEndMs) out.push(p)
    }
    return out
  }, [periodParcels, deferredFilters])

  const periodRangeText = `${fmtDay(period.start)} 08h00 → ${fmtDay(period.end)} 06h00`

  // ✅ Calculer les statistiques par agence
  // Mode theoretical = tous les ports (actuel)
  // Mode physical = argent réellement collecté en caisse
  const portStats = useMemo(() => {
    const { directionFilter, originCityFilter, viewMode } = deferredFilters
    if (!Array.isArray(filteredByDate)) return []

    const stats: Record<string, {
      city: string
      portPaye: number              // ✅ Port Payé (expéditeur) OU Ports payés reçus (mode physical)
      portDu: number                 // 💰 Port Dû (destinataire) OU Ports dû collectés (mode physical)
      portDuCheque: number           // 📋 Port Dû Chèque
      enCompteExp: number            // 📤 En Compte Expéditeur
      enCompteDest: number           // 📥 En Compte Destinataire
      totalPort: number
      nbExpeditions: number          // Seulement les expéditions (pas colis) — locales comptées 2 fois en « Toutes »
      nbUnique: number               // Expéditions distinctes (= nombre affiché sur la page Chef d'agence)
    }> = {}

    // Initialiser toutes les villes
    CITIES.forEach(city => {
      stats[city] = {
        city,
        portPaye: 0,
        portDu: 0,
        portDuCheque: 0,
        enCompteExp: 0,
        enCompteDest: 0,
        totalPort: 0,
        nbExpeditions: 0,
        nbUnique: 0,
      }
    })

    // Parcourir tous les colis filtrés par date
    filteredByDate.forEach((p: any) => {
      // ✅ Utiliser SEULEMENT originCity et destinationCity (comme dans AgentPage)
      const originCity = p.originCity
      const destCity = p.destinationCity

      // 🔗 Agences concernées : ville d'expédition / de destination (et villes expéditeur /
      // destinataire des anciens colis). Le périmètre et la répartition des ports suivent la règle
      // PARTAGÉE avec la page Chef d'agence (utils/billingAgency) → mêmes expéditions, mêmes montants.
      const agencyDir: AgencyDirection = directionFilter === 'sent' ? 'sent' : directionFilter === 'received' ? 'received' : 'all'
      const matchesOriginFilter = directionFilter !== 'received' || originCityFilter === 'all' || originCity === originCityFilter
      const involvedCities = [...new Set([originCity, p.sender?.city, destCity, p.receiver?.city])]
        .filter((c: any) => c && stats[c]) as string[]

      if (viewMode === 'theoretical') {
        // 📊 MODE THÉORIQUE : ports de chaque expédition du périmètre de l'agence
        // Port payé / En compte exp. → ORIGINE ; Port dû (espèces, chèque) / En compte dest. → DESTINATION
        if (matchesOriginFilter) {
          for (const c of involvedCities) {
            if (!isInAgencyScope(p, c, agencyDir)) continue
            const a = agencyPortAmounts(p, c)
            stats[c].portPaye += a.portPaye
            stats[c].portDu += a.portDu
            stats[c].portDuCheque += a.portDuCheque
            stats[c].enCompteExp += a.enCompteExp
            stats[c].enCompteDest += a.enCompteDest
          }
        }
      } else {
        // 💵 MODE SITUATION CAISSE : ARGENT PHYSIQUE COLLECTÉ
        const price = safeParseFloat(p.price)
        const portType = p.portType
        const portStatus = p.portStatus

        // 1️⃣ PORTS DÛ COLLECTÉS : portType = 'port_du', portStatus = 'collected' ou 'received'
        if (portType === 'port_du' && (portStatus === 'collected' || portStatus === 'received') && price > 0 && destCity && stats[destCity]) {
          stats[destCity].portDu += price
        }

        // 1️⃣ bis PORTS DÛ CHÈQUE COLLECTÉS : portType = 'port_du_cheque', portStatus = 'collected' ou 'received'
        if (portType === 'port_du_cheque' && (portStatus === 'collected' || portStatus === 'received') && price > 0 && destCity && stats[destCity]) {
          stats[destCity].portDuCheque += price
        }

        // 2️⃣ PORTS PAYÉS REÇUS LOCALEMENT : portType = 'port_paye', from this city, portStatus = 'received'
        if (portType === 'port_paye' && !p.portPayeMethod && portStatus === 'received' && price > 0 && originCity && stats[originCity]) {
          stats[originCity].portPaye += price
        }
      }

      // ✅ EXPÉDITIONS : même périmètre que la page Chef d'agence (envoyées depuis la ville,
      // reçues = arrivées dans la ville ET visibles à destination ; les retours sont suivis dans
      // l'onglet Retours). En « Toutes », une expédition LOCALE (même ville) compte 2 fois pour son
      // agence (1 envoyée + 1 reçue) ; nbUnique la compte une seule fois (= total Chef d'agence).
      if (matchesOriginFilter) {
        for (const c of involvedCities) {
          const sent = agencyDir !== 'received' && isSentFromAgency(p, c)
          const received = agencyDir !== 'sent' && isReceivedInAgency(p, c)
          stats[c].nbExpeditions += (sent ? 1 : 0) + (received ? 1 : 0)
          if (sent || received) stats[c].nbUnique += 1
        }
      }
    })

    // Calculer les totaux et arrondir - afficher toutes les agences
    return Object.values(stats).map(stat => {
      // 💰 Total Port = Somme de tous les ports (sans déduire les versements)
      const totalPort = stat.portPaye + stat.portDu + stat.portDuCheque + stat.enCompteExp + stat.enCompteDest

      return {
        ...stat,
        portPaye: Math.round(stat.portPaye * 100) / 100,
        portDu: Math.round(stat.portDu * 100) / 100,
        portDuCheque: Math.round(stat.portDuCheque * 100) / 100,
        enCompteExp: Math.round(stat.enCompteExp * 100) / 100,
        enCompteDest: Math.round(stat.enCompteDest * 100) / 100,
        totalPort: Math.round(totalPort * 100) / 100,
      }
    })
  }, [filteredByDate, deferredFilters])

  // Appliquer les filtres de ville et type de port
  const filteredStats = useMemo(() => {
    const { selectedCity, portTypeFilter } = deferredFilters
    let filtered = portStats

    // Filtre par ville sélectionnée
    if (selectedCity !== 'all') {
      filtered = filtered.filter(stat => stat.city === selectedCity)
    }

    // Filtre par type de port - 5 TYPES SÉPARÉS
    if (portTypeFilter !== 'all') {
      filtered = filtered.filter(stat => {
        if (portTypeFilter === 'port_paye') return stat.portPaye > 0
        if (portTypeFilter === 'port_du') return stat.portDu > 0
        if (portTypeFilter === 'port_du_cheque') return stat.portDuCheque > 0
        if (portTypeFilter === 'port_en_compte_expediteur') return stat.enCompteExp > 0
        if (portTypeFilter === 'port_en_compte_destinataire') return stat.enCompteDest > 0
        return true
      })
    }

    return filtered
  }, [portStats, deferredFilters])

  // ✅ Calculer les totaux sur les stats FILTRÉES - 4 TYPES + EXPÉDITIONS SEULEMENT
  // 🔢 Expéditions DISTINCTES des agences affichées (même périmètre que la page Chef d'agence).
  // En « Toutes », le total ci-dessus compte 2 fois une expédition envoyée ET reçue par les agences
  // affichées (locales pour une agence ; aussi les inter-agences quand toutes les villes sont affichées).
  const uniqueExpeditionsCount = useMemo(() => {
    const { directionFilter, originCityFilter } = deferredFilters
    const cities = filteredStats.map(s => s.city)
    const agencyDir: AgencyDirection = directionFilter === 'sent' ? 'sent' : directionFilter === 'received' ? 'received' : 'all'
    return filteredByDate.filter((p: any) =>
      (directionFilter !== 'received' || originCityFilter === 'all' || p.originCity === originCityFilter) &&
      cities.some(c => isInAgencyScope(p, c, agencyDir))).length
  }, [filteredByDate, filteredStats, deferredFilters])

  const totauxFiltres = useMemo(() => {
    const totaux = filteredStats.reduce((acc, stat) => ({
      portPaye: acc.portPaye + stat.portPaye,
      portDu: acc.portDu + stat.portDu,
      portDuCheque: acc.portDuCheque + stat.portDuCheque,
      enCompteExp: acc.enCompteExp + stat.enCompteExp,
      enCompteDest: acc.enCompteDest + stat.enCompteDest,
      nbExpeditions: acc.nbExpeditions + stat.nbExpeditions,
    }), { portPaye: 0, portDu: 0, portDuCheque: 0, enCompteExp: 0, enCompteDest: 0, nbExpeditions: 0 })

    // 💵 Total Port (dans les cartes) = Port Dû + Port Payé + Port Dû Chèque
    const totalPortCartes = totaux.portPaye + totaux.portDu + totaux.portDuCheque

    return {
      portPaye: Math.round(totaux.portPaye * 100) / 100,
      portDu: Math.round(totaux.portDu * 100) / 100,
      portDuCheque: Math.round(totaux.portDuCheque * 100) / 100,
      enCompteExp: Math.round(totaux.enCompteExp * 100) / 100,
      enCompteDest: Math.round(totaux.enCompteDest * 100) / 100,
      totalPort: Math.round(totalPortCartes * 100) / 100,
      nbExpeditions: totaux.nbExpeditions,
    }
  }, [filteredStats])

  const hasActiveFilter = selectedCity !== 'all' || portTypeFilter !== 'all' || datePreset !== 'all' || directionFilter !== 'all'

  // 🖨️ Fonction d'impression
  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      <PendingBadge show={filtersPending} />
      {/* 🖨️ Styles d'impression */}
      <style>{`
        @media print {
          @page {
            margin: 1cm;
            size: A4 portrait;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print-page-break {
            page-break-before: always;
          }
          /* Assurer que les gradients et couleurs sont visibles */
          * {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          /* Optimiser l'affichage du tableau */
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          /* Enlever les ombres à l'impression pour meilleure lisibilité */
          .shadow-xl, .shadow-lg, .shadow-sm {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="mt-4 space-y-4">
      {/* ⚠️ Avertissement dates invalides */}
      {period.invalid && (
        <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-400 rounded-xl p-4 flex items-center gap-3 shadow-md print:hidden">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-900">⚠️ Dates invalides : la date de début doit être antérieure ou égale à la date de fin</p>
            <p className="text-xs text-red-700 mt-1">
              Période par défaut affichée ({DEFAULT_DAYS} derniers jours). Corrigez les dates pour appliquer la période personnalisée.
            </p>
          </div>
        </div>
      )}

      {/* ⚠️ Avertissement période limitée */}
      {period.cappedFrom && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-orange-400 rounded-xl p-4 flex items-center gap-3 shadow-md print:hidden">
          <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-900">⚠️ Période limitée à {MAX_DAYS} jours ({period.cappedFrom} jours demandés)</p>
            <p className="text-xs text-orange-700 mt-1">
              Seules les {MAX_DAYS} premières journées de la période sont chargées.
            </p>
          </div>
        </div>
      )}

      {/* ❌ Erreur de chargement */}
      {loadError && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-center gap-3 print:hidden">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <p className="text-sm font-bold text-red-900">Erreur de chargement : {loadError} — les totaux peuvent être incomplets.</p>
        </div>
      )}

      {(
        <div id="port-agence-print">
          {/* 🖨️ En-tête d'impression simplifié - visible uniquement à l'impression */}
          <div className="hidden print:block bg-white pb-4 mb-4">
            {/* Titre principal avec détails */}
            <div className="text-center mb-4">
              <h1 className="text-3xl font-black text-gray-900">
                Port par Agence
                {selectedCity !== 'all' && ` - ${selectedCity}`}
              </h1>
              <p className="text-lg font-bold text-indigo-700 mt-2">
                {totauxFiltres.nbExpeditions} expédition{totauxFiltres.nbExpeditions > 1 ? 's' : ''}
                {directionFilter === 'sent' && ' créée' + (totauxFiltres.nbExpeditions > 1 ? 's' : '') + ' et envoyée' + (totauxFiltres.nbExpeditions > 1 ? 's' : '') + (selectedCity === 'all' ? ' (toutes agences)' : ` par ${selectedCity}`)}
                {directionFilter === 'received' && (
                  <>
                    {' reçue' + (totauxFiltres.nbExpeditions > 1 ? 's' : '')}
                    {originCityFilter !== 'all' && ` de ${originCityFilter}`}
                  </>
                )}
              </p>
              {datePreset === 'operational' && operationalDay && (
                <p className="text-lg font-semibold text-gray-600 mt-2">
                  Jour d'opération : {operationalDay.toLocaleDateString('fr-MA', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              )}
              {datePreset !== 'operational' && (
                <p className="text-lg font-semibold text-gray-600 mt-2">
                  Période : {period.label} — du {periodRangeText}
                </p>
              )}
            </div>

            {/* Ligne de séparation */}
            <div className="mt-4 border-t-2 border-gray-300"></div>
          </div>

          {/* En-tête */}
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-4 sm:p-6 shadow-xl print:hidden">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-white">
              <div className="flex items-center gap-2 sm:gap-3">
                <Building2 className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black">Port par Agence</h2>
                    {/* ⚠️ Tant que ce badge est affiché, le total peut encore changer : les
                        données viennent du cache local en attendant la confirmation serveur. */}
                    {syncing && (
                      <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-400/20 text-amber-100 text-[11px] font-semibold print:hidden">
                        <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                        Synchronisation…
                      </span>
                    )}
                  </div>
                  <p className="text-blue-100 text-xs sm:text-sm mt-1 hidden sm:block">
                    {viewMode === 'theoretical'
                      ? 'Port Payé et En Compte (collecté par expéditeur) · Port Dû (collecté à destination)'
                      : 'Situation physique de la caisse - Argent réellement collecté'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {/* Toggle Vue Théorique / Situation Caisse */}
                <div className="flex items-center gap-1 sm:gap-2 bg-white/20 backdrop-blur-sm rounded-xl p-1 w-full sm:w-auto">
                  <button
                    onClick={() => setViewMode('theoretical')}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg transition-all font-bold text-xs sm:text-sm whitespace-nowrap ${
                      viewMode === 'theoretical'
                        ? 'bg-white text-purple-600 shadow-lg'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="hidden xs:inline">📊 Vue Théorique</span>
                    <span className="xs:hidden">📊 Théorique</span>
                  </button>
                  <button
                    onClick={() => setViewMode('physical')}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg transition-all font-bold text-xs sm:text-sm whitespace-nowrap ${
                      viewMode === 'physical'
                        ? 'bg-white text-purple-600 shadow-lg'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="hidden xs:inline">💵 Situation Caisse</span>
                    <span className="xs:hidden">💵 Caisse</span>
                  </button>
                </div>
                {/* Bouton pour ouvrir la fenêtre Caisse Agence */}
                <button
                  onClick={() => setShowCaisseModal(true)}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors font-bold text-white print:hidden text-xs sm:text-sm whitespace-nowrap"
                  title="Voir Caisse Agence"
                >
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden md:inline">Détails Agences</span>
                  <span className="md:hidden">Détails</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors font-bold print:hidden text-xs sm:text-sm whitespace-nowrap"
                >
                  <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden md:inline">Imprimer</span>
                </button>
              </div>
            </div>
          </div>

      {/* Section Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:hidden">
        {/* En-tête des filtres */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-purple-600" />
            <span className="font-bold text-gray-800">Filtres et Recherche</span>
            {hasActiveFilter && (
              <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-bold">
                Actifs
              </span>
            )}
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-600 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Contenu des filtres */}
        {showFilters && (
          <div className="p-4 space-y-4 border-t border-gray-100">
            {/* Ligne 1: Période */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Période
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                {[
                  { key: 'all', label: '10j' },
                  { key: 'today', label: "Auj." },
                  { key: 'week', label: '7j' },
                  { key: 'month', label: 'Mois' },
                  { key: 'operational', label: '🗓️ J.Opé' },
                  { key: 'custom', label: 'Période' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDatePreset(key)
                      // 🗓️ Si J.Opé et pas de date définie, utiliser dateFrom ou aujourd'hui
                      if (key === 'operational' && !operationalDay) {
                        setOperationalDay(
                          dateFrom
                            ? new Date(dateFrom + 'T00:00:00')
                            : new Date()
                        )
                      }
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                      datePreset === key
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}

                {datePreset === 'operational' && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:ml-2 w-full sm:w-auto">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Jour d'opération (8H → 6H lendemain)</span>
                    <input
                      type="date"
                      value={operationalDay ? `${operationalDay.getFullYear()}-${String(operationalDay.getMonth() + 1).padStart(2, '0')}-${String(operationalDay.getDate()).padStart(2, '0')}` : ''}
                      onChange={e => {
                        if (!e.target.value) {
                          setOperationalDay(null)
                          return
                        }
                        setOperationalDay(new Date(e.target.value + 'T00:00:00'))
                      }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
                    />
                  </div>
                )}

                {datePreset === 'custom' && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:ml-2 w-full sm:w-auto">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
                    />
                    <span className="text-gray-400 text-xs font-bold">→</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Ligne 2: Filtre Ville par boutons */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">
                <Building2 className="w-3.5 h-3.5 inline mr-1" />
                Filtrer par ville / agence
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCity('all')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                    selectedCity === 'all'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Toutes les villes
                </button>
                {CITIES.map(city => (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                      selectedCity === city
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Ligne 3: Filtre type de port */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">
                <Filter className="w-3.5 h-3.5 inline mr-1" />
                Type de port
              </label>
              <select
                value={portTypeFilter}
                onChange={(e) => setPortTypeFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-medium"
              >
                <option value="all">Tous les types</option>
                <option value="port_paye">✅ Port Payé uniquement</option>
                <option value="port_du">📮 Port Dû uniquement</option>
                <option value="port_du_cheque">📋 Port Dû Chèque uniquement</option>
                <option value="port_en_compte_expediteur">📤 En Compte Exp uniquement</option>
                <option value="port_en_compte_destinataire">📥 En Compte Dest uniquement</option>
              </select>
            </div>

            {/* Ligne 4: Filtre Direction (Envoyées / Reçues) */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">
                🔄 Direction des expéditions
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDirectionFilter('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    directionFilter === 'all'
                      ? 'bg-green-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Toutes (envoyées + reçues)
                </button>
                <button
                  onClick={() => setDirectionFilter('sent')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    directionFilter === 'sent'
                      ? 'bg-orange-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📤 Créées / envoyées (nombre réel d'expéditions)
                </button>
                <button
                  onClick={() => setDirectionFilter('received')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    directionFilter === 'received'
                      ? 'bg-teal-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📥 Reçues (destination)
                </button>
              </div>
            </div>

            {/* Ligne 5: Filtre Ville d'origine (visible uniquement en mode "Reçues") */}
            {directionFilter === 'received' && (
              <div className="border-t border-gray-100 pt-4 bg-teal-50/30 p-4 rounded-lg">
                <label className="block text-xs font-bold text-teal-700 mb-3 uppercase tracking-wide">
                  📍 Ville d'origine (expéditions reçues de...)
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setOriginCityFilter('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                      originCityFilter === 'all'
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    Toutes les villes
                  </button>
                  {CITIES.map(city => (
                    <button
                      key={city}
                      onClick={() => setOriginCityFilter(city)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                        originCityFilter === city
                          ? 'bg-teal-700 text-white shadow-md'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bouton Reset et Tags actifs */}
            {hasActiveFilter && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <div className="flex flex-wrap gap-2 flex-1">
                  {datePreset !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                      <Calendar className="w-3 h-3" />
                      {datePreset === 'today' && "Aujourd'hui"}
                      {datePreset === 'week' && "7 derniers jours"}
                      {datePreset === 'month' && "Ce mois"}
                      {datePreset === 'operational' && operationalDay && `J.Opé ${operationalDay.toLocaleDateString('fr-MA')}`}
                      {datePreset === 'custom' && `${dateFrom} → ${dateTo}`}
                      <button
                        onClick={() => setDatePreset('all')}
                        className="hover:bg-purple-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {selectedCity !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                      <Building2 className="w-3 h-3" />
                      Ville: {selectedCity}
                      <button
                        onClick={() => setSelectedCity('all')}
                        className="hover:bg-blue-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {portTypeFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                      {portTypeFilter === 'port_paye' && '✅ Port Payé'}
                      {portTypeFilter === 'port_du' && '📮 Port Dû'}
                      {portTypeFilter === 'port_du_cheque' && '📋 Port Dû Chèque'}
                      {portTypeFilter === 'port_en_compte_expediteur' && '📤 En Compte Exp'}
                      {portTypeFilter === 'port_en_compte_destinataire' && '📥 En Compte Dest'}
                      <button
                        onClick={() => setPortTypeFilter('all')}
                        className="hover:bg-green-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {directionFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
                      {directionFilter === 'sent' && '📤 Créées / envoyées'}
                      {directionFilter === 'received' && '📥 Reçues'}
                      <button
                        onClick={() => setDirectionFilter('all')}
                        className="hover:bg-amber-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {directionFilter === 'received' && originCityFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg text-xs font-bold">
                      📍 Origine: {originCityFilter}
                      <button
                        onClick={() => setOriginCityFilter('all')}
                        className="hover:bg-teal-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedCity('all')
                    setPortTypeFilter('all')
                    setDirectionFilter('all')
                    setOriginCityFilter('all')
                    setDatePreset('all')
                  }}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-bold transition-colors flex items-center gap-2 text-xs"
                >
                  <X className="w-4 h-4" />
                  Tout réinitialiser
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 📅 Période appliquée (mêmes bornes pour le chargement et le filtrage) */}
      <div className="bg-gradient-to-r from-green-50 to-teal-50 border border-green-300 rounded-xl p-3 flex items-center gap-3 shadow-sm print:hidden">
        <Calendar className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-900">
            📅 {period.label} : {period.days} journée{period.days > 1 ? 's' : ''} d'opération
            {datePreset === 'all' && <span className="text-green-600 ml-1">(période par défaut)</span>}
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            🗓️ Du {periodRangeText} · archivés inclus
          </p>
        </div>
      </div>

      {/* ⏳ Chargement de la période : aucune donnée d'une autre période n'est affichée */}
      {loading && (
        <div className="bg-white rounded-2xl border border-purple-200 shadow-sm p-6 print:hidden">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 text-purple-600 animate-spin flex-shrink-0" />
            <p className="text-sm font-bold text-purple-900">Chargement de la période sélectionnée…</p>
          </div>
          <LoadProgress
            loading
            count={loadedCount}
            detail={dayProgress
              ? `jour par jour : ${dayProgress.label} (${dayProgress.done}/${dayProgress.total} jours) — ${period.label}`
              : `journée en cours (temps réel) — ${period.label}`}
            className="mt-3"
          />
        </div>
      )}

      {!loading && (
      <>
      {/* Carte résumé (filtré) */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-orange-200 rounded-xl p-6 shadow-lg print:bg-gray-50 print:rounded-none print:mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              📊 Résumé {hasActiveFilter ? '(Filtré)' : 'Global'}
            </h3>
            {/* 🗓️ "Période" est basée sur la journée d'opération (8h → 6h lendemain) : on
                l'affiche explicitement pour que le total corresponde bien à ce qui est montré,
                plutôt que de laisser croire à une plage calendaire simple (00:00 → 23:59). */}
            {(
              <p className="text-xs text-gray-500 mt-0.5">
                🗓️ {period.label} — journées d'opération : {periodRangeText}
              </p>
            )}
          </div>
          <span className="text-sm text-gray-600">
            {filteredStats.length} agence(s) affichée(s)
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-around gap-6">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-indigo-600" />
            <div>
              <div className="text-xs text-gray-600 font-medium uppercase tracking-wide">Expéditions</div>
              <div className="text-2xl font-black text-indigo-700">{uniqueExpeditionsCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">✅ Port Payé</div>
              <div className="text-xl font-black text-blue-700">{totauxFiltres.portPaye.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">💰 Port Dû (espèces)</div>
              <div className="text-xl font-black text-orange-700">{totauxFiltres.portDu.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">📋 Port Dû Chèque</div>
              <div className="text-xl font-black text-purple-700">{totauxFiltres.portDuCheque.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-orange-700"></div>
            <div>
              {/* La page Expéditions (Chef d'agence) affiche un seul "Total Port dû" qui
                  additionne espèces + chèque : cette carte donne la valeur équivalente pour
                  éviter toute impression d'écart entre les deux pages. */}
              <div className="text-xs text-gray-600 font-medium">💰 Port Dû total (= Chef d'agence)</div>
              <div className="text-xl font-black text-orange-900">{(totauxFiltres.portDu + totauxFiltres.portDuCheque).toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">📤 En Compte Exp</div>
              <div className="text-xl font-black text-indigo-700">{totauxFiltres.enCompteExp.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">📥 En Compte Dest</div>
              <div className="text-xl font-black text-pink-700">{totauxFiltres.enCompteDest.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <div>
              <div className="text-xs text-gray-600 font-medium uppercase">💵 Total Port</div>
              <div className="text-2xl font-black text-green-700">{totauxFiltres.totalPort.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau par agence */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-100 overflow-hidden print:rounded-none print:border print:border-gray-300">
        <HScrollArrows className="print:overflow-visible">
          <table className="w-full print:text-sm">
            <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white">
              <tr>
                <th className="px-6 py-4 text-left font-bold whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Agence (Ville)
                  </div>
                </th>
                <th className="px-6 py-4 text-center font-bold whitespace-nowrap">
                  📋 Expéditions
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-blue-600/30">
                  ✅ Port Payé
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-orange-600/30">
                  💰 Port Dû
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-purple-600/30">
                  📋 Port Dû Chèque
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-green-600/30">
                  💵 Total (Payé + Dû + Chèque)
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-indigo-600/30 print:hidden">
                  📤 En Compte Exp
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-pink-600/30 print:hidden">
                  📥 En Compte Dest
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-green-600/30 print:hidden">
                  💵 Total Port
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((stat, idx) => (
                <tr
                  key={stat.city}
                  className={`border-b border-gray-100 transition-all hover:bg-purple-50 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gradient-to-r from-blue-50/30 via-purple-50/20 to-pink-50/30'
                  }`}
                >
                  <td className="px-6 py-4 font-bold text-gray-900">
                    <div className="flex items-center gap-2">
                      📍 <span className="text-lg">{stat.city}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-base">
                      {stat.nbExpeditions}
                    </span>
                    {stat.nbExpeditions > stat.nbUnique && (
                      <div className="text-[10px] text-gray-500 mt-1" title="Expéditions locales comptées 2 fois (1 envoyée + 1 reçue)">
                        {stat.nbUnique} unique{stat.nbUnique > 1 ? 's' : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-blue-50/50">
                    <span className="text-blue-700 text-lg">
                      {stat.portPaye.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-orange-50/50">
                    <span className="text-orange-700 text-lg">
                      {stat.portDu.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-purple-50/50">
                    <span className="text-purple-700 text-lg">
                      {stat.portDuCheque.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-green-50/50">
                    <span className="text-green-700 text-xl">
                      {(stat.portPaye + stat.portDu + stat.portDuCheque).toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-indigo-50/50 print:hidden">
                    <span className="text-indigo-700 text-lg">
                      {stat.enCompteExp.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-pink-50/50 print:hidden">
                    <span className="text-pink-700 text-lg">
                      {stat.enCompteDest.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-green-50/50 print:hidden">
                    <span className="text-green-700 text-xl">
                      {stat.totalPort.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                </tr>
              ))}
              {/* Ligne totaux */}
              {filteredStats.length > 0 && (
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-black border-t-2 border-gray-300">
                  <td className="px-6 py-5 text-gray-900 text-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                      TOTAL {hasActiveFilter ? '(FILTRÉ)' : 'GÉNÉRAL'}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className="inline-flex items-center justify-center px-4 py-2 bg-indigo-200 text-indigo-900 rounded-lg font-black text-lg">
                      {totauxFiltres.nbExpeditions}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-blue-100">
                    <span className="text-blue-900 text-xl font-black">
                      {totauxFiltres.portPaye.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-orange-100">
                    <span className="text-orange-900 text-xl font-black">
                      {totauxFiltres.portDu.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-purple-100">
                    <span className="text-purple-900 text-xl font-black">
                      {totauxFiltres.portDuCheque.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-green-100">
                    <span className="text-green-900 text-2xl font-black">
                      {(totauxFiltres.portPaye + totauxFiltres.portDu + totauxFiltres.portDuCheque).toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-indigo-100 print:hidden">
                    <span className="text-indigo-900 text-xl font-black">
                      {totauxFiltres.enCompteExp.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-pink-100 print:hidden">
                    <span className="text-pink-900 text-xl font-black">
                      {totauxFiltres.enCompteDest.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-green-100 print:hidden">
                    <span className="text-green-900 text-2xl font-black">
                      {(totauxFiltres.portPaye + totauxFiltres.portDu + totauxFiltres.portDuCheque + totauxFiltres.enCompteExp + totauxFiltres.enCompteDest).toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </HScrollArrows>
      </div>

      {/* Message si aucun résultat */}
      {filteredStats.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilter
              ? 'Aucune agence ne correspond aux filtres sélectionnés'
              : 'Aucune donnée de port disponible'
            }
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {hasActiveFilter
              ? 'Essayez de modifier vos critères de recherche'
              : 'Les statistiques apparaîtront ici une fois que des colis seront créés'
            }
          </p>
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSelectedCity('all')
                setPortTypeFilter('all')
                setDirectionFilter('all')
                setOriginCityFilter('all')
                setDatePreset('all')
              }}
              className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}
      </>
      )}
        </div>
      )}
      </div>

      {/* Modale Caisse Agence en plein écran (90%) */}
      {showCaisseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] h-[90%] overflow-hidden flex flex-col">
            {/* En-tête de la modale */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Eye className="w-6 h-6" />
                <h2 className="text-xl font-bold">Caisse Agence - Détails</h2>
              </div>
              <button
                onClick={() => setShowCaisseModal(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                title="Fermer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Contenu de la modale */}
            <div className="flex-1 overflow-hidden">
              <AdminCaisseView onClose={() => setShowCaisseModal(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
