import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { PARCELS_LITE_COLLECTION } from '../../../firebase/parcels'
import { Building2, ChevronDown, Loader2, Printer, RefreshCw, AlertCircle } from 'lucide-react'
import {
  buildCaisseSituation, buildChefAgenceFollowUp, buildEnCompteFollowUp, buildExploitationFollowUp, computeAgencyPortStats,
  followUpWindow, fmtDateTime, invoiceNumbersByParcel, pendingEnvoiPortParcelIds, resteAEncaisserLines,
  RECEIPT_SOURCE_LABEL, TRANSFER_STATUS_LABEL,
} from '../../../utils/agencyFollowUp'
import { printAgencyFollowUp } from '../../../utils/printAgencyFollowUp'
import ResteAEncaisserModal from './ResteAEncaisserModal'

interface Props {
  /** Agence sélectionnée ('all' = aucune) */
  city: string
  /** Expéditions de la période (déjà filtrées par date dans l'onglet) */
  parcels: any[]
  periodStartMs: number
  periodEndMs: number
  periodText: string
}

const dh = (n: number) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-MA')} DH`
const docsOf = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))

interface Loaded {
  expDocs: any[]
  entries: any[]
  transfers: any[]
  envois: any[]
  invoices: any[]
}

/**
 * 🧭 Suivi de l'agence (Admin › Port par agence, une agence sélectionnée) — PORTS uniquement.
 * Lectures ponctuelles (bouton « Actualiser ») sur la fenêtre de la période :
 * - parcelsLite : réceptions du chef d'exploitation (destinationCity + portExpReceivedAt, originCity + portPayeExpReceivedAt) ;
 * - caisseEntries (city + createdAt), adminTransfers (city + createdAt), valeursEnvois (city + createdAt ≥ début),
 *   invoices (agencyCity + createdAt ≥ début de période) — index existants.
 * Les totaux théoriques / caisse viennent des expéditions déjà chargées par l'onglet (mêmes règles).
 */
export default function AgencyFollowUpBlock({ city, parcels, periodStartMs, periodEndMs, periodText }: Props) {
  const selected = !!city && city !== 'all'
  const win = useMemo(() => followUpWindow(periodStartMs, periodEndMs), [periodStartMs, periodEndMs])
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  // Fenêtre « Reste à encaisser » (expéditions qui composent le montant)
  const [resteOpen, setResteOpen] = useState(false)
  const genRef = useRef(0)

  useEffect(() => {
    const gen = ++genRef.current
    setData(null)
    setError(null)
    if (!selected) { setLoading(false); return }
    setLoading(true)
    const startIso = new Date(win.startMs).toISOString()
    const endIso = new Date(win.endMs).toISOString()
    const tsStart = Timestamp.fromMillis(win.startMs)
    const tsEnd = Timestamp.fromMillis(win.endMs)
    ;(async () => {
      try {
        const [du, pp, entriesSnap, transfersSnap, envoisSnap, invoicesSnap] = await Promise.all([
          getDocs(query(collection(db, PARCELS_LITE_COLLECTION), where('destinationCity', '==', city),
            where('portExpReceivedAt', '>=', startIso), where('portExpReceivedAt', '<=', endIso))),
          getDocs(query(collection(db, PARCELS_LITE_COLLECTION), where('originCity', '==', city),
            where('portPayeExpReceivedAt', '>=', startIso), where('portPayeExpReceivedAt', '<=', endIso))),
          getDocs(query(collection(db, 'caisseEntries'), where('city', '==', city),
            where('createdAt', '>=', tsStart), where('createdAt', '<=', tsEnd), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'adminTransfers'), where('city', '==', city),
            where('createdAt', '>=', tsStart), where('createdAt', '<=', tsEnd), orderBy('createdAt', 'desc'))),
          // Envois créés depuis le début de la fenêtre (un envoi suit toujours la réception) : ceux « envoyés »
          getDocs(query(collection(db, 'valeursEnvois'), where('city', '==', city),
            where('createdAt', '>=', tsStart), orderBy('createdAt', 'desc'), limit(300))),
          // Factures de l'agence créées depuis le début de la période (une facture suit l'expédition)
          getDocs(query(collection(db, 'invoices'), where('agencyCity', '==', city),
            where('createdAt', '>=', Timestamp.fromMillis(periodStartMs)), orderBy('createdAt', 'desc'))),
        ])
        const entries = docsOf(entriesSnap)
        const transfers = docsOf(transfersSnap)
        // Transfert à l'Admin dont le transfert n'est pas dans la fenêtre (bornes) : relu par caisseEntryId
        const known = new Set(transfers.map((t: any) => t.caisseEntryId).filter(Boolean))
        const missing = entries.filter((e: any) => e.type === 'sortie' && e.category === 'remise_admin' && !known.has(e.id)).slice(0, 30)
        const extra = await Promise.all(missing.map((e: any) =>
          getDocs(query(collection(db, 'adminTransfers'), where('caisseEntryId', '==', e.id), limit(1))).then(docsOf).catch(() => [])))
        if (gen !== genRef.current) return
        setData({
          expDocs: [...docsOf(du), ...docsOf(pp)],
          entries,
          transfers: [...transfers, ...extra.flat()],
          envois: docsOf(envoisSnap),
          invoices: docsOf(invoicesSnap),
        })
      } catch (err: any) {
        console.error("Suivi de l'agence - erreur de chargement:", err)
        if (gen === genRef.current) setError(err?.message || 'Erreur de chargement')
      } finally {
        if (gen === genRef.current) setLoading(false)
      }
    })()
  }, [selected, city, win.startMs, win.endMs, periodStartMs, reloadKey])

  const computed = useMemo(() => {
    if (!selected) return null
    const exp = buildExploitationFollowUp(data?.expDocs || [], city, win, pendingEnvoiPortParcelIds(data?.envois || []))
    const chef = buildChefAgenceFollowUp(data?.entries || [], data?.transfers || [], win)
    // Les DEUX modes de l'onglet pour cette agence (toutes directions), quel que soit le mode affiché
    const physical = computeAgencyPortStats(parcels, { viewMode: 'physical', cities: [city] })[0]
    const theoretical = computeAgencyPortStats(parcels, { viewMode: 'theoretical', cities: [city] })[0]
    const situation = buildCaisseSituation(physical, theoretical, chef.verse.amount)
    const enCompte = buildEnCompteFollowUp(parcels, city, invoiceNumbersByParcel(data?.invoices || []))
    const reste = resteAEncaisserLines(parcels, city)
    return { exp, chef, situation, enCompte, reste }
  }, [selected, city, data, parcels, win])

  if (!selected) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 print:hidden">
        <Building2 className="w-5 h-5 inline mr-1 text-slate-400" />
        Choisissez une agence pour voir son suivi
      </div>
    )
  }
  if (!computed) return null
  const { exp, chef, situation: s, enCompte, reste } = computed // exp : gardé pour la signature de l'impression (section retirée)
  const windowNote = win.clamped ? 'mouvements comptés à partir du 05/10/2026 08h00 (début du vrai calcul)' : ''
  const ready = !!data && !loading
  const nonFacture = { n: enCompte.exp.nonFacture.n + enCompte.dest.nonFacture.n, amount: enCompte.exp.nonFacture.amount + enCompte.dest.nonFacture.amount }
  const n = (k: number) => `${k} exp.`

  // ── Éléments de présentation ──
  const Kpi = ({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'ok' | 'warn' | 'info' }) => (
    <div className={`rounded-xl border bg-white p-3 ${tone === 'warn' ? 'border-amber-300' : tone === 'ok' ? 'border-emerald-200' : 'border-slate-200'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  )
  const Row = ({ label, value, count, kind = 'normal' }: { label: string; value: string; count?: string; kind?: 'normal' | 'minus' | 'total' | 'sub' }) => (
    <div className={`flex items-baseline justify-between gap-3 px-3 ${kind === 'total' ? 'py-2 bg-slate-50 border-t border-slate-200' : 'py-1.5'}`}>
      <span className={`text-sm ${kind === 'total' ? 'font-bold text-slate-800' : kind === 'sub' ? 'pl-4 text-xs text-slate-500' : 'text-slate-600'}`}>{label}</span>
      <span className="flex items-baseline gap-2 whitespace-nowrap">
        {count && <span className="text-[11px] text-slate-400">{count}</span>}
        <span className={`tabular-nums ${kind === 'total' ? 'text-base font-black text-slate-900' : kind === 'sub' ? 'text-xs text-slate-500' : 'text-sm font-semibold text-slate-800'}`}>
          {kind === 'minus' ? '− ' : ''}{value}
        </span>
      </span>
    </div>
  )
  const Statement = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      <div className="py-1">{children}</div>
    </div>
  )
  const table = (head: string[], rows: ReactNode[][], rowClass?: (i: number) => string) => (
    <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 sticky top-0">
          <tr>{head.map((h, i) => <th key={i} className={`px-2 py-1.5 font-semibold text-slate-600 whitespace-nowrap ${h === 'Montant' ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="px-2 py-3 text-center text-slate-400">Aucune ligne</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-slate-100 ${rowClass ? rowClass(i) : ''}`}>
              {r.map((c, j) => <td key={j} className={`px-2 py-1 align-top ${head[j] === 'Montant' ? 'text-right font-semibold whitespace-nowrap tabular-nums' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const tabs: [string, string, number][] = [
    ['recu', 'Entrées en caisse', chef.receipts.length],
    ['vers', 'Versements', chef.versements.length],
    ['ec', 'Ports en compte', enCompte.lines.length],
  ]
  // Onglet de détail ouvert (un seul à la fois ; re-cliquer le referme) — gardé dans « open » sous la clé t:<onglet>
  const tab = Object.keys(open).find(k => k.startsWith('t:') && open[k])?.slice(2) || ''
  const showTab = (k: string) => setOpen(o => {
    const next: Record<string, boolean> = { help: !!o.help }
    if (tab !== k) next[`t:${k}`] = true
    return next
  })

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5 shadow-sm print:hidden">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Suivi de l'agence — {city}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Ports uniquement · {periodText}</p>
          {windowNote && <p className="text-[11px] text-amber-700 mt-0.5">Réceptions, caisse et versements : {windowNote}</p>}
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />}
          <button onClick={() => setReloadKey(k => k + 1)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 disabled:opacity-50">
            <RefreshCw className="w-4 h-4" /> Actualiser
          </button>
          <button onClick={() => printAgencyFollowUp({ city, periodText, windowNote, exp, chef, situation: s, enCompte })} disabled={!ready}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 rounded-lg text-xs font-semibold text-white disabled:opacity-50">
            <Printer className="w-4 h-4" /> Imprimer
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-red-800">Erreur de chargement : {error}. Réceptions, caisse et versements peuvent être incomplets.</p>
        </div>
      )}

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi label="Reçu en caisse" value={dh(chef.recu.amount)} sub={`${chef.recu.n} entrée(s)`} tone="info" />
        <Kpi label="Solde en caisse" value={dh(chef.solde)} sub={`après ${dh(chef.verse.amount)} versés`} tone="info" />
        <button type="button" onClick={() => setResteOpen(true)} className="text-left rounded-xl hover:ring-2 hover:ring-amber-300 transition" title="Voir et imprimer les expéditions qui composent ce montant">
          <Kpi label="Reste à encaisser 👁" value={dh(s.ecart)} sub="cliquer : voir les expéditions" tone={s.ecart > 0 ? 'warn' : 'ok'} />
        </button>
        <Kpi label="En compte non facturé" value={dh(nonFacture.amount)} sub={`${nonFacture.n} expédition(s)`} tone={nonFacture.amount > 0 ? 'warn' : 'ok'} />
      </div>

      {/* Relevés */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <Statement title="1 · Chef d'agence" subtitle="Caisse de l'agence">
          <Row label="Reçu en caisse" value={dh(chef.recu.amount)} count={n(chef.recu.n)} />
          <Row label="Versé (admin, banque)" value={dh(chef.verse.amount)} count={`${chef.verse.n} vers.`} kind="minus" />
          <Row label="Solde en caisse" value={dh(chef.solde)} kind="total" />
          {chef.ecarte.n > 0 && <Row label="Versements hors ports (COD, en compte…) non déduits" value={dh(chef.ecarte.amount)} kind="sub" />}
        </Statement>

        <Statement title="2 · Situation des ports" subtitle="Attendu, encaissé et soldes de la période">
          <Row label="Ports attendus (théorique)" value={dh(s.theorique.total)} />
          <Row label="Ports encaissés (caisse)" value={dh(s.encaisse.total)} />
          <button type="button" onClick={() => setResteOpen(true)} className="block w-full text-left hover:bg-amber-50" title="Voir et imprimer les expéditions qui composent ce montant">
            <Row label="Reste à encaisser 👁 (voir les expéditions)" value={dh(s.ecart)} kind="total" />
          </button>
          <Row label="Solde réel = encaissé − versé" value={dh(s.soldeCaisse)} kind="sub" />
          <Row label="Solde théorique = attendu − versé" value={dh(s.soldeTheorique)} kind="sub" />
        </Statement>
      </div>

      {/* Ports en compte */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
          <h4 className="text-sm font-bold text-slate-800">3 · Ports en compte</h4>
          <p className="text-[11px] text-slate-500">Ports facturés aux clients plutôt qu'encaissés</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-slate-500">
              <th className="px-3 py-2 text-left font-semibold">Type</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
              <th className="px-3 py-2 text-right font-semibold">Facturé</th>
              <th className="px-3 py-2 text-right font-semibold">Non facturé</th>
            </tr>
          </thead>
          <tbody>
            {([['En compte expéditeur', enCompte.exp], ['En compte destinataire', enCompte.dest]] as const).map(([label, g]) => (
              <tr key={label} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-700">{label}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{dh(g.total.amount)} <span className="text-[11px] text-slate-400">({g.total.n})</span></td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{dh(g.facture.amount)} <span className="text-[11px] text-slate-400">({g.facture.n})</span></td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${g.nonFacture.amount > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{dh(g.nonFacture.amount)} <span className="text-[11px] text-slate-400">({g.nonFacture.n})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Détails */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1">Détails :</span>
          {tabs.map(([k, label, count]) => (
            <button key={k} onClick={() => showTab(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${tab === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}>
              {label} <span className={tab === k ? 'text-white/70' : 'text-slate-400'}>({count})</span>
            </button>
          ))}
          <button onClick={() => setOpen(o => ({ ...o, help: !o.help }))} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
            <ChevronDown className={`w-4 h-4 transition-transform ${open.help ? 'rotate-180' : ''}`} /> Comment sont calculés ces chiffres ?
          </button>
        </div>

        {open.help && (
          <ul className="mt-3 text-xs text-slate-600 space-y-1 list-disc pl-5">
            <li><b>Chef d'agence</b> : ports entrés dans la caisse (envois validés ou réception en remplacement) ; versements = transferts à l'admin (en attente ou confirmés) et versements en banque de ports. Les versements de COD, en compte, rejetés ou internes ne sont pas déduits.</li>
            <li><b>Situation des ports</b> : mêmes règles que les modes « Théorique » et « Caisse » de la page, pour les expéditions de la période.</li>
            <li><b>Ports en compte</b> : facturé = présent dans une facture non annulée.</li>
          </ul>
        )}

        {tab === 'recu' && <div className="mt-3">{table(['Date', 'Port', 'Origine', 'Par', 'Montant'], chef.receipts.map(r => [
          fmtDateTime(r.atMs), r.category === 'port_du' ? 'Port dû' : 'Port payé', RECEIPT_SOURCE_LABEL[r.source], r.who, dh(r.amount),
        ]))}</div>}

        {tab === 'vers' && <div className="mt-3">{table(['Date', 'Versement', 'Par', 'Statut', 'Remarque', 'Montant'], chef.versements.map(v => [
          fmtDateTime(v.atMs), `${v.label}${v.paymentType ? ` (${v.paymentType})` : ''}`, v.who,
          v.status ? TRANSFER_STATUS_LABEL[v.status] : '—',
          <>{v.note}{v.reason && <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-semibold">non déduit · {v.nature === 'cod' ? 'COD' : v.reason}</span>}</>,
          dh(v.amount),
        ]), i => chef.versements[i].counted ? '' : 'text-slate-400 bg-slate-50')}</div>}

        {tab === 'ec' && <div className="mt-3">{table(['Date', 'N° EXP', 'Type', 'Client', 'Autre ville', 'Facturation', 'Montant'], enCompte.lines.map(l => [
          fmtDateTime(l.dateMs), <span className="font-semibold">{l.nic}</span>, l.kind === 'exp' ? 'Expéditeur' : 'Destinataire',
          l.client, l.otherCity,
          l.invoiced
            ? <span className="text-emerald-700">Facturé{l.invoiceNumber && l.invoiceNumber !== 'Facturée' ? ` · ${l.invoiceNumber}` : ''}</span>
            : <span className="text-amber-700 font-semibold">Non facturé</span>,
          dh(l.amount),
        ]))}</div>}
      </div>
      {resteOpen && <ResteAEncaisserModal city={city} periodText={periodText} lines={reste} total={s.ecart} onClose={() => setResteOpen(false)} />}
    </div>
  )
}
