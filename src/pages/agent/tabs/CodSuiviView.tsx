// 📊 RETOUR FOND — vue « Suivi » (chef d'agence / agent pro) : où en est chaque valeur, en
// clair. Deux circuits séparés (j'encaisse / je paie mes clients), chacun découpé en 5 étapes
// numérotées et cliquables (nombre + montant), un tableau unique filtrable (étape, type de
// valeur, livreur, ancienneté) avec la prochaine action à faire, et l'impression A4.
// Lecture seule : les actions (encaisser, envoyer, régler) restent dans les autres sous-onglets.
// Les étapes reprennent EXACTEMENT les règles des sections de CodTab (codStatus, codSentToSource,
// codReceivedBySource, codSenderPaid, centralDeposited).
import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { codPaymentTypeOf } from '../../../firebase/constants'
import { codHasType, codAmountOfType, isMixedCod, codPartsLabel } from '../../../utils/codParts'
import { fmt, fmtFixed as fmtAmt } from '../../../utils/formatNumber'

type Dir = 'dest' | 'src'
type GoView = 'todo' | 'livreurs' | 'retards' | 'flux'
interface Stage { key: string; n: number; label: string; help: string; action: string; go?: GoView; color: string; dot: string }

const DELIVERED = ['Livré', 'Retourné à l\'expéditeur']

const STAGES: Record<Dir, Stage[]> = {
  dest: [
    { key: 'd1', n: 1, label: 'À livrer', help: 'Colis pas encore livré au destinataire', action: 'Le livreur doit livrer et encaisser la valeur', color: 'bg-gray-500', dot: 'bg-gray-100 text-gray-700 border-gray-300' },
    { key: 'd2', n: 2, label: 'Chez le livreur', help: 'Livré : la valeur est entre les mains du livreur', action: 'Encaisser la valeur auprès du livreur', go: 'livreurs', color: 'bg-red-500', dot: 'bg-red-50 text-red-700 border-red-300' },
    { key: 'd3', n: 3, label: 'Dans mon agence', help: 'Encaissée par l\'agence, pas encore envoyée', action: 'Envoyer à l\'agence d\'origine (chèque / traite) ou verser (espèces)', go: 'todo', color: 'bg-orange-500', dot: 'bg-orange-50 text-orange-700 border-orange-300' },
    { key: 'd4', n: 4, label: 'Envoyée', help: 'Envoyée à l\'agence d\'origine, en attente de sa confirmation', action: 'Attendre la confirmation de réception de l\'agence d\'origine', go: 'flux', color: 'bg-sky-500', dot: 'bg-sky-50 text-sky-700 border-sky-300' },
    { key: 'd5', n: 5, label: 'Terminé', help: 'Reçue par l\'agence d\'origine, versée au compte société ou client payé', action: 'Rien à faire', color: 'bg-green-600', dot: 'bg-green-50 text-green-700 border-green-300' },
  ],
  src: [
    { key: 's1', n: 1, label: 'Pas encore livré', help: 'Le colis n\'est pas encore livré à destination', action: 'Attendre la livraison', color: 'bg-gray-500', dot: 'bg-gray-100 text-gray-700 border-gray-300' },
    { key: 's2', n: 2, label: 'Encaissé à destination', help: 'La valeur est chez le livreur ou l\'agence de destination', action: 'Attendre l\'envoi par l\'agence de destination', color: 'bg-amber-500', dot: 'bg-amber-50 text-amber-700 border-amber-300' },
    { key: 's3', n: 3, label: 'En route vers moi', help: 'Envoyée par l\'agence de destination', action: 'Confirmer la réception dès son arrivée', go: 'todo', color: 'bg-blue-500', dot: 'bg-blue-50 text-blue-700 border-blue-300' },
    { key: 's4', n: 4, label: 'À payer au client', help: 'Reçue dans mon agence, le client expéditeur n\'est pas encore payé', action: 'Payer le client expéditeur', go: 'todo', color: 'bg-purple-600', dot: 'bg-purple-50 text-purple-700 border-purple-300' },
    { key: 's5', n: 5, label: 'Client payé', help: 'Le client expéditeur a été payé', action: 'Rien à faire', color: 'bg-green-600', dot: 'bg-green-50 text-green-700 border-green-300' },
  ],
}

const TYPES = [
  { key: 'especes', label: '💵 Espèces' },
  { key: 'cheque', label: '📋 Chèques' },
  { key: 'traite', label: '📝 Traites' },
  { key: 'bon_livraison', label: '🧾 Bon livraison' },
]
const AGES = [
  { key: 0, label: 'Toutes' },
  { key: 24, label: '+ 24 h' },
  { key: 72, label: '+ 3 jours' },
  { key: 168, label: '+ 7 jours' },
]

const typeOf = (p: any): string => codPaymentTypeOf(p) || 'especes'
const inType = (p: any, k: string) => typeOf(p) === k || codHasType(p, k)
const toMs = (v: any): number | null => {
  if (!v) return null
  const d = v?.toDate ? v.toDate() : new Date(v)
  const t = d.getTime()
  return Number.isNaN(t) ? null : t
}

function stageOf(p: any, dir: Dir, hasDocValue: (p: any) => boolean): { key: string; since: any } {
  const st = p.codStatus || 'pending'
  const delivered = DELIVERED.includes(p.status)
  if (dir === 'dest') {
    if (p.codSenderPaid || p.codReceivedBySource || (p.centralDeposited && !hasDocValue(p)))
      return { key: 'd5', since: p.codSenderPaidAt || p.codReceivedBySourceAt || p.centralDepositedAt }
    if (p.codSentToSource) return { key: 'd4', since: p.codSentToSourceAt }
    if (st === 'remis') return { key: 'd3', since: p.codRemisAt || p.codChefReceivedAt || p.codReceivedByChefAt }
    if (st === 'collected' || delivered) return { key: 'd2', since: p.codCollectedAt || p.deliveredAt }
    return { key: 'd1', since: p.deliveryAssignedAt || p.createdAt }
  }
  if (p.codSenderPaid) return { key: 's5', since: p.codSenderPaidAt }
  if (p.codReceivedBySource) return { key: 's4', since: p.codReceivedBySourceAt }
  if (p.codSentToSource) return { key: 's3', since: p.codSentToSourceAt }
  if (st !== 'pending' || delivered || p.centralDeposited)
    return { key: 's2', since: p.centralDepositedAt || p.codRemisAt || p.codCollectedAt || p.deliveredAt }
  return { key: 's1', since: p.createdAt }
}

const ageText = (h: number | null) => h === null ? '—' : h < 1 ? '< 1 h' : h < 24 ? `${h} h` : `${Math.floor(h / 24)} j`
const ageCls = (h: number | null) => h === null ? 'bg-gray-100 text-gray-500'
  : h < 24 ? 'bg-green-50 text-green-700' : h < 72 ? 'bg-yellow-100 text-yellow-800' : h < 168 ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-700'

interface Props {
  rows: any[]
  isDest: (p: any) => boolean
  isSrc: (p: any) => boolean
  hasDocValue: (p: any) => boolean
  driverNameOf: (p: any) => string
  profile: any
  onGo: (v: GoView) => void
  historyLoaded: boolean
  loadingHistory: boolean
  onLoadHistory: () => void
}

export default function CodSuiviView({ rows, isDest, isSrc, hasDocValue, driverNameOf, profile, onGo, historyLoaded, loadingHistory, onLoadHistory }: Props) {
  const [dir, setDir] = useState<Dir>('dest')
  const [stage, setStage] = useState<string>('open') // 'open' = tout sauf Terminé · 'all' · clé d'étape
  const [type, setType] = useState('all')
  const [driver, setDriver] = useState('all')
  const [minAge, setMinAge] = useState(0)
  const [shown, setShown] = useState(150)

  // Valeurs du circuit choisi, avec leur étape et leur ancienneté dans l'étape
  const items = useMemo(() => {
    const now = Date.now()
    const pick = dir === 'dest' ? isDest : isSrc
    const seen = new Set<string>()
    const out: { p: any; stage: string; hours: number | null; driverKey: string; driverName: string }[] = []
    for (const p of rows) {
      if (!pick(p) || seen.has(p.id)) continue
      seen.add(p.id)
      const s = stageOf(p, dir, hasDocValue)
      const ms = toMs(s.since)
      out.push({
        p, stage: s.key,
        hours: ms === null ? null : Math.max(0, Math.floor((now - ms) / 3600000)),
        driverKey: p.deliveryDriverId || 'unassigned',
        driverName: driverNameOf(p),
      })
    }
    return out
  }, [rows, dir, isDest, isSrc, hasDocValue, driverNameOf])

  const typed = useMemo(() => (type === 'all' ? items : items.filter(i => inType(i.p, type))), [items, type])
  const amountOf = (p: any) => (type === 'all' ? (parseFloat(p.codAmount) || 0) : codAmountOfType(p, type))
  const driverScoped = useMemo(() => (driver === 'all' ? typed : typed.filter(i => i.driverKey === driver)), [typed, driver])
  const aged = useMemo(() => (minAge ? driverScoped.filter(i => i.hours !== null && i.hours >= minAge) : driverScoped), [driverScoped, minAge])

  // Compteurs des étapes (après filtres type / livreur / ancienneté, avant le filtre d'étape)
  const stageStats = useMemo(() => {
    const m: Record<string, { n: number; total: number }> = {}
    STAGES[dir].forEach(s => { m[s.key] = { n: 0, total: 0 } })
    aged.forEach(i => { m[i.stage].n++; m[i.stage].total += amountOf(i.p) })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aged, dir, type])

  const lastKey = STAGES[dir][4].key
  const visible = useMemo(() => {
    const list = stage === 'all' ? aged : stage === 'open' ? aged.filter(i => i.stage !== lastKey) : aged.filter(i => i.stage === stage)
    // Les plus anciennes d'abord : ce sont celles à relancer
    return [...list].sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1))
  }, [aged, stage, lastKey])
  const total = visible.reduce((s, i) => s + amountOf(i.p), 0)
  const byType = TYPES.map(t => ({ ...t, n: visible.filter(i => inType(i.p, t.key)).length, m: visible.reduce((s, i) => s + codAmountOfType(i.p, t.key), 0) })).filter(t => t.n > 0)

  const driverOptions = useMemo(() => {
    const m = new Map<string, { key: string; name: string; n: number }>()
    typed.forEach(i => { if (!m.has(i.driverKey)) m.set(i.driverKey, { key: i.driverKey, name: i.driverName, n: 0 }); m.get(i.driverKey)!.n++ })
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [typed])

  const stageDef = STAGES[dir].find(s => s.key === stage)
  const stageName = (k: string) => STAGES[dir].find(s => s.key === k)!
  const nic = (p: any) => p.senderNic || p.sender?.nic || p.trackingId || '—'
  const typeLabel = (p: any) => isMixedCod(p) ? codPartsLabel(p, { emoji: false, amounts: true }) : (TYPES.find(t => t.key === typeOf(p))?.label.slice(3) || 'Espèces')
  const switchDir = (d: Dir) => { setDir(d); setStage('open'); setDriver('all'); setShown(150) }

  const filterNote = [
    dir === 'dest' ? 'Colis livrés dans ma ville (j\'encaisse)' : 'Colis partis de ma ville (je paie mes clients)',
    stage === 'open' ? 'Étapes en cours (hors terminé)' : stage === 'all' ? 'Toutes les étapes' : `Étape ${stageDef?.n} : ${stageDef?.label}`,
    type !== 'all' ? TYPES.find(t => t.key === type)?.label.slice(3) : '',
    driver !== 'all' ? `Livreur : ${driverOptions.find(d => d.key === driver)?.name || ''}` : '',
    minAge ? `Bloqué depuis ${AGES.find(a => a.key === minAge)?.label}` : '',
  ].filter(Boolean).join(' · ')

  const handlePrint = () => {
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
    const body = visible.map((i, k) => `<tr>
      <td>${k + 1}</td><td>${esc(stageName(i.stage).n + '. ' + stageName(i.stage).label)}</td>
      <td><b>${esc(nic(i.p))}</b></td><td>${esc(i.p.sender?.name || '—')}</td><td>${esc(i.p.receiver?.name || '—')}</td>
      <td>${esc(dir === 'dest' ? i.driverName : (i.p.receiver?.city || i.p.destinationCity || '—'))}</td>
      <td>${esc(typeLabel(i.p))}</td><td>${ageText(i.hours)}</td><td class="r"><b>${fmtAmt(amountOf(i.p))} DH</b></td></tr>`).join('')
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Suivi RETOUR FOND</title><style>
      *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body{font-family:Arial,sans-serif;margin:14px;font-size:10px;color:#111827}
      h1{font-size:16px;margin:0 0 3px;text-align:center;color:#92400e}.sub{text-align:center;color:#6b7280;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}th{background:#b45309;color:#fff;padding:5px 4px;text-align:left;font-size:9px}
      td{padding:4px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even) td{background:#fafaf9}
      .r{text-align:right}tfoot td{font-weight:bold;background:#fef3c7;border-top:2px solid #f59e0b}
      @page{size:A4 portrait;margin:10mm}</style></head><body>
      <h1>💰 BG EXPRESS — Suivi RETOUR FOND</h1>
      <div class="sub">Agence ${esc(profile?.city || '')} · ${esc(filterNote)} · imprimé le ${new Date().toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      <table><thead><tr><th>#</th><th>Étape</th><th>N° EXP</th><th>Client expéditeur</th><th>Destinataire</th><th>${dir === 'dest' ? 'Livreur' : 'Ville dest.'}</th><th>Valeur</th><th>Depuis</th><th class="r">Montant</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="8">TOTAL — ${visible.length} valeur(s)${byType.length ? ' · ' + byType.map(t => `${t.label.slice(3)} ${t.n} = ${fmtAmt(t.m)} DH`).join(' · ') : ''}</td><td class="r">${fmtAmt(total)} DH</td></tr></tfoot></table>
      <script>window.onload=function(){window.print()}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  const chip = (on: boolean) => `px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${on ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`

  return (
    <div className="space-y-3">
      {/* ① Circuit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {([
          { key: 'dest', icon: '📥', title: 'J\'encaisse', sub: 'Colis livrés dans ma ville : je récupère la valeur et je l\'envoie à l\'agence d\'origine' },
          { key: 'src', icon: '📤', title: 'Je paie mes clients', sub: 'Colis partis de ma ville : la valeur revient vers moi et je paie le client expéditeur' },
        ] as const).map(c => (
          <button key={c.key} type="button" onClick={() => switchDir(c.key)}
            className={`text-left rounded-2xl border-2 px-4 py-3 transition ${dir === c.key ? 'border-amber-500 bg-amber-50 shadow' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <p className="text-sm font-black text-gray-800">{c.icon} {c.title}</p>
            <p className="text-[11px] text-gray-500 leading-snug">{c.sub}</p>
          </button>
        ))}
      </div>

      {/* ② Étapes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Les étapes — cliquez pour filtrer</p>
          <div className="flex gap-1">
            <button type="button" onClick={() => setStage('open')} className={chip(stage === 'open')}>En cours</button>
            <button type="button" onClick={() => setStage('all')} className={chip(stage === 'all')}>Toutes</button>
          </div>
        </div>
        <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
          {STAGES[dir].map((s, i) => {
            const st = stageStats[s.key] || { n: 0, total: 0 }
            const on = stage === s.key
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1 min-w-[118px]">
                <button type="button" onClick={() => setStage(on ? 'open' : s.key)} title={s.help}
                  className={`flex-1 h-full rounded-xl border-2 px-2 py-2 text-left transition ${on ? `${s.color} border-transparent text-white shadow-md` : `${s.dot} hover:shadow`}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 shrink-0 rounded-full text-[11px] font-black flex items-center justify-center ${on ? 'bg-white/25' : `${s.color} text-white`}`}>{s.n}</span>
                    <span className="text-[11px] font-bold leading-tight">{s.label}</span>
                  </div>
                  <p className="text-lg font-black leading-tight mt-1">{st.n}</p>
                  <p className={`text-[10px] font-semibold ${on ? 'text-white/85' : 'opacity-80'}`}>{fmt(st.total)} DH</p>
                </button>
                {i < 4 && <span className="text-gray-300 font-black shrink-0">›</span>}
              </div>
            )
          })}
        </div>
        {stageDef ? (
          <div className="mt-2 flex items-center gap-2 flex-wrap rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
            <p className="text-xs text-gray-700 flex-1 min-w-0">
              <b>{stageDef.n}. {stageDef.label} :</b> {stageDef.help}. <span className="text-gray-500">➜ Prochaine action : <b className="text-gray-800">{stageDef.action}</b></span>
            </p>
            {stageDef.go && (
              <button type="button" onClick={() => onGo(stageDef.go!)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">Aller traiter ➜</button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-gray-400">Chaque valeur avance de l'étape 1 à l'étape 5. Survolez une étape pour son explication.</p>
        )}
      </div>

      {/* ③ Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-gray-500 w-24">Type de valeur</span>
          <button type="button" onClick={() => setType('all')} className={chip(type === 'all')}>Toutes</button>
          {TYPES.map(t => <button key={t.key} type="button" onClick={() => setType(t.key)} className={chip(type === t.key)}>{t.label}</button>)}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-gray-500 w-24">Bloquée depuis</span>
          {AGES.map(a => <button key={a.key} type="button" onClick={() => setMinAge(a.key)} className={chip(minAge === a.key)}>{a.label}</button>)}
        </div>
        {dir === 'dest' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-gray-500 w-24">Livreur</span>
            <select value={driver} onChange={e => setDriver(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:border-amber-400 focus:outline-none">
              <option value="all">🚚 Tous les livreurs</option>
              {driverOptions.map(d => <option key={d.key} value={d.key}>{d.name} ({d.n})</option>)}
            </select>
          </div>
        )}
        {(type !== 'all' || minAge || driver !== 'all' || stage !== 'open') && (
          <button type="button" onClick={() => { setType('all'); setMinAge(0); setDriver('all'); setStage('open') }}
            className="text-[11px] font-bold text-amber-700 hover:underline">✕ Réinitialiser les filtres</button>
        )}
      </div>

      {/* ④ Totaux + liste */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-800">{visible.length} valeur{visible.length > 1 ? 's' : ''} · <span className="text-amber-600">{fmt(total)} DH</span></p>
            <p className="text-[11px] text-gray-500 truncate">{filterNote}</p>
            {byType.length > 1 && (
              <p className="text-[11px] text-gray-600 mt-0.5">{byType.map(t => `${t.label} ${t.n} · ${fmt(t.m)} DH`).join('   ')}</p>
            )}
          </div>
          <button type="button" onClick={handlePrint} disabled={!visible.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold disabled:opacity-40">
            <Printer className="w-4 h-4" /> Imprimer
          </button>
        </div>

        {!historyLoaded && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap text-[11px] text-amber-800">
            <span className="flex-1">Seules les valeurs récentes sont chargées. Pour retrouver les anciennes valeurs :</span>
            <button type="button" onClick={onLoadHistory} disabled={loadingHistory}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold disabled:opacity-60">
              {loadingHistory ? 'Chargement…' : 'Charger tout l\'historique'}
            </button>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            {items.length === 0 ? 'Aucune valeur RETOUR FOND sur cette période.' : '✅ Aucune valeur ne correspond à ces filtres.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-[11px]">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Étape</th>
                  <th className="text-left px-3 py-2 font-semibold">N° EXP</th>
                  <th className="text-left px-3 py-2 font-semibold">Client → Destinataire</th>
                  <th className="text-left px-3 py-2 font-semibold">{dir === 'dest' ? 'Livreur' : 'Ville dest.'}</th>
                  <th className="text-left px-3 py-2 font-semibold">Valeur</th>
                  <th className="text-left px-3 py-2 font-semibold">Depuis</th>
                  <th className="text-right px-3 py-2 font-semibold">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.slice(0, shown).map(i => {
                  const s = stageName(i.stage)
                  return (
                    <tr key={i.p.id} className="hover:bg-amber-50/40 align-top">
                      <td className="px-3 py-2">
                        <span title={`Prochaine action : ${s.action}`} className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${s.dot}`}>
                          <span className={`w-4 h-4 rounded-full text-[10px] text-white flex items-center justify-center ${s.color}`}>{s.n}</span>{s.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-bold text-gray-900">{nic(i.p)}</div>
                        <div className="text-[10px] font-mono text-blue-600">{i.p.trackingId}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{i.p.sender?.name || '—'}</div>
                        <div className="text-[11px] text-gray-500">→ {i.p.receiver?.name || '—'}{i.p.receiver?.tel ? ` · ${i.p.receiver.tel}` : ''}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">{dir === 'dest' ? i.driverName : (i.p.receiver?.city || i.p.destinationCity || '—')}</td>
                      <td className="px-3 py-2 text-xs text-gray-700">{typeLabel(i.p)}</td>
                      <td className="px-3 py-2"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ageCls(i.hours)}`}>{ageText(i.hours)}</span></td>
                      <td className="px-3 py-2 text-right font-black text-amber-700 whitespace-nowrap">{fmtAmt(amountOf(i.p))} DH</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visible.length > shown && (
              <button type="button" onClick={() => setShown(n => n + 300)}
                className="w-full py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 border-t border-gray-100">
                Afficher plus ({visible.length - shown} restantes)
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 px-1">
        « Depuis » = temps passé dans l'étape actuelle (vert &lt; 24 h · jaune &lt; 3 j · orange &lt; 7 j · rouge ≥ 7 j). Les plus anciennes sont en haut.
      </p>
    </div>
  )
}
