// 📦 Rapports Contrôle & Pointage enregistrés : chaque impression du rapport est sauvegardée (contenu figé)
// pour suivre l'envoi des chèques / traites vers la ville qui doit les recevoir (ville d'origine de l'expédition,
// où l'expéditeur est payé). Encaisseur central et analyseur chèques : liste, contenu, réimpression, état d'arrivée
// actuel de chaque valeur, et « Envoi reçu » pour l'agence destinataire.
import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, documentId, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { Eye, Printer, Trash2, X, CheckCircle2, Send, Search } from 'lucide-react'
import { db } from '../../firebase/db'

export interface ReportDoc { type: string; numero: string; banque: string; montant: number; echeance?: string; groupNics?: string[]; groupTotal?: number }
export interface ReportLine {
  id: string; nic: string; createdAt: string; sender: string; receiver: string; tel: string; city: string
  originCity: string; destinationCity: string; payType: string; amount: number; mixed: string; controlled: boolean
  isDoc: boolean; docs: ReportDoc[]
}
export interface ControlReport {
  id?: string; number: string; title: string; period: string; scope: string
  createdAt?: any; createdBy: string; createdById: string; createdByRole: string; createdByCity: string
  lines: ReportLine[]; count: number; total: number; controlledCount: number
  /** Villes qui doivent recevoir les valeurs (ville d'origine des expéditions) → nombre d'expéditions */
  toCities: Record<string, number>
  receivedBy?: Record<string, { at: string; by: string }>
}

const money = (n: any) => (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2 })
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const fmtD = (v: any) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-MA') : '-' }
/** N° EXP du rapport : les premiers, puis « + N autres ». */
const nicsText = (r: ControlReport, max = 4) => {
  const n = r.lines.map(l => l.nic).filter(Boolean)
  return n.length <= max ? n.join(', ') || '—' : `${n.slice(0, max).join(', ')} + ${n.length - max} autre${n.length - max > 1 ? 's' : ''}`
}
const fmtDT = (v: any) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? `${d.toLocaleDateString('fr-MA')} ${d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}` : '-' }

/** Enregistre le rapport imprimé (contenu figé) et renvoie son numéro. */
export async function saveControlReport(r: Omit<ControlReport, 'number' | 'toCities' | 'count' | 'total' | 'controlledCount'>): Promise<string> {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const code = (r.createdByCity || 'CEN').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
  const number = `RAP-${code}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const toCities: Record<string, number> = {}
  r.lines.forEach(l => { const c = l.originCity || '—'; toCities[c] = (toCities[c] || 0) + 1 })
  await addDoc(collection(db, 'controlReports'), {
    ...r, number, toCities,
    count: r.lines.length,
    total: Math.round(r.lines.reduce((s, l) => s + (l.amount || 0), 0) * 100) / 100,
    controlledCount: r.lines.filter(l => l.controlled).length,
    createdAt: serverTimestamp(),
  })
  return number
}

/** HTML du rapport (impression immédiate ET réimpression depuis l'historique : même présentation). */
export function controlReportHtml(r: Pick<ControlReport, 'title' | 'period' | 'scope' | 'lines' | 'createdBy' | 'createdByRole' | 'createdByCity'> & { number?: string; printedAt?: string }) {
  const docsCell = (l: ReportLine) => {
    if (!l.isDoc) return '<span style="color:#9ca3af">—</span>'
    if (!l.docs.length) return '<span style="color:#9ca3af">—</span>'
    return l.docs.map(d => `${d.type === 'traite' ? 'Traite' : 'Chèque'} N° <b>${esc(d.numero || '-')}</b><br><span style="font-size:9px">${esc(d.banque)} · ${money(d.montant)} DH${d.echeance ? ` · éch. ${esc(String(d.echeance).split('-').reverse().join('/'))}` : ''}</span>${(d.groupNics || []).length > 1 ? `<br><span style="font-size:8.5px;color:#4338ca;font-weight:bold">🔗 chèque groupé ${money(d.groupTotal)} DH : ${esc((d.groupNics || []).join(', '))}</span>` : ''}`).join('<div style="border-top:1px dashed #e5e7eb;margin:3px 0"></div>')
  }
  const rows = r.lines.map(l => `
      <tr>
        <td>${esc(l.nic || '-')}</td>
        <td style="white-space:nowrap">${esc(fmtD(l.createdAt))}</td>
        <td>${esc(l.sender || '-')}</td>
        <td>${esc(l.receiver || '-')}</td>
        <td>${esc(l.tel || '-')}</td>
        <td>${esc(l.city || '-')}</td>
        <td>${esc(l.payType || '-')}</td>
        <td>${docsCell(l)}</td>
        <td style="text-align:right;font-weight:bold">${money(l.amount)} DH${l.mixed ? `<br><span style="font-size:8pt;font-weight:normal">${esc(l.mixed)}</span>` : ''}</td>
        <td style="text-align:center">${l.controlled ? '✓' : ''}</td>
      </tr>`).join('')
  const total = r.lines.reduce((s, l) => s + (l.amount || 0), 0)
  const ctl = r.lines.filter(l => l.controlled).length
  const toCities: Record<string, number> = {}
  r.lines.forEach(l => { const c = l.originCity || '—'; toCities[c] = (toCities[c] || 0) + 1 })
  const n = r.lines.length || 1
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.number || 'Rapport')} - ${esc(r.title)}</title>
      <style>
        @page{size:A4 landscape;margin:12mm}
        body{font-family:Arial,sans-serif;margin:22px;font-size:11px}
        h1{font-size:20px;margin:0 0 4px;color:#7c3aed}
        h2{font-size:16px;margin:0 0 8px;color:#6b7280;font-weight:normal}
        .info{background:#f3f4f6;padding:12px;border-radius:8px;margin:12px 0}
        .info p{margin:4px 0;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:14px}
        th{background:#7c3aed;color:white;text-align:left;padding:8px;font-size:11px}
        td{border-bottom:1px solid #e5e7eb;padding:7px;font-size:11px;vertical-align:top}
        .total{background:#f9fafb;padding:12px;margin-top:14px;border-radius:8px}
        .total p{margin:4px 0;font-weight:bold}
        .footer{margin-top:20px;padding-top:12px;border-top:2px solid #e5e7eb;text-align:center;color:#6b7280;font-size:10px}
      </style>
    </head><body>
      <h1>📋 Rapport Contrôle & Pointage - ${esc(r.title)}</h1>
      <h2>${r.number ? `N° ${esc(r.number)} · ` : ''}Période: ${esc(r.period)}</h2>
      <div class="info">
        <p><strong>${esc(r.createdByRole)}:</strong> ${esc(r.createdBy)}${r.createdByCity ? ` — Agence de ${esc(r.createdByCity)}` : ''}</p>
        <p><strong>Date d'impression:</strong> ${esc(r.printedAt || fmtDT(new Date()))}</p>
        <p><strong>Type de rapport:</strong> ${esc(r.scope)}</p>
        <p><strong>Valeurs à envoyer vers:</strong> ${esc(Object.entries(toCities).map(([c, k]) => `${c} (${k})`).join(' · '))}</p>
      </div>
      <table>
        <thead><tr><th>N° EXP (NIC)</th><th>Date de création</th><th>Expéditeur</th><th>Destinataire</th><th>Téléphone</th><th>Ville</th><th>Type Paiement</th><th>Chèque / traite</th><th>Montant</th><th>Contrôlé</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">
        <p>Total expéditions: ${r.lines.length}</p>
        <p>Total montant: ${money(total)} DH</p>
        <p>Contrôlés: ${ctl} / ${r.lines.length} (${Math.round((ctl / n) * 100)}%)</p>
        <p>Non contrôlés: ${r.lines.length - ctl}</p>
      </div>
      <div class="footer"><p>Document généré par le système de gestion - Encaisseur Central${r.number ? ` · rapport enregistré ${esc(r.number)}` : ''}</p></div>
    </body></html>`
}

export function openPrint(html: string) {
  const w: any = window.open('', '_blank')
  if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer.'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

/** Onglet « Rapports envoyés » : historique, contenu, état d'arrivée actuel, réception par l'agence destinataire. */
export function ControlReportsPanel({ myCity, me, isAdmin }: { myCity: string; me: { uid: string; name: string }; isAdmin: boolean }) {
  const [reports, setReports] = useState<ControlReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scope, setScope] = useState<'mine' | 'toMe' | 'all'>(myCity ? 'mine' : 'all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<ControlReport | null>(null)

  const reload = () => {
    setLoading(true); setError('')
    getDocs(query(collection(db, 'controlReports'), orderBy('createdAt', 'desc'), limit(300)))
      .then(s => setReports(s.docs.map(d => ({ id: d.id, ...d.data() }) as ControlReport)))
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [])

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return reports.filter(r => {
      if (scope === 'mine' && r.createdByCity !== myCity) return false
      if (scope === 'toMe' && !(myCity && r.toCities?.[myCity])) return false
      if (!k) return true
      // Recherche : N° de rapport, N° EXP, N° de chèque, expéditeur
      return r.number.toLowerCase().includes(k) || r.lines.some(l => l.nic.toLowerCase().includes(k) || l.sender.toLowerCase().includes(k) || l.docs.some(d => String(d.numero).toLowerCase().includes(k)))
    })
  }, [reports, scope, q, myCity])

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <h3 className="font-black text-slate-800 flex items-center gap-2"><Send className="w-4 h-4 text-purple-600" /> Rapports Contrôle & Pointage enregistrés</h3>
        <div className="flex gap-1 ml-auto">
          {myCity && ([['mine', `Envoyés par ${myCity}`], ['toMe', `À recevoir à ${myCity}`], ['all', 'Tous']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)} className={`px-3 py-1.5 rounded-xl text-xs font-black ${scope === k ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>{l}</button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="N° EXP, N° chèque, expéditeur…" className="w-full pl-8 pr-2 py-2 rounded-xl border-2 border-slate-200 focus:border-purple-400 focus:outline-none text-sm" />
        </div>
      </div>
      {error ? <p className="p-4 text-sm font-bold text-red-600">Erreur : {error}</p> : loading ? <p className="p-4 text-sm text-slate-400">Chargement…</p> : shown.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">Aucun rapport enregistré. Chaque impression du rapport « Contrôle & Pointage » est enregistrée ici automatiquement.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr><th className="px-3 py-2 text-left">N° EXP</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Par</th><th className="px-3 py-2 text-left">Vers</th><th className="px-3 py-2 text-right">Expéditions</th><th className="px-3 py-2 text-right">Montant</th><th className="px-3 py-2 text-left">Réception</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(r => {
                const cities = Object.keys(r.toCities || {})
                const rec = r.receivedBy || {}
                return (
                  <tr key={r.id} className="hover:bg-purple-50/40 cursor-pointer" onClick={() => setOpen(r)}>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-purple-700 max-w-xs" title={r.lines.map(l => l.nic).join(', ')}>{nicsText(r)}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{fmtDT(r.createdAt)}</td>
                    <td className="px-3 py-2 text-xs">{r.createdBy}<span className="block text-slate-400">{r.createdByCity}</span></td>
                    <td className="px-3 py-2 text-xs">{cities.map(c => `${c} (${r.toCities[c]})`).join(', ')}</td>
                    <td className="px-3 py-2 text-right">{r.count}</td>
                    <td className="px-3 py-2 text-right font-black text-emerald-700 whitespace-nowrap">{money(r.total)} DH</td>
                    <td className="px-3 py-2 text-xs">{cities.map(c => <span key={c} className={`inline-block mr-1 mb-0.5 px-1.5 py-0.5 rounded-md font-bold ${rec[c] ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{c} : {rec[c] ? 'reçu' : 'en attente'}</span>)}</td>
                    <td className="px-3 py-2 text-right"><Eye className="w-4 h-4 text-purple-500 inline" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <ReportModal report={open} myCity={myCity} me={me} isAdmin={isAdmin} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload() }} />}
    </section>
  )
}

function ReportModal({ report, myCity, me, isAdmin, onClose, onChanged }: { report: ControlReport; myCity: string; me: { uid: string; name: string }; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  // État ACTUEL de chaque expédition du rapport (arrivée confirmée par l'agence destinataire ?)
  const [live, setLive] = useState<Record<string, any>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const ids = report.lines.map(l => l.id).filter(Boolean)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
    Promise.all(chunks.map(c => getDocs(query(collection(db, 'parcels'), where(documentId(), 'in', c))).catch(() => null)))
      .then(res => {
        const m: Record<string, any> = {}
        res.forEach(s => s?.docs.forEach(d => { m[d.id] = d.data() }))
        setLive(m)
      })
  }, [report.id])

  const arrived = report.lines.filter(l => live[l.id]?.deliveryControlled).length
  const canReceive = !!myCity && !!report.toCities?.[myCity] && !report.receivedBy?.[myCity]
  const canDelete = isAdmin || report.createdById === me.uid

  const markReceived = async () => {
    if (!confirm(`Confirmer la réception de l'envoi du ${fmtDT(report.createdAt)} (N° EXP ${nicsText(report)}) à ${myCity} (${report.toCities[myCity]} expédition(s)) ?`)) return
    setBusy(true)
    try { await updateDoc(doc(db, 'controlReports', report.id!), { [`receivedBy.${myCity}`]: { at: new Date().toISOString(), by: me.name } }); onChanged() } catch (e: any) { alert(e?.message || String(e)) }
    setBusy(false)
  }
  const remove = async () => {
    if (!confirm(`Supprimer le rapport enregistré du ${fmtDT(report.createdAt)} (N° EXP ${nicsText(report)}) ? (Les expéditions et leurs pointages ne changent pas.)`)) return
    setBusy(true)
    try { await deleteDoc(doc(db, 'controlReports', report.id!)); onChanged() } catch (e: any) { alert(e?.message || String(e)) }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-slate-800">📋 N° EXP : {nicsText(report, 8)}</h3>
            <p className="text-xs text-slate-500">{report.title} · {report.period} · par {report.createdBy}{report.createdByCity ? ` (${report.createdByCity})` : ''} le {fmtDT(report.createdAt)}</p>
            <p className="text-xs mt-1">
              <b>{report.count}</b> expédition(s) · <b className="text-emerald-700">{money(report.total)} DH</b> · arrivée confirmée : <b>{arrived} / {report.count}</b>
              {Object.keys(report.toCities || {}).map(c => <span key={c} className={`ml-2 px-1.5 py-0.5 rounded-md font-bold ${report.receivedBy?.[c] ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{c} : {report.receivedBy?.[c] ? `reçu le ${fmtDT(report.receivedBy[c].at)} par ${report.receivedBy[c].by}` : 'en attente'}</span>)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 sticky top-0">
              <tr><th className="px-2 py-2 text-left">N° EXP</th><th className="px-2 py-2 text-left">Créée le</th><th className="px-2 py-2 text-left">Expéditeur → destinataire</th><th className="px-2 py-2 text-left">Vers</th><th className="px-2 py-2 text-left">Paiement</th><th className="px-2 py-2 text-right">Montant</th><th className="px-2 py-2 text-left">Contrôlé</th><th className="px-2 py-2 text-left">Arrivée (actuel)</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.lines.map(l => {
                const cur = live[l.id]
                return (
                  <tr key={l.id}>
                    <td className="px-2 py-1.5 font-bold">{l.nic}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtD(l.createdAt)}</td>
                    <td className="px-2 py-1.5">{l.sender} → {l.receiver}</td>
                    <td className="px-2 py-1.5">{l.originCity}</td>
                    <td className="px-2 py-1.5">{l.payType}</td>
                    <td className="px-2 py-1.5 text-right font-black text-emerald-700 whitespace-nowrap">{money(l.amount)} DH</td>
                    <td className="px-2 py-1.5">{l.controlled ? '✓' : ''}</td>
                    <td className="px-2 py-1.5">{!cur ? <span className="text-slate-400">—</span> : cur.deliveryControlled ? <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {cur.deliveryControlledBy || 'confirmée'}</span> : <span className="text-amber-700 font-bold">en attente</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2">
          {canDelete && <button disabled={busy} onClick={remove} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-sm font-black flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Supprimer</button>}
          {canReceive && <button disabled={busy} onClick={markReceived} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Envoi reçu à {myCity}</button>}
          <button onClick={() => openPrint(controlReportHtml({ ...report, printedAt: `${fmtDT(new Date())} (réimpression du ${fmtDT(report.createdAt)})` }))} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-black flex items-center gap-1.5"><Printer className="w-4 h-4" /> Réimprimer</button>
        </div>
      </div>
    </div>
  )
}
