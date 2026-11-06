// 🩺 Santé des données (01/11/2026) — dernier rapport du contrôle quotidien automatique (Cloud Function scheduledHealthCheck,
// chaque matin à 5 h, lecture seule ; libellés fournis par le serveur, functions/healthCheck.js). Bouton : relancer maintenant.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { Activity, Loader2, RefreshCw } from 'lucide-react'
import { db } from '../../../firebase/config'
import app from '../../../firebase/appCore'

interface Item { label?: string; count?: number; checked?: number; diff?: number; examples?: string[] }
interface Report { at: string; scanned: number; sample: number; problems: number; rules: Record<string, Item>; copies: Record<string, Item>; aggregates: Record<string, Item> }

const COPY_LABEL: Record<string, string> = {
  lite: 'Copie allégée des expéditions (parcelsLite)',
  versement: 'Collectes par jour / versements (versementContrib)',
  envoi: 'Argent détenu par le chef d\'exploitation (envoiContrib)',
  versementDays: 'Totaux par journée et par agence (versementDays)',
  envoiHolders: 'Reste à verser par compte (envoiHolders)',
  portAgencyDays: 'Totaux de Port par agence (portAgencyDays)',
  codAgencyDays: 'Totaux de COD par agence (codAgencyDays)',
}
const fmtAt = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` }

export default function HealthCheckCard() {
  const [r, setR] = useState<Report | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => onSnapshot(doc(db, 'healthChecks', 'latest'),
    s => { setR(s.exists() ? (s.data() as Report) : null); setLoaded(true) },
    e => { setError(`Lecture du contrôle : ${e.message}`); setLoaded(true) }), [])

  const runNow = async () => {
    setRunning(true); setError('')
    try { await httpsCallable(getFunctions(app, 'europe-west1'), 'runHealthCheckNow', { timeout: 540000 })({}) }
    catch (e: any) { setError(e?.message || String(e)) }
    finally { setRunning(false) }
  }

  const rules = r ? Object.values(r.rules || {}) : []
  const copies = r ? Object.entries({ ...(r.copies || {}), ...(r.aggregates || {}) }) : []
  const copyDiff = copies.reduce((s, [, c]) => s + (c.diff || 0), 0)
  const ok = !!r && r.problems === 0

  return (
    <section className={`rounded-2xl border p-5 ${!r ? 'border-slate-200 bg-white' : ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className={`p-2 rounded-xl text-white ${ok ? 'bg-emerald-600' : 'bg-amber-500'}`}><Activity className="w-5 h-5" /></div>
        <div className="flex-1 min-w-60">
          <h2 className="text-lg font-black text-slate-900">🩺 Santé des données</h2>
          <p className="text-xs text-slate-600">
            Contrôle automatique chaque matin à 5 h, en lecture seule : incohérences laissées par une correction, et copies tenues par le serveur comparées à l'original.
            {r && <> Dernier contrôle : <b>{fmtAt(r.at)}</b> · {r.scanned.toLocaleString('fr-FR')} expéditions actives.</>}
          </p>
        </div>
        <button onClick={runNow} disabled={running} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} {running ? 'Contrôle en cours…' : 'Relancer maintenant'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {loaded && !r && !error && <p className="mt-3 text-sm text-slate-600">Pas encore de contrôle : il tournera demain à 5 h, ou cliquez sur « Relancer maintenant ».</p>}
      {r && (
        <>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className={`px-3 py-1 rounded-full font-bold ${rules.some(x => x.count) ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {rules.reduce((s, x) => s + (x.count || 0), 0)} incohérence(s)
            </span>
            <span className={`px-3 py-1 rounded-full font-bold ${copyDiff ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
              {copyDiff ? `${copyDiff} écart(s) dans les copies` : 'Copies du serveur justes'}
            </span>
            <button onClick={() => setOpen(o => !o)} className="px-3 py-1 rounded-full border border-slate-300 bg-white text-slate-700 font-semibold">{open ? 'Masquer le détail' : 'Voir le détail'}</button>
          </div>
          {open && (
            <div className="mt-3 grid gap-2">
              {rules.map(x => (
                <div key={x.label} className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm">
                  <span className={`inline-block min-w-12 font-black ${x.count ? 'text-amber-700' : 'text-emerald-700'}`}>{x.count}</span> {x.label}
                  {!!x.examples?.length && <div className="text-xs text-slate-500 mt-0.5 font-mono">ex. {x.examples.join(' · ')}</div>}
                </div>
              ))}
              {copies.map(([k, c]) => (
                <div key={k} className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm">
                  <span className={`inline-block min-w-12 font-black ${c.diff ? 'text-red-700' : 'text-emerald-700'}`}>{c.diff ? `${c.diff} ✗` : '✓'}</span>
                  {COPY_LABEL[k] || k} — {c.checked} vérifié(s){c.diff ? `, ${c.diff} écart(s)` : ''}
                  {!!c.examples?.length && <div className="text-xs text-slate-500 mt-0.5 font-mono">ex. {c.examples.join(' · ')}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
