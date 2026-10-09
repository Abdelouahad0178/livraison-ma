import { useState } from 'react'
import { Calendar, Printer } from 'lucide-react'
import { printCodCollectes, printPortsCollectes } from '../../utils/agentPrintUtils'
import { getOperationalDayString } from '../../config/operationalDay'
import { caisseCodAmountOfType, type CodCollecteJour } from '../../utils/agencyCaisseRules'

export type CollecteJour = { count: number; montant: number; parcels: any[] }

/**
 * 📊 Ports dus collectés par journée d'opération (14 dernières) — cartes cliquables + détail imprimable.
 * Partagé par Caisse Agence (chef d'agence) et la Collecte du soir (chef d'exploitation) :
 * données = computeCaisseView().collectesParJour.
 */
export default function CollectesParJour({ collectesParJour, profile }: Readonly<{
  collectesParJour: [string, CollecteJour][]
  profile: any
}>) {
  const [collecteDay, setCollecteDay] = useState<(CollecteJour & { dateStr: string; dayLabel: string }) | null>(null)
  if (collectesParJour.length === 0) return null
  const today = getOperationalDayString(new Date())

  return (
    <>
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-green-600" />
          <h3 className="text-lg font-bold text-gray-900">Collectes par jour (14 derniers jours)</h3>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
          {collectesParJour.map(([dateStr, data]) => {
            const d = new Date(dateStr)
            const dayLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            const isToday = dateStr === today
            return (
              <button type="button" key={dateStr} onClick={() => setCollecteDay({ dateStr, dayLabel, ...data })}
                title="Voir le détail et imprimer"
                className={`border rounded-lg p-3 text-center hover:border-green-400 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer ${isToday ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-green-200'}`}>
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-green-50' : 'text-gray-600'}`}>{isToday ? "Aujourd'hui" : dayLabel}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-white' : 'text-green-700'}`}>{data.count}</div>
                <div className={`text-xs mt-1 ${isToday ? 'text-green-50' : 'text-gray-500'}`}>{data.montant.toFixed(0)} DH</div>
                <div className={`text-[10px] mt-1 font-semibold ${isToday ? 'text-white' : 'text-green-600'}`}>👁 Détail</div>
              </button>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-gray-600 text-center">
          Total 14 jours: <strong>{collectesParJour.reduce((s, [, d]) => s + d.count, 0)} colis</strong> pour{' '}
          <strong>{collectesParJour.reduce((s, [, d]) => s + d.montant, 0).toFixed(2)} DH</strong>
        </div>
      </div>

      {/* 📅 Détail d'une journée de collecte (clic sur une carte) */}
      {collecteDay && (() => {
        const list = [...(collecteDay.parcels || [])].sort((a: any, b: any) => String(a.deliveryDriverName || '').localeCompare(String(b.deliveryDriverName || '')))
        const byDriver = new Map<string, { n: number; m: number }>()
        list.forEach((p: any) => { const k = p.deliveryDriverName || p.portCollectedBy || '—'; const c = byDriver.get(k) || { n: 0, m: 0 }; c.n++; c.m += Number(p.price) || 0; byDriver.set(k, c) })
        const fullDay = new Date(collecteDay.dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={() => setCollecteDay(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900">Ports collectés — journée du {fullDay}</h3>
                  <p className="text-xs text-gray-600">{collecteDay.count} colis · <b className="text-green-700">{collecteDay.montant.toFixed(2)} DH</b> · {byDriver.size} livreur(s)</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => printPortsCollectes(list, profile, `Journée d'opération du ${fullDay}`)}
                    className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3 py-2 rounded-lg">
                    <Printer className="w-4 h-4" /> Imprimer
                  </button>
                  <button onClick={() => setCollecteDay(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Fermer">✕</button>
                </div>
              </div>
              <div className="px-5 py-3 flex flex-wrap gap-2 border-b">
                {[...byDriver.entries()].map(([name, v]) => (
                  <span key={name} className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full px-2.5 py-1">
                    {name} : <b>{v.n}</b> · {v.m.toFixed(0)} DH
                  </span>
                ))}
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">N° EXP</th>
                      <th className="px-3 py-2 text-left">Expéditeur</th>
                      <th className="px-3 py-2 text-left">Destinataire</th>
                      <th className="px-3 py-2 text-left">Livreur</th>
                      <th className="px-3 py-2 text-left">Collecté par</th>
                      <th className="px-3 py-2 text-left">Heure</th>
                      <th className="px-3 py-2 text-right">Port dû</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p: any, i: number) => {
                      const at = p.portCollectedAt?.toDate ? p.portCollectedAt.toDate() : p.portCollectedAt ? new Date(p.portCollectedAt) : null
                      return (
                        <tr key={p.id} className={i % 2 ? 'bg-gray-50/60' : ''}>
                          <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold text-blue-700">{p.sender?.nic || p.senderNic || p.trackingId}</td>
                          <td className="px-3 py-1.5">{p.sender?.name || '—'}</td>
                          <td className="px-3 py-1.5">{p.receiver?.name || '—'}</td>
                          <td className="px-3 py-1.5">{p.deliveryDriverName || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{p.portCollectedBy || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">{at && !isNaN(at.getTime()) ? at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-green-700">{(Number(p.price) || 0).toFixed(2)} DH</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-green-50 font-bold">
                    <tr><td colSpan={7} className="px-3 py-2">TOTAL — {collecteDay.count} colis</td><td className="px-3 py-2 text-right text-green-800">{collecteDay.montant.toFixed(2)} DH</td></tr>
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
export function CodCollectesParJour({ codCollectesParJour, profile }: Readonly<{
  codCollectesParJour: [string, CodCollecteJour][]
  profile: any
}>) {
  const [day, setDay] = useState<(CodCollecteJour & { dateStr: string }) | null>(null)
  if (codCollectesParJour.length === 0) return null
  const today = getOperationalDayString(new Date())
  const sum = (k: 'count' | 'montant' | 'especes' | 'cheque' | 'traite') => codCollectesParJour.reduce((s, [, d]) => s + d[k], 0)

  return (
    <>
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-gray-900">Valeurs (COD) collectées par jour (14 derniers jours)</h3>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
          {codCollectesParJour.map(([dateStr, data]) => {
            const isToday = dateStr === today
            const dayLabel = new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
            return (
              <button type="button" key={dateStr} onClick={() => setDay({ dateStr, ...data })}
                title={COD_TYPES.filter(t => data[t.key] > 0).map(t => `${t.label} ${data[t.key].toFixed(0)} DH`).join(' · ')}
                className={`border rounded-lg p-3 text-center hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer ${isToday ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-indigo-200'}`}>
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-indigo-50' : 'text-gray-600'}`}>{isToday ? "Aujourd'hui" : dayLabel}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-white' : 'text-indigo-700'}`}>{data.count}</div>
                <div className={`text-xs mt-1 ${isToday ? 'text-indigo-50' : 'text-gray-500'}`}>{data.montant.toFixed(0)} DH</div>
                <div className={`text-[10px] mt-1 font-semibold ${isToday ? 'text-white' : 'text-indigo-600'}`}>👁 Détail</div>
              </button>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-gray-600 text-center">
          Total 14 jours: <strong>{sum('count')} expédition(s)</strong> pour <strong>{sum('montant').toFixed(2)} DH</strong>
          {COD_TYPES.filter(t => sum(t.key) > 0).map(t => <span key={t.key}> · {t.emoji} {t.label} {sum(t.key).toFixed(2)} DH</span>)}
        </div>
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
