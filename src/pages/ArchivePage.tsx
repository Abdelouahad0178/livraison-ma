import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { getArchivedParcels } from '../firebase/firestore'
import { STATUS_COLORS, CITIES } from '../firebase/constants'
import {
  ChevronLeft, ChevronRight, Search, Archive, Calendar, X, Package, RefreshCw,
} from 'lucide-react'

const PAGE_SIZE = 25
const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const SERVICE_LABELS = {
  simple:    { label: 'Simple',    color: 'bg-gray-100 text-gray-600' },
  especes:   { label: 'C/Espèces', color: 'bg-green-100 text-green-700' },
  cheque:    { label: 'C/Chèque',  color: 'bg-blue-100 text-blue-700' },
  traite:    { label: 'C/Traite',  color: 'bg-indigo-100 text-indigo-700' },
  retour_bl: { label: 'Retour BL', color: 'bg-amber-100 text-amber-700' },
}

function formatDate(ts: any) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function filterByDateRange(list: any, dateFrom: any, dateTo: any) {
  if (!dateFrom && !dateTo) return list
  const start = dateFrom ? new Date(dateFrom) : null
  const end   = dateTo   ? new Date(dateTo + 'T23:59:59') : null
  return list.filter((p: any) => {
    const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}

export default function ArchivePage() {
  const navigate = useNavigate()
  const [profile, setProfile]       = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [parcels, setParcels]       = useState<any[]>([])
  const [fetching, setFetching]     = useState(false)
  const [hasMore, setHasMore]       = useState(false)
  const [cursors, setCursors]       = useState<any>({ lastOrigDoc: null, lastDestDoc: null })
  const [city, setCity]             = useState('')

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [originCityFilter, setOriginCityFilter]   = useState('all')
  const [destCityFilter, setDestCityFilter]       = useState('all')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [page, setPage]             = useState(0)

  // Auth + profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) { navigate('/login'); return }
      const snap = await getDoc(doc(db, 'users', u.uid))
      if (!snap.exists()) { navigate('/login'); return }
      const p: any = { id: u.uid, ...snap.data() }
      const role = String(p.role || '').toLowerCase()
      if (!['chef_agence', 'admin'].includes(role)) { navigate('/agent'); return }
      setProfile({ ...p, role })
      if (role !== 'admin') setCity(p.city || '')
      setAuthLoading(false)
    })
    return unsub
  }, [navigate])

  // Chargement initial quand la ville est définie
  useEffect(() => {
    if (!city) return
    setParcels([])
    setCursors({ lastOrigDoc: null, lastDestDoc: null })
    setPage(0)
    load(city, null, null, false)
  }, [city])

  async function load(targetCity: any, lastOrigDoc: any, lastDestDoc: any, append: any) {
    setFetching(true)
    try {
      const result = await getArchivedParcels(targetCity, { lastOrigDoc, lastDestDoc })
      setParcels(prev => {
        if (!append) return result.parcels
        const map = new Map()
        prev.forEach(p => map.set(p.id, p))
        result.parcels.forEach(p => map.set(p.id, p))
        return [...map.values()].sort((a, b) => {
          const ta = a.createdAt?.toDate?.() || new Date(0)
          const tb = b.createdAt?.toDate?.() || new Date(0)
          return tb.getTime() - ta.getTime()
        })
      })
      setHasMore(result.hasMore)
      setCursors({ lastOrigDoc: result.lastOrigDoc, lastDestDoc: result.lastDestDoc })
    } catch (e: any) {
      console.error('getArchivedParcels:', e)
    } finally {
      setFetching(false)
    }
  }

  // Villes dynamiques extraites des archives chargées
  const availableOriginCities = useMemo(() =>
    [...new Set(parcels.map(p => p.originCity).filter(Boolean))].sort()
  , [parcels])
  const availableDestCities = useMemo(() =>
    [...new Set(parcels.map(p => p.destinationCity).filter(Boolean))].sort()
  , [parcels])

  // Filtrage client-side
  const filtered = useMemo(() => {
    let list = filterByDateRange(parcels, dateFrom, dateTo)
    if (statusFilter !== 'all') list = list.filter((p: any) => p.status === statusFilter)
    if (directionFilter === 'sent') list = list.filter((p: any) => p.originCity === city)
    if (directionFilter === 'received') list = list.filter((p: any) => p.destinationCity === city)
    if (originCityFilter !== 'all') list = list.filter((p: any) => p.originCity === originCityFilter)
    if (destCityFilter !== 'all')   list = list.filter((p: any) => p.destinationCity === destCityFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p: any) =>
        (p.trackingId || '').toLowerCase().includes(q) ||
        (p.sender?.name || '').toLowerCase().includes(q) ||
        (p.receiver?.name || '').toLowerCase().includes(q) ||
        (p.sender?.tel || '').includes(q) ||
        (p.receiver?.tel || '').includes(q) ||
        (p.originCity || '').toLowerCase().includes(q) ||
        (p.destinationCity || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [parcels, search, statusFilter, directionFilter, originCityFilter, destCityFilter, dateFrom, dateTo, city])

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [search, statusFilter, directionFilter, originCityFilter, destCityFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages - 1)
  const paged      = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // Chips de mois (6 mois depuis la date actuelle)
  const now = new Date()
  const toISO = (d: any) => d.toISOString().slice(0, 10)
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); weekStart.setHours(0,0,0,0)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    const y = d.getFullYear(), m = d.getMonth()
    const lastDay = new Date(y, m + 1, 0).getDate()
    return {
      label: `${MONTH_NAMES[m]} ${y}`,
      from: `${y}-${String(m+1).padStart(2,'0')}-01`,
      to:   `${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
      current: i === 5,
    }
  })

  const isPeriodActive = (f: any, t: any) => dateFrom === f && dateTo === t
  const applyPeriod    = (f: any, t: any) => { setDateFrom(f); setDateTo(t) }
  const clearPeriod    = ()     => { setDateFrom(''); setDateTo('') }
  const anyPeriod      = dateFrom || dateTo

  const goTo = (p: any) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/agent')}
            className="p-2 rounded-xl hover:bg-gray-100 transition"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Archive className="w-5 h-5 text-teal-600 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-bold text-gray-800 text-base leading-tight">Archives</h1>
              <p className="text-xs text-gray-400 truncate">
                {city ? `Agence ${city}` : 'Toutes villes'} · {parcels.length} colis chargés
              </p>
            </div>
          </div>
          {profile?.role === 'admin' && (
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-teal-500"
            >
              <option value="">— ville —</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tracking, expéditeur, destinataire, téléphone…"
            className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:border-teal-500 focus:outline-none shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* Filtres statut + direction + villes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Statut</span>
            {[
              { key: 'all',       label: 'Tous' },
              { key: 'Livré',     label: 'Livré' },
              { key: 'Retourné',  label: 'Retourné' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  statusFilter === key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >{label}</button>
            ))}
          </div>
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Direction</span>
            {[
              { key: 'all',      label: 'Tous' },
              { key: 'sent',     label: 'Envoyés' },
              { key: 'received', label: 'Reçus' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setDirectionFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  directionFilter === key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >{label}</button>
            ))}
          </div>
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Expéditeur</span>
            <select
              value={originCityFilter}
              onChange={e => setOriginCityFilter(e.target.value)}
              className={`border rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-teal-500 flex-1 min-w-0 ${
                originCityFilter !== 'all' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              <option value="all">Toutes les villes</option>
              {availableOriginCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-gray-400 font-bold uppercase w-16 shrink-0">Destinataire</span>
            <select
              value={destCityFilter}
              onChange={e => setDestCityFilter(e.target.value)}
              className={`border rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-teal-500 flex-1 min-w-0 ${
                destCityFilter !== 'all' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              <option value="all">Toutes les villes</option>
              {availableDestCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Sélecteur de période */}
        <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Période
            </span>
            {anyPeriod && (
              <button onClick={clearPeriod} className="text-[10px] text-red-400 hover:text-red-600 font-semibold transition">
                ✕ Tout afficher
              </button>
            )}
          </div>
          <div className="p-3 space-y-2">
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "Aujourd'hui", from: toISO(now), to: toISO(now) },
                { label: 'Cette semaine', from: toISO(weekStart), to: toISO(weekEnd) },
              ].map(({ label, from, to }) => (
                <button key={label} onClick={() => isPeriodActive(from, to) ? clearPeriod() : applyPeriod(from, to)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                    isPeriodActive(from, to)
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300 hover:text-teal-600'
                  }`}
                >{label}</button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {months.map(({ label, from, to, current }) => (
                <button key={from} onClick={() => isPeriodActive(from, to) ? clearPeriod() : applyPeriod(from, to)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    isPeriodActive(from, to)
                      ? 'bg-teal-600 text-white border-teal-600'
                      : current
                      ? 'bg-teal-50 text-teal-600 border-teal-200 hover:bg-teal-100'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-teal-300 hover:text-teal-500'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Résultats */}
        {city ? (
          fetching && parcels.length === 0 ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm">Chargement des archives…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
              <Archive className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">Aucun colis archivé trouvé</p>
              {(search || statusFilter !== 'all' || anyPeriod) && (
                <button onClick={() => { setSearch(''); setStatusFilter('all'); setDirectionFilter('all'); clearPeriod() }}
                  className="text-xs text-teal-600 hover:underline"
                >Réinitialiser les filtres</button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">
                {filtered.length} colis{anyPeriod || search || statusFilter !== 'all' ? ' (filtrés)' : ' archivés'}
              </p>

              {paged.map((p: any) => {
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS['Livré']
                const svc = (SERVICE_LABELS as any)[p.serviceType]
                const isOwn = p.originCity === city
                return (
                  <div key={p.id}
                    className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${isOwn ? 'border-l-teal-500 border border-teal-50' : 'border-l-orange-400 border border-orange-50'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-gray-700">{p.trackingId}</span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {p.status}
                        </span>
                        {svc && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${svc.color}`}>{svc.label}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{formatDate(p.createdAt)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
                      <div>
                        <span className="text-gray-400">Expéditeur : </span>
                        <span className="font-medium">{p.sender?.name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Destinataire : </span>
                        <span className="font-medium">{p.receiver?.name || '—'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">De : </span>
                        <span className="font-medium">{p.originCity}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Vers : </span>
                        <span className="font-medium">{p.destinationCity}</span>
                      </div>
                      {p.codAmount > 0 && (
                        <div className="col-span-2">
                          <span className="text-gray-400">COD : </span>
                          <span className="font-semibold text-green-700">{p.codAmount.toLocaleString('fr-MA')} DH</span>
                        </div>
                      )}
                    </div>

                    {p._archivedAt && (
                      <div className="text-[10px] text-gray-400 border-t border-gray-50 pt-1.5 mt-1">
                        Archivé le {formatDate(p._archivedAt)}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Pagination */}
              {filtered.length > PAGE_SIZE && (() => {
                const pages: any[] = []
                for (let i = 0; i < totalPages; i++) {
                  if (i === 0 || i === totalPages - 1 || Math.abs(i - safePage) <= 1) pages.push(i)
                }
                const items: any[] = []
                pages.forEach((p, idx) => {
                  if (idx > 0 && p - pages[idx - 1] > 1) items.push('…')
                  items.push(p)
                })
                return (
                  <div className="pt-4 mt-2 border-t border-gray-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{filtered.length} résultats</span>
                      <span className="text-xs text-gray-400">Page {safePage + 1} / {totalPages}</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button onClick={() => goTo(Math.max(0, safePage - 1))} disabled={safePage === 0}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                      ><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
                      {items.map((item, idx) =>
                        item === '…'
                          ? <span key={`d${idx}`} className="px-1 text-gray-400 text-sm">…</span>
                          : <button key={item} onClick={() => goTo(item)}
                              className={`min-w-[36px] h-9 rounded-xl text-sm font-semibold transition border ${
                                item === safePage
                                  ? 'bg-teal-600 text-white border-teal-600'
                                  : 'bg-white text-gray-600 border-gray-200 hover:bg-teal-50 hover:border-teal-300'
                              }`}
                            >{item + 1}</button>
                      )}
                      <button onClick={() => goTo(Math.min(totalPages - 1, safePage + 1))} disabled={safePage === totalPages - 1}
                        className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition"
                      ><ChevronRight className="w-4 h-4 text-gray-600" /></button>
                    </div>
                  </div>
                )
              })()}

              {/* Charger plus */}
              {hasMore && (
                <button
                  onClick={() => load(city, cursors.lastOrigDoc, cursors.lastDestDoc, true)}
                  disabled={fetching}
                  className="w-full mt-2 py-3 rounded-xl border border-teal-200 text-teal-600 text-sm font-semibold hover:bg-teal-50 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {fetching
                    ? <><span className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /> Chargement…</>
                    : '↓ Charger plus d\'archives'}
                </button>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <Package className="w-10 h-10 opacity-30" />
            <p className="text-sm">Sélectionnez une ville pour afficher les archives</p>
          </div>
        )}
      </main>
    </div>
  )
}
