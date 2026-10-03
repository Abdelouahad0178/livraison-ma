import { useState, useEffect, useMemo, useRef, useDeferredValue, startTransition } from 'react'
import PendingBadge from '../components/PendingBadge'
import { makeFacturierSearchMatcher } from '../utils/parcelSearch'
import { subscribeAllParcels, getParcelsPage, getParcelsByCreatedAtRange } from '../firebase/parcels'
import { Search, Printer, FileSpreadsheet, Edit2, Check, X, FileText, Database, Download, MapPin, User, Receipt, RefreshCw } from 'lucide-react'
import { CITIES, STATUSES } from '../firebase/constants'
import * as XLSX from 'xlsx'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { printParcelTicket } from '../utils/printParcelTicket'
import { printClientInvoice } from '../utils/printClientInvoice'
import { filterByDate, parcelDate } from '../utils/dateFilter'
import { getCurrentOperationalDay } from '../config/operationalDay'
import { buildDaySlices } from '../utils/daySlices'
import DateFilter from './agent/DateFilter'
import LoadProgress from '../components/LoadProgress'
import type { DateFilterPreset } from '../types'
import {
  subscribeAllInvoices, createInvoice, markParcelsAsInvoiced,
  type Invoice, type InvoiceItem,
} from '../firebase/invoices'
import { subscribeClients } from '../firebase/clients'
import { isMixedCod, codPartsBreakdown, codPartsDetailLabel } from '../utils/codParts'
import { normName, billingAgencyOf, isBilledByAgency, isCompteExpediteurType, isPortEnCompteType } from '../utils/billingAgency'

// ── Helpers ──────────────────────────────────────────────────────────────────

type PortFilter = 'all' | 'port_paye' | 'port_du' | 'port_du_cheque' | 'port_en_compte_all'
  | 'port_en_compte' | 'port_en_compte_expediteur' | 'port_en_compte_destinataire'
type ClientRole = 'all' | 'expediteur' | 'destinataire'
type BillingFilter = 'all' | 'non_facturees' | 'facturees'

const PORT_LABELS: Record<string, string> = {
  port_paye: 'Port payé',
  port_du: 'Port dû',
  port_du_cheque: 'Port dû (chèque)',
  port_en_compte: 'Port en compte',
  port_en_compte_expediteur: 'Port en compte (exp.)',
  port_en_compte_destinataire: 'Port en compte (dest.)',
}
const portLabel = (t?: string) => (t && PORT_LABELS[t]) || '-'
const isPortDu = (t?: string) => t === 'port_du' || t === 'port_du_cheque'
const isPortEnCompte = isPortEnCompteType
const portBadgeCls = (t?: string) =>
  isPortDu(t) ? 'bg-orange-100 text-orange-700'
    : isPortEnCompte(t) ? 'bg-purple-100 text-purple-700'
      : t === 'port_paye' ? 'bg-blue-100 text-blue-700'
        : 'bg-gray-100 text-gray-600'

const norm = normName

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fr = (s: string) => (s ? s.split('-').reverse().join('/') : '')
const addDaysStr = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d)
}
const opDateStr = (p: any) => {
  const d = parcelDate(p)
  return d.getTime() > 0 ? ymd(d) : ''
}
const nbColisOf = (p: any) => Number(p.nbColis || p.numberOfParcels || 1) || 1
const priceOf = (p: any) => Number(p.price) || 0
const codOf = (p: any) => Number(p.codAmount) || 0

// Noms du « client » d'une expédition selon le rôle choisi
const clientNamesOf = (p: any, role: ClientRole): string[] => {
  const exp = [p.clientName, p.sender?.name]
  const dest = [p.receiver?.name]
  const list = role === 'expediteur' ? exp : role === 'destinataire' ? dest : [...exp, ...dest]
  return list.filter(Boolean).map(String)
}

// Période (en journées d'opération) correspondant au filtre de date
function computePeriod(preset: DateFilterPreset, from: string, to: string, opDay: Date | null): { from: string; to: string } | null {
  const todayOp = ymd(getCurrentOperationalDay())
  switch (preset) {
    case 'today': return { from: todayOp, to: todayOp }
    case 'week': return { from: addDaysStr(todayOp, -6), to: todayOp }
    case 'month': return { from: todayOp.slice(0, 8) + '01', to: todayOp }
    case 'operational': return opDay ? { from: ymd(opDay), to: ymd(opDay) } : null
    case 'custom': return from ? { from, to: to || todayOp } : null
    default: return null
  }
}

function periodLabelOf(preset: DateFilterPreset, period: { from: string; to: string } | null): string {
  if (!period) return 'Toutes les dates'
  if (preset === 'month') {
    const d = new Date(period.from + 'T12:00:00')
    const month = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    return `Mois de ${month} (du ${fr(period.from)} au ${fr(period.to)})`
  }
  if (period.from === period.to) return `Journée du ${fr(period.from)}`
  return `Du ${fr(period.from)} au ${fr(period.to)}`
}

const stripUndefined = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

// ── Composant ────────────────────────────────────────────────────────────────

export default function FacturierExpeditionsTab({ profileCity, userName }: { profileCity?: string; userName?: string }) {
  const PAGE_SIZE = 300
  // Données « Toutes les dates » (temps réel + chargement manuel)
  const [liveParcels, setLiveParcels] = useState<any[]>([])
  const [moreParcels, setMoreParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadAllProgress, setLoadAllProgress] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Données chargées pour la période sélectionnée
  const [rangeParcels, setRangeParcels] = useState<any[]>([])
  const [rangeLoading, setRangeLoading] = useState(false)
  const [rangeLoadedCount, setRangeLoadedCount] = useState(0) // compteur visible pendant le chargement de la période
  const [rangeReload, setRangeReload] = useState(0)
  const rangeReqRef = useRef(0)
  // Progression du chargement jour par jour (null hors chargement)
  const [rangeDayProgress, setRangeDayProgress] = useState<{ done: number; total: number; label: string } | null>(null)

  // Filtres
  const [search, setSearch] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [clientRole, setClientRole] = useState<ClientRole>('all')
  const [cityFilter, setCityFilter] = useState('Toutes')
  const [portTypeFilter, setPortTypeFilter] = useState<PortFilter>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [billingFilter, setBillingFilter] = useState<BillingFilter>('all')
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('week') // démarre sur 7 jours
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [operationalDay, setOperationalDay] = useState<Date | null>(() => getCurrentOperationalDay())

  const lastPageDocRef = useRef<any>(null)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editingPrice, setEditingPrice] = useState<string>('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [displayLimit, setDisplayLimit] = useState(500)

  // Factures existantes + clients
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<any[]>([])
  // Sélection : ids dont l'état par défaut est inversé (non facturée → exclue, facturée → incluse)
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)

  // ── Chargement « Toutes les dates » ────────────────────────────────────────
  const parcels = useMemo(() => {
    const map = new Map()
    moreParcels.forEach((p: any) => map.set(p.id, p))
    liveParcels.forEach((p: any) => map.set(p.id, p))
    return [...map.values()]
  }, [liveParcels, moreParcels])

  useEffect(() => {
    const unsubscribe = subscribeAllParcels(
      (docs: any[], lastSnap: any) => {
        startTransition(() => setLiveParcels(docs))
        setLoading(false)
        setError(null)
        if (!lastPageDocRef.current) lastPageDocRef.current = lastSnap
        if (docs.length < PAGE_SIZE) setHasMore(false)
      },
      (err) => {
        console.error('Facturier - Erreur:', err)
        setError(`Erreur de chargement: ${err?.message || 'Erreur inconnue'}`)
        setLoading(false)
      },
      0,
      PAGE_SIZE
    )
    return unsubscribe
  }, [])

  useEffect(() => {
    let unsubInv: (() => void) | undefined
    let unsubCli: (() => void) | undefined
    try { unsubInv = subscribeAllInvoices(setInvoices) } catch (e) { console.warn('Facturier - factures:', e) }
    try { unsubCli = subscribeClients(setClients, (e) => console.warn('Facturier - clients:', e)) } catch (e) { console.warn(e) }
    return () => { unsubInv?.(); unsubCli?.() }
  }, [])

  const loadMoreParcels = async () => {
    if (!hasMore || loadingMore || loadingAll || !lastPageDocRef.current) return
    setLoadingMore(true)
    try {
      const page = await getParcelsPage(lastPageDocRef.current, PAGE_SIZE)
      const pageDocs = page.docs
      startTransition(() => setMoreParcels(prev => {
        const map = new Map()
        prev.forEach((p: any) => map.set(p.id, p))
        pageDocs.forEach((p: any) => map.set(p.id, p))
        return [...map.values()]
      }))
      if (page.lastDocSnap) lastPageDocRef.current = page.lastDocSnap
      if (!page.hasMore) setHasMore(false)
    } catch (err) {
      console.error('Erreur chargement supplémentaire:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const stopLoadingRef = useRef(false)
  const stopLoading = () => {
    stopLoadingRef.current = true
    setLoadingAll(false)
    setLoadingMore(false)
  }

  const loadAllParcels = async () => {
    if (!hasMore || loadingAll || loadingMore || !lastPageDocRef.current) return
    stopLoadingRef.current = false
    setLoadingAll(true)
    setLoadAllProgress(0)
    try {
      let cursor = lastPageDocRef.current
      let more = true
      let loaded = 0
      let safety = 0
      while (more && cursor && safety < 500 && !stopLoadingRef.current) {
        const page = await getParcelsPage(cursor, 800)
        const pageDocs = page.docs
        loaded += pageDocs.length
        setLoadAllProgress(loaded)
        startTransition(() => setMoreParcels(prev => {
          const map = new Map()
          prev.forEach((p: any) => map.set(p.id, p))
          pageDocs.forEach((p: any) => map.set(p.id, p))
          return [...map.values()]
        }))
        cursor = page.lastDocSnap
        more = page.hasMore && !!page.lastDocSnap
        safety += 1
      }
      if (cursor) lastPageDocRef.current = cursor
      if (!more || !cursor) setHasMore(false)
    } catch (err) {
      console.error('Erreur chargement complet:', err)
    } finally {
      setLoadingAll(false)
      stopLoadingRef.current = false
    }
  }

  // ── Chargement par période (toutes les expéditions de la période) ──────────
  const period = useMemo(
    () => computePeriod(datePreset, dateFrom, dateTo, operationalDay),
    [datePreset, dateFrom, dateTo, operationalDay]
  )
  const rangeMode = period !== null
  const periodLabel = useMemo(() => periodLabelOf(datePreset, period), [datePreset, period])

  useEffect(() => {
    if (!period) { setRangeParcels([]); setRangeLoading(false); return }
    const reqId = ++rangeReqRef.current
    // Marge d'un jour de chaque côté : la journée d'opération (8h → 6h lendemain) et les colis
    // datés via workDate/operationDate sont ensuite filtrés précisément par filterByDate.
    const start = new Date(addDaysStr(period.from, -1) + 'T00:00:00')
    const end = new Date(addDaysStr(period.to, 2) + 'T00:00:00')
    // 📅 Chargement JOUR PAR JOUR (journée la plus récente d'abord) : chaque journée est ajoutée
    // à la liste dès qu'elle est reçue → tableau et totaux se complètent progressivement.
    // Les tranches couvrent exactement [start, end] (voir buildDaySlices) : totaux finaux identiques.
    const slices = buildDaySlices(start, end, period.from, period.to)
    setRangeLoading(true)
    setRangeLoadedCount(0)
    startTransition(() => setRangeParcels([]))
    setRangeDayProgress({ done: 0, total: slices.length, label: slices[0]?.label || '' })
    ;(async () => {
      let loaded = 0
      // ⚡ Journées ajoutées par LOTS (1re tout de suite, puis au plus une mise à jour / 800 ms, et
      // toujours à la fin) : chaque ajout relançait filtres, suggestions clients et totaux sur toute
      // la période. Le compteur de progression reste mis à jour à chaque journée.
      let pending: any[] = []
      let lastFlush = 0
      let shown = 0 // nombre d'expéditions déjà envoyées à l'affichage
      const flush = () => {
        if (!pending.length) return
        const docs = pending
        pending = []
        lastFlush = Date.now()
        shown += docs.length
        startTransition(() => setRangeParcels(prev => {
          const map = new Map<string, any>()
          prev.forEach(p => map.set(p.id, p))
          docs.forEach(p => map.set(p.id, p))
          return [...map.values()]
        }))
      }
      try {
        // ⚡ 12 journées lues EN PARALLÈLE : résultat complet ~5 fois plus rapide
        let nextIdx = 0, doneDays = 0
        const worker = async () => {
          while (nextIdx < slices.length) {
            const s = slices[nextIdx++]
            if (reqId !== rangeReqRef.current) return
            const docs = await getParcelsByCreatedAtRange(s.start, s.end, 1000, undefined, !s.endInclusive)
            if (reqId !== rangeReqRef.current) return
            loaded += docs.length
            doneDays += 1
            setRangeLoadedCount(loaded)
            setRangeDayProgress({ done: doneDays, total: slices.length, label: s.label })
            if (docs.length) {
            for (const d of docs) pending.push(d)
            // Intervalle ADAPTATIF : plus la liste est grande, plus chaque mise à jour coûte (filtres,
            // suggestions, totaux, tableau) → on espace les ajouts (0,8 s au début → 4 s au-delà de ~13 000).
            // ⚡ Affichage progressif seulement pour les ~3 000 premières expéditions (le tableau est
            // rempli) ; au-delà, chaque mise à jour recalcule filtres/suggestions/totaux sur une liste
            // énorme et fige la page → le reste est gardé en réserve et ajouté EN UNE FOIS à la fin
            // (le bandeau de progression, lui, continue d'avancer jour par jour).
            if (shown < 3000 && Date.now() - lastFlush >= 800) flush()
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(12, slices.length) }, worker)) // 12 journées en parallèle
        if (reqId !== rangeReqRef.current) return
        flush()
        if (reqId === rangeReqRef.current) setError(null)
      } catch (err: any) {
        if (reqId !== rangeReqRef.current) return
        console.error('Facturier - Erreur chargement période:', err)
        setError(`Erreur de chargement de la période: ${err?.message || 'Erreur inconnue'}`)
      } finally {
        if (reqId === rangeReqRef.current) { flush(); setRangeLoading(false); setRangeDayProgress(null) }
      }
    })()
  }, [period?.from, period?.to, rangeReload]) // eslint-disable-line react-hooks/exhaustive-deps

  // 🔄 Mises à jour de colis depuis d'autres pages
  useEffect(() => {
    const handleParcelUpdate = (event: CustomEvent) => {
      const { parcelId, data } = event.detail
      const upd = (prev: any[]) => prev.map(p => (p.id === parcelId ? { ...p, ...data } : p))
      setLiveParcels(upd)
      setMoreParcels(upd)
      setRangeParcels(upd)
    }
    window.addEventListener('parcelUpdated', handleParcelUpdate as EventListener)
    return () => window.removeEventListener('parcelUpdated', handleParcelUpdate as EventListener)
  }, [])

  // ── Factures existantes : colis déjà facturés ──────────────────────────────
  const invoicedMap = useMemo(() => {
    const m = new Map<string, string>()
    invoices.forEach(inv => {
      if (inv.status === 'cancelled') return
      ;(inv.items || []).forEach(it => { if (it.parcelId) m.set(it.parcelId, inv.invoiceNumber) })
    })
    return m
  }, [invoices])
  const invoiceOf = (p: any): string | null =>
    invoicedMap.get(p.id) || (p.invoiced === true ? 'Facturée' : null)

  // ── Filtrage ───────────────────────────────────────────────────────────────
  // 1) Période + filtres généraux (sans le client) → sert aussi aux suggestions de clients
  // ⚡ La saisie reste fluide : les filtres suivent la frappe en priorité basse (même résultat final).
  const deferredSearch = useDeferredValue(search)
  const deferredClientQuery = useDeferredValue(clientQuery)
  // ⚡ RÉACTIVITÉ DES BOUTONS : les filtres (période, ville, type de port, statut, facturation, rôle
  // client) restent URGENTS — le bouton cliqué s'allume tout de suite et le chargement de la
  // nouvelle période démarre aussitôt — mais le filtrage/les suggestions/les totaux lisent leur copie
  // DIFFÉRÉE, recalculée en arrière-plan de façon interruptible. Mêmes résultats.
  const urgentFilters = useMemo(
    () => ({ rangeMode, datePreset, dateFrom, dateTo, operationalDay, cityFilter, portTypeFilter, statusFilter, billingFilter, clientRole }),
    [rangeMode, datePreset, dateFrom, dateTo, operationalDay, cityFilter, portTypeFilter, statusFilter, billingFilter, clientRole]
  )
  const deferredFilters = useDeferredValue(urgentFilters)
  const baseFiltered = useMemo(() => {
    const { rangeMode, datePreset, dateFrom, dateTo, operationalDay, cityFilter, portTypeFilter, statusFilter, billingFilter } = deferredFilters
    const source = rangeMode ? rangeParcels : parcels
    const byDate = filterByDate(source, datePreset, dateFrom, dateTo, parcelDate, operationalDay ?? undefined)
    const term = norm(deferredSearch)
    // Champs normalisés mis en cache par expédition (utils/parcelSearch) — même règle qu'avant
    const searchMatch = term ? makeFacturierSearchMatcher(deferredSearch) : null
    return byDate.filter((p: any) => {
      // Agence qui facture : l'agence de DESTINATION pour un port en compte destinataire (le client
      // destinataire paie là où il reçoit, comme sur la page Chef d'agence), sinon l'agence d'origine.
      // Règle partagée avec la page Chef d'agence : utils/billingAgency
      if (profileCity && !isBilledByAgency(p, profileCity)) return false
      if (cityFilter !== 'Toutes' && !isBilledByAgency(p, cityFilter)) return false

      if (portTypeFilter === 'port_en_compte_all') {
        if (!isPortEnCompte(p.portType)) return false
      } else if (portTypeFilter === 'port_en_compte_expediteur') {
        // Ancien type générique 'port_en_compte' = compte expéditeur (même convention que la page Chef d'agence)
        if (!isCompteExpediteurType(p.portType)) return false
      } else if (portTypeFilter !== 'all' && p.portType !== portTypeFilter) return false

      if (statusFilter !== 'all' && p.status !== statusFilter) return false

      if (billingFilter !== 'all') {
        const inv = !!invoiceOf(p)
        if (billingFilter === 'facturees' && !inv) return false
        if (billingFilter === 'non_facturees' && inv) return false
      }

      if (searchMatch && !searchMatch(p)) return false
      return true
    })
  }, [deferredFilters, rangeParcels, parcels, deferredSearch, profileCity, invoicedMap]) // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Suggestions de clients (noms trouvés sur la période + fiche clients)
  const clientOptions = useMemo(() => {
    const { clientRole } = deferredFilters
    const counts = new Map<string, { name: string; count: number }>()
    baseFiltered.forEach((p: any) => {
      new Set(clientNamesOf(p, clientRole).map(n => n.trim())).forEach(name => {
        const k = norm(name)
        if (!k) return
        const cur = counts.get(k)
        if (cur) cur.count++
        else counts.set(k, { name, count: 1 })
      })
    })
    clients.forEach((c: any) => {
      const k = norm(c.name)
      if (k && !counts.has(k)) counts.set(k, { name: String(c.name).trim(), count: 0 })
    })
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [baseFiltered, clients, deferredFilters])
  const clientOptionKeys = useMemo(() => new Set(clientOptions.map(o => norm(o.name))), [clientOptions])

  // 3) Filtre client : correspondance exacte si le nom vient de la liste, sinon « contient »
  const clientKey = norm(clientQuery)
  const clientExact = !!clientKey && clientOptionKeys.has(clientKey)
  const fClientKey = norm(deferredClientQuery)
  const fClientExact = !!fClientKey && clientOptionKeys.has(fClientKey)
  const filteredParcels = useMemo(() => {
    const clientKey = fClientKey, clientExact = fClientExact
    const { clientRole } = deferredFilters
    if (!clientKey) {
      // Sans client : le rôle garde son sens historique (qui paie le port en compte)
      if (clientRole === 'expediteur') return baseFiltered.filter((p: any) => p.portType !== 'port_en_compte_destinataire')
      if (clientRole === 'destinataire') return baseFiltered.filter((p: any) => p.portType === 'port_en_compte_destinataire')
      return baseFiltered
    }
    return baseFiltered.filter((p: any) =>
      clientNamesOf(p, clientRole).some(n => (clientExact ? norm(n) === clientKey : norm(n).includes(clientKey)))
    )
  }, [baseFiltered, fClientKey, fClientExact, deferredFilters])

  // ⚡ Le tableau (jusqu'à 500 lignes) se redessine en priorité BASSE : les clics sur les filtres
  // et la saisie restent fluides pendant le chargement ; même contenu une fois à jour.
  const tableParcels = useDeferredValue(filteredParcels)
  // ⏳ Liste/totaux pas encore à jour du dernier filtre cliqué ou saisi
  const filtersPending = deferredFilters !== urgentFilters || deferredSearch !== search
    || deferredClientQuery !== clientQuery || tableParcels !== filteredParcels

  // Réinitialisations quand les filtres changent
  useEffect(() => {
    setDisplayLimit(500)
    setToggled(new Set())
  }, [search, clientQuery, clientRole, cityFilter, portTypeFilter, statusFilter, billingFilter, datePreset, dateFrom, dateTo, operationalDay])

  // ── Sélection pour la facture ──────────────────────────────────────────────
  const isIncluded = (p: any) => (invoiceOf(p) ? toggled.has(p.id) : !toggled.has(p.id))
  const toggleOne = (id: string) => setToggled(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const selectedParcels = useMemo(
    () => filteredParcels.filter(isIncluded),
    [filteredParcels, toggled, invoicedMap] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const selectAll = () => setToggled(new Set(filteredParcels.filter((p: any) => invoiceOf(p)).map((p: any) => p.id)))
  const selectNone = () => setToggled(new Set(filteredParcels.filter((p: any) => !invoiceOf(p)).map((p: any) => p.id)))
  const allSelected = filteredParcels.length > 0 && selectedParcels.length === filteredParcels.length

  // ── Statistiques ──────────────────────────────────────────────────────────
  const computeTotals = (list: any[]) => {
    let portPaye = 0, portDu = 0, portEnCompte = 0, cod = 0, nbColis = 0, total = 0
    let portPayeCount = 0, portDuCount = 0, portEnCompteCount = 0
    list.forEach(p => {
      const price = priceOf(p)
      total += price
      cod += codOf(p)
      nbColis += nbColisOf(p)
      if (isPortDu(p.portType)) { portDu += price; portDuCount++ }
      else if (isPortEnCompte(p.portType)) { portEnCompte += price; portEnCompteCount++ }
      else if (p.portType === 'port_paye') { portPaye += price; portPayeCount++ }
    })
    return { count: list.length, nbColis, portPaye, portDu, portEnCompte, cod, total, portPayeCount, portDuCount, portEnCompteCount }
  }

  const stats = useMemo(() => {
    const t = computeTotals(filteredParcels)
    const byAgency = filteredParcels.reduce((acc: any, p: any) => {
      const agency = billingAgencyOf(p) || 'Non défini'
      if (!acc[agency]) acc[agency] = { count: 0, portDu: 0, portPaye: 0, portEnCompte: 0, totalAmount: 0 }
      acc[agency].count++
      acc[agency].totalAmount += priceOf(p)
      if (isPortDu(p.portType)) acc[agency].portDu++
      else if (isPortEnCompte(p.portType)) acc[agency].portEnCompte++
      else if (p.portType === 'port_paye') acc[agency].portPaye++
      return acc
    }, {})
    return { ...t, byAgency }
  }, [filteredParcels]) // eslint-disable-line react-hooks/exhaustive-deps

  const selTotals = useMemo(() => computeTotals(selectedParcels), [selectedParcels]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modification du prix ──────────────────────────────────────────────────
  async function handleSavePrice(parcelId: string, newPrice: number) {
    if (savingPrice) return
    setSavingPrice(true)
    try {
      const upd = (prev: any[]) => prev.map(p => (p.id === parcelId ? { ...p, price: newPrice } : p))
      setLiveParcels(upd)
      setMoreParcels(upd)
      setRangeParcels(upd)
      await updateDoc(doc(db, 'parcels', parcelId), {
        price: newPrice,
        priceModifiedAt: new Date().toISOString(),
      })
      window.dispatchEvent(new CustomEvent('parcelPriceUpdated', {
        detail: { parcelId, newPrice, timestamp: new Date().toISOString() },
      }))
      setEditingPriceId(null)
      setEditingPrice('')
      setSuccessMessage(`Prix mis à jour: ${newPrice.toLocaleString()} DH`)
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Erreur mise à jour prix:', err)
      alert('Erreur lors de la mise à jour du prix')
    } finally {
      setSavingPrice(false)
    }
  }

  // ── Export Excel ──────────────────────────────────────────────────────────
  function exportToExcel() {
    const excelData: any[] = filteredParcels.map((parcel: any) => ({
      'N° EXP (NIC)': parcel.sender?.nic || parcel.trackingId || '-',
      'Client': parcel.clientName || '-',
      'Expéditeur': parcel.sender?.name || '-',
      'Destinataire': parcel.receiver?.name || '-',
      'Agence': parcel.sender?.city || parcel.originCity || '-',
      'Ville Dest.': parcel.receiver?.city || parcel.recipientCity || '-',
      'Nb Colis': nbColisOf(parcel),
      'Type Port': portLabel(parcel.portType),
      'Montant Port (DH)': priceOf(parcel),
      'CRBT (DH)': codOf(parcel),
      ...(isMixedCod(parcel) ? { 'CRBT détail': codPartsDetailLabel(parcel) } : {}),
      'Date': fr(opDateStr(parcel)) || '-',
      'Statut': parcel.status || '-',
      'Facture': invoiceOf(parcel) || '',
    }))
    excelData.push({
      'N° EXP (NIC)': 'TOTAL',
      'Agence': `${filteredParcels.length} expéditions`,
      'Nb Colis': stats.nbColis,
      'Montant Port (DH)': stats.total,
      'CRBT (DH)': stats.cod,
    })
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Facturier')
    const parts = ['Facturier']
    if (clientQuery.trim()) parts.push(clientQuery.trim().replace(/[^\p{L}\p{N}]+/gu, '_'))
    if (period) parts.push(period.from === period.to ? period.from : `${period.from}_${period.to}`)
    else parts.push(ymd(new Date()))
    if (cityFilter !== 'Toutes') parts.push(cityFilter)
    XLSX.writeFile(wb, `${parts.join('_')}.xlsx`)
  }

  const resetFilters = () => {
    setSearch('')
    setClientQuery('')
    setClientRole('all')
    setCityFilter('Toutes')
    setPortTypeFilter('all')
    setStatusFilter('all')
    setBillingFilter('all')
    setDatePreset('month')
    setDateFrom('')
    setDateTo('')
    setOperationalDay(getCurrentOperationalDay())
  }

  const isLoadingList = rangeMode ? rangeLoading : loading
  const selectCls = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500 bg-white'

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 text-green-700 font-semibold">{successMessage}</div>
          <button onClick={() => setSuccessMessage(null)} className="text-green-500 hover:text-green-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-red-700 font-semibold mb-1">Erreur de chargement</div>
          <div className="text-red-600 text-sm">{error}</div>
          <div className="text-red-500 text-xs mt-2">Vérifiez que votre compte a bien le rôle "facturier" dans Firestore.</div>
        </div>
      )}

      {/* ── Filtres ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
          <Receipt className="w-4 h-4 text-cyan-600" />
          Facturation client — choisissez la période et le client
        </div>

        <DateFilter
          value={datePreset}
          onChange={setDatePreset}
          from={dateFrom}
          onFromChange={setDateFrom}
          to={dateTo}
          onToChange={setDateTo}
          operationalMode
          operationalDay={operationalDay}
          onOperationalDayChange={setOperationalDay}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-600" />
            <input
              type="text"
              list="facturier-clients"
              placeholder="Nom du client (choisir dans la liste ou saisir une partie du nom)"
              value={clientQuery}
              onChange={e => setClientQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 border-2 border-cyan-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-cyan-500"
            />
            {clientQuery && (
              <button onClick={() => setClientQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="Effacer">
                <X className="w-4 h-4" />
              </button>
            )}
            <datalist id="facturier-clients">
              {clientOptions.slice(0, 400).map(o => (
                <option key={norm(o.name)} value={o.name}>{o.count > 0 ? `${o.count} exp. sur la période` : 'fiche client'}</option>
              ))}
            </datalist>
          </div>
          <select value={clientRole} onChange={e => setClientRole(e.target.value as ClientRole)} className={selectCls}>
            <option value="all">Client : expéditeur ou destinataire</option>
            <option value="expediteur">📤 Client = Expéditeur</option>
            <option value="destinataire">📥 Client = Destinataire</option>
          </select>
        </div>
        {clientKey && (
          <div className="text-xs text-gray-500 -mt-1 pl-1">
            {clientExact ? 'Correspondance exacte sur le nom du client.' : 'Recherche partielle sur le nom (choisissez un nom dans la liste pour une correspondance exacte).'}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="N° EXP, NIC, téléphone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          {!profileCity && (
            <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className={selectCls}>
              <option value="Toutes">Toutes les agences</option>
              {CITIES.map(city => <option key={city} value={city}>🏢 {city}</option>)}
            </select>
          )}
          <select value={portTypeFilter} onChange={e => setPortTypeFilter(e.target.value as PortFilter)} className={selectCls}>
            <option value="all">Tous les ports</option>
            <option value="port_paye">✅ Port payé</option>
            <option value="port_du">💰 Port dû</option>
            <option value="port_du_cheque">💰 Port dû (chèque)</option>
            <option value="port_en_compte_all">📒 Port en compte (tous)</option>
            <option value="port_en_compte_expediteur">📤 Port en compte (expéditeur)</option>
            <option value="port_en_compte_destinataire">📥 Port en compte (destinataire)</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="all">Tous les statuts</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={billingFilter} onChange={e => setBillingFilter(e.target.value as BillingFilter)} className={selectCls}>
            <option value="all">Facturées et non facturées</option>
            <option value="non_facturees">Non facturées</option>
            <option value="facturees">Déjà facturées</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={resetFilters} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition">
            Réinitialiser
          </button>
          <button onClick={exportToExcel} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          <button
            onClick={() => printFacturation(filteredParcels, stats, { cityFilter, portTypeFilter, clientRole, periodLabel, search, clientQuery, statusFilter })}
            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm transition flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Imprimer la liste
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowInvoiceModal(true)}
            disabled={!clientKey || selectedParcels.length === 0}
            title={!clientKey ? "Saisissez d'abord le nom du client" : selectedParcels.length === 0 ? 'Aucune expédition sélectionnée' : ''}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition flex items-center gap-2 shadow-sm"
          >
            <Receipt className="w-4 h-4" /> Créer la facture client
          </button>
        </div>
      </div>

      {/* ── Récap facture en préparation ── */}
      {clientKey && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <div className="text-xs text-indigo-600 uppercase font-semibold">Facture pour</div>
              <div className="text-lg font-black text-indigo-900">{clientQuery.trim()}</div>
              <div className="text-xs text-indigo-700">{periodLabel}</div>
            </div>
            <div className="text-sm text-indigo-900">
              <b>{selTotals.count}</b> / {filteredParcels.length} expédition(s) sélectionnée(s) — <b>{selTotals.nbColis}</b> colis
            </div>
            <div className="text-sm text-indigo-900 flex flex-wrap gap-x-4">
              {selTotals.portPaye > 0 && <span>Port payé : <b>{selTotals.portPaye.toLocaleString()} DH</b></span>}
              {selTotals.portDu > 0 && <span>Port dû : <b>{selTotals.portDu.toLocaleString()} DH</b></span>}
              {selTotals.portEnCompte > 0 && <span>Port en compte : <b>{selTotals.portEnCompte.toLocaleString()} DH</b></span>}
              {selTotals.cod > 0 && <span>CRBT : <b>{selTotals.cod.toLocaleString()} DH</b></span>}
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-indigo-600 uppercase font-semibold">Total à facturer</div>
              <div className="text-2xl font-black text-indigo-900">{selTotals.total.toLocaleString()} DH</div>
            </div>
          </div>
          {filteredParcels.some((p: any) => invoiceOf(p)) && (
            <div className="text-xs text-amber-700 mt-2">
              Les expéditions déjà facturées sont décochées par défaut (cochez-les pour les refacturer).
            </div>
          )}
        </div>
      )}

      {/* ── Statistiques ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Total expéditions</div>
          <div className="text-2xl font-bold text-gray-800">{stats.count}</div>
          <div className="text-sm text-gray-500 mt-1">{stats.nbColis} colis</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-200">
          <div className="text-xs text-blue-700 uppercase font-semibold mb-1">Port payé</div>
          <div className="text-2xl font-bold text-blue-800">{stats.portPayeCount}</div>
          <div className="text-sm text-blue-600 mt-1">{stats.portPaye.toLocaleString()} DH</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 shadow-sm border border-orange-200">
          <div className="text-xs text-orange-700 uppercase font-semibold mb-1">Port dû</div>
          <div className="text-2xl font-bold text-orange-800">{stats.portDuCount}</div>
          <div className="text-sm text-orange-600 mt-1">{stats.portDu.toLocaleString()} DH</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 shadow-sm border border-purple-200">
          <div className="text-xs text-purple-700 uppercase font-semibold mb-1">Port en compte</div>
          <div className="text-2xl font-bold text-purple-800">{stats.portEnCompteCount}</div>
          <div className="text-sm text-purple-600 mt-1">{stats.portEnCompte.toLocaleString()} DH</div>
        </div>
        <div className="bg-cyan-50 rounded-xl p-4 shadow-sm border border-cyan-200 col-span-2 md:col-span-1">
          <div className="text-xs text-cyan-700 uppercase font-semibold mb-1">Montant total</div>
          <div className="text-2xl font-bold text-cyan-800">{stats.total.toLocaleString()} DH</div>
          {stats.cod > 0 && <div className="text-sm text-cyan-600 mt-1">CRBT : {stats.cod.toLocaleString()} DH</div>}
        </div>
      </div>

      {/* ── Résumé par agence ── */}
      {!profileCity && !clientKey && Object.keys(stats.byAgency).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-gray-200">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-purple-600" /> Résumé par agence — {periodLabel}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Agence</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Total exp.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Port payé</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Port dû</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Port en compte</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Montant total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Object.entries(stats.byAgency)
                  .sort(([, a]: any, [, b]: any) => b.totalAmount - a.totalAmount)
                  .map(([agency, data]: any) => (
                    <tr key={agency} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-indigo-600">🏢 {agency}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-800">{data.count}</td>
                      <td className="px-3 py-2 text-center text-blue-700">{data.portPaye}</td>
                      <td className="px-3 py-2 text-center text-orange-700">{data.portDu}</td>
                      <td className="px-3 py-2 text-center text-purple-700">{data.portEnCompte}</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-900">{data.totalAmount.toLocaleString()} DH</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PendingBadge show={filtersPending} />
      {/* ── Bandeau de chargement ── */}
      {rangeMode ? (
        <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-indigo-600" />
            <div className="text-sm text-gray-700">
              {rangeLoading
                ? <LoadProgress
                    loading
                    count={rangeLoadedCount}
                    detail={rangeDayProgress && rangeDayProgress.total > 1
                      ? `jour par jour : ${rangeDayProgress.label} (${rangeDayProgress.done}/${rangeDayProgress.total} jours) — ${periodLabel} — liste et totaux complets à la fin du chargement`
                      : periodLabel}
                  />
                : <>Toutes les expéditions de la période sont chargées — <b>{periodLabel}</b></>}
            </div>
          </div>
          <button
            onClick={() => setRangeReload(n => n + 1)}
            disabled={rangeLoading}
            className="px-3 py-2 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rangeLoading ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </section>
      ) : (
        <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg overflow-hidden">
          <div className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20 flex-shrink-0"><Database className="w-6 h-6 text-white" /></div>
              <div className="text-white">
                <p className="font-black text-lg mb-0.5">📊 {parcels.length.toLocaleString('fr-MA')} expéditions chargées</p>
                <p className="text-xs text-blue-100">
                  {loadingAll
                    ? `⏳ Chargement en cours... +${loadAllProgress.toLocaleString('fr-MA')} colis récupérés`
                    : hasMore
                      ? 'Toutes les dates : chargez plus d\'historique, ou choisissez une période pour tout charger automatiquement.'
                      : '✓ Toute la base est chargée'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {hasMore && !loadingAll && (
                <>
                  <button onClick={loadMoreParcels} disabled={loadingMore}
                    className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-white/20 hover:bg-white/30 disabled:opacity-50 transition flex items-center gap-2">
                    {loadingMore ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</> : <>↓ Charger 300 de plus</>}
                  </button>
                  <button onClick={loadAllParcels} disabled={loadingMore}
                    className="px-4 py-2.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition">
                    ⚡ Tout charger
                  </button>
                </>
              )}
              {loadingAll && (
                <button onClick={stopLoading}
                  className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 transition flex items-center gap-2">
                  <X className="w-4 h-4" /> Arrêter ({loadAllProgress.toLocaleString('fr-MA')}...)
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Tableau des expéditions ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 text-xs text-gray-600 flex flex-wrap items-center gap-3">
          <span>Période : <b className="text-gray-800">{periodLabel}</b></span>
          {clientKey && <span>Client : <b className="text-gray-800">{clientQuery.trim()}</b></span>}
          <span className="ml-auto flex gap-2">
            <button onClick={selectAll} className="px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100">Tout cocher</button>
            <button onClick={selectNone} className="px-2 py-1 rounded bg-white border border-gray-300 hover:bg-gray-100">Tout décocher</button>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-center">
                  <input type="checkbox" checked={allSelected} onChange={() => (allSelected ? selectNone() : selectAll())} title="Sélection pour la facture" />
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">N° EXP (NIC)</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Expéditeur</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Destinataire</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">🏢 Agence</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ville dest.</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Nb colis</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type port</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Montant port</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">CRBT</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Facture</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoadingList && filteredParcels.length === 0 ? (
                <tr><td colSpan={15} className="px-4 py-8 text-center text-gray-500">Chargement...</td></tr>
              ) : filteredParcels.length === 0 ? (
                <tr><td colSpan={15} className="px-4 py-8 text-center text-gray-500">Aucune expédition trouvée</td></tr>
              ) : (
                tableParcels.slice(0, displayLimit).map((parcel: any) => {
                  const inv = invoiceOf(parcel)
                  const included = isIncluded(parcel)
                  return (
                    <tr key={parcel.id} className={included ? 'hover:bg-gray-50' : 'bg-gray-50/60 text-gray-400'}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" checked={included} onChange={() => toggleOne(parcel.id)} />
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-indigo-600">{parcel.sender?.nic || parcel.trackingId || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{parcel.clientName || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{parcel.sender?.name || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-700">{parcel.receiver?.name || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{parcel.sender?.city || parcel.originCity || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{parcel.receiver?.city || parcel.recipientCity || '-'}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-block px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">{nbColisOf(parcel)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${portBadgeCls(parcel.portType)}`}>
                          {portLabel(parcel.portType)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-gray-800">
                        {editingPriceId === parcel.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={editingPrice}
                              onChange={e => setEditingPrice(e.target.value)}
                              className="w-24 px-2 py-1.5 border-2 border-cyan-500 rounded-lg text-sm font-semibold focus:outline-none"
                              autoFocus
                              disabled={savingPrice}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const v = parseFloat(editingPrice)
                                  if (!isNaN(v) && v >= 0) handleSavePrice(parcel.id, v)
                                } else if (e.key === 'Escape') {
                                  setEditingPriceId(null); setEditingPrice('')
                                }
                              }}
                            />
                            <button
                              onClick={() => { const v = parseFloat(editingPrice); if (!isNaN(v) && v >= 0) handleSavePrice(parcel.id, v) }}
                              disabled={savingPrice}
                              className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                              title="Valider"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setEditingPriceId(null); setEditingPrice('') }}
                              disabled={savingPrice}
                              className="p-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg disabled:opacity-50"
                              title="Annuler"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group whitespace-nowrap">
                            <span>{priceOf(parcel).toLocaleString()} DH</span>
                            <button
                              onClick={() => { setEditingPriceId(parcel.id); setEditingPrice(String(parcel.price || 0)) }}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-xs bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded-lg transition font-medium"
                            >
                              <Edit2 className="w-3 h-3" /> Modifier
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{codOf(parcel) ? `${codOf(parcel).toLocaleString()} DH` : '-'}{isMixedCod(parcel) && <div className="text-[10px] text-gray-500">{codPartsBreakdown(parcel)}</div>}</td>
                      <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">{fr(opDateStr(parcel)) || '-'}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{parcel.status}</td>
                      <td className="px-3 py-3 text-xs">
                        {inv
                          ? <span className="inline-block px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold whitespace-nowrap">{inv}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => printParcelTicket(parcel)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold transition"
                          title="Afficher le bon d'expédition"
                        >
                          <FileText className="w-3.5 h-3.5" /> Bon
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            Affichage de <b className="text-gray-800">{Math.min(displayLimit, filteredParcels.length)}</b> sur <b className="text-gray-800">{filteredParcels.length}</b> expédition(s)
          </div>
          {filteredParcels.length > displayLimit && (
            <button
              onClick={() => setDisplayLimit(prev => prev + 500)}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Afficher 500 de plus
            </button>
          )}
        </div>
      </div>

      {showInvoiceModal && (
        <CreateClientInvoiceModal
          clientName={clientQuery.trim()}
          parcels={selectedParcels}
          totals={selTotals}
          period={period}
          periodLabel={periodLabel}
          defaultAgency={profileCity || (cityFilter !== 'Toutes' ? cityFilter : '')}
          invoices={invoices}
          clients={clients}
          userName={userName}
          onClose={() => setShowInvoiceModal(false)}
          onSaved={(num) => {
            setShowInvoiceModal(false)
            setToggled(new Set())
            setSuccessMessage(`Facture ${num} enregistrée (visible dans l'onglet Factures)`)
            setTimeout(() => setSuccessMessage(null), 5000)
          }}
        />
      )}
    </div>
  )
}

// ── Modal de création de facture client ──────────────────────────────────────

function CreateClientInvoiceModal({
  clientName, parcels, totals, period, periodLabel, defaultAgency, invoices, clients, userName, onClose, onSaved,
}: {
  clientName: string
  parcels: any[]
  totals: { count: number; nbColis: number; portPaye: number; portDu: number; portEnCompte: number; cod: number; total: number }
  period: { from: string; to: string } | null
  periodLabel: string
  defaultAgency: string
  invoices: Invoice[]
  clients: any[]
  userName?: string
  onClose: () => void
  onSaved: (invoiceNumber: string) => void
}) {
  // Agence par défaut : filtre agence, sinon l'agence d'origine la plus fréquente
  const guessedAgency = useMemo(() => {
    if (defaultAgency) return defaultAgency
    const counts: Record<string, number> = {}
    parcels.forEach(p => { const c = p.sender?.city || p.originCity; if (c) counts[c] = (counts[c] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  }, [defaultAgency, parcels])

  // Période effective : celle du filtre, sinon min → max des expéditions sélectionnées
  const effectivePeriod = useMemo(() => {
    if (period) return { ...period, label: periodLabel }
    const dates = parcels.map(opDateStr).filter(Boolean).sort()
    if (!dates.length) return { from: '', to: '', label: periodLabel }
    const from = dates[0], to = dates[dates.length - 1]
    return { from, to, label: from === to ? `Journée du ${fr(from)}` : `Du ${fr(from)} au ${fr(to)}` }
  }, [period, periodLabel, parcels])

  const [agencyCity, setAgencyCity] = useState(guessedAgency)
  const [invoiceDate, setInvoiceDate] = useState(ymd(new Date()))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [numberEdited, setNumberEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  // Numéro automatique : AAA-AAAAMM-NNN (même format que l'onglet Factures)
  useEffect(() => {
    if (numberEdited) return
    const code = (agencyCity || 'BGX').substring(0, 3).toUpperCase()
    const prefix = `${code}-${invoiceDate.slice(0, 4)}${invoiceDate.slice(5, 7)}`
    let max = 0
    invoices.forEach(inv => {
      const n = inv.invoiceNumber || ''
      if (n.startsWith(prefix + '-')) {
        const seq = parseInt(n.slice(prefix.length + 1), 10)
        if (!isNaN(seq) && seq > max) max = seq
      }
    })
    setInvoiceNumber(`${prefix}-${String(max + 1).padStart(3, '0')}`)
  }, [agencyCity, invoiceDate, invoices, numberEdited])

  const clientRecord = useMemo(() => clients.find(c => norm(c.name) === norm(clientName)), [clients, clientName])
  const clientTel = clientRecord?.tel || parcels.find(p => norm(p.sender?.name) === norm(clientName))?.sender?.tel
    || parcels.find(p => norm(p.receiver?.name) === norm(clientName))?.receiver?.tel || ''

  const sortedParcels = useMemo(
    () => [...parcels].sort((a, b) => parcelDate(a).getTime() - parcelDate(b).getTime()),
    [parcels]
  )

  const printData = () => ({
    invoiceNumber,
    invoiceDate: fr(invoiceDate),
    clientName,
    clientTel,
    agencyCity,
    periodLabel: effectivePeriod.label,
    dueDate: dueDate ? fr(dueDate) : undefined,
    notes: notes.trim() || undefined,
    lines: sortedParcels.map(p => ({
      date: fr(opDateStr(p)),
      nic: p.sender?.nic || p.trackingId || '-',
      receiverName: p.receiver?.name || '-',
      receiverCity: p.receiver?.city || p.recipientCity || '-',
      originCity: p.sender?.city || p.originCity || '-',
      nbColis: nbColisOf(p),
      portLabel: portLabel(p.portType),
      amount: priceOf(p),
      codAmount: codOf(p),
    })),
    totals,
  })

  const handleSave = async () => {
    if (!invoiceNumber.trim()) { alert('Veuillez saisir un numéro de facture'); return }
    if (invoices.some(inv => inv.invoiceNumber === invoiceNumber.trim() && inv.status !== 'cancelled')) {
      if (!confirm(`Le numéro ${invoiceNumber} existe déjà. Continuer quand même ?`)) return
    }
    setSaving(true)
    try {
      const ids = new Set(sortedParcels.map(p => p.clientId).filter(Boolean))
      const items: InvoiceItem[] = sortedParcels.map(p => stripUndefined({
        parcelId: p.id,
        trackingId: p.trackingId || '',
        senderNic: p.sender?.nic || '',
        portAmount: priceOf(p),
        portType: isPortDu(p.portType) ? 'port-du' : isPortEnCompte(p.portType) ? 'port-en-compte' : 'port-paye',
        portTypeRaw: p.portType || '',
        senderName: p.sender?.name || '',
        recipientName: p.receiver?.name || '',
        recipientCity: p.receiver?.city || p.recipientCity || '',
        originCity: p.sender?.city || p.originCity || '',
        nbColis: nbColisOf(p),
        codAmount: codOf(p),
        operationDate: opDateStr(p),
        createdAt: p.createdAt?.toDate?.() || undefined,
      }) as InvoiceItem)

      const payload: any = stripUndefined({
        invoiceNumber: invoiceNumber.trim(),
        clientId: ids.size === 1 ? [...ids][0] : (clientRecord?.id || ''),
        clientName,
        agencyCity: agencyCity || '',
        items,
        totalAmount: totals.total,
        status: 'pending',
        notes: notes.trim(),
        createdBy: auth.currentUser?.uid || '',
        createdByName: userName || auth.currentUser?.email || 'Facturier',
        periodFrom: effectivePeriod.from,
        periodTo: effectivePeriod.to,
        periodLabel: effectivePeriod.label,
        invoiceDate,
        totals: {
          count: totals.count, nbColis: totals.nbColis, portPaye: totals.portPaye,
          portDu: totals.portDu, portEnCompte: totals.portEnCompte, cod: totals.cod,
        },
      })
      if (dueDate) {
        payload.dueDate = Timestamp.fromDate(new Date(dueDate + 'T12:00:00'))
      }

      const invoiceId = await createInvoice(payload)
      // Marquage des colis (best effort : la facture reste enregistrée même si la règle refuse)
      try {
        await markParcelsAsInvoiced(sortedParcels.map(p => p.id), invoiceId)
      } catch (e) {
        console.warn('Facturier - marquage des colis facturés non autorisé:', e)
      }
      printClientInvoice(printData(), { summary: summaryFormat })
      onSaved(invoiceNumber.trim())
    } catch (err: any) {
      console.error('Erreur création facture:', err)
      alert(`Erreur lors de l'enregistrement de la facture : ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500'
  // 🧾 Format d'impression : détaillée (liste des expéditions) ou résumée (vraie facture, sans liste)
  const [summaryFormat, setSummaryFormat] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 p-5 border-b bg-indigo-50 rounded-t-2xl">
          <Receipt className="w-6 h-6 text-indigo-600" />
          <div className="flex-1">
            <h2 className="font-bold text-gray-800">Facture — {clientName}</h2>
            <div className="text-xs text-indigo-700">{effectivePeriod.label}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">N° de facture</label>
              <input value={invoiceNumber} onChange={e => { setInvoiceNumber(e.target.value); setNumberEdited(true) }} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date de facture</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value || ymd(new Date()))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Agence</label>
              <select value={agencyCity} onChange={e => setAgencyCity(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                {agencyCity && !CITIES.includes(agencyCity) && <option value={agencyCity}>{agencyCity}</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Échéance (optionnel)</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Format de la facture</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSummaryFormat(false)}
                className={`text-left rounded-xl border-2 px-3 py-2 transition ${!summaryFormat ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="text-sm font-bold text-gray-800">📋 Détaillée</div>
                <div className="text-xs text-gray-500">Avec la liste de toutes les expéditions</div>
              </button>
              <button type="button" onClick={() => setSummaryFormat(true)}
                className={`text-left rounded-xl border-2 px-3 py-2 transition ${summaryFormat ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="text-sm font-bold text-gray-800">🧾 Résumé</div>
                <div className="text-xs text-gray-500">Vraie facture : totaux par type de port, sans liste</div>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optionnel)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm grid grid-cols-2 gap-y-1.5">
            <span className="text-gray-600">Expéditions</span><b className="text-right">{totals.count}</b>
            <span className="text-gray-600">Colis</span><b className="text-right">{totals.nbColis}</b>
            {totals.portPaye > 0 && <><span className="text-gray-600">Port payé</span><b className="text-right">{totals.portPaye.toLocaleString()} DH</b></>}
            {totals.portDu > 0 && <><span className="text-gray-600">Port dû</span><b className="text-right">{totals.portDu.toLocaleString()} DH</b></>}
            {totals.portEnCompte > 0 && <><span className="text-gray-600">Port en compte</span><b className="text-right">{totals.portEnCompte.toLocaleString()} DH</b></>}
            {totals.cod > 0 && <><span className="text-gray-600">CRBT (indicatif)</span><b className="text-right">{totals.cod.toLocaleString()} DH</b></>}
            <span className="text-indigo-700 font-bold border-t pt-1.5 mt-1">Total TTC</span>
            <b className="text-right text-indigo-800 text-lg border-t pt-1.5 mt-1">{totals.total.toLocaleString()} DH</b>
          </div>
        </div>

        <div className="p-4 border-t flex flex-wrap justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Annuler</button>
          <button
            onClick={() => printClientInvoice(printData(), { summary: summaryFormat })}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Aperçu / imprimer
          </button>
          <button
            onClick={handleSave}
            disabled={saving || parcels.length === 0}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2"
          >
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
            Enregistrer et imprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Impression de la liste (rapport, A4 portrait) ────────────────────────────

function printFacturation(parcels: any[], stats: any, filters: any) {
  const logoUrl = window.location.origin + '/LOGO.jpg'
  const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

  const activeFilters: string[] = [`Période : ${filters.periodLabel}`]
  if (filters.clientQuery?.trim()) activeFilters.push(`Client : ${filters.clientQuery.trim()}`)
  if (filters.cityFilter !== 'Toutes') activeFilters.push(`Agence : ${filters.cityFilter}`)
  if (filters.portTypeFilter === 'port_en_compte_all') activeFilters.push('Type : Port en compte')
  else if (filters.portTypeFilter !== 'all') activeFilters.push(`Type : ${portLabel(filters.portTypeFilter)}`)
  if (filters.clientRole === 'expediteur') activeFilters.push('Client : expéditeur')
  if (filters.clientRole === 'destinataire') activeFilters.push('Client : destinataire')
  if (filters.statusFilter !== 'all') activeFilters.push(`Statut : ${filters.statusFilter}`)
  if (filters.search) activeFilters.push(`Recherche : "${filters.search}"`)

  const byAgencyTable = stats.byAgency && Object.keys(stats.byAgency).length > 1
    ? `<h3>Résumé par agence</h3>
       <table>
         <thead><tr><th>Agence</th><th class="c">Total exp.</th><th class="c">Port payé</th><th class="c">Port dû</th><th class="c">Port en compte</th><th class="r">Montant total</th></tr></thead>
         <tbody>
           ${Object.entries(stats.byAgency)
             .sort(([, a]: any, [, b]: any) => b.totalAmount - a.totalAmount)
             .map(([agency, d]: any) => `<tr><td><b>${esc(agency)}</b></td><td class="c">${d.count}</td><td class="c">${d.portPaye}</td><td class="c">${d.portDu}</td><td class="c">${d.portEnCompte}</td><td class="r"><b>${d.totalAmount.toLocaleString()} DH</b></td></tr>`).join('')}
         </tbody>
       </table>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Liste facturation - ${esc(filters.periodLabel)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #1e3a8a; }
    .header img { height: 45px; object-fit: contain; }
    .header h1 { color: #1e3a8a; font-size: 16pt; text-align: center; flex: 1; }
    .filters { background: #eff6ff; padding: 8px; margin: 8px 0; border-left: 4px solid #2563eb; border-radius: 3px; }
    .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 10px 0; }
    .stat { border: 1px solid #ddd; padding: 6px; border-radius: 4px; text-align: center; }
    .stat .l { font-size: 6.5pt; color: #666; text-transform: uppercase; }
    .stat .v { font-size: 12pt; font-weight: bold; }
    .stat .a { font-size: 7.5pt; color: #444; }
    h3 { color: #1e3a8a; margin: 10px 0 6px; font-size: 11pt; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    thead { display: table-header-group; }
    th { background: #1e3a8a; color: white; padding: 5px 4px; text-align: left; font-size: 7.5pt; }
    td { padding: 3px 4px; border-bottom: 1px solid #eee; font-size: 7.5pt; }
    tr { page-break-inside: avoid; }
    .r { text-align: right; } .c { text-align: center; }
    .footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid #ddd; text-align: center; font-size: 7pt; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl}" alt="Logo">
    <h1>LISTE DES EXPÉDITIONS — FACTURATION</h1>
    <div style="font-size:7.5pt;color:#666;text-align:right">Imprimé le<br>${new Date().toLocaleDateString('fr-MA')} ${new Date().toLocaleTimeString('fr-MA')}</div>
  </div>
  <div class="filters"><b>Filtres :</b> ${activeFilters.map(esc).join(' • ')}</div>
  <div class="stats">
    <div class="stat"><div class="l">Expéditions</div><div class="v">${stats.count}</div><div class="a">${stats.nbColis} colis</div></div>
    <div class="stat"><div class="l">Port payé</div><div class="v">${stats.portPayeCount}</div><div class="a">${stats.portPaye.toLocaleString()} DH</div></div>
    <div class="stat"><div class="l">Port dû</div><div class="v">${stats.portDuCount}</div><div class="a">${stats.portDu.toLocaleString()} DH</div></div>
    <div class="stat"><div class="l">Port en compte</div><div class="v">${stats.portEnCompteCount}</div><div class="a">${stats.portEnCompte.toLocaleString()} DH</div></div>
    <div class="stat"><div class="l">Montant total</div><div class="v">${stats.total.toLocaleString()} DH</div>${stats.cod > 0 ? `<div class="a">CRBT ${stats.cod.toLocaleString()} DH</div>` : ''}</div>
  </div>
  ${byAgencyTable}
  <h3>Détail des expéditions</h3>
  <table>
    <thead>
      <tr><th>N° EXP</th><th>Date</th><th>Client</th><th>Expéditeur</th><th>Destinataire</th><th>Agence</th><th>Ville dest.</th><th>Type port</th><th class="r">Montant</th></tr>
    </thead>
    <tbody>
      ${parcels.map(p => `
        <tr>
          <td><b>${esc(p.sender?.nic || p.trackingId || '-')}</b></td>
          <td>${fr(opDateStr(p)) || '-'}</td>
          <td>${esc(p.clientName || '-')}</td>
          <td>${esc(p.sender?.name || '-')}</td>
          <td>${esc(p.receiver?.name || '-')}</td>
          <td>${esc(p.sender?.city || p.originCity || '-')}</td>
          <td>${esc(p.receiver?.city || p.recipientCity || '-')}</td>
          <td>${esc(portLabel(p.portType))}</td>
          <td class="r"><b>${priceOf(p).toLocaleString()} DH</b></td>
        </tr>`).join('')}
    </tbody>
  </table>
  <div class="footer">BG EXPRESS — R.C : 17447 — I.F : 31837263 — ICE : 002158803000007</div>
  <script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=1100')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
