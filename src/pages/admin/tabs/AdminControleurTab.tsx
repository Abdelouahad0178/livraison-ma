// 🤖 Admin › Rapports du Contrôleur — À LA DEMANDE, ADMIN SEULEMENT.
// La Cloud Function generateControlReport applique les règles (functions/controlRules.js) puis Claude rédige le rapport.
// Ici : lancer un rapport, relire les rapports enregistrés, filtrer / suivre les anomalies, imprimer.
import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { Bot, Loader2, Printer, Trash2, Search, X } from 'lucide-react'
import { db } from '../../../firebase/config'
import app from '../../../firebase/appCore'
import { CITIES } from '../../../firebase/constants'

/** Libellés des règles — mêmes clés que functions/controlRules.js (RULES). */
export const CONTROL_RULES: Record<string, { label: string; who: string }> = {
  pointe_non_livre: { label: 'Valeur pointée alors que l\'expédition n\'est pas livrée', who: 'Encaisseur central' },
  livre_mauvaise_agence: { label: 'Livrée par une agence qui n\'est pas la destination', who: 'Chef d\'agence / agent pro / aide agent' },
  livre_sans_historique: { label: '« Livré » sans ligne de livraison dans l\'historique', who: 'Chef d\'agence' },
  encaisse_non_recu: { label: 'Encaissé par le livreur, pas reçu par le chef d\'exploitation (> 24 h)', who: 'Livreur / chef d\'exploitation' },
  recu_non_envoye: { label: 'Reçu par le chef d\'exploitation, pas envoyé au chef d\'agence (> 24 h)', who: 'Chef d\'exploitation' },
  livre_port_non_collecte: { label: 'Livrée mais port dû jamais collecté (> 24 h)', who: 'Livreur / chef d\'exploitation' },
  ville_incoherente: { label: 'Ville du destinataire hors liste ou ≠ destination', who: 'Saisie / admin' },
  saisie_autre_jour: { label: 'Saisie datée d\'une autre journée que la saisie réelle', who: 'Agent / chef d\'agence' },
  en_livraison_48h: { label: '« En cours de livraison » depuis plus de 48 h', who: 'Livreur / chef d\'exploitation' },
  lot_non_recu: { label: 'Lot de valeurs non réceptionné (> 3 j) ou reçu avec manquants', who: 'Encaisseur central' },
  valeur_modifiee_apres_encaissement: { label: 'Montant / type de la valeur modifié après encaissement', who: 'Tous' },
  arrivee_mauvaise_agence: { label: 'Arrivée confirmée par une agence qui n\'est pas la destination', who: 'Chef d\'agence' },
}
const SEV: Record<string, { label: string; cls: string; dot: string }> = {
  rouge: { label: 'Grave', cls: 'bg-red-100 text-red-700 border-red-200', dot: '🔴' },
  orange: { label: 'Important', cls: 'bg-orange-100 text-orange-700 border-orange-200', dot: '🟠' },
  jaune: { label: 'À surveiller', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200', dot: '🟡' },
}
const STATUS_LABEL: Record<string, string> = { '': 'À traiter', corrige: '✅ Corrigé', fausse: '✖ Fausse alerte' }

interface Anomaly { rule: string; severity: string; parcelId: string | null; nic: string; city: string; user: string; userRole: string; amount: number; at: string | null; proof: string; count?: number; userRoleLabel?: string; userCity?: string }
interface Report {
  id: string; createdAt: string; createdBy: string; from: string; to: string; city: string
  stats: { total: number; lines?: number; bySeverity: Record<string, number>; byRule: Record<string, number>; byCity: Record<string, number>; byUser: Record<string, number>; amount: number }
  summary: string | null; aiError: string | null; anomalies: Anomaly[]; truncated?: boolean; scanned?: number; statusById?: Record<string, string>
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** Journée d'opération actuelle (avant 08h : celle de la veille). */
const opToday = () => { const d = new Date(); if (d.getHours() < 8) d.setDate(d.getDate() - 1); return d }
const fmtDay = (k: string) => k.split('-').reverse().join('/')
const fmtDT = (s: string | null) => { if (!s) return ''; const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` }
const dh = (n: number) => `${(Math.round((n || 0) * 100) / 100).toLocaleString('fr-MA')} DH`
const keyOf = (a: Anomaly) => `${a.rule}|${a.parcelId || a.nic}|${a.at || ''}`.replace(/[./#$[\]]/g, '_')
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export default function AdminControleurTab() {
  const [preset, setPreset] = useState<'today' | 'yesterday' | 'week' | 'custom'>('today')
  const [from, setFrom] = useState(ymd(opToday()))
  const [to, setTo] = useState(ymd(opToday()))
  const [city, setCity] = useState('all')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [reports, setReports] = useState<Report[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => onSnapshot(query(collection(db, 'controlAiReports'), orderBy('createdAt', 'desc'), limit(30)),
    snap => setReports(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
    err => setError(`Lecture des rapports : ${err.message}`)), [])

  const period = (): [string, string] => {
    const t = opToday()
    if (preset === 'today') return [ymd(t), ymd(t)]
    if (preset === 'yesterday') { const y = new Date(t); y.setDate(y.getDate() - 1); return [ymd(y), ymd(y)] }
    if (preset === 'week') { const s = new Date(t); s.setDate(s.getDate() - 6); return [ymd(s), ymd(t)] }
    return [from, to]
  }

  const generate = async () => {
    const [f, t] = period()
    if (!f || !t || t < f) { setError('Choisissez une période valide.'); return }
    setRunning(true); setError('')
    try {
      const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'generateControlReport', { timeout: 300000 })
      const res: any = await fn({ from: f, to: t, city })
      setOpenId(res.data?.id || null)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setRunning(false)
    }
  }

  const open = reports.find(r => r.id === openId) || null
  const sel = 'px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700'

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-xl bg-indigo-600 text-white"><Bot className="w-5 h-5" /></div>
          <div>
            <h2 className="text-lg font-black text-indigo-900">Rapports du Contrôleur</h2>
            <p className="text-xs text-slate-600">Des règles tirées du fonctionnement du site détectent les erreurs des utilisateurs (avec la preuve), puis l'IA rédige le rapport. Rien n'est modifié dans les expéditions.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={preset} onChange={e => setPreset(e.target.value as any)} className={sel}>
            <option value="today">Aujourd'hui (journée en cours)</option>
            <option value="yesterday">Hier</option>
            <option value="week">7 derniers jours</option>
            <option value="custom">Du … au …</option>
          </select>
          {preset === 'custom' && <>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={sel} />
            <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={sel} />
          </>}
          <select value={city} onChange={e => setCity(e.target.value)} className={sel}>
            <option value="all">Toutes les agences</option>
            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={generate} disabled={running} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-black shadow">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />} {running ? 'Analyse en cours (1 à 2 min)…' : 'Générer le rapport'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm font-semibold text-red-700">❌ {error}</p>}
      </section>

      {open ? <ReportView report={open} onClose={() => setOpenId(null)} /> : (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50"><h3 className="font-bold text-slate-800">Rapports enregistrés ({reports.length})</h3></div>
          {reports.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Aucun rapport. Choisissez une période et cliquez sur « Générer le rapport ».</p>}
          <div className="divide-y divide-slate-100">
            {reports.map(r => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-indigo-50/40">
                <button onClick={() => setOpenId(r.id)} className="text-left flex-1 min-w-0">
                  <p className="font-bold text-slate-800">Du {fmtDay(r.from)} au {fmtDay(r.to)} · {r.city === 'all' ? 'Toutes les agences' : r.city}</p>
                  <p className="text-xs text-slate-500">Généré le {fmtDT(r.createdAt)} par {r.createdBy} · {r.stats?.lines ?? r.anomalies?.length ?? 0} ligne(s) · {r.stats?.total || 0} expédition(s)
                    {Object.entries(SEV).map(([k, s]) => r.stats?.bySeverity?.[k] ? <span key={k}> · {s.dot} {r.stats.bySeverity[k]}</span> : null)}</p>
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={() => setOpenId(r.id)} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">Ouvrir</button>
                  <button onClick={() => { if (window.confirm('Supprimer ce rapport ?')) deleteDoc(doc(db, 'controlAiReports', r.id)).catch(e => alert(e.message)) }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ReportView({ report: r, onClose }: { report: Report; onClose: () => void }) {
  const [sev, setSev] = useState('all')
  const [rule, setRule] = useState('all')
  const [city, setCity] = useState('all')
  const [user, setUser] = useState('all')
  const [state, setState] = useState('all')
  const [q, setQ] = useState('')
  const statusById = r.statusById || {}
  const list = useMemo(() => (r.anomalies || []).filter(a =>
    (sev === 'all' || a.severity === sev) && (rule === 'all' || a.rule === rule) && (city === 'all' || a.city === city)
    && (user === 'all' || a.user === user) && (state === 'all' || (statusById[keyOf(a)] || '') === state)
    && (!q.trim() || [a.nic, a.user, a.proof].some(v => String(v || '').toLowerCase().includes(q.trim().toLowerCase())))),
  [r, sev, rule, city, user, state, q, statusById])
  const uniq = (f: (a: Anomaly) => string) => [...new Set((r.anomalies || []).map(f).filter(Boolean))].sort()

  const mark = (a: Anomaly, v: string) =>
    updateDoc(doc(db, 'controlAiReports', r.id), { statusById: { ...statusById, [keyOf(a)]: v } }).catch(e => alert(e.message))

  const print = () => {
    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer.'); return }
    const rows = list.map((a, i) => `<tr><td>${i + 1}</td><td>${SEV[a.severity]?.dot || ''}</td><td>${esc(CONTROL_RULES[a.rule]?.label || a.rule)}</td><td><b>${esc(a.nic)}</b></td><td>${esc(a.city)}</td><td>${esc(a.user)}</td><td class="r">${a.amount ? esc(dh(a.amount)) : ''}</td><td>${esc(fmtDT(a.at))}</td><td>${esc(a.proof)}</td><td>${esc(STATUS_LABEL[statusById[keyOf(a)] || ''])}</td></tr>`).join('')
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport du Contrôleur ${esc(fmtDay(r.from))} – ${esc(fmtDay(r.to))}</title>
<style>*{box-sizing:border-box}@page{size:A4 landscape;margin:8mm}body{font-family:Arial,sans-serif;font-size:9px;color:#111}
h1{font-size:15px;margin:0 0 2px;color:#3730a3}.meta{color:#475569;margin-bottom:6px}.sum{white-space:pre-wrap;font-size:10px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:5px;padding:6px 8px;margin-bottom:8px}
table{width:100%;border-collapse:collapse}th{background:#3730a3;color:#fff;font-size:8px;text-align:left;padding:2px 3px}td{border-bottom:.5px solid #cbd5e1;padding:2px 3px;vertical-align:top}.r{text-align:right}thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>
<h1>🤖 Rapport du Contrôleur — du ${esc(fmtDay(r.from))} au ${esc(fmtDay(r.to))} · ${esc(r.city === 'all' ? 'Toutes les agences' : r.city)}</h1>
<div class="meta">Généré le ${esc(fmtDT(r.createdAt))} par ${esc(r.createdBy)} · ${r.stats?.total || 0} anomalie(s) · ${list.length} affichée(s) · montant en jeu ${esc(dh(r.stats?.amount || 0))}</div>
${r.summary ? `<div class="sum">${esc(r.summary)}</div>` : ''}
<table><thead><tr><th>#</th><th></th><th>Erreur</th><th>N° EXP / lot</th><th>Agence</th><th>Utilisateur</th><th class="r">Montant</th><th>Date</th><th>Preuve</th><th>Suivi</th></tr></thead><tbody>${rows}</tbody></table>
<script>window.onload=function(){window.print()}<\/script></body></html>`)
    w.document.close()
  }

  const sel = 'px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 max-w-56'
  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-indigo-50">
        <div>
          <h3 className="font-black text-indigo-900">Rapport du {fmtDay(r.from)} au {fmtDay(r.to)} · {r.city === 'all' ? 'Toutes les agences' : r.city}</h3>
          <p className="text-xs text-slate-600">Généré le {fmtDT(r.createdAt)} par {r.createdBy} · {r.scanned ?? '—'} expéditions analysées · {r.stats?.lines ?? r.anomalies?.length ?? 0} ligne(s) d'erreur sur {r.stats?.total || 0} expédition(s) · montant en jeu {dh(r.stats?.amount || 0)}{r.truncated ? ' · liste tronquée à 1500' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={print} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold"><Printer className="w-4 h-4" /> Imprimer</button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white text-slate-500" title="Fermer"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Chiffres */}
      <div className="flex flex-wrap gap-2 px-4 py-3 border-b">
        {Object.entries(SEV).map(([k, s]) => (
          <button key={k} onClick={() => setSev(sev === k ? 'all' : k)} className={`px-3 py-1.5 rounded-xl border text-sm font-black ${s.cls} ${sev === k ? 'ring-2 ring-indigo-400' : ''}`}>
            {s.dot} {s.label} : {r.stats?.bySeverity?.[k] || 0}
          </button>
        ))}
      </div>

      {/* Rapport rédigé par l'IA */}
      <div className="px-4 py-3 border-b">
        {r.summary && <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">{r.summary}</div>}
        {r.aiError && <p className="mt-2 text-sm font-semibold text-amber-700">⚠️ {r.aiError} — les anomalies ci-dessous restent valables (règles).</p>}
      </div>

      {/* Par erreur */}
      <div className="px-4 py-3 border-b flex flex-wrap gap-2">
        {Object.entries(r.stats?.byRule || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
          <button key={k} onClick={() => setRule(rule === k ? 'all' : k)}
            className={`text-xs rounded-full px-2.5 py-1 border ${rule === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            {CONTROL_RULES[k]?.label || k} : <b>{n}</b>
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="px-4 py-2 border-b flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="N° EXP, utilisateur…" className="pl-7 pr-2 py-1.5 rounded-lg border border-slate-300 text-xs" />
        </div>
        <select value={city} onChange={e => setCity(e.target.value)} className={sel}><option value="all">Toutes les agences</option>{uniq(a => a.city).map(c => <option key={c}>{c}</option>)}</select>
        <select value={user} onChange={e => setUser(e.target.value)} className={sel}><option value="all">Tous les utilisateurs</option>{uniq(a => a.user).map(u => <option key={u}>{u}</option>)}</select>
        <select value={state} onChange={e => setState(e.target.value)} className={sel}>
          <option value="all">Tous les suivis</option><option value="">À traiter</option><option value="corrige">Corrigés</option><option value="fausse">Fausses alertes</option>
        </select>
        <span className="text-xs text-slate-500">{list.length} affichée(s)</span>
      </div>

      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600 sticky top-0">
            <tr><th className="px-2 py-2 text-left"></th><th className="px-2 py-2 text-left">Erreur</th><th className="px-2 py-2 text-left">N° EXP / lot</th><th className="px-2 py-2 text-left">Agence</th>
              <th className="px-2 py-2 text-left">Utilisateur</th><th className="px-2 py-2 text-right">Montant</th><th className="px-2 py-2 text-left">Date</th><th className="px-2 py-2 text-left">Preuve</th><th className="px-2 py-2 text-left">Suivi</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Aucune anomalie pour ces filtres.</td></tr>}
            {list.map((a, i) => {
              const st = statusById[keyOf(a)] || ''
              return (
                <tr key={i} className={`border-t border-slate-100 ${st ? 'opacity-50' : ''}`}>
                  <td className="px-2 py-1.5" title={SEV[a.severity]?.label}>{SEV[a.severity]?.dot}</td>
                  <td className="px-2 py-1.5 font-semibold text-slate-700 max-w-56">{CONTROL_RULES[a.rule]?.label || a.rule}</td>
                  <td className="px-2 py-1.5 font-mono font-bold text-blue-700">{a.nic}</td>
                  <td className="px-2 py-1.5">{a.city}</td>
                  <td className="px-2 py-1.5">{a.user}{(a.userRoleLabel || a.userCity) && <div className="text-[10px] text-slate-500">{[a.userRoleLabel, a.userCity].filter(Boolean).join(" · ")}</div>}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">{a.amount ? dh(a.amount) : ''}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmtDT(a.at)}</td>
                  <td className="px-2 py-1.5 text-slate-600 max-w-80">{a.proof}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {st ? (
                      <button onClick={() => mark(a, '')} className="text-[11px] font-bold text-slate-600 hover:underline" title="Remettre « à traiter »">{STATUS_LABEL[st]}</button>
                    ) : (<>
                      <button onClick={() => mark(a, 'corrige')} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold mr-1">✓ Corrigé</button>
                      <button onClick={() => mark(a, 'fausse')} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">✖ Fausse</button>
                    </>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
