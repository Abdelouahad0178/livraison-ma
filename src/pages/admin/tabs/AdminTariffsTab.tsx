import { Calculator, Save } from 'lucide-react'
import { CITIES, calculateTariff, normalizeTariffConfig } from '../../../firebase/constants'
import type { TariffConfig } from '../../../types'

interface AdminTariffsTabProps {
  tariffDraft: TariffConfig
  setTariffDraft: (fn: (prev: TariffConfig) => TariffConfig) => void
  tariffSaving: boolean
  tariffMessage: any
  handleSaveTariffs: () => void
  handleResetTariffs: () => void
  updateTariffCityPrice: (city: string, value: string) => void
  updateTariffWeightRule: (idx: number, field: string, value: string) => void
}

export default function AdminTariffsTab({
  tariffDraft, setTariffDraft, tariffSaving, tariffMessage,
  handleSaveTariffs, handleResetTariffs, updateTariffCityPrice, updateTariffWeightRule,
}: AdminTariffsTabProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-black text-gray-800 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-amber-500" /> Tarifs par ville et par poids
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={handleSaveTariffs} disabled={tariffSaving}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center gap-2">
            <Save className="w-4 h-4" /> {tariffSaving ? 'Enregistrement...' : 'Enregistrer les tarifs'}
          </button>
          <button onClick={handleResetTariffs}
            className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold">
            Recharger les tarifs par defaut
          </button>
        </div>
        {tariffMessage && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
            tariffMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100'
              : tariffMessage.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100'
                : 'bg-blue-50 text-blue-700 border border-blue-100'
          }`}>
            {tariffMessage.text}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">Prix = tarif ville + supplément poids + 5 DH par colis supplémentaire.</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Modifier les prix de base par ville</h3>
          <p className="text-xs text-gray-400">Les nouveaux colis utiliseront ces prix apres enregistrement.</p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
          {CITIES.map(city => (
            <label key={city} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <span className="block text-xs font-bold text-gray-500 mb-1">{city}</span>
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="1"
                  value={tariffDraft.cityPrices?.[city] ?? 0}
                  onChange={e => updateTariffCityPrice(city, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs font-bold text-gray-400">DH</span>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Modifier les supplements poids</h3>
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
          {(tariffDraft.weightRules || []).map((rule, idx) => (
            <div key={idx} className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-2">
              <input value={rule.label || ''}
                onChange={e => updateTariffWeightRule(idx, 'label', e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min="0" step="0.1" disabled={rule.max === null}
                  value={rule.max ?? ''}
                  onChange={e => updateTariffWeightRule(idx, 'max', e.target.value)}
                  title="Max kg"
                  className="bg-white disabled:bg-gray-100 border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold focus:outline-none focus:border-amber-500"
                />
                <input type="number" min="0" step="1"
                  value={rule.extra ?? 0}
                  onChange={e => updateTariffWeightRule(idx, 'extra', e.target.value)}
                  title="Supplement DH"
                  className="bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          ))}
        </div>
        <label className="block rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-700 max-w-sm">
          Supplement par colis supplementaire
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min="0" step="1"
              value={tariffDraft.extraPerAdditionalParcel ?? 0}
              onChange={e => setTariffDraft(prev => normalizeTariffConfig({ ...prev, extraPerAdditionalParcel: Number(e.target.value) || 0 }))}
              className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-amber-500"
            />
            <span className="font-bold">DH</span>
          </div>
        </label>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Apercu du calcul</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-180">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ville</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Base</th>
                {(tariffDraft.weightRules || []).map(r => (
                  <th key={r.label} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {CITIES.map(city => (
                <tr key={city} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-800">{city}</td>
                  <td className="px-4 py-3 text-blue-600 font-bold">{tariffDraft.cityPrices?.[city] || 0} DH</td>
                  {(tariffDraft.weightRules || []).map(r => {
                    const weight = r.max === null ? 31 : r.max
                    return (
                      <td key={r.label} className="px-4 py-3 font-semibold text-gray-700">
                        {calculateTariff(city, weight, 1, tariffDraft)} DH
                        {r.extra > 0 && <span className="block text-[10px] text-gray-400">+{r.extra} DH</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
