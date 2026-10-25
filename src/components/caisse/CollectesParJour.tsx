import { useEffect, useRef, useState } from 'react'
import { usePersistedOpen } from '../../hooks/usePersistedOpen'
import { Calendar, ChevronDown, Printer } from 'lucide-react'
import { printCodCollectes, printPortsCollectes } from '../../utils/agentPrintUtils'
import { getOperationalDayString } from '../../config/operationalDay'
import { caisseCodAmountOfType, toDateSafe, type CodCollecteJour, type CollecteJour } from '../../utils/agencyCaisseRules'

export type { CollecteJour }

/** Journée d'opération de l'EXPÉDITION (date de création) — distingue, dans un même jour de collecte, une
 *  expédition du 07/10 encaissée avec celles du 08/10. */
const expDayOf = (p: any): string => { const d = toDateSafe(p.createdAt); return d ? getOperationalDayString(d) : '' }
const fmtDay = (key: string) => key ? new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Date inconnue'
const fmtDayShort = (key: string) => key ? new Date(key + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '?'
/** Livreur d'une collecte (port payé ramassé au guichet : celui qui l'a collecté). */
const driverOf = (p: any): string => (p.portType === 'port_paye' ? p.portCollectedBy : p.deliveryDriverName) || p.portCollectedBy || '—'
/** Répartition par date d'expédition (la plus récente d'abord). */
function byExpDay(parcels: any[]): [string, { n: number; m: number }][] {
  const map = new Map<string, { n: number; m: number }>()
  parcels.forEach((p: any) => { const k = expDayOf(p); const c = map.get(k) || { n: 0, m: 0 }; c.n++; c.m += Number(p.price) || 0; map.set(k, c) })
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

/**
 * 📊 Ports collectés par journée d'opération (14 dernières) : ports dus + ports payés ramassés au guichet (« En gare ») — cartes cliquables + détail imprimable.
 * Partagé par Caisse Agence (chef d'agence) et la Collecte du soir (chef d'exploitation) :
 * données = computeCaisseView().collectesParJour.
 */
export default function CollectesParJour({ collectesParJour, profile, showVersement = false, selectedRange = null, loadingRecent = false }: Readonly<{
  collectesParJour: [string, CollecteJour][]
  profile: any
  /** ⏳ Collectes des derniers jours encore en chargement (lancées après la période affichée) : chiffres incomplets */
  loadingRecent?: boolean
  /** 📌 Date / période du filtre de la page (journées d'opération AAAA-MM-JJ, incluses) : journées mises en évidence */
  selectedRange?: { fromKey: string; toKey: string } | null
  /** 💼 Caisse Agence : état du versement à l'admin de chaque journée (✅ versé / ⏳ reste à verser) */
  showVersement?: boolean
}>) {
  const [collecteDay, setCollecteDay] = useState<(CollecteJour & { dateStr: string; dayLabel: string }) | null>(null)
  // Filtre du détail par date d'expédition (null = toutes)
  const [expFilter, setExpFilter] = useState<string | null>(null)
  // Filtre du détail par livreur (null = tous)
  const [driverFilter, setDriverFilter] = useState<string | null>(null)
  // Bloc replié au démarrage (petite flèche), puis tel que l'utilisateur l'a laissé
  const [open, setOpen] = usePersistedOpen(`collectes-jour:${showVersement ? 'agence' : 'exp'}`, false)
  const gridRef = useRef<HTMLDivElement>(null)
  const isSel = (k: string) => !!selectedRange && k >= selectedRange.fromKey && k <= selectedRange.toKey
  const selKey = selectedRange ? `${selectedRange.fromKey}|${selectedRange.toKey}` : ''
  // 📌 Nouvelle date / période choisie dans le filtre (pas au premier affichage) : le bloc s'ouvre sur la sélection
  const firstSel = useRef(true)
  useEffect(() => {
    if (firstSel.current) { firstSel.current = false; return }
    if (selKey) setOpen(true)
  }, [selKey])
  // 📌 Le filtre change (ou le bloc s'ouvre) : défilement jusqu'à la journée sélectionnée
  useEffect(() => {
    if (!open || !selKey) return
    const el = gridRef.current?.querySelector('[data-selected="1"]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [open, selKey])
  if (collectesParJour.length === 0) return null
  const today = getOperationalDayString(new Date())
  const todayData = collectesParJour.find(([k]) => k === today)?.[1]

  return (
    <>
      <div className={`bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl ${open ? 'p-5' : 'px-5 py-3'}`}>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className={`w-full flex items-center justify-between gap-2 text-left ${open ? 'mb-4' : ''}`}>
          <span className="flex items-center gap-2 min-w-0">
            <Calendar className="w-5 h-5 text-green-600 shrink-0" />
            <span className="min-w-0">
              <span className="block text-lg font-bold text-gray-900">Collectes par jour (14 derniers jours)</span>
              {loadingRecent && <span className="block text-xs font-semibold text-amber-700">⏳ Chargement des collectes des derniers jours… (versements disponibles dans quelques secondes)</span>}
              {!open && (
                <span className="block text-xs text-gray-600">
                  Aujourd'hui : <b className="text-green-700">{todayData?.count || 0}</b> · {(todayData?.montant || 0).toFixed(0)} DH
                  {' '}— 14 jours : {collectesParJour.reduce((s, [, d]) => s + d.count, 0)} colis · {collectesParJour.reduce((s, [, d]) => s + d.montant, 0).toFixed(0)} DH
                  {selectedRange && (() => {
                    const sel = collectesParJour.filter(([k]) => isSel(k))
                    return <> — <b className="text-violet-700">📌 Filtre : {sel.reduce((s, [, d]) => s + d.count, 0)} colis · {sel.reduce((s, [, d]) => s + d.montant, 0).toFixed(0)} DH</b></>
                  })()}
                </span>
              )}
            </span>
          </span>
          <ChevronDown className={`w-5 h-5 text-green-700 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (<>
        <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {collectesParJour.map(([dateStr, data]) => {
            const d = new Date(dateStr)
            const dayLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            const isToday = dateStr === today
            const selected = isSel(dateStr)
            const exps = byExpDay(data.parcels || [])
            return (
              <button type="button" key={dateStr} data-selected={selected ? '1' : undefined} onClick={() => { setExpFilter(null); setDriverFilter(null); setCollecteDay({ dateStr, dayLabel, ...data }) }}
                title={selected ? 'Journée du filtre — voir le détail et imprimer' : 'Voir le détail et imprimer'}
                className={`relative flex flex-col items-stretch justify-start border rounded-lg p-3 text-center hover:border-green-400 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer ${isToday ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-green-200'} ${selected ? 'ring-4 ring-violet-400 ring-offset-1 shadow-md' : ''}`}>
                {selected && <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black text-white shadow">📌 Filtre</span>}
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-green-50' : 'text-gray-600'}`}>{isToday ? "Aujourd'hui" : dayLabel}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-white' : 'text-green-700'}`}>{data.count}</div>
                <div className={`text-xs mt-1 ${isToday ? 'text-green-50' : 'text-gray-500'}`}>{data.montant.toFixed(0)} DH</div>
                {data.portPaye?.count > 0 && (
                  <div className={`text-[10px] mt-1 leading-tight ${isToday ? 'text-green-50' : 'text-gray-500'}`}>
                    💰 {data.portDu.count} dû · {data.portDu.montant.toFixed(0)} DH<br />📬 {data.portPaye.count} payé · {data.portPaye.montant.toFixed(0)} DH
                  </div>
                )}
                {exps.length > 1 && (
                  // Répartition par date d'expédition : 3 lignes au plus (le reste dans le détail)
                  <div className={`mt-2 pt-1.5 border-t text-[10px] leading-snug text-left space-y-0.5 ${isToday ? 'border-green-500 text-green-50' : 'border-green-100 text-amber-800'}`}
                    title={exps.map(([k, v]) => `Exp. ${fmtDayShort(k)} : ${v.n} · ${v.m.toFixed(0)} DH`).join('\n')}>
                    {exps.slice(0, 3).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-1 whitespace-nowrap">
                        <span>📦 {fmtDayShort(k)} · {v.n}</span><span className="tabular-nums">{v.m.toFixed(0)} DH</span>
                      </div>
                    ))}
                    {exps.length > 3 && <div className="italic opacity-80">+ {exps.length - 3} autre{exps.length - 3 > 1 ? 's' : ''} date{exps.length - 3 > 1 ? 's' : ''}</div>}
                  </div>
                )}
                {showVersement && (
                  <div className={`mt-2 rounded-md px-1.5 py-0.5 text-[10px] font-black ${(data.aVerser || 0) > 0
                    ? (isToday ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800')
                    : (isToday ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800')}`}>
                    {(data.aVerser || 0) > 0 ? `⏳ Reste à verser ${data.aVerser!.toFixed(0)} DH` : (data.nonRecu || 0) > 0 ? '✅ Rien à verser pour l\'instant' : '✅ Versé à l\'admin'}
                  </div>
                )}
                {showVersement && (data.nonRecu || 0) > 0 && (
                  <div className={`mt-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isToday ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-700'}`}
                    title="Ports dus collectés ce jour-là mais pas encore reçus par le chef d'agence (chez le chef d'exploitation ou les livreurs)">
                    🚚 Pas encore reçu {data.nonRecu!.toFixed(0)} DH
                  </div>
                )}
                <div className={`mt-auto pt-2 text-[10px] font-semibold ${isToday ? 'text-white' : 'text-green-600'}`}>👁 Détail</div>
              </button>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-gray-600 text-center">
          Total des journées affichées : <strong>{collectesParJour.reduce((s, [, d]) => s + d.count, 0)} colis</strong> pour{' '}
          <strong>{collectesParJour.reduce((s, [, d]) => s + d.montant, 0).toFixed(2)} DH</strong>
          {' '}(💰 ports dus {collectesParJour.reduce((s, [, d]) => s + (d.portDu?.montant || 0), 0).toFixed(2)} DH · 📬 ports payés à ramasser {collectesParJour.reduce((s, [, d]) => s + (d.portPaye?.montant || 0), 0).toFixed(2)} DH)
        </div>
        </>)}
      </div>

      {/* 📅 Détail d'une journée de collecte (clic sur une carte) */}
      {collecteDay && (() => {
        const exps = byExpDay(collecteDay.parcels || [])
        // Trié par date d'expédition (la plus récente d'abord), puis par livreur ; filtrable par date d'expédition
        const expList = [...(collecteDay.parcels || [])]
          .filter((p: any) => expFilter === null || expDayOf(p) === expFilter)
          .sort((a: any, b: any) => expDayOf(b).localeCompare(expDayOf(a)) || String(a.deliveryDriverName || '').localeCompare(String(b.deliveryDriverName || '')))
        const byDriver = new Map<string, { n: number; m: number }>()
        expList.forEach((p: any) => { const k = driverOf(p); const c = byDriver.get(k) || { n: 0, m: 0 }; c.n++; c.m += Number(p.price) || 0; byDriver.set(k, c) })
        // Filtre livreur (null = tous) : affichage ET impression
        const drv = driverFilter !== null && byDriver.has(driverFilter) ? driverFilter : null
        const list = drv === null ? expList : expList.filter((p: any) => driverOf(p) === drv)
        const listMontant = list.reduce((s: number, p: any) => s + (Number(p.price) || 0), 0)
        const fullDay = new Date(collecteDay.dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const printTitle = (d: string | null) => `Journée d'opération du ${fullDay}${expFilter !== null ? ` — expéditions du ${fmtDay(expFilter)}` : ''}${d !== null ? ` — livreur : ${d}` : ''}`
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={() => setCollecteDay(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900">Ports collectés — journée du {fullDay}</h3>
                  <p className="text-xs text-gray-600">{collecteDay.count} colis · <b className="text-green-700">{collecteDay.montant.toFixed(2)} DH</b> · {byDriver.size} livreur(s)
                    {collecteDay.portPaye?.count > 0 && <> · 💰 ports dus {collecteDay.portDu.count} ({collecteDay.portDu.montant.toFixed(2)} DH) · 📬 ports payés à ramasser {collecteDay.portPaye.count} ({collecteDay.portPaye.montant.toFixed(2)} DH)</>}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => printPortsCollectes(list, profile, printTitle(drv))}
                    title={drv === null ? 'Imprimer tous les livreurs' : `Imprimer seulement ${drv}`}
                    className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-2 rounded-lg">
                    <Printer className="w-4 h-4" /> {drv === null ? 'Imprimer tout' : `Imprimer ${drv}`}
                  </button>
                  <button onClick={() => setCollecteDay(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Fermer">✕</button>
                </div>
              </div>
              {/* 📦 Répartition par date d'expédition : une expédition du 07/10 encaissée avec celles du 08/10
                  reste identifiable ; clic = n'afficher (et n'imprimer) que cette date d'expédition */}
              <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b bg-amber-50/40">
                <span className="text-xs font-semibold text-gray-700">📦 Par date d'expédition :</span>
                <button type="button" onClick={() => setExpFilter(null)}
                  className={`text-xs rounded-full px-2.5 py-1 border ${expFilter === null ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50'}`}>
                  Toutes : <b>{collecteDay.count}</b> · {collecteDay.montant.toFixed(0)} DH
                </button>
                {exps.map(([k, v]) => (
                  <button type="button" key={k} onClick={() => setExpFilter(k)}
                    className={`text-xs rounded-full px-2.5 py-1 border ${expFilter === k ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-50'}`}>
                    Exp. du {fmtDay(k)} : <b>{v.n}</b> · {v.m.toFixed(0)} DH
                  </button>
                ))}
              </div>
              {/* 🚚 Par livreur : clic = n'afficher que ce livreur (le bouton Imprimer suit) ; 🖨️ = imprimer ce livreur directement */}
              <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b">
                <span className="text-xs font-semibold text-gray-700">🚚 Par livreur :</span>
                <button type="button" onClick={() => setDriverFilter(null)}
                  className={`text-xs rounded-full px-2.5 py-1 border ${drv === null ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>
                  Tous : <b>{expList.length}</b> · {expList.reduce((s: number, p: any) => s + (Number(p.price) || 0), 0).toFixed(0)} DH
                </button>
                {[...byDriver.entries()].map(([name, v]) => (
                  <span key={name} className={`inline-flex items-center rounded-full border text-xs ${drv === name ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    <button type="button" onClick={() => setDriverFilter(drv === name ? null : name)} className="pl-2.5 pr-1.5 py-1 rounded-l-full hover:underline">
                      {name} : <b>{v.n}</b> · {v.m.toFixed(0)} DH
                    </button>
                    <button type="button" title={`Imprimer seulement ${name}`}
                      onClick={() => printPortsCollectes(expList.filter((p: any) => driverOf(p) === name), profile, printTitle(name))}
                      className={`pl-1 pr-2 py-1 rounded-r-full border-l ${drv === name ? 'border-emerald-400 hover:bg-emerald-700' : 'border-emerald-200 hover:bg-emerald-100'}`}>
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">N° EXP</th>
                      <th className="px-3 py-2 text-left">Date EXP</th>
                      <th className="px-3 py-2 text-left">Expéditeur</th>
                      <th className="px-3 py-2 text-left">Destinataire</th>
                      <th className="px-3 py-2 text-left">Livreur</th>
                      <th className="px-3 py-2 text-left">Collecté par</th>
                      <th className="px-3 py-2 text-left">Heure</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Port</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p: any, i: number) => {
                      const at = p.portCollectedAt?.toDate ? p.portCollectedAt.toDate() : p.portCollectedAt ? new Date(p.portCollectedAt) : null
                      return (
                        <tr key={p.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold text-blue-700">{p.sender?.nic || p.senderNic || p.trackingId}</td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmtDay(expDayOf(p))}</td>
                          <td className="px-3 py-1.5">{p.sender?.name || '—'}</td>
                          <td className="px-3 py-1.5">{p.receiver?.name || '—'}</td>
                          <td className="px-3 py-1.5">{p.deliveryDriverName || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{p.portCollectedBy || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{at && !isNaN(at.getTime()) ? at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td className="px-3 py-1.5 text-xs">{p.portType === 'port_paye' ? <span className="text-indigo-700 font-semibold">📬 Port payé à ramasser{p.destinationCity ? ` → ${p.destinationCity}` : ''}{!p.portPayeExpReceivedAt && p.portStatus !== 'received' ? <span className="ml-1 text-amber-700">(à recevoir de la gare)</span> : ''}</span> : <span className="text-green-700 font-semibold">💰 Port dû</span>}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-green-700">{(Number(p.price) || 0).toFixed(2)} DH</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-green-50 font-bold">
                    <tr><td colSpan={9} className="px-3 py-2">TOTAL — {list.length} colis{expFilter !== null && <> (expéditions du {fmtDay(expFilter)})</>}{drv !== null && <> — {drv}</>}</td><td className="px-3 py-2 text-right text-green-800">{listMontant.toFixed(2)} DH</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

const COD_TYPES = [
  { key: 'especes', label: 'Espèces', emoji: '💵' },
  { key: 'cheque', label: 'Chèque', emoji: '📋' },
  { key: 'traite', label: 'Traite', emoji: '📝' },
] as const

/**
 * 💰 Valeurs (COD) collectées par journée d'opération (14 dernières) — cartes cliquables + détail imprimable,
 * montants par type comme Caisse Agence. Données = computeCaisseView().codCollectesParJour.
 */
export function CodCollectesParJour({ codCollectesParJour, profile, periodLabel = '14 derniers jours', periodShort = '14 jours', selectedRange = null }: Readonly<{
  codCollectesParJour: [string, CodCollecteJour][]
  profile: any
  /** 📌 Même sélection que les collectes des ports (date / période du filtre de la page) : journées mises en évidence */
  selectedRange?: { fromKey: string; toKey: string } | null
  /** Libellés de la période (page admin « Contre Remboursement » : période choisie) — défaut : 14 derniers jours. */
  periodLabel?: string
  periodShort?: string
}>) {
  const [day, setDay] = useState<(CodCollecteJour & { dateStr: string }) | null>(null)
  // Bloc replié au démarrage (petite flèche), comme les autres parties des pages
  const [open, setOpen] = usePersistedOpen('cod-collectes-jour', false)
  const gridRef = useRef<HTMLDivElement>(null)
  const isSel = (k: string) => !!selectedRange && k >= selectedRange.fromKey && k <= selectedRange.toKey
  const selKey = selectedRange ? `${selectedRange.fromKey}|${selectedRange.toKey}` : ''
  // 📌 Nouvelle date / période choisie dans le filtre (pas au premier affichage) : le bloc s'ouvre sur la sélection
  const firstSel = useRef(true)
  useEffect(() => {
    if (firstSel.current) { firstSel.current = false; return }
    if (selKey) setOpen(true)
  }, [selKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !selKey) return
    const el = gridRef.current?.querySelector('[data-selected="1"]') as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [open, selKey])
  if (codCollectesParJour.length === 0) return null
  const today = getOperationalDayString(new Date())
  const sum = (k: 'count' | 'montant' | 'especes' | 'cheque' | 'traite') => codCollectesParJour.reduce((s, [, d]) => s + d[k], 0)
  const todayData = codCollectesParJour.find(([k]) => k === today)?.[1]

  return (
    <>
      <div className={`bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl ${open ? 'p-5' : 'px-5 py-3'}`}>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className={`w-full flex items-center justify-between gap-2 text-left ${open ? 'mb-4' : ''}`}>
          <span className="flex items-center gap-2 min-w-0">
            <Calendar className="w-5 h-5 text-indigo-600 shrink-0" />
            <span className="min-w-0">
              <span className="block text-lg font-bold text-gray-900">Valeurs (COD) collectées par jour ({periodLabel})</span>
              {!open && (
                <span className="block text-xs text-gray-600">
                  Aujourd'hui : <b className="text-indigo-700">{todayData?.count || 0}</b> · {(todayData?.montant || 0).toFixed(0)} DH
                  {' '}— {periodShort} : {sum('count')} expédition(s) · {sum('montant').toFixed(0)} DH
                  {selectedRange && (() => {
                    const sel = codCollectesParJour.filter(([k]) => isSel(k))
                    return <> — <b className="text-violet-700">📌 Filtre : {sel.reduce((t, [, d]) => t + d.count, 0)} exp. · {sel.reduce((t, [, d]) => t + d.montant, 0).toFixed(0)} DH</b></>
                  })()}
                </span>
              )}
            </span>
          </span>
          <ChevronDown className={`w-5 h-5 text-indigo-700 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (<>
        <div ref={gridRef} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {codCollectesParJour.map(([dateStr, data]) => {
            const isToday = dateStr === today
            const selected = isSel(dateStr)
            const dayLabel = new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            return (
              <button type="button" key={dateStr} data-selected={selected ? '1' : undefined} onClick={() => setDay({ dateStr, ...data })}
                title={(selected ? 'Journée du filtre — ' : '') + COD_TYPES.filter(t => data[t.key] > 0).map(t => `${t.label} ${data[t.key].toFixed(0)} DH`).join(' · ')}
                className={`relative flex flex-col items-stretch justify-start border rounded-lg p-3 text-center hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer ${isToday ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-indigo-200'} ${selected ? 'ring-4 ring-violet-400 ring-offset-1 shadow-md' : ''}`}>
                {selected && <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black text-white shadow">📌 Filtre</span>}
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-indigo-50' : 'text-gray-600'}`}>{isToday ? "Aujourd'hui" : dayLabel}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-white' : 'text-indigo-700'}`}>{data.count}</div>
                <div className={`text-xs mt-1 ${isToday ? 'text-indigo-50' : 'text-gray-500'}`}>{data.montant.toFixed(0)} DH</div>
                {COD_TYPES.some(t => data[t.key] > 0) && (
                  <div className={`mt-2 pt-1.5 border-t text-[10px] leading-snug text-left space-y-0.5 ${isToday ? 'border-indigo-500 text-indigo-50' : 'border-indigo-100 text-gray-600'}`}>
                    {COD_TYPES.filter(t => data[t.key] > 0).map(t => (
                      <div key={t.key} className="flex justify-between gap-1 whitespace-nowrap">
                        <span>{t.emoji} {t.label}</span><span className="tabular-nums">{data[t.key].toFixed(0)} DH</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className={`mt-auto pt-2 text-[10px] font-semibold ${isToday ? 'text-white' : 'text-indigo-600'}`}>👁 Détail</div>
              </button>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-gray-600 text-center">
          Total {periodShort}: <strong>{sum('count')} expédition(s)</strong> pour <strong>{sum('montant').toFixed(2)} DH</strong>
          {COD_TYPES.filter(t => sum(t.key) > 0).map(t => <span key={t.key}> · {t.emoji} {t.label} {sum(t.key).toFixed(2)} DH</span>)}
        </div>
        </>)}
      </div>

      {day && (() => {
        const list = [...day.parcels].sort((a: any, b: any) => String(a.deliveryDriverName || '').localeCompare(String(b.deliveryDriverName || '')))
        const fullDay = new Date(day.dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={() => setDay(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-gradient-to-r from-indigo-50 to-violet-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900">Valeurs (COD) collectées — journée du {fullDay}</h3>
                  <p className="text-xs text-gray-600">{day.count} expédition(s) · <b className="text-indigo-700">{day.montant.toFixed(2)} DH</b>
                    {COD_TYPES.filter(t => day[t.key] > 0).map(t => <span key={t.key}> · {t.emoji} {day[t.key].toFixed(2)} DH</span>)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => printCodCollectes(list, caisseCodAmountOfType, profile, `Journée d'opération du ${fullDay}`)}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-2 rounded-lg">
                    <Printer className="w-4 h-4" /> Imprimer
                  </button>
                  <button onClick={() => setDay(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Fermer">✕</button>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">N° EXP</th>
                      <th className="px-3 py-2 text-left">Destinataire</th>
                      <th className="px-3 py-2 text-left">Livreur</th>
                      <th className="px-3 py-2 text-left">Collecté par</th>
                      {COD_TYPES.map(t => <th key={t.key} className="px-3 py-2 text-right">{t.emoji} {t.label}</th>)}
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p: any, i: number) => {
                      const parts = COD_TYPES.map(t => caisseCodAmountOfType(p, t.key))
                      const at = p.codCollectedAt?.toDate ? p.codCollectedAt.toDate() : p.codCollectedAt ? new Date(p.codCollectedAt) : null
                      return (
                        <tr key={p.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold text-blue-700">{p.sender?.nic || p.senderNic || p.trackingId}</td>
                          <td className="px-3 py-1.5">{p.receiver?.name || '—'}</td>
                          <td className="px-3 py-1.5">{p.deliveryDriverName || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{p.codCollectedBy || '—'}{at && !isNaN(at.getTime()) ? ` · ${at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}</td>
                          {parts.map((a, k) => <td key={COD_TYPES[k].key} className="px-3 py-1.5 text-right text-gray-700">{a ? `${a.toFixed(2)} DH` : '—'}</td>)}
                          <td className="px-3 py-1.5 text-right font-bold text-indigo-700">{parts.reduce((s, a) => s + a, 0).toFixed(2)} DH</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-indigo-50 font-bold">
                    <tr>
                      <td colSpan={5} className="px-3 py-2">TOTAL — {day.count} expédition(s)</td>
                      {COD_TYPES.map(t => <td key={t.key} className="px-3 py-2 text-right">{day[t.key].toFixed(2)} DH</td>)}
                      <td className="px-3 py-2 text-right text-indigo-800">{day.montant.toFixed(2)} DH</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
