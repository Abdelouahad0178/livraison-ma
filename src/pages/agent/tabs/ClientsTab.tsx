import { Check, Edit2, MapPin, Phone, Search, Users, X } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { fmt } from '../../../utils/formatNumber'

export default function ClientsTab() {
  const {
    profile,
    clients,
    clientsSearch, setClientsSearch,
    agentNewClient, setAgentNewClient,
    agentClientSaving,
    handleAgentCreateClient,
  } = useAgentCtx()

  
  const cityClients = profile?.city ? clients.filter((c: any) => c.city === profile.city) : clients
  const q = clientsSearch.toLowerCase().trim()
  const filtered = q
    ? cityClients.filter((c: any) =>
        c.name?.toLowerCase().includes(q) ||
        c.tel?.includes(q) ||
        c.address?.toLowerCase().includes(q)
      )
    : cityClients

  return (
    <>
      <div className="mt-4 space-y-4">
        <div className="bg-linear-to-br from-green-600 to-emerald-700 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-200 text-xs font-medium uppercase tracking-wider">Base de donnees</p>
              <h2 className="font-black text-xl mt-0.5">Clients</h2>
              <p className="text-green-300 text-xs mt-1">Agence {profile?.city}</p>
            </div>
            <div className="text-right">
              <p className="text-green-200 text-xs">Total</p>
              <p className="text-2xl font-black">{cityClients.length}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              placeholder="Rechercher (nom, tel, adresse...)"
              value={clientsSearch}
              onChange={e => setClientsSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setAgentNewClient({ name: '', tel: '', address: '', accountType: 'cash', remise: '' })}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition shrink-0"
          >
            Nouveau
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{cityClients.length === 0 ? 'Aucun client enregistre' : 'Aucun resultat'}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-120">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Client', 'Telephone', 'Type', 'Remise', 'Solde', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => {
                  const d = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt || 0)
                  return (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-green-50/40 transition">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{c.name}</p>
                        {c.address && <p className="text-xs text-gray-400">{c.address}</p>}
                        <p className="text-xs text-gray-300">{d.toLocaleDateString('fr-MA')}</p>
                      </td>
                      <td className="px-4 py-3">
                        {c.tel ? (
                          <a href={`tel:${c.tel}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                            <Phone className="w-3 h-3" />{c.tel}
                          </a>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.accountType === 'compte' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {c.accountType === 'compte' ? 'En compte' : 'Comptant'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{(c.remise || 0) > 0 ? <span className="text-green-600 font-semibold">{c.remise}%</span> : <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${(c.balance || 0) > 0 ? 'text-orange-600' : (c.balance || 0) < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {(c.balance || 0) === 0 ? '-' : `${(c.balance || 0) > 0 ? '+' : ''}${fmt(c.balance)} DH`}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setAgentNewClient({
                            id: c.id,
                            name: c.name || '',
                            tel: c.tel || '',
                            address: c.address || '',
                            accountType: c.accountType || 'cash',
                            remise: c.remise || '',
                          })}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {agentNewClient && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                {agentNewClient?.id ? 'Modifier le client' : 'Nouveau client'}
              </h3>
              <button onClick={() => setAgentNewClient(null)} className="p-1.5 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <input placeholder="Nom complet" value={agentNewClient.name} onChange={e => setAgentNewClient((m: any) => ({ ...m, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none" />
              <input placeholder="Telephone" value={agentNewClient.tel} onChange={e => setAgentNewClient((m: any) => ({ ...m, tel: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none" />
              <input placeholder="Adresse" value={agentNewClient.address} onChange={e => setAgentNewClient((m: any) => ({ ...m, address: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none" />
              <div className="flex items-center gap-2">
                <select value={agentNewClient.accountType} onChange={e => setAgentNewClient((m: any) => ({ ...m, accountType: e.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none bg-white">
                  <option value="cash">Comptant</option>
                  <option value="compte">En compte</option>
                </select>
                <input type="number" min="0" max="100" step="0.5" placeholder="Remise %" value={agentNewClient.remise} onChange={e => setAgentNewClient((m: any) => ({ ...m, remise: e.target.value }))} className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none" />
              </div>
              {!agentNewClient?.id && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-500">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  Ville : <span className="font-semibold text-gray-700">{profile?.city}</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={() => setAgentNewClient(null)} className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition text-sm">Annuler</button>
              <button onClick={handleAgentCreateClient} disabled={!agentNewClient.name?.trim() || agentClientSaving} className="py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold transition text-sm flex items-center justify-center gap-2">
                {agentClientSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
