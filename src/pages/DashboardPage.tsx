import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs,
  query, orderBy, limit,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { auth, db } from '../firebase/config'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import '../utils/chartConfig' // Enregistre les composants Chart.js
import { CHART_COLORS, PIE_COLORS, defaultChartOptions, pieChartOptions } from '../utils/chartConfig'
import {
  ArrowLeft, TrendingUp, Package, CheckCircle, Clock,
  RotateCcw, Banknote, Wallet, Users, Truck, MapPin, Calendar, RefreshCw, Database
} from 'lucide-react'
import { fmt } from '../utils/formatNumber'

// Map flat stats/global field keys to display labels
const STATUS_KEY_LABELS = {
  s_collecte:          'Collecté',
  s_en_transit:        'En transit',
  s_arrive:            'Arrivé en agence',
  s_en_livraison:      'En livraison',
  s_livre:             'Livré',
  s_retourne:          'Retourné',
  s_annule:            'Annulé',
  s_en_transit_retour: 'Retour en transit',
}

// ── Build time-series from daily stats docs ────────────────────────────────
function buildTimeSeriesFromStats(dailyStats: any, view: any) {
  const now = new Date()
  const buckets: any[] = []

  if (view === 'day') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0,0,0,0)
      buckets.push({ label: d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' }), start: new Date(d), end: new Date(d.getTime() + 86400000) })
    }
  } else if (view === 'week') {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now); start.setDate(now.getDate() - i * 7); start.setHours(0,0,0,0)
      const end = new Date(start.getTime() + 7 * 86400000)
      buckets.push({ label: 'S ' + start.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' }), start, end })
    }
  } else if (view === 'month') {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      buckets.push({ label: start.toLocaleDateString('fr-MA', { month: 'short', year: '2-digit' }), start, end })
    }
  } else {
    const yr = now.getFullYear()
    for (let y = yr - 3; y <= yr; y++) {
      buckets.push({ label: String(y), start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) })
    }
  }

  return buckets.map(b => {
    const inB = dailyStats.filter((d: any) => {
      const dt = new Date(d.date + 'T00:00:00')
      return dt >= b.start && dt < b.end
    })
    const crees     = inB.reduce((s: any, d: any) => s + (d.created || 0), 0)
    const livres    = inB.reduce((s: any, d: any) => s + (d.livres   || 0), 0)
    const retournes = inB.reduce((s: any, d: any) => s + (d.retours  || 0), 0)
    return {
      label: b.label,
      crees,
      livres,
      retournes,
      enCours: Math.max(0, crees - livres - retournes),
      revenue: inB.reduce((s: any, d: any) => s + (d.revenue || 0), 0),
      cod:     0,
    }
  })
}

// ── Helpers Chart.js ───────────────────────────────────────────────────────
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Tooltip callback : montants en DH pour revenue / cod
const dhTooltipCallbacks = {
  callbacks: {
    label: (ctx: any) => {
      if (ctx.dataset.label === 'revenue' || ctx.dataset.label === 'cod') {
        return ctx.dataset.label + ': ' + fmt(ctx.parsed.y) + ' DH'
      }
      return ctx.dataset.label + ': ' + ctx.parsed.y
    },
  },
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [globalStats,  setGlobalStats]  = useState<any>(null)
  const [agencyStats,  setAgencyStats]  = useState<any[]>([])
  const [dailyStats,   setDailyStats]   = useState<any[]>([])
  const [agentStats,   setAgentStats]   = useState<any[]>([])
  const [driverStats,  setDriverStats]  = useState<any[]>([])
  const [users,        setUsers]        = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [rebuilding,   setRebuilding]   = useState(false)
  const [lastUpdate,   setLastUpdate]   = useState<any>(null)
  const [view,    setView]    = useState('month') // day | week | month | year
  const [cityTab, setCityTab] = useState('volume')

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [globalSnap, agenciesSnap, dailySnap, agentsSnap, driversSnap, usersSnap] = await Promise.all([
        getDoc(doc(db, 'stats', 'global')),
        getDocs(collection(db, 'stats', 'global', 'agencies')),
        getDocs(query(
          collection(db, 'stats', 'global', 'daily'),
          orderBy('date', 'desc'),
          limit(500),
        )),
        getDocs(query(
          collection(db, 'stats', 'global', 'agents'),
          orderBy('created', 'desc'),
          limit(20),
        )),
        getDocs(query(
          collection(db, 'stats', 'global', 'drivers'),
          orderBy('deliveries', 'desc'),
          limit(20),
        )),
        getDocs(collection(db, 'users')),
      ])

      setGlobalStats(globalSnap.exists() ? globalSnap.data() : null)
      setAgencyStats(agenciesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setDailyStats(dailySnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setAgentStats(agentsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setDriverStats(driversSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLastUpdate(new Date())
    } catch (err: any) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleRebuildStats = async () => {
    if (!window.confirm('Reconstruire toutes les statistiques depuis les données brutes ? Cela peut prendre quelques minutes.')) return
    setRebuilding(true)
    try {
      const fn = httpsCallable(getFunctions(), 'rebuildStats')
      const result = await fn()
      alert(`Stats reconstruites avec succès : ${(result.data as any).processed} colis traités.`)
      await loadData(true)
    } catch (err: any) {
      alert('Erreur : ' + (err.message || 'Inconnue'))
    } finally {
      setRebuilding(false)
    }
  }

  // ── Global KPIs ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total   = globalStats?.total   ?? 0
    const livres  = globalStats?.livres  ?? 0
    const retours = globalStats?.retours ?? 0
    const enCours = Math.max(0, total - livres - retours)
    const revenue   = globalStats?.revenue  ?? 0
    const codTotal  = globalStats?.codTotal ?? 0
    const taux   = total > 0 ? Math.round((livres / total) * 100) : 0
    const agents  = users.filter(u => u.role === 'agent' || u.role === 'chef_agence').length
    const drivers = users.filter(u => ['chauffeur', 'livreur'].includes(u.role)).length
    return { total, livres, retours, enCours, revenue, codTotal, codPending: 0, codRemis: 0, taux, agents, drivers }
  }, [globalStats, users])

  // ── Time series from daily stats ──────────────────────────────────────────
  const timeSeries = useMemo(() => buildTimeSeriesFromStats(dailyStats, view), [dailyStats, view])

  // ── Period comparison ─────────────────────────────────────────────────────
  const comparison = useMemo(() => {
    const n = timeSeries.length
    if (n < 2) return null
    const curr = timeSeries[n - 1]
    const prev = timeSeries[n - 2]
    const delta = (a: any, b: any) => b === 0 ? null : Math.round(((a - b) / b) * 100)

    // S'assurer que les valeurs sont valides (pas undefined, null ou négatives)
    const safe = (val: any) => Math.max(0, val || 0)

    return {
      crees:   { curr: safe(curr?.crees),   prev: safe(prev?.crees),   pct: delta(safe(curr?.crees),   safe(prev?.crees))   },
      livres:  { curr: safe(curr?.livres),  prev: safe(prev?.livres),  pct: delta(safe(curr?.livres),  safe(prev?.livres))  },
      revenue: { curr: safe(curr?.revenue), prev: safe(prev?.revenue), pct: delta(safe(curr?.revenue), safe(prev?.revenue)) },
    }
  }, [timeSeries])

  // ── Per city stats from agency stats ──────────────────────────────────────
  const cityStats = useMemo(() => {
    return agencyStats
      .map(c => ({
        city:      c.city    || c.id,
        total:     c.total   || 0,
        livres:    c.livres  || 0,
        retournes: c.retours || 0,
        enCours:   Math.max(0, (c.total || 0) - (c.livres || 0) - (c.retours || 0)),
        revenue:   c.revenue || 0,
        cod:       c.cod     || 0,
        taux:      (c.total || 0) > 0 ? Math.round(((c.livres || 0) / (c.total || 1)) * 100) : 0,
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [agencyStats])

  // ── Status distribution from global stats ─────────────────────────────────
  const statusDist = useMemo(() => {
    if (!globalStats) return []
    return Object.entries(STATUS_KEY_LABELS)
      .map(([k, name]) => ({ name, value: globalStats[k] || 0 }))
      .filter(s => s.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [globalStats])

  // ── Top agents & drivers from stats ───────────────────────────────────────
  const topAgents = useMemo(() =>
    agentStats
      .map(a => {
        const user = users.find(u => u.uid === a.id || u.id === a.id)
        if (!user) return null // Exclure les agents supprimés
        return { name: user.name || user.email || '—', city: user.city || '—', created: a.created || 0, livres: a.livres || 0 }
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .slice(0, 5)
  , [agentStats, users])

  const topDrivers = useMemo(() =>
    driverStats
      .map(d => {
        const user = users.find(u => u.uid === d.id || u.id === d.id)
        if (!user) return null // Exclure les chauffeurs supprimés
        return { name: user.name || user.email || '—', city: user.city || '—', deliveries: d.deliveries || 0, livres: d.livres || 0 }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .slice(0, 5)
  , [driverStats, users])

  const VIEW_OPTS = [
    { key: 'day',   label: '14 jours' },
    { key: 'week',  label: '12 semaines' },
    { key: 'month', label: '12 mois' },
    { key: 'year',  label: '4 ans' },
  ]

  // ── Chart.js : évolution des colis (aires empilées visuellement) ─────────
  const evolutionData = {
    labels: timeSeries.map(t => t.label),
    datasets: (['crees', 'livres', 'retournes', 'enCours'] as const).map(key => ({
      label: key,
      data: timeSeries.map((t: any) => t[key]),
      borderColor: CHART_COLORS[key],
      backgroundColor: hexToRgba(CHART_COLORS[key], 0.1),
      fill: true,
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
    })),
  }

  const evolutionOptions = {
    ...defaultChartOptions,
    interaction: { mode: 'index' as const, intersect: false },
  }

  // ── Chart.js : volume par agence ──────────────────────────────────────────
  const cityVolumeData = {
    labels: cityStats.map(c => c.city),
    datasets: [
      { label: 'Total',     data: cityStats.map(c => c.total),     backgroundColor: CHART_COLORS.crees,     borderRadius: 4 },
      { label: 'livres',    data: cityStats.map(c => c.livres),    backgroundColor: CHART_COLORS.livres,    borderRadius: 4 },
      { label: 'retournes', data: cityStats.map(c => c.retournes), backgroundColor: CHART_COLORS.retournes, borderRadius: 4 },
    ],
  }

  const cityVolumeOptions = {
    ...defaultChartOptions,
    scales: {
      ...defaultChartOptions.scales,
      x: {
        ...defaultChartOptions.scales.x,
        ticks: { ...defaultChartOptions.scales.x.ticks, maxRotation: 25, minRotation: 25 },
      },
    },
  }

  // ── Chart.js : revenus par agence ─────────────────────────────────────────
  const cityRevenueData = {
    labels: cityStats.map(c => c.city),
    datasets: [
      { label: 'revenue', data: cityStats.map(c => c.revenue), backgroundColor: CHART_COLORS.revenue, borderRadius: 4 },
      { label: 'cod',     data: cityStats.map(c => c.cod),     backgroundColor: CHART_COLORS.cod,     borderRadius: 4 },
    ],
  }

  const cityRevenueOptions = {
    ...defaultChartOptions,
    plugins: {
      ...defaultChartOptions.plugins,
      tooltip: { ...defaultChartOptions.plugins.tooltip, ...dhTooltipCallbacks },
    },
    scales: {
      ...defaultChartOptions.scales,
      x: {
        ...defaultChartOptions.scales.x,
        ticks: { ...defaultChartOptions.scales.x.ticks, maxRotation: 25, minRotation: 25 },
      },
      y: {
        ...defaultChartOptions.scales.y,
        ticks: { ...defaultChartOptions.scales.y.ticks, callback: (v: any) => fmt(v) },
      },
    },
  }

  // ── Chart.js : donut répartition des statuts ──────────────────────────────
  const statusData = {
    labels: statusDist.map(s => s.name),
    datasets: [{
      data: statusDist.map(s => s.value),
      backgroundColor: statusDist.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]),
      borderColor: '#ffffff',
      borderWidth: 2,
    }],
  }

  const statusOptions = {
    ...pieChartOptions,
    cutout: '60%',
    plugins: {
      ...pieChartOptions.plugins,
      tooltip: {
        ...pieChartOptions.plugins.tooltip,
        callbacks: { label: (ctx: any) => ctx.label + ': ' + ctx.parsed + ' colis' },
      },
    },
  }

  // ── Chart.js : revenus & COD dans le temps ────────────────────────────────
  const timeRevenueData = {
    labels: timeSeries.map(t => t.label),
    datasets: [
      { label: 'revenue', data: timeSeries.map(t => t.revenue), backgroundColor: CHART_COLORS.revenue, borderRadius: 4 },
      { label: 'cod',     data: timeSeries.map(t => t.cod),     backgroundColor: CHART_COLORS.cod,     borderRadius: 4 },
    ],
  }

  const timeRevenueOptions = {
    ...defaultChartOptions,
    plugins: {
      ...defaultChartOptions.plugins,
      tooltip: { ...defaultChartOptions.plugins.tooltip, ...dhTooltipCallbacks },
    },
    scales: {
      ...defaultChartOptions.scales,
      y: {
        ...defaultChartOptions.scales.y,
        ticks: { ...defaultChartOptions.scales.y.ticks, callback: (v: any) => fmt(v) },
      },
    },
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <CompanyContact />

      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-100 rounded-xl transition">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
            <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-gray-800">Tableau de bord global</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LiveClock className="text-gray-400 hidden sm:inline" />
            {lastUpdate && (
              <span className="hidden sm:block text-xs text-gray-400">
                MAJ {lastUpdate.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={handleRebuildStats} disabled={rebuilding}
              title="Reconstruire toutes les statistiques depuis les données brutes"
              className="flex items-center gap-1.5 text-sm text-orange-500 hover:text-orange-600 disabled:opacity-50 transition">
              <Database className={`w-4 h-4 ${rebuilding ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{rebuilding ? 'Reconstruction...' : 'Reconstruire les stats'}</span>
            </button>
            <button onClick={() => loadData(true)} disabled={refreshing}
              className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50 transition">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            <button onClick={() => signOut(auth).then(() => navigate('/login'))}
              className="hidden md:flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-16">

        {/* ── KPI CARDS ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {[
            { label: 'Total colis',    value: fmt(kpis.total),           icon: Package,     bg: 'bg-blue-50',   text: 'text-blue-600',   border: 'border-blue-100' },
            { label: 'En cours',       value: fmt(kpis.enCours),         icon: Clock,       bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
            { label: 'livres',         value: fmt(kpis.livres),          icon: CheckCircle, bg: 'bg-green-50',  text: 'text-green-600',  border: 'border-green-100' },
            { label: 'retournes',      value: fmt(kpis.retours),         icon: RotateCcw,   bg: 'bg-red-50',    text: 'text-red-500',    border: 'border-red-100' },
            { label: 'Taux livraison', value: kpis.taux + '%',           icon: TrendingUp,  bg: 'bg-teal-50',   text: 'text-teal-600',   border: 'border-teal-100' },
            { label: 'Revenus',        value: fmt(kpis.revenue) + ' DH', icon: Banknote,    bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-100' },
            { label: 'RETOUR FOND en attente', value: fmt(kpis.codPending)+' DH',icon: Wallet,      bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100' },
            { label: 'RETOUR FOND remis',      value: fmt(kpis.codRemis)+' DH',  icon: Wallet,      bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-100' },
          ].map(({ label, value, icon: Icon, bg, text, border }) => (
            <div key={label} className={`bg-white rounded-2xl border ${border} shadow-sm p-4 flex flex-col gap-2`}>
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${text}`} />
              </div>
              <p className={`text-xl font-black ${text} leading-tight`}>{value}</p>
              <p className="text-xs text-gray-400 font-medium leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* ── ÉVOLUTION DANS LE TEMPS ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-bold text-gray-800">Évolution des colis</h2>
              <p className="text-xs text-gray-400 mt-0.5">crees · livres · retournes · En cours</p>
            </div>
            <div className="flex gap-1.5">
              {VIEW_OPTS.map(o => (
                <button key={o.key} onClick={() => setView(o.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    view === o.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: '280px' }}>
            <Line data={evolutionData} options={evolutionOptions as any} />
          </div>
        </div>

        {/* ── COMPARISON PÉRIODE COURANTE / PRÉCÉDENTE ──────────────────── */}
        {comparison && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'crees',   label: 'Colis crees',   icon: Package,  color: 'blue'  },
              { key: 'livres',  label: 'livres',        icon: CheckCircle, color: 'green' },
              { key: 'revenue', label: 'Revenus (DH)',  icon: Banknote, color: 'amber' },
            ].map(({ key, label, icon: Icon, color }) => {
              const c   = (comparison as any)[key]
              const up  = c.pct !== null && c.pct >= 0
              const clr = ({ blue: 'text-blue-600 bg-blue-50', green: 'text-green-600 bg-green-50', amber: 'text-amber-600 bg-amber-50' } as any)[color] as string
              return (
                <div key={key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                    <Icon className={`w-4 h-4 ${clr.split(' ')[0]}`} />
                  </div>
                  <p className={`text-2xl font-black ${clr.split(' ')[0]}`}>
                    {key === 'revenue' ? fmt(c.curr) : c.curr}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-400">Période préc. : {key === 'revenue' ? fmt(c.prev) : c.prev}</p>
                    {c.pct !== null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {up ? '+' : ''}{c.pct}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── PAR AGENCE ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-bold text-gray-800">Comparaison par agence</h2>
              <p className="text-xs text-gray-400 mt-0.5">{cityStats.length} agences actives</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setCityTab('volume')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${cityTab === 'volume' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                Volume
              </button>
              <button onClick={() => setCityTab('revenue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${cityTab === 'revenue' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                Revenus
              </button>
            </div>
          </div>
          {cityStats.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Aucune donnée</p>
          ) : (
            <div style={{ height: '280px' }}>
              {cityTab === 'volume' ? (
                <Bar data={cityVolumeData} options={cityVolumeOptions as any} />
              ) : (
                <Bar data={cityRevenueData} options={cityRevenueOptions as any} />
              )}
            </div>
          )}
        </div>

        {/* ── STATUS DISTRIBUTION + TAUX LIVRAISON PAR AGENCE ─────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Donut statuts */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-1">Répartition des statuts</h2>
            <p className="text-xs text-gray-400 mb-4">{fmt(globalStats?.total || 0)} colis (stats agrégées)</p>
            <div style={{ height: '240px' }}>
              <Doughnut data={statusData} options={statusOptions as any} />
            </div>
          </div>

          {/* Taux de livraison par agence */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-800 mb-1">Taux de livraison par agence</h2>
            <p className="text-xs text-gray-400 mb-4">livres / Total × 100</p>
            <div className="space-y-2.5">
              {cityStats.slice(0, 8).map(c => (
                <div key={c.city}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-400" />{c.city}
                    </span>
                    <span className="text-xs font-bold text-gray-700">{c.taux}% <span className="text-gray-400 font-normal">({c.livres}/{c.total})</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${c.taux >= 70 ? 'bg-green-500' : c.taux >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, Math.max(0, Number(c.taux) || 0))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── REVENUS DANS LE TEMPS ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-gray-800 mb-1">Évolution des revenus & RETOUR FOND</h2>
          <p className="text-xs text-gray-400 mb-4">Montants en DH sur la même période sélectionnée</p>
          <div style={{ height: '220px' }}>
            <Bar data={timeRevenueData} options={timeRevenueOptions as any} />
          </div>
        </div>

        {/* ── TOP AGENTS & CHAUFFEURS ────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Top agents */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h2 className="font-bold text-gray-800">Top agents</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Agent', 'Ville', 'crees', 'livres', 'Taux'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topAgents.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8 text-sm">Aucune donnée</td></tr>
                ) : topAgents.map((a, i) => {
                  const taux = a.created > 0 ? Math.round((a.livres / a.created) * 100) : 0
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-semibold text-gray-800">{a.name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{a.city || '—'}</td>
                      <td className="px-4 py-3 font-bold text-blue-600">{a.created}</td>
                      <td className="px-4 py-3 font-bold text-green-600">{a.livres}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${taux >= 70 ? 'bg-green-100 text-green-700' : taux >= 40 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-600'}`}>
                          {taux}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Top chauffeurs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
              <Truck className="w-4 h-4 text-orange-600" />
              <h2 className="font-bold text-gray-800">Top chauffeurs</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Chauffeur', 'Ville', 'Missions', 'livres', 'Taux'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topDrivers.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8 text-sm">Aucune donnée</td></tr>
                ) : topDrivers.map((d, i) => {
                  const taux = d.deliveries > 0 ? Math.round((d.livres / d.deliveries) * 100) : 0
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-semibold text-gray-800">{d.name || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{d.city || '—'}</td>
                      <td className="px-4 py-3 font-bold text-orange-600">{d.deliveries}</td>
                      <td className="px-4 py-3 font-bold text-green-600">{d.livres}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${taux >= 70 ? 'bg-green-100 text-green-700' : taux >= 40 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-600'}`}>
                          {taux}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── TABLEAU AGENCES DÉTAIL ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-600" />
            <h2 className="font-bold text-gray-800">État détaillé par agence</h2>
          </div>
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                {['Agence', 'Total', 'En cours', 'livres', 'retournes', 'Taux', 'Revenus', 'RETOUR FOND'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cityStats.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-gray-400 py-10">Aucune donnée</td></tr>
              ) : cityStats.map(c => (
                <tr key={c.city} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-bold text-gray-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />{c.city}
                  </td>
                  <td className="px-4 py-3 font-bold text-blue-600">{c.total}</td>
                  <td className="px-4 py-3 font-semibold text-orange-500">{c.enCours}</td>
                  <td className="px-4 py-3 font-bold text-green-600">{c.livres}</td>
                  <td className="px-4 py-3 font-semibold text-red-500">{c.retournes}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-16">
                        <div className={`h-full rounded-full ${c.taux >= 70 ? 'bg-green-500' : c.taux >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                          style={{ width: `${Math.min(100, Math.max(0, Number(c.taux) || 0))}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${c.taux >= 70 ? 'text-green-600' : c.taux >= 40 ? 'text-orange-600' : 'text-red-500'}`}>
                        {c.taux}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-amber-600">{fmt(c.revenue)} DH</td>
                  <td className="px-4 py-3 font-semibold text-purple-600">{fmt(c.cod)} DH</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-3 font-bold text-gray-700">TOTAL</td>
                <td className="px-4 py-3 font-black text-blue-700">{fmt(kpis.total)}</td>
                <td className="px-4 py-3 font-black text-orange-600">{fmt(kpis.enCours)}</td>
                <td className="px-4 py-3 font-black text-green-700">{fmt(kpis.livres)}</td>
                <td className="px-4 py-3 font-black text-red-600">{fmt(kpis.retours)}</td>
                <td className="px-4 py-3 font-black text-teal-600">{kpis.taux}%</td>
                <td className="px-4 py-3 font-black text-amber-700">{fmt(kpis.revenue)} DH</td>
                <td className="px-4 py-3 font-black text-purple-700">{fmt(kpis.codTotal)} DH</td>
              </tr>
            </tfoot>
          </table>
        </div>

      </main>
    </div>
  )
}
