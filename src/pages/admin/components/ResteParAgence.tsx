// ⏳ Vue « Reste à encaisser » (Admin › Port par agence ET COD par agence) : par agence, attendu − encaissé = reste ;
// clic sur une agence → la liste des expéditions qui composent ce reste (filtrable par livreur, imprimable).
import { useState, type ReactNode } from 'react'
import { Building2, TrendingUp } from 'lucide-react'
import ResteAEncaisserModal from './ResteAEncaisserModal'
import type { ResteLine } from '../../../utils/agencyFollowUp'

export interface ResteRow { city: string; attendu: number; encaisse: number; reste: number; lines: ResteLine[] }

const dh = (n: number) => `${(Math.round((n || 0) * 100) / 100).toLocaleString('fr-MA')} DH`

export default function ResteParAgence({ rows, subject, periodText, kindLabels, help, children, alert = false }: {
  rows: ResteRow[]
  /** 🚨 Total du reste à encaisser en ROUGE CLIGNOTANT quand il est > 0 (COD par agence, demande du 24/10/2026) */
  alert?: boolean
  /** « Ports » ou « COD » */
  subject: string
  periodText: string
  kindLabels?: Record<string, string>
  help: string
  /** Contenu affiché sous le tableau (ex. Suivi de l'agence pour les ports) */
  children?: ReactNode
}) {
  const [open, setOpen] = useState<ResteRow | null>(null)
  const tot = rows.reduce((t, r) => ({ attendu: t.attendu + r.attendu, encaisse: t.encaisse + r.encaisse, reste: t.reste + r.reste, n: t.n + r.lines.length }), { attendu: 0, encaisse: 0, reste: 0, n: 0 })
  const blink = alert && tot.reste > 0.005
  const resteTotal = blink ? <span className="blink-alert inline-block text-red-600">⚠️ {dh(tot.reste)}</span> : dh(tot.reste)
  return (
    <>
      {/* Carte résumé */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-orange-200 rounded-xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">⏳ Reste à encaisser — {subject}</h3>
            <p className="text-xs text-gray-500 mt-0.5">🗓️ {periodText} · {help}</p>
          </div>
          <span className="text-sm text-gray-600">{rows.length} agence(s)</span>
        </div>
        <div className="flex flex-wrap items-center justify-around gap-6">
          <div><div className="text-xs text-gray-600 font-medium uppercase">📊 Attendu</div><div className="text-xl font-black text-indigo-700">{dh(tot.attendu)}</div></div>
          <div><div className="text-xs text-gray-600 font-medium uppercase">💵 Encaissé</div><div className="text-xl font-black text-green-700">{dh(tot.encaisse)}</div></div>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-amber-600" />
            <div><div className="text-xs text-gray-600 font-medium uppercase">⏳ Reste à encaisser</div><div className={`text-2xl font-black ${blink ? 'text-red-600' : 'text-amber-700'}`}>{resteTotal}</div><div className="text-[11px] text-gray-500">{tot.n} expédition(s)</div></div>
          </div>
        </div>
      </div>

      {/* Tableau par agence */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white">
            <tr>
              <th className="px-6 py-4 text-left font-bold whitespace-nowrap"><div className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Agence (Ville)</div></th>
              <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-indigo-600/30">📊 Attendu</th>
              <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-green-600/30">💵 Encaissé</th>
              <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-amber-500/30">⏳ Reste à encaisser</th>
              <th className="px-6 py-4 text-center font-bold whitespace-nowrap">Expéditions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.city} className={`border-b border-gray-100 ${i % 2 ? 'bg-gradient-to-r from-blue-50/30 via-purple-50/20 to-pink-50/30' : 'bg-white'}`}>
                <td className="px-6 py-4 font-bold text-gray-900">📍 <span className="text-lg">{r.city}</span></td>
                <td className="px-6 py-4 text-right font-bold text-indigo-700">{dh(r.attendu)}</td>
                <td className="px-6 py-4 text-right font-bold text-green-700">{dh(r.encaisse)}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setOpen(r)} disabled={!r.lines.length} title="Voir et imprimer les expéditions"
                    className="font-black text-lg text-amber-700 hover:underline disabled:no-underline disabled:text-gray-400">{dh(r.reste)} {r.lines.length > 0 && '👁'}</button>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex px-3 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold">{r.lines.length}</span>
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-black border-t-2 border-gray-300">
                <td className="px-6 py-5 text-lg">TOTAL</td>
                <td className="px-6 py-5 text-right text-indigo-900">{dh(tot.attendu)}</td>
                <td className="px-6 py-5 text-right text-green-900">{dh(tot.encaisse)}</td>
                <td className={`px-6 py-5 text-right text-xl ${blink ? 'text-red-600' : 'text-amber-900'}`}>{resteTotal}</td>
                <td className="px-6 py-5 text-center">{tot.n}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 print:hidden">Cliquez sur un montant « Reste à encaisser » pour voir les expéditions, les filtrer par livreur et les imprimer.</p>

      {children}

      {open && <ResteAEncaisserModal city={open.city} periodText={periodText} lines={open.lines} total={open.reste} kindLabels={kindLabels} subject={subject} onClose={() => setOpen(null)} />}
    </>
  )
}
