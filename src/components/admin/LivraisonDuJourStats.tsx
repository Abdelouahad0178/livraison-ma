import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/db'
import { caisseCodAmountOfType } from '../../utils/agencyCaisseRules'
import { fmt } from '../../utils/formatNumber'

/**
 * 🚚 En-tête Admin — argent de la LIVRAISON DU JOUR (demande de l'admin, 22/10/2026) :
 * les expéditions d'HIER se livrent aujourd'hui (lundi : celles du samedi et du dimanche ; dimanche : celles du samedi).
 * Deux grands chiffres FIXES pour la journée (toutes ces expéditions, livrées / encaissées ou non ; annulées exclues) :
 * 💵 COD espèces (ville de DESTINATION) · 💰 ports = dus (ville de DESTINATION) + payés (encaissés au départ, ville d'ORIGINE).
 * Jour = journée de livraison à l'horloge : nouveaux chiffres à partir de 06:00 (deliveryDayNow). Lecture : parcelsLite.
 */
const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fr = (k: string) => k.split('-').reverse().slice(0, 2).join('/')
/** Journées d'opération dont les expéditions se livrent le jour `day` (AAAA-MM-JJ). */
export function batchDaysFor(day: string): string[] {
  const d = new Date(`${day}T12:00:00`)
  const back = (n: number) => { const x = new Date(d); x.setDate(x.getDate() - n); return keyOf(x) }
  const dow = d.getDay() // 0 dimanche, 1 lundi
  if (dow === 1) return [back(2), back(1)] // lundi : samedi + dimanche
  if (dow === 0) return [back(1)]          // dimanche : samedi
  return [back(1)]
}
/** Journée de livraison affichée : celle d'aujourd'hui à partir de 06:00, sinon encore celle d'hier (demande du 22/10/2026). */
export function deliveryDayNow(now = new Date()): string {
  const d = new Date(now)
  if (d.getHours() < 6) d.setDate(d.getDate() - 1)
  return keyOf(d)
}
// Couleur selon le rang (plus grand montant d'abord) : rouge, orange, ambre, bleu, violet, puis gris
const RANK_COLORS = [
  { text: 'text-red-600', bar: 'bg-red-500' },
  { text: 'text-orange-600', bar: 'bg-orange-500' },
  { text: 'text-amber-600', bar: 'bg-amber-400' },
  { text: 'text-blue-600', bar: 'bg-blue-500' },
  { text: 'text-violet-600', bar: 'bg-violet-500' },
  { text: 'text-gray-600', bar: 'bg-gray-400' },
]

/**
 * ⚡ UNE seule écoute par page et par (journées, villes), partagée par toutes les cartes affichées (version ordinateur +
 * version téléphone) — avant : chaque carte écoutait ~800 expéditions de TOUTES les villes (×2 par page).
 * Avec des villes : seulement les expéditions À DESTINATION de ces villes + celles PARTIES de ces villes (ports payés).
 */
type SharedEntry = { rows: any[] | null; subs: Set<(r: any[]) => void>; stop: () => void }
const shared = new Map<string, SharedEntry>()
function subscribeDayRows(days: string[], cities: string[] | undefined, cb: (rows: any[]) => void): () => void {
  const key = `${days.join('|')}#${cities?.length ? [...cities].sort().join(',') : '*'}`
  let entry = shared.get(key)
  if (!entry) {
    const e: SharedEntry = { rows: null, subs: new Set(), stop: () => {} }
    entry = e
    shared.set(key, e)
    const col = collection(db, 'parcelsLite')
    const qs: [string, ReturnType<typeof query>][] = cities?.length
      ? [['dest', query(col, where('workDate', 'in', days), where('destinationCity', 'in', cities))],
         ['orig', query(col, where('workDate', 'in', days), where('originCity', 'in', cities))]]
      : [['all', query(col, where('workDate', 'in', days))]]
    const parts = new Map<string, any[]>()
    const emit = () => {
      if (parts.size < qs.length) return
      const m = new Map<string, any>()
      for (const list of parts.values()) for (const p of list) m.set(p.id, p)
      e.rows = [...m.values()]
      e.subs.forEach(f => f(e.rows as any[]))
    }
    const unsubs = qs.map(([k, q]) => onSnapshot(q,
      snap => { parts.set(k, snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))); emit() },
      err => { console.warn('Livraison du jour :', err); parts.set(k, []); emit() }))
    e.stop = () => unsubs.forEach(u => u())
  }
  const e = entry
  e.subs.add(cb)
  if (e.rows) cb(e.rows)
  return () => { e.subs.delete(cb); if (!e.subs.size) { e.stop(); shared.delete(key) } }
}

const normCity = (c: unknown) => String(c ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/gi, '').toLowerCase()

/** `cities` : limiter aux villes données (ex. chef d'agence Agadir + Ait Melloul) ; absent = toutes les villes (admin). */
export default function LivraisonDuJourStats({ mobile = false, cities }: Readonly<{ mobile?: boolean; cities?: string[] }>) {
  const [day, setDay] = useState(deliveryDayNow())
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    const t = setInterval(() => setDay(deliveryDayNow()), 60000) // nouvelle journée à 06:00
    return () => clearInterval(t)
  }, [])
  const days = useMemo(() => batchDaysFor(day), [day])
  useEffect(() => {
    setRows(null)
    return subscribeDayRows(days, cities, setRows)
  }, [days.join('|'), cities?.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = useMemo(() => {
    const r = { n: 0, livrees: 0, cod: 0, codN: 0, portDu: 0, portPaye: 0, byCity: {} as Record<string, { n: number; cod: number; port: number; codN: number; portDu: number; portPaye: number }> }
    const cityOf = (city: string) => r.byCity[city] || (r.byCity[city] = { n: 0, cod: 0, port: 0, codN: 0, portDu: 0, portPaye: 0 })
    const allowed = cities?.length ? new Set(cities.map(normCity)) : null
    const inScope = (city: unknown) => !allowed || allowed.has(normCity(city))
    // 📌 TOTAUX FIXES de la journée (22/10/2026) : toutes les expéditions des journées livrées aujourd'hui, quel que soit
    // leur avancement (livrées, encaissées ou non) — avant, une expédition livrée / encaissée sortait du total, qui
    // baissait au fil de la journée. Seules les expéditions annulées sont exclues.
    for (const p of rows || []) {
      if (p.status === 'Annulé') continue
      const price = Number(p.price) || 0
      // 💰 Port PAYÉ : encaissé AU DÉPART par l'agence d'ORIGINE (guichet), quel que soit le statut de livraison
      // → rangé dans la ville d'origine (demande de l'admin, 22/10/2026). Avant : rangé à tort dans la ville de destination.
      const origin = p.originCity || p.sender?.city || '?'
      if (p.portType === 'port_paye' && price > 0 && inScope(origin)) {
        const o = cityOf(origin)
        r.portPaye += price; o.port += price; o.portPaye += price
      }
      if (!inScope(p.destinationCity)) continue
      r.n++
      if (p.status === 'Livré') r.livrees++
      const c = cityOf(p.destinationCity || '?')
      c.n++
      // 💵 COD espèces (part espèces d'un COD mixte comprise), encaissé ou non
      const cash = caisseCodAmountOfType(p, 'especes')
      if (cash > 0) { r.cod += cash; r.codN++; c.cod += cash; c.codN++ }
      // Port DÛ : encaissé à la LIVRAISON, ville de destination, collecté ou non
      if ((p.portType === 'port_du' || p.portType === 'port_du_cheque') && price > 0) { r.portDu += price; c.port += price; c.portDu += price }
    }
    return r
  }, [rows, cities?.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const head = `Livraison du ${fr(day)} — totaux FIXES des expéditions du ${days.map(fr).join(' et du ')} : ${s.n} (déjà livrées : ${s.livrees}) · nouveaux chiffres demain à 06:00`
  const tile = 'rounded-xl px-3 py-1.5 border text-right leading-tight cursor-default'
  /** 🏙️ Détail par ville au survol : classées du plus grand montant au plus petit — 1re en ROUGE, 2e en orange, etc. */
  const cityPanel = (kind: 'cod' | 'port') => {
    const list = Object.entries(s.byCity).map(([city, v]) => ({ city, v, amount: kind === 'cod' ? v.cod : v.port }))
      .filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount)
    const total = kind === 'cod' ? s.cod : s.portDu + s.portPaye
    return (
      <div className={`${mobile ? 'fixed left-3 right-3 top-32' : 'absolute right-0 top-full mt-2 w-80'} hidden group-hover:block group-focus-within:block z-50 rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-2xl`}>
        <div className="text-xs font-black text-gray-800">{kind === 'cod' ? '💵 COD espèces par ville' : '💰 Port dû + port payé par ville (sans ports en compte)'}</div>
        <div className="mb-2 text-[10px] text-gray-500">{head}</div>
        {list.length === 0 ? <div className="text-xs text-gray-400">Aucun montant.</div> : list.map((x, i) => {
          const c = RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)]
          const pct = total > 0 ? Math.round(x.amount / total * 100) : 0
          return (
            <div key={x.city} className="mb-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-bold ${c.text}`}>{i + 1}. {x.city}</span>
                <span className={`tabular-nums font-black ${c.text} ${i === 0 ? 'text-base' : 'text-sm'}`}>{fmt(x.amount)} DH</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${c.bar}`} style={{ width: `${pct}%` }} /></div>
              <div className="text-[10px] text-gray-500">{kind === 'cod' ? `${x.v.codN} COD espèces · ${pct} %` : `port dû ${fmt(x.v.portDu)} · port payé ${fmt(x.v.portPaye)} · ${pct} %`}{x.v.n ? ` · ${x.v.n} exp.` : ''}</div>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className={mobile ? 'flex md:hidden flex-wrap items-center gap-2' : 'hidden md:flex items-center gap-2'}>
      <div className={`text-[10px] leading-tight text-gray-500 ${mobile ? 'w-full' : 'text-right'}`} title={head}>
        <div className="font-bold text-gray-700">🚚 Livraison du {fr(day)}</div>
        <div>exp. du {days.map(fr).join(' + ')} · {rows ? `${s.n} exp. · ${s.livrees} livrées` : 'chargement…'}</div>
      </div>
      <div className={`relative group outline-none ${mobile ? 'flex-1' : ''}`} tabIndex={0}>
        <div className={`${tile} bg-emerald-50 border-emerald-200`}>
          <div className="text-lg font-black text-emerald-700 tabular-nums">{rows ? fmt(s.cod) : '…'} <span className="text-xs">DH</span></div>
          <div className="text-[10px] font-semibold text-emerald-800">💵 COD espèces{rows ? ` (${s.codN})` : ''}</div>
        </div>
        {rows && cityPanel('cod')}
      </div>
      <div className={`relative group outline-none ${mobile ? 'flex-1' : ''}`} tabIndex={0}>
        {/* 💰 Deux chiffres séparés : Port dû · Port payé (les ports en compte ne sont jamais comptés) */}
        <div className={`${tile} bg-blue-50 border-blue-200 flex items-stretch gap-3`}>
          <div>
            <div className="text-lg font-black text-orange-600 tabular-nums">{rows ? fmt(s.portDu) : '…'} <span className="text-xs">DH</span></div>
            <div className="text-[10px] font-semibold text-orange-700">📮 Port dû</div>
          </div>
          <div className="w-px bg-blue-200" />
          <div>
            <div className="text-lg font-black text-blue-700 tabular-nums">{rows ? fmt(s.portPaye) : '…'} <span className="text-xs">DH</span></div>
            <div className="text-[10px] font-semibold text-blue-800">✅ Port payé</div>
          </div>
        </div>
        {rows && cityPanel('port')}
      </div>
    </div>
  )
}
