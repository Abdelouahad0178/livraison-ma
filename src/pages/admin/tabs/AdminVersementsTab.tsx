// 💼 Admin › Versements (refonte du 30/10/2026) — UNE page simple pour tout l'argent versé à l'admin.
// Circuit : livreur → chef d'exploitation → chef d'agence → ADMIN.
//  • Soldes : chez les chefs d'agence (à verser), pas encore reçu (chez les chefs d'exploitation), écarts à régulariser,
//    à valider, validé ce mois — mêmes calculs que l'onglet Versements du chef d'agence ;
//  • Onglets : À valider · Par agence · Historique · Écarts.
// Flux corrigé :
//  • valider = saisir le MONTANT REÇU (l'envoyé est gardé, l'écart suivi) ; refuser = expéditions de nouveau « à verser » ;
//  • un versement de chef d'agence ne se modifie plus (montant, statut) : seulement sa note ; supprimer = refus définitif
//    (expéditions de nouveau « à verser ») ;
//  • « Versement reçu directement » : argent remis en main propre (ex. régularisation d'un écart), enregistré validé.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { collection, documentId, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { MONEY_START } from '../../../utils/moneyFlow'
import { CheckCircle, Clock, Eye, Pencil, Plus, Search, Trash2, Wallet, X, XCircle } from 'lucide-react'
import { db } from '../../../firebase/config'
import { CITIES } from '../../../firebase/constants'
import { confirmAdminTransferWithAmount } from '../../../firebase/caisse'
import { fmt } from '../../../utils/formatNumber'
import { printVersementParcels } from '../../../utils/agentPrintUtils'
import { summarizeEcarts, transferEcart, transferSent } from '../../../utils/versementEcarts'

/** Reste d'une agence (copie allégée versementDays) : à verser, pas encore reçu (dont au guichet), journées à verser. */
interface Reste { amount: number; nonRecu: number; nonRecuGuichet: number; days: number; updatedAt: number; ready: boolean }

const dateOf = (t: any): Date => t?.createdAt?.toDate?.() || new Date(t?.createdAt || 0)
const fmtDT = (d: Date) => `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
const num = (v: any) => parseFloat(v) || 0
/** Versement d'un chef d'agence (créé depuis Caisse Agence) : non modifiable sauf la note. */
const isAgencyTransfer = (t: any) => ['port', 'cod', 'regul'].includes(t?.kind) && t?.fromRole !== 'admin'
/** Versement d'avant le début du vrai calcul (05/10/2026 08:00) */
const isOld = (t: any) => dateOf(t) < MONEY_START
const STATUS_BORDER: Record<string, string> = { pending: 'border-l-amber-400', confirmed: 'border-l-emerald-500', rejected: 'border-l-red-500' }
const NATURE = (t: any): { label: string; cls: string } =>
  t.kind === 'port' ? { label: '📮 Ports collectés', cls: 'bg-orange-100 text-orange-800' }
  : t.kind === 'cod' ? { label: '💰 COD', cls: 'bg-emerald-100 text-emerald-800' }
  : t.kind === 'regul' ? { label: '⚖️ Régularisation', cls: 'bg-violet-100 text-violet-800' }
  : t.fromRole === 'admin' ? { label: '✍️ Reçu directement', cls: 'bg-slate-100 text-slate-700' }
  : { label: '📦 Ancien versement', cls: 'bg-gray-100 text-gray-700' }
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: '⏳ À valider', cls: 'bg-amber-100 text-amber-800' },
  confirmed: { label: '✅ Validé', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: '❌ Refusé', cls: 'bg-red-100 text-red-800' },
}
type Tab = 'valider' | 'agences' | 'historique' | 'ecarts'

export default function AdminVersementsTab({
  adminTransfers = [], confirmAdminTransfer, rejectAdminTransfer, createAdminTransferDirect, updateAdminTransfer, deleteAdminTransfer, auth,
}: any) {
  const me = { name: auth?.currentUser?.displayName || 'Admin', id: auth?.currentUser?.uid || '' }
  const [tab, setTab] = useState<Tab>('valider')
  // Historique : filtres
  const [city, setCity] = useState('all')
  const [status, setStatus] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  // Fenêtres
  const [validate, setValidate] = useState<any>(null)
  const [received, setReceived] = useState('')
  const [reject, setReject] = useState<any>(null)
  const [reason, setReason] = useState('')
  const [noteEdit, setNoteEdit] = useState<any>(null)
  const [del, setDel] = useState<any>(null)
  const [direct, setDirect] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  // 💼 Reste à verser par agence — COPIE ALLÉGÉE (30/10/2026) : versementDays = totaux par journée et par agence tenus
  // par le serveur (Cloud Function syncVersementStats, MÊME règle que les pages : collecteContributionFor). Une centaine
  // de petits documents en temps réel, au lieu des collectes de chaque ville (avant : 30 s et ~80 Mo, puis à la demande).
  const [days, setDays] = useState<any[] | null>(null)
  useEffect(() => onSnapshot(collection(db, 'versementDays'),
    s => setDays(s.docs.map(d => d.data())), e => { console.error('Versements — copie allégée', e); setDays([]) }), [])
  const reste = useMemo(() => {
    const m: Record<string, Reste> = {}
    for (const d of days || []) {
      const r = m[d.city] || (m[d.city] = { amount: 0, nonRecu: 0, nonRecuGuichet: 0, days: 0, updatedAt: 0, ready: true })
      r.amount = Math.round((r.amount + num(d.aVerser)) * 100) / 100
      r.nonRecu = Math.round((r.nonRecu + num(d.nonRecu)) * 100) / 100
      r.nonRecuGuichet = Math.round((r.nonRecuGuichet + num(d.nonRecu_portPaye)) * 100) / 100
      if (num(d.aVerser) > 0.009) r.days++
      r.updatedAt = Math.max(r.updatedAt, d.updatedAt?.toMillis?.() || 0)
    }
    return m
  }, [days])

  // 📋 TOUT l'historique (30/10/2026) : la liste reçue de la page Admin écarte les versements d'avant le 05/10 08:00
  // (début du vrai calcul) — 5 versements invisibles, dont un en attente depuis le 03/10. Ici : lecture complète ;
  // les anciens sont marqués « avant le 05/10 ».
  const [raw, setRaw] = useState<any[] | null>(null)
  useEffect(() => onSnapshot(query(collection(db, 'adminTransfers'), orderBy('createdAt', 'desc')),
    s => setRaw(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.error('Versements admin', e)), [])
  const all = useMemo(() => [...(raw ?? adminTransfers ?? [])].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()), [raw, adminTransfers])
  const pending = useMemo(() => all.filter(t => t.status === 'pending').sort((a, b) => dateOf(a).getTime() - dateOf(b).getTime()), [all])
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const monthName = monthStart.toLocaleDateString('fr-FR', { month: 'long' })
  const sum = (l: any[]) => l.reduce((s, t) => s + num(t.amount), 0)
  const cities = (CITIES as string[])
  const byCity = cities.map(c => {
    const mine = all.filter(t => t.city === c)
    return {
      city: c, reste: reste[c], ecart: summarizeEcarts(mine),
      pending: mine.filter(t => t.status === 'pending'),
      month: mine.filter(t => t.status === 'confirmed' && dateOf(t) >= monthStart),
      last: mine.find(t => t.status !== 'rejected'),
    }
  }).filter(r => r.pending.length || r.month.length || r.last || r.ecart.reste > 0 || (r.reste && (r.reste.amount > 0 || r.reste.nonRecu > 0)))
  const ready = days !== null
  const T = {
    aVerser: cities.reduce((s, c) => s + (reste[c]?.amount || 0), 0),
    nonRecu: cities.reduce((s, c) => s + (reste[c]?.nonRecu || 0), 0),
    nonRecuGuichet: cities.reduce((s, c) => s + (reste[c]?.nonRecuGuichet || 0), 0),
    ecart: byCity.reduce((s, r) => s + r.ecart.reste, 0),
    month: sum(all.filter(t => t.status === 'confirmed' && dateOf(t) >= monthStart)),
  }

  const hist = all.filter(t => {
    if (city !== 'all' && t.city !== city) return false
    if (status !== 'all' && t.status !== status) return false
    const d = dateOf(t)
    if (from && d < new Date(`${from}T00:00:00`)) return false
    if (to && d > new Date(`${to}T23:59:59`)) return false
    const n = q.trim().toLowerCase()
    if (n && ![t.fromName, t.note, t.city].some(v => String(v || '').toLowerCase().includes(n))) return false
    return true
  })

  // ── Actions ─────────────────────────────────────────────────────────────────────────────────────────────────
  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true)
    try { await fn(); alert(ok); return true } catch (e: any) { alert(`❌ ${e?.message || e}`); return false } finally { setBusy(false) }
  }
  const doValidate = async () => {
    const sent = transferSent(validate)
    const r = received === '' ? sent : Number(received)
    if (!(r > 0) || r > sent + 0.001) { alert(`❌ Montant reçu invalide (entre 0 et ${fmt(sent)} DH).`); return }
    const ecart = Math.round((sent - r) * 100) / 100
    if (ecart > 0.009 && !confirm(`Valider ${fmt(r)} DH reçus sur ${fmt(sent)} DH envoyés ?\nÉcart de ${fmt(ecart)} DH à régulariser par ${validate.city}.`)) return
    const ok = await run(() => (ecart > 0.009 ? confirmAdminTransferWithAmount(validate.id, r, me.name, me.id) : confirmAdminTransfer(validate.id, me.name, me.id)),
      ecart > 0.009 ? `✅ Validé : ${fmt(r)} DH reçus — écart ${fmt(ecart)} DH à régulariser` : '✅ Versement validé')
    if (ok) setValidate(null)
  }
  const doReject = async () => {
    if (!reason.trim()) { alert('❌ Indiquez le motif du refus'); return }
    let released = 0
    const ok = await run(async () => { released = await rejectAdminTransfer(reject.id, me.name, me.id, reason.trim()) }, '✅ Versement refusé')
    if (ok) { setReject(null); setReason(''); if (released) alert(`${released} expédition(s) de nouveau « à verser » chez le chef d'agence`) }
  }
  const doNote = async () => {
    const t = noteEdit.t
    const ok = await run(() => updateAdminTransfer(t.id, { amount: t.amount, paymentType: t.paymentType || 'especes', type: t.type, note: noteEdit.note }, me.id), '✅ Note enregistrée')
    if (ok) setNoteEdit(null)
  }
  const doDelete = async () => {
    const ok = await run(() => deleteAdminTransfer(del.id, me.id), '✅ Versement supprimé')
    if (ok) setDel(null)
  }
  const doDirect = async () => {
    const d = direct
    if (!d.city || !d.fromName || !(num(d.amount) > 0)) { alert('❌ Agence, nom et montant sont obligatoires'); return }
    const ok = await run(() => createAdminTransferDirect({
      city: d.city, fromName: d.fromName, fromRole: 'admin', amount: d.amount, paymentType: d.paymentType, type: 'port_du',
      status: 'confirmed', reference: d.reference, note: d.regul ? `Régularisation d'écart reçue directement${d.note ? ` — ${d.note}` : ''}` : d.note,
      ...(d.regul ? { kind: 'regul' } : {}),
    }, me.id, me.name), '✅ Versement enregistré')
    if (ok) setDirect(null)
  }
  const showParcels = async (t: any) => {
    const ids: string[] = (t.codParcelIds || []).filter(Boolean)
    if (!ids.length) { alert('Aucune expédition dans ce versement'); return }
    const parcels: any[] = []
    for (let i = 0; i < ids.length; i += 30) {
      const s = await getDocs(query(collection(db, 'parcels'), where(documentId(), 'in', ids.slice(i, i + 30))))
      s.forEach(d => parcels.push({ id: d.id, ...d.data() }))
    }
    printVersementParcels(parcels, t, { name: t.fromName, city: t.city })
  }

  // ── Affichage ───────────────────────────────────────────────────────────────────────────────────────────────
  const card = 'bg-white rounded-2xl border border-slate-100 shadow-sm'
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-teal-50'}`
  const sel = 'px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700'
  const Amount = ({ t }: { t: any }) => (
    <div className="text-right">
      <div className="font-black tabular-nums text-slate-800">{fmt(num(t.amount))} DH</div>
      {transferEcart(t) > 0 && <div className="text-[11px] font-semibold text-red-700">envoyé {fmt(transferSent(t))} · écart {fmt(transferEcart(t))}</div>}
      {t.status === 'pending' && t.amountSent != null && Math.abs(transferSent(t) - num(t.amount)) > 0.009 && <div className="text-[11px] text-slate-500">envoyé {fmt(transferSent(t))}</div>}
    </div>
  )
  const Actions = ({ t }: { t: any }) => (
    <div className="flex flex-wrap justify-end gap-1.5">
      {(t.codParcelIds || []).length > 0 && <button onClick={() => showParcels(t)} title="Imprimer les expéditions" className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"><Eye className="w-4 h-4" /></button>}
      {t.status === 'pending' && <>
        <button onClick={() => { setReceived(''); setValidate(t) }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"><CheckCircle className="w-4 h-4" /> Valider</button>
        <button onClick={() => { setReason(''); setReject(t) }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold"><XCircle className="w-4 h-4" /> Refuser</button>
      </>}
      <button onClick={() => setNoteEdit({ t, note: t.note || '' })} title="Modifier la note" className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"><Pencil className="w-4 h-4" /></button>
      <button onClick={() => setDel(t)} title="Supprimer" className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4" /></button>
    </div>
  )
  const Tile = ({ cls, title, value, sub }: { cls: string; title: string; value: string; sub?: string }) => (
    <div className={`rounded-2xl border p-4 ${cls}`}><p className="text-xs font-bold">{title}</p><p className="mt-1 text-2xl font-black tabular-nums">{value}</p>{sub && <p className="text-xs opacity-80">{sub}</p>}</div>
  )

  return (
    <div className="mt-4 space-y-4">

      {/* 🧪 Page en essai (30/10/2026) */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 flex items-center gap-2">
        <span className="text-lg">🧪</span>
        <p><b>Page en essai</b> — les chiffres et les fonctions de cette page sont en cours de vérification.</p>
      </div>

      {/* En-tête */}
      <div className={`${card} p-4 flex flex-wrap items-center gap-3`}>
        <div className="flex-1 min-w-60">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Wallet className="w-5 h-5 text-teal-600" /> Versements à l'admin</h2>
          <p className="text-xs text-slate-500">Circuit : livreur → chef d'exploitation → chef d'agence → <b>admin</b>. Validez avec le montant réellement reçu : un écart reste « à régulariser » chez le chef d'agence.</p>
        </div>
        <button onClick={() => setDirect({ city: '', fromName: '', amount: '', paymentType: 'especes', reference: '', note: '', regul: false })}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold"><Plus className="w-4 h-4" /> Versement reçu directement</button>
      </div>

      {/* Soldes */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile cls="border-violet-200 bg-violet-50 text-violet-800" title="💼 Chez les chefs d'agence — à verser" value={ready ? `${fmt(T.aVerser)} DH` : '⏳'} sub="dans leur caisse, versable" />
        <Tile cls="border-orange-200 bg-orange-50 text-orange-800" title="🚚 Pas encore reçu par les chefs d'agence" value={ready ? `${fmt(T.nonRecu)} DH` : '⏳'}
          sub={ready ? `dont ${fmt(T.nonRecuGuichet)} DH au guichet (ports payés pas encore remis)` : undefined} />
        <Tile cls="border-red-200 bg-red-50 text-red-800" title="⚠️ Écarts à régulariser" value={`${fmt(T.ecart)} DH`} sub="envoyé − reçu − régularisations" />
        <Tile cls="border-amber-200 bg-amber-50 text-amber-800" title="⏳ À valider" value={`${fmt(sum(pending))} DH`} sub={`${pending.length} versement(s)`} />
        <Tile cls="border-emerald-200 bg-emerald-50 text-emerald-800" title={`✅ Validé en ${monthName}`} value={`${fmt(T.month)} DH`} />
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab('valider')} className={chip(tab === 'valider')}>⏳ À valider ({pending.length})</button>
        <button onClick={() => setTab('agences')} className={chip(tab === 'agences')}>🏢 Par agence</button>
        <button onClick={() => setTab('historique')} className={chip(tab === 'historique')}>📋 Historique ({all.length})</button>
        <button onClick={() => setTab('ecarts')} className={chip(tab === 'ecarts')}>⚠️ Écarts{T.ecart > 0 ? ` (${fmt(T.ecart)} DH)` : ''}</button>
      </div>

      {/* À valider */}
      {tab === 'valider' && (
        <div className={`${card} p-4`}>
          {!pending.length ? <p className="text-sm font-semibold text-emerald-700">✓ Aucun versement à valider.</p> : (
            <div className="space-y-2">
              {pending.map(t => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
                  <div className="flex-1 min-w-56">
                    <p className="font-bold text-slate-800"><span className={`mr-1.5 rounded-full px-2 py-0.5 text-[11px] ${NATURE(t).cls}`}>{NATURE(t).label}</span>{t.city} · {t.fromName || '—'}</p>
                    <p className="text-xs text-slate-600">{t.note || '—'}{t.codParcelCount ? ` · ${t.codParcelCount} exp.` : ''} · envoyé le {fmtDT(dateOf(t))}
                      {isOld(t) && <span className="ml-1.5 rounded bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600">avant le 05/10 — en attente depuis {Math.floor((Date.now() - dateOf(t).getTime()) / 864e5)} j</span>}</p>
                  </div>
                  <Amount t={t} />
                  <Actions t={t} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Par agence */}
      {tab === 'agences' && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600"><tr>
              <th className="px-3 py-2 text-left">Agence</th><th className="px-3 py-2 text-right">💼 À verser (chez le chef)</th><th className="px-3 py-2 text-right">🚚 Pas encore reçu</th>
              <th className="px-3 py-2 text-right">⏳ À valider</th><th className="px-3 py-2 text-right">⚠️ Écart</th><th className="px-3 py-2 text-right">✅ Validé en {monthName}</th><th className="px-3 py-2 text-left">Dernier versement</th>
            </tr></thead>
            <tbody>
              {byCity.map(r => (
                <tr key={r.city} onClick={() => { setCity(r.city); setTab('historique') }} className="border-t border-slate-100 cursor-pointer hover:bg-teal-50" title="Voir l'historique de l'agence">
                  <td className="px-3 py-2 font-bold">{r.city}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-violet-800">{!ready ? '⏳' : (r.reste?.amount || 0) > 0 ? <>{fmt(r.reste!.amount)} DH <span className="text-[11px] font-normal text-slate-500">({r.reste!.days} j.)</span></> : '✓ 0'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-orange-700">{!ready ? '⏳' : (r.reste?.nonRecu || 0) > 0 ? <>{fmt(r.reste!.nonRecu)} DH{(r.reste!.nonRecuGuichet || 0) > 0 && <div className="text-[10px] text-slate-500">dont guichet {fmt(r.reste!.nonRecuGuichet)}</div>}</> : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{r.pending.length ? `${fmt(sum(r.pending))} DH (${r.pending.length})` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-red-700">{r.ecart.reste > 0 ? `${fmt(r.ecart.reste)} DH` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.month.length ? `${fmt(sum(r.month))} DH (${r.month.length})` : '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{r.last ? `${fmtDT(dateOf(r.last))} · ${fmt(num(r.last.amount))} DH · ${STATUS[r.last.status]?.label || r.last.status}` : '—'}</td>
                </tr>
              ))}
              {!byCity.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">{ready ? 'Aucune donnée.' : 'Calcul en cours…'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Historique */}
      {tab === 'historique' && (
        <div className={`${card} overflow-hidden`}>
          <div className="p-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom, note…" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm" />
            </div>
            <select value={city} onChange={e => setCity(e.target.value)} className={sel}>
              <option value="all">Toutes les agences</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={status} onChange={e => setStatus(e.target.value)} className={sel}>
              <option value="all">Tous les statuts</option><option value="pending">⏳ À valider</option><option value="confirmed">✅ Validés</option><option value="rejected">❌ Refusés</option>
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={sel} />
            <span className="text-xs text-slate-500">au</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={sel} />
            {(city !== 'all' || status !== 'all' || from || to || q) && <button onClick={() => { setCity('all'); setStatus('all'); setFrom(''); setTo(''); setQ('') }} className="text-xs text-slate-500 underline">Réinitialiser</button>}
          </div>
          {/* Résumé par agence (clic = filtre) */}
          <div className="px-3 py-3 flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/60">
            {cities.map(c => {
              const l = all.filter(t => t.city === c)
              if (!l.length) return null
              const on = city === c
              return (
                <button key={c} onClick={() => setCity(on ? 'all' : c)}
                  className={`rounded-xl border px-3 py-2 text-left transition ${on ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <p className="text-sm font-black text-slate-800">{c}</p>
                  <p className="text-[11px] text-slate-600">{l.length} versement(s) · <span className="font-bold text-emerald-700">{fmt(sum(l.filter(t => t.status === 'confirmed')))} DH validés</span>
                    {l.some(t => t.status === 'pending') && <> · <span className="font-bold text-amber-700">{l.filter(t => t.status === 'pending').length} à valider</span></>}</p>
                </button>
              )
            })}
          </div>
          <div className="px-3 py-2 text-xs text-slate-600 border-b border-slate-100">{hist.length} versement(s) affiché(s) · validés <b className="text-emerald-700">{fmt(sum(hist.filter(t => t.status === 'confirmed')))} DH</b> · à valider <b className="text-amber-700">{fmt(sum(hist.filter(t => t.status === 'pending')))} DH</b> · refusés {fmt(sum(hist.filter(t => t.status === 'rejected')))} DH</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600"><tr>
                <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Agence · de</th><th className="px-3 py-2 text-left">Nature</th>
                <th className="px-3 py-2 text-left">Note</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2 text-left">Statut</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {hist.map((t, i) => {
                  const m = dateOf(t).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                  const newMonth = i === 0 || m !== dateOf(hist[i - 1]).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                  const inMonth = newMonth ? hist.filter(x => dateOf(x).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) === m) : []
                  return (<Fragment key={t.id}>
                  {newMonth && (
                    <tr className="bg-teal-50/70"><td colSpan={7} className="px-3 py-1.5 text-xs font-black text-teal-900">
                      📅 <span className="capitalize">{m}</span> — {inMonth.length} versement(s) · {fmt(sum(inMonth.filter(x => x.status === 'confirmed')))} DH validés
                    </td></tr>
                  )}
                  <tr className={`border-t border-slate-100 align-top border-l-4 ${STATUS_BORDER[t.status] || 'border-l-slate-200'} ${isOld(t) ? 'bg-slate-50/70' : ''}`}>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtDT(dateOf(t))}
                      {isOld(t) && <div className="mt-0.5 inline-block rounded bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600" title="Avant le début du vrai calcul (05/10/2026 08:00) : non compté dans les soldes">avant le 05/10</div>}</td>
                    <td className="px-3 py-2"><b>{t.city}</b><div className="text-xs text-slate-500">{t.fromName || '—'}</div></td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${NATURE(t).cls}`}>{NATURE(t).label}</span>{t.codParcelCount ? <div className="text-[11px] text-slate-500 mt-0.5">{t.codParcelCount} exp.</div> : null}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 max-w-64">{t.note || '—'}</td>
                    <td className="px-3 py-2"><Amount t={t} /></td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[t.status]?.cls || 'bg-gray-100'}`}>{STATUS[t.status]?.label || t.status}</span>
                      {t.status === 'confirmed' && t.confirmedBy && <div className="text-[11px] text-slate-500 mt-0.5">par {t.confirmedBy}</div>}
                      {t.status === 'rejected' && <div className="text-[11px] text-red-700 mt-0.5">{t.rejectionReason || ''}{t.rejectedBy ? ` (${t.rejectedBy})` : ''}</div>}
                    </td>
                    <td className="px-3 py-2"><Actions t={t} /></td>
                  </tr>
                  </Fragment>)
                })}
                {!hist.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Aucun versement</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Écarts */}
      {tab === 'ecarts' && (
        <div className="space-y-3">
          {!byCity.some(r => r.ecart.list.length) && <div className={`${card} p-4 text-sm font-semibold text-emerald-700`}>✓ Aucun écart : tous les versements ont été validés pour le montant envoyé.</div>}
          {byCity.filter(r => r.ecart.list.length).map(r => (
            <div key={r.city} className={`${card} p-4`}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="flex-1 font-bold text-slate-800">{r.city}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${r.ecart.reste > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{r.ecart.reste > 0 ? `Reste à régulariser : ${fmt(r.ecart.reste)} DH` : '✓ Régularisé'}</span>
              </div>
              <p className="text-xs text-slate-600 mb-2">Écarts {fmt(r.ecart.ecarts)} DH − régularisations validées {fmt(r.ecart.regulValidees)} DH{r.ecart.regulEnAttente > 0 ? ` · régularisation à valider ${fmt(r.ecart.regulEnAttente)} DH` : ''}</p>
              <table className="w-full text-xs">
                <thead className="text-slate-500"><tr><th className="text-left py-1">Date</th><th className="text-left py-1">Versement</th><th className="text-right py-1">Envoyé</th><th className="text-right py-1">Reçu</th><th className="text-right py-1">Écart</th></tr></thead>
                <tbody>
                  {r.ecart.list.map((t: any) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="py-1">{fmtDT(dateOf(t))}</td><td className="py-1">{t.fromName} — {t.note || ''}</td>
                      <td className="py-1 text-right tabular-nums">{fmt(transferSent(t))}</td><td className="py-1 text-right tabular-nums">{fmt(num(t.amount))}</td>
                      <td className="py-1 text-right tabular-nums font-bold text-red-700">{fmt(transferEcart(t))}</td>
                    </tr>
                  ))}
                  {all.filter(t => t.city === r.city && t.kind === 'regul' && t.status !== 'rejected').map(t => (
                    <tr key={t.id} className="border-t border-slate-100 text-violet-800">
                      <td className="py-1">{fmtDT(dateOf(t))}</td><td className="py-1">⚖️ Régularisation — {t.fromName} {t.status === 'pending' ? '(à valider)' : ''}</td>
                      <td></td><td></td><td className="py-1 text-right tabular-nums font-bold">−{fmt(num(t.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setDirect({ city: r.city, fromName: '', amount: r.ecart.reste ? String(r.ecart.reste) : '', paymentType: 'especes', reference: '', note: '', regul: true })}
                className="mt-2 text-xs font-bold text-violet-700 underline">+ Enregistrer une régularisation reçue directement</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Fenêtres ── */}
      {validate && (
        <Modal title="Valider le versement" onClose={() => setValidate(null)}>
          <Info rows={[['Agence', validate.city], ['De', validate.fromName], ['Nature', NATURE(validate).label], ['Note', validate.note || '—'], ['Montant envoyé', `${fmt(transferSent(validate))} DH`]]} />
          <label className="block text-xs font-semibold text-slate-600 mt-3 mb-1">Montant reçu (DH)</label>
          <input type="number" step="0.01" min="0" max={transferSent(validate)} value={received} onChange={e => setReceived(e.target.value)} placeholder={String(transferSent(validate))}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-lg font-bold tabular-nums" />
          {received !== '' && Number(received) > 0 && Number(received) < transferSent(validate) - 0.009 && (
            <p className="mt-1 text-xs font-bold text-orange-700">⚠️ Écart de {fmt(transferSent(validate) - Number(received))} DH : à régulariser par le chef d'agence.</p>)}
          <p className="mt-1 text-[11px] text-slate-500">Vide = montant envoyé.</p>
          <Buttons onCancel={() => setValidate(null)} onOk={doValidate} ok="✓ Valider" okCls="bg-emerald-600 hover:bg-emerald-700" busy={busy} />
        </Modal>
      )}
      {reject && (
        <Modal title="Refuser le versement" onClose={() => setReject(null)}>
          <Info rows={[['Agence', reject.city], ['De', reject.fromName], ['Montant', `${fmt(num(reject.amount))} DH`]]} />
          <p className="mt-2 text-xs text-slate-600">Les expéditions du versement redeviennent « à verser » chez le chef d'agence.</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif du refus (obligatoire)" rows={3} className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <Buttons onCancel={() => setReject(null)} onOk={doReject} ok="✗ Refuser" okCls="bg-red-600 hover:bg-red-700" busy={busy} />
        </Modal>
      )}
      {noteEdit && (
        <Modal title="Modifier la note" onClose={() => setNoteEdit(null)}>
          <p className="text-xs text-slate-500">Le montant et le statut ne se modifient pas ici : validez avec le montant reçu, ou refusez.</p>
          <textarea value={noteEdit.note} onChange={e => setNoteEdit((n: any) => ({ ...n, note: e.target.value }))} rows={3} className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          <Buttons onCancel={() => setNoteEdit(null)} onOk={doNote} ok="💾 Enregistrer" okCls="bg-teal-600 hover:bg-teal-700" busy={busy} />
        </Modal>
      )}
      {del && (
        <Modal title="Supprimer le versement" onClose={() => setDel(null)}>
          <Info rows={[['Agence', del.city], ['De', del.fromName], ['Montant', `${fmt(num(del.amount))} DH`], ['Statut', STATUS[del.status]?.label || del.status]]} />
          <p className="mt-2 text-xs font-semibold text-red-700">Suppression définitive.{isAgencyTransfer(del) && del.kind !== 'regul' ? ' Les expéditions du versement redeviennent « à verser » chez le chef d\'agence.' : ''}</p>
          <Buttons onCancel={() => setDel(null)} onOk={doDelete} ok="🗑️ Supprimer" okCls="bg-red-600 hover:bg-red-700" busy={busy} />
        </Modal>
      )}
      {direct && (
        <Modal title="Versement reçu directement" onClose={() => setDirect(null)}>
          <p className="text-xs text-slate-500 mb-2">Argent remis en main propre à l'admin : enregistré comme validé.</p>
          <div className="grid grid-cols-2 gap-2">
            <select value={direct.city} onChange={e => setDirect((d: any) => ({ ...d, city: e.target.value }))} className={sel}><option value="">Agence…</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <input value={direct.fromName} onChange={e => setDirect((d: any) => ({ ...d, fromName: e.target.value }))} placeholder="Remis par (nom)" className={sel} />
            <input type="number" step="0.01" value={direct.amount} onChange={e => setDirect((d: any) => ({ ...d, amount: e.target.value }))} placeholder="Montant (DH)" className={sel} />
            <select value={direct.paymentType} onChange={e => setDirect((d: any) => ({ ...d, paymentType: e.target.value }))} className={sel}><option value="especes">💵 Espèces</option><option value="cheque">📝 Chèque</option><option value="virement">🏦 Virement</option></select>
            <input value={direct.reference} onChange={e => setDirect((d: any) => ({ ...d, reference: e.target.value }))} placeholder="Référence (optionnel)" className={`${sel} col-span-2`} />
            <textarea value={direct.note} onChange={e => setDirect((d: any) => ({ ...d, note: e.target.value }))} placeholder="Note (optionnel)" rows={2} className={`${sel} col-span-2`} />
          </div>
          <label className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-violet-800"><input type="checkbox" checked={direct.regul} onChange={e => setDirect((d: any) => ({ ...d, regul: e.target.checked }))} className="w-4 h-4" /> Régularisation d'un écart de l'agence</label>
          <Buttons onCancel={() => setDirect(null)} onOk={doDirect} ok="✓ Enregistrer" okCls="bg-teal-600 hover:bg-teal-700" busy={busy} />
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: any }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">{title}</h3><button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button></div>
        {children}
      </div>
    </div>
  )
}
function Info({ rows }: { rows: [string, any][] }) {
  return <div className="rounded-xl bg-slate-50 p-3 space-y-1 text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800 text-right">{v}</span></div>)}</div>
}
function Buttons({ onCancel, onOk, ok, okCls, busy }: { onCancel: () => void; onOk: () => void; ok: string; okCls: string; busy: boolean }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <button onClick={onCancel} disabled={busy} className="py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50">Annuler</button>
      <button onClick={onOk} disabled={busy} className={`py-2.5 rounded-xl text-white font-bold disabled:opacity-50 ${okCls}`}>{busy ? '…' : ok}</button>
    </div>
  )
}
