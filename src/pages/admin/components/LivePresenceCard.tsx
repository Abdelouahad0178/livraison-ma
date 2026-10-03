/**
 * 👁️ « L'œil qui ne dort pas » — utilisateurs connectés en temps réel + cadence de travail.
 * Source : collection presence/{uid} alimentée par le heartbeat client (src/services/presence.ts).
 * Lecture réservée Admin / Directeur (firestore.rules).
 */
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore'
import { Eye, Monitor, Smartphone, Package, PenLine, Wallet, Zap, Clock, ChevronDown } from 'lucide-react'
import { db } from '../../../firebase/db'
import { getCurrentOperationalDayString } from '../../../config/operationalDay'

const ONLINE_MAX_AGE_S = 45      // dernier signal < 90 s → connecté « frais »
const OFFLINE_AFTER_S = 75      // plus de signal depuis 3 min → hors ligne
const IDLE_AFTER_S = 5 * 60      // aucune saisie depuis 5 min → inactif

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', directeur: 'Directeur', agent: 'Agent', chef_agence: "Chef d'agence", agentpro: 'Agent PRO',
  aide_agent: 'Aide agent', chef_exploitation: "Chef d'exploitation", caissier: 'Caissier', chauffeur: 'Chauffeur',
  livreur: 'Livreur', 'livreur-gare': 'Livreur gare', encaisseur_central: 'Encaisseur central',
  analyseur_cheque: 'Analyse chèques', analyseur_espece: 'Analyse espèces', distributeur_especes: 'DRFE',
  distributeur_cheques: 'DRFC', facturier: 'Facturier', pointeur_encaisseur: 'Pointeur', client: 'Client',
}
const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700', directeur: 'bg-purple-100 text-purple-700', agent: 'bg-blue-100 text-blue-700',
  chef_agence: 'bg-indigo-100 text-indigo-700', agentpro: 'bg-indigo-100 text-indigo-700', aide_agent: 'bg-sky-100 text-sky-700',
  chef_exploitation: 'bg-violet-100 text-violet-700', caissier: 'bg-emerald-100 text-emerald-700',
  chauffeur: 'bg-amber-100 text-amber-700', livreur: 'bg-orange-100 text-orange-700', 'livreur-gare': 'bg-orange-100 text-orange-700',
  facturier: 'bg-teal-100 text-teal-700', client: 'bg-gray-100 text-gray-700',
}

type Status = 'active' | 'idle' | 'offline'

const toMs = (v: any): number => {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v?.toMillis === 'function') return v.toMillis()
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : 0
}

const ago = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')}`
  return `${Math.floor(h / 24)} j`
}

interface Row {
  uid: string
  name: string
  role: string
  city: string
  page: string
  device: string
  status: Status
  idleReason: string
  lastSeenMs: number
  lastActivityMs: number
  sessionMs: number
  actions: number
  created: number
  updated: number
  cod: number
  perHour: number
  activeMin: number
  spark: number[]
  score: number
}

export default function LivePresenceCard({ users = [] }: { users?: any[] }) {
  const [docs, setDocs] = useState<any[]>([])
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [roleFilter, setRoleFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [showOffline, setShowOffline] = useState(false)

  // Écoute temps réel (fiches vues dans les dernières 24 h)
  useEffect(() => {
    let unsub: (() => void) | null = null
    try {
      const since = Timestamp.fromMillis(Date.now() - 24 * 3600_000)
      unsub = onSnapshot(
        query(collection(db, 'presence'), where('lastSeen', '>=', since)),
        snap => {
          setDocs(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })))
          setError('')
        },
        err => setError(err?.code === 'permission-denied' ? 'Accès refusé (règles non déployées ?)' : 'Connexion temps réel interrompue'),
      )
    } catch {
      setError('Présence indisponible')
    }
    return () => { try { unsub?.() } catch { /* */ } }
  }, [])

  // Temps relatifs rafraîchis toutes les 15 s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(id)
  }, [])

  const userMap = useMemo(() => {
    const m = new Map<string, any>()
    for (const u of users) { if (u?.id) m.set(u.id, u); if (u?.uid) m.set(u.uid, u) }
    return m
  }, [users])

  const rows: Row[] = useMemo(() => {
    const today = getCurrentOperationalDayString()
    const curMinute = Math.floor(now / 60_000)
    return docs.map(d => {
      const u = userMap.get(d.id) || {}
      const lastSeenMs = toMs(d.lastSeen)
      const age = (now - lastSeenMs) / 1000
      const idleSec = typeof d.idleSec === 'number' ? d.idleSec : 999_999
      const lastActivityMs = lastSeenMs - idleSec * 1000
      const idle = (now - lastActivityMs) / 1000
      let status: Status
      let idleReason = ''
      if (d.online === false || !lastSeenMs || age > OFFLINE_AFTER_S) status = 'offline'
      else if (age <= ONLINE_MAX_AGE_S && idle < IDLE_AFTER_S && d.visible !== false) status = 'active'
      else {
        status = 'idle'
        idleReason = d.visible === false ? 'onglet en arrière-plan' : idle >= IDLE_AFTER_S ? `aucune saisie depuis ${ago(idle * 1000)}` : 'signal faible'
      }
      const isToday = d.day === today
      const actions = isToday ? Number(d.actionsToday) || 0 : 0
      const firstMs = isToday ? toMs(d.firstSeenToday) : 0
      const spanH = firstMs ? Math.max(0.25, (Math.max(lastSeenMs, firstMs) - firstMs) / 3600_000) : 0
      // Fenêtre 15 min recalée sur la minute courante
      const raw: number[] = Array.isArray(d.activity15) ? d.activity15.map((x: any) => Number(x) || 0) : []
      const shift = Math.max(0, curMinute - (Number(d.activityMinute) || curMinute))
      const spark = Array.from({ length: 15 }, (_, i) => {
        const src = i + shift
        return src < raw.length ? Math.min(6, raw[src]) : 0
      })
      const score = Math.round((spark.reduce((s, v) => s + v, 0) / 90) * 100)
      return {
        uid: d.id,
        name: u.name || d.name || 'Utilisateur',
        role: String(u.role || d.role || '').toLowerCase(),
        city: u.city || d.city || '',
        page: [d.pageLabel || d.currentPage, d.tab].filter(Boolean).join(' › '),
        device: d.device || 'desktop',
        status,
        idleReason,
        lastSeenMs,
        lastActivityMs,
        sessionMs: status !== 'offline' && d.sessionStart ? Math.max(0, now - toMs(d.sessionStart)) : 0,
        actions,
        created: isToday ? Number(d.parcelsCreatedToday) || 0 : 0,
        updated: isToday ? Number(d.parcelsUpdatedToday) || 0 : 0,
        cod: isToday ? Number(d.codCollectedToday) || 0 : 0,
        perHour: spanH ? Math.round(actions / spanH) : 0,
        activeMin: Math.round((actions * 10) / 60),
        spark,
        score: status === 'offline' ? 0 : score,
      }
    })
  }, [docs, userMap, now])

  const roles = useMemo(() => Array.from(new Set(rows.map(r => r.role).filter(Boolean))).sort(), [rows])
  const cities = useMemo(() => Array.from(new Set(rows.map(r => r.city).filter(Boolean))).sort(), [rows])

  // 📌 Ordre d'ARRIVÉE : au premier affichage, les connectés sont rangés Admin → Chef d'agence →
  // Agent Pro → autres ; ensuite, chaque nouvelle connexion s'ajoute EN BAS, sans déplacer les
  // cartes déjà affichées. Une déconnexion libère la place (reconnexion = de nouveau en bas).
  const arrivalRef = useRef<Map<string, number>>(new Map())
  const nextArrivalRef = useRef(0)
  const roleRank = (r: string) => (r === 'admin' ? 0 : r === 'chef_agence' ? 1 : r === 'agentpro' ? 2 : 3)
  const baseCmp = (a: Row, b: Row) =>
    roleRank(a.role) - roleRank(b.role)
    || (roleRank(a.role) === 3 ? String(a.role || '').localeCompare(String(b.role || '')) : 0)
    || String(a.city || '').localeCompare(String(b.city || ''))
    || a.name.localeCompare(b.name)
    || String(a.uid || '').localeCompare(String(b.uid || ''))
  const arrival = useMemo(() => {
    const map = arrivalRef.current
    const onlineNow = rows.filter(r => r.status !== 'offline')
    const onlineIds = new Set(onlineNow.map(r => r.uid))
    for (const id of [...map.keys()]) if (!onlineIds.has(id)) map.delete(id)
    onlineNow.filter(r => !map.has(r.uid)).sort(baseCmp).forEach(r => map.set(r.uid, nextArrivalRef.current++))
    return new Map(map)
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return rows
      .filter(r => (roleFilter === 'all' || r.role === roleFilter) && (cityFilter === 'all' || r.city === cityFilter))
      .sort((a, b) => {
        // 👑 L'Admin reste TOUJOURS en premier
        const aa = a.role === 'admin' ? 0 : 1, ab = b.role === 'admin' ? 0 : 1
        if (aa !== ab) return aa - ab
        const ia = arrival.get(a.uid), ib = arrival.get(b.uid)
        if (ia !== undefined && ib !== undefined) return ia - ib
        if (ia !== undefined) return -1
        if (ib !== undefined) return 1
        return b.lastSeenMs - a.lastSeenMs // hors ligne : les plus récents d'abord
      })
  }, [rows, roleFilter, cityFilter, arrival])

  const counts = useMemo(() => ({
    active: filtered.filter(r => r.status === 'active').length,
    idle: filtered.filter(r => r.status === 'idle').length,
    offline: filtered.filter(r => r.status === 'offline').length,
    created: filtered.reduce((s, r) => s + r.created, 0),
    updated: filtered.reduce((s, r) => s + r.updated, 0),
  }), [filtered])

  const live = filtered.filter(r => r.status !== 'offline')
  const offline = filtered.filter(r => r.status === 'offline')

  return (
    <div className="rounded-3xl overflow-hidden shadow-lg border border-slate-200 bg-white">
      {/* En-tête */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-5 py-4 text-white">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <Eye className="w-6 h-6 text-cyan-300" />
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base sm:text-lg leading-tight">L'œil qui ne dort pas</h3>
              <p className="text-xs text-slate-300">Utilisateurs en temps réel · cadence de travail du jour</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="bg-white/10 border border-white/20 text-white text-xs font-semibold rounded-xl px-3 py-2 [&>option]:text-gray-900">
              <option value="all">Tous les rôles</option>
              {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
            </select>
            <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
              className="bg-white/10 border border-white/20 text-white text-xs font-semibold rounded-xl px-3 py-2 [&>option]:text-gray-900">
              <option value="all">Toutes les villes</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Compteurs */}
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
          <Counter label="En ligne" value={counts.active} dot="bg-emerald-400" />
          <Counter label="Inactifs" value={counts.idle} dot="bg-amber-400" />
          <Counter label="Hors ligne" value={counts.offline} dot="bg-slate-400" />
          <Counter label="Créées auj." value={counts.created} className="hidden sm:block" />
          <Counter label="Modifiées auj." value={counts.updated} className="hidden sm:block" />
        </div>
      </div>

      {/* Corps */}
      <div className="p-3 sm:p-4 space-y-3 bg-slate-50/60">
        {error && <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</div>}

        {live.length === 0 && !error && (
          <div className="text-center text-sm text-gray-400 py-6">Aucun utilisateur connecté en ce moment.</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {live.map(r => <PresenceRow key={r.uid} r={r} now={now} />)}
        </div>

        {offline.length > 0 && (
          <div>
            <button onClick={() => setShowOffline(v => !v)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50 transition">
              <span>⚪ Hors ligne ({offline.length}) — vus dans les dernières 24 h</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showOffline ? 'rotate-180' : ''}`} />
            </button>
            {showOffline && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2">
                {offline.map(r => (
                  <div key={r.uid} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl px-3 py-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm text-gray-700 truncate">{r.name}</span>
                        <RoleBadge role={r.role} />
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {r.city || '—'} · vu il y a {ago(now - r.lastSeenMs)}
                        {(r.created + r.updated) > 0 && ` · ${r.created} créées / ${r.updated} modifiées auj.`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Counter({ label, value, dot, className = '' }: { label: string; value: number; dot?: string; className?: string }) {
  return (
    <div className={`bg-white/10 rounded-2xl px-3 py-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-semibold">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-xl font-black leading-tight"><FlashValue value={value} /></div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  if (!role) return null
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'}`}>
      {ROLE_LABELS[role] || role}
    </span>
  )
}

function PresenceRowImpl({ r, now }: { r: Row; now: number }) {
  const isActive = r.status === 'active'
  const DeviceIcon = r.device === 'mobile' ? Smartphone : Monitor
  return (
    <div className={`bg-white rounded-2xl border p-3 shadow-sm ${isActive ? 'border-emerald-100' : 'border-amber-100'}`}>
      <div className="flex items-start gap-3">
        <span className="relative flex h-3 w-3 mt-1.5 shrink-0">
          {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex rounded-full h-3 w-3 ${isActive ? 'bg-emerald-500' : 'bg-amber-400'}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="font-bold text-sm text-gray-900 truncate max-w-[60%]">{r.name}</span>
            <RoleBadge role={r.role} />
            {r.city && <span className="text-[11px] text-gray-500">📍 {r.city}</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 min-w-0">
            <DeviceIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{r.page || '—'}</span>
          </div>
          <div className={`mt-0.5 text-[11px] font-semibold ${isActive ? 'text-emerald-600' : 'text-amber-600'}`}>
            {isActive ? `🟢 Actif · dernière action il y a ${ago(now - r.lastActivityMs)}` : `🟡 Inactif · ${r.idleReason}`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center justify-end gap-1 text-[11px] text-gray-400"><Clock className="w-3 h-3" />session</div>
          <div className="text-xs font-bold text-gray-700">{r.sessionMs ? ago(r.sessionMs) : '—'}</div>
        </div>
      </div>

      {/* Cadence */}
      <div className="mt-3 flex items-end gap-3">
        <div className="grid grid-cols-4 gap-1.5 flex-1 min-w-0">
          <Metric icon={<Zap className="w-3 h-3" />} label="act./h" value={r.perHour} title={`${r.actions} tranches actives de 10 s aujourd'hui (≈ ${r.activeMin} min actives)`} />
          <Metric icon={<Package className="w-3 h-3" />} label="créées" value={r.created} title="Expéditions créées aujourd'hui" />
          <Metric icon={<PenLine className="w-3 h-3" />} label="modif." value={r.updated} title="Mises à jour d'expéditions aujourd'hui (statut, correction, affectation)" />
          <Metric icon={<Wallet className="w-3 h-3" />} label="RF" value={r.cod} title="Retours de fonds encaissés aujourd'hui" />
        </div>
        <div className="shrink-0" title={`Activité des 15 dernières minutes : ${r.score}%`}>
          <div className="flex items-end gap-[2px] h-8">
            {r.spark.map((v, i) => (
              <span key={i}
                className={`w-[5px] rounded-sm ${v === 0 ? 'bg-slate-200' : isActive ? 'bg-emerald-500' : 'bg-amber-400'}`}
                style={{ height: `${Math.max(12, (v / 6) * 100)}%` }} />
            ))}
          </div>
          <div className="text-[10px] text-gray-400 text-right mt-0.5">15 min · {r.score}%</div>
        </div>
      </div>
    </div>
  )
}

// ⚡ Une carte n'est redessinée que si SES valeurs affichées changent (mise à jour en arrière-plan,
// rien ne bouge ailleurs).
const rowSig = (r: Row, now: number) => [
  r.name, r.role, r.city, r.page, r.device, r.status, r.idleReason,
  r.sessionMs ? ago(r.sessionMs) : '', r.status === 'active' ? ago(now - r.lastActivityMs) : '',
  r.perHour, r.actions, r.activeMin, r.created, r.updated, r.cod, r.score, r.spark.join(','),
].join('|')
const PresenceRow = memo(PresenceRowImpl, (a, b) => rowSig(a.r, a.now) === rowSig(b.r, b.now))

/** Chiffre qui « s'allume » brièvement quand SA valeur change. */
function FlashValue({ value, className = '' }: { value: number | string; className?: string }) {
  const prev = useRef(value)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1200)
      return () => clearTimeout(t)
    }
  }, [value])
  return (
    <span className={`inline-block rounded px-1 transition-colors duration-700 ${flash ? 'bg-emerald-200 text-emerald-900' : ''} ${className}`}>{value}</span>
  )
}

function Metric({ icon, label, value, title }: { icon: ReactNode; label: string; value: number; title: string }) {
  return (
    <div className="bg-slate-50 rounded-xl px-2 py-1.5 text-center" title={title}>
      <div className="text-sm font-black text-gray-800 leading-none"><FlashValue value={value} /></div>
      <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] text-gray-500">{icon}{label}</div>
    </div>
  )
}
