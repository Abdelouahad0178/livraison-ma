import { Printer, Truck } from 'lucide-react'
import DateFilter from '../DateFilter'
import { useAgentCtx } from '../AgentCtx'
import { filterByDate } from '../../../utils/dateFilter'

export default function ChargeTab() {
  const {
    profile,
    parcels,
    chargeDriverId, setChargeDriverId,
    chargeDatePreset, setChargeDatePreset,
    chargeDateFrom, setChargeDateFrom,
    chargeDateTo, setChargeDateTo,
    handlePrintCharge,
  } = useAgentCtx()

  const chargeDate = (p: any) => {
    if (p.shipmentLoadedAt) return new Date(p.shipmentLoadedAt)
    if (p.createdAt?.toDate) return p.createdAt.toDate()
    if (p.createdAt) return new Date(p.createdAt)
    return new Date(0)
  }
  const assigned = parcels.filter((p: any) => p.chauffeurName && p.status === 'En transit')
  const filtered = filterByDate(assigned, chargeDatePreset, chargeDateFrom, chargeDateTo, chargeDate)
  const visible = chargeDriverId ? filtered.filter(p => (p.chauffeurName || '') === chargeDriverId) : filtered
  const uniqueDriverNames = ([...new Set(assigned.map((p: any) => p.chauffeurName).filter(Boolean))] as string[]).sort()
  const groupsMap: Record<string, any> = {}
  visible.forEach(p => {
    const key = (p.chauffeurName || '').trim()
    if (!groupsMap[key]) groupsMap[key] = { id: key, name: p.chauffeurName || key, phone: p.chauffeurPhone || '', matricule: p.chauffeurMatricule || '', parcels: [] }
    groupsMap[key].parcels.push(p)
  })
  const groups = Object.values(groupsMap)

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-gray-800 text-base">Feuille de charge</h2>
          <p className="text-xs text-gray-400 mt-0.5">Colis en transit groupes par chauffeur</p>
        </div>
        <button onClick={() => handlePrintCharge(groups, profile)} disabled={groups.length === 0} className="flex items-center gap-2 bg-blue-600 disabled:opacity-50 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition">
          <Printer className="w-4 h-4" /> Imprimer
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setChargeDriverId('')} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${!chargeDriverId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}>
            Tous les chauffeurs
          </button>
          {uniqueDriverNames.map(name => (
            <button key={name} onClick={() => setChargeDriverId(name)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${chargeDriverId === name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}>
              {name}
            </button>
          ))}
        </div>
        <DateFilter value={chargeDatePreset} onChange={setChargeDatePreset} from={chargeDateFrom} onFromChange={setChargeDateFrom} to={chargeDateTo} onToChange={setChargeDateTo} />
        <div className="flex gap-4 flex-wrap text-sm">
          <span className="text-gray-500">{visible.length} colis</span>
          {groups.length > 0 && <span className="text-blue-600 font-semibold">{groups.length} chauffeur{groups.length > 1 ? 's' : ''}</span>}
          <span className="font-semibold text-gray-700">Total port : {visible.reduce((s,p) => s + (p.price || 0), 0)} DH</span>
          {visible.some(p => p.codAmount > 0) && <span className="font-semibold text-amber-600">RETOUR FOND : {visible.filter(p => p.codAmount > 0).reduce((s,p) => s + (p.codAmount || 0), 0)} DH</span>}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Aucun colis en transit pour cette selection</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-blue-800">{group.name}</p>
                  {group.phone && <p className="text-xs text-blue-500">{group.phone}</p>}
                </div>
                <span className="text-sm font-black text-blue-700">{group.parcels.length} colis</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase">
                    <tr>
                      {['N', 'Tracking', 'Code', 'Expediteur', 'Destinataire', 'Nb', 'Poids', 'Nature'].map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {group.parcels.map((p: any, i: number) => (
                      <tr key={p.id} className="border-t border-gray-50">
                        <td className="px-3 py-2 font-bold">{i + 1}</td>
                        <td className="px-3 py-2 font-mono font-bold text-blue-600">{p.trackingId}</td>
                        <td className="px-3 py-2 font-mono">{p.sender?.nic || '-'}</td>
                        <td className="px-3 py-2">{p.sender?.name || '-'}</td>
                        <td className="px-3 py-2">{p.receiver?.name || '-'}</td>
                        <td className="px-3 py-2">{p.nbColis || 1}</td>
                        <td className="px-3 py-2">{p.weight ? `${p.weight} kg` : '-'}</td>
                        <td className="px-3 py-2">{p.natureOfGoods || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
