import { useState, useEffect } from 'react'
import { Users, Search, Plus, Edit2, Save, X } from 'lucide-react'
import { subscribeClients, createClient, updateClient, Client } from '../../../firebase/clients'
import { subscribeAllUsers, subscribeAllSectors } from '../../../firebase/firestore'
import { CITIES } from '../../../firebase/constants'

interface AgentClientsTabProps {
  agencyCity: string
  profile: any
  setMsg: (msg: { type: string; text: string } | null) => void
}

export default function AgentClientsTab({ agencyCity, profile, setMsg }: AgentClientsTabProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [sectors, setSectors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'expediteur' | 'destinataire'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState({
    name: '',
    tel: '',
    email: '',
    address: '',
    city: agencyCity,
    nic: '',
    accountType: 'cash',
    remise: 0,
    isExpediteur: false,
    isDestinataire: false,
    secteurId: '',
    secteurName: '',
    livreurIds: [] as string[],
  })

  useEffect(() => {
    const unsubClients = subscribeClients((data: any[]) => {
      // Filtrer les clients de cette agence
      const agencyClients = data.filter((c: any) => c.city === agencyCity)
      setClients(agencyClients as Client[])
      setLoading(false)
    })
    const unsubUsers = subscribeAllUsers((data: any[]) => {
      // Filtrer les chauffeurs de cette agence
      const agencyDrivers = data.filter(u =>
        (u.role === 'driver' || u.role === 'livreur') && u.city === agencyCity
      )
      setUsers(agencyDrivers)
    })
    const unsubSectors = subscribeAllSectors((data: any[]) => {
      setSectors(data.filter(s => s.city === agencyCity))
    })
    return () => {
      unsubClients()
      unsubUsers()
      unsubSectors()
    }
  }, [agencyCity])

  const filteredClients = clients.filter(c => {
    const matchSearch = !searchTerm ||
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.tel?.includes(searchTerm) ||
      c.address?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchFilter = filter === 'all' ||
      (filter === 'expediteur' && c.isExpediteur) ||
      (filter === 'destinataire' && c.isDestinataire)

    return matchSearch && matchFilter
  })

  const handleEdit = (client: Client) => {
    setEditingId(client.id)
    setEditForm({
      isExpediteur: client.isExpediteur || false,
      isDestinataire: client.isDestinataire || false,
      secteurId: client.secteurId || '',
      secteurName: client.secteurName || '',
      livreurIds: client.livreurIds || [],
    })
  }

  const handleSave = async (clientId: string) => {
    try {
      await updateClient(clientId, editForm)
      setEditingId(null)
      setMsg({ type: 'success', text: '✅ Client mis à jour' })
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ ' + error.message })
    }
  }

  const handleCreate = async () => {
    try {
      await createClient({
        ...newForm,
        createdBy: profile?.uid || profile?.id,
        createdByName: profile?.name || 'Chef ' + agencyCity,
        createdByRole: profile?.role || 'chef_agence',
      })
      setShowNewModal(false)
      setNewForm({
        name: '',
        tel: '',
        email: '',
        address: '',
        city: agencyCity,
        nic: '',
        accountType: 'cash',
        remise: 0,
        isExpediteur: false,
        isDestinataire: false,
        secteur: '',
        livreurIds: [],
      })
      setMsg({ type: 'success', text: '✅ Client créé' })
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ ' + error.message })
    }
  }

  const toggleLivreur = (livreursIds: string[], livreurId: string) => {
    if (livreursIds.includes(livreurId)) {
      return livreursIds.filter(id => id !== livreurId)
    } else {
      return [...livreursIds, livreurId]
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="font-bold text-gray-800">Mes clients - {agencyCity}</h2>
              <p className="text-sm text-gray-600">{filteredClients.length} clients</p>
            </div>
          </div>
          <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition">
            <Plus className="w-4 h-4" /> Nouveau
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'Tous' },
            { key: 'expediteur', label: 'Expéditeurs' },
            { key: 'destinataire', label: 'Destinataires' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                filter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filteredClients.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <p className="text-gray-500">Aucun client</p>
          </div>
        ) : (
          filteredClients.map(client => (
            <div key={client.id} className="bg-white border-2 border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-gray-800">{client.name}</h3>
                  <div className="flex gap-3 text-sm text-gray-600 mt-1">
                    <span>📞 {client.tel}</span>
                    {client.address && <span>🏠 {client.address}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {editingId === client.id ? (
                    <>
                      <button onClick={() => handleSave(client.id)} className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
                        <Save className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleEdit(client)} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {editingId === client.id ? (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.isExpediteur}
                        onChange={(e) => setEditForm({ ...editForm, isExpediteur: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="font-semibold">📤 Expéditeur</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.isDestinataire}
                        onChange={(e) => setEditForm({ ...editForm, isDestinataire: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="font-semibold">📥 Destinataire</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">🏘️ Secteur</label>
                    <select
                      value={editForm.secteurId}
                      onChange={(e) => {
                        const sector = sectors.find(s => s.id === e.target.value)
                        setEditForm({
                          ...editForm,
                          secteurId: e.target.value,
                          secteurName: sector ? `${sector.code}${sector.name && sector.name !== sector.code ? ' - ' + sector.name : ''}` : ''
                        })
                      }}
                      className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Aucun secteur</option>
                      {sectors.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {users.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold mb-2">🚚 Livreurs assignés</label>
                      <div className="grid grid-cols-2 gap-2">
                        {users.map(driver => (
                          <label key={driver.id} className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg hover:bg-blue-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editForm.livreurIds?.includes(driver.id)}
                              onChange={() => setEditForm({
                                ...editForm,
                                livreurIds: toggleLivreur(editForm.livreurIds || [], driver.id)
                              })}
                              className="w-4 h-4"
                            />
                            <span className="text-sm font-medium">{driver.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-3 text-sm flex-wrap">
                  {client.isExpediteur && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">📤 Expéditeur</span>}
                  {client.isDestinataire && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold">📥 Destinataire</span>}
                  {client.secteurName && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-semibold">🏘️ {client.secteurName}</span>}
                  {client.livreurIds && client.livreurIds.length > 0 && (
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full font-semibold">
                      🚚 {client.livreurIds.length} livreur(s)
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal Nouveau Client */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Nouveau client</h3>
              <button onClick={() => setShowNewModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2">Nom complet *</label>
                  <input
                    value={newForm.name}
                    onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                    placeholder="Nom du client"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Téléphone *</label>
                  <input
                    value={newForm.tel}
                    onChange={(e) => setNewForm({ ...newForm, tel: e.target.value })}
                    placeholder="0612345678"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Email</label>
                  <input
                    value={newForm.email}
                    onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                    placeholder="email@exemple.com"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2">Adresse</label>
                  <input
                    value={newForm.address}
                    onChange={(e) => setNewForm({ ...newForm, address: e.target.value })}
                    placeholder="Adresse complète"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Type de compte</label>
                  <select
                    value={newForm.accountType}
                    onChange={(e) => setNewForm({ ...newForm, accountType: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="compte">En compte</option>
                  </select>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newForm.isExpediteur}
                      onChange={(e) => setNewForm({ ...newForm, isExpediteur: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="font-semibold">📤 Expéditeur</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newForm.isDestinataire}
                      onChange={(e) => setNewForm({ ...newForm, isDestinataire: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="font-semibold">📥 Destinataire</span>
                  </label>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold mb-2">🏘️ Secteur</label>
                  <select
                    value={newForm.secteurId}
                    onChange={(e) => {
                      const sector = sectors.find(s => s.id === e.target.value)
                      setNewForm({
                        ...newForm,
                        secteurId: e.target.value,
                        secteurName: sector ? `${sector.code}${sector.name && sector.name !== sector.code ? ' - ' + sector.name : ''}` : ''
                      })
                    }}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Aucun secteur</option>
                    {sectors.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {users.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold mb-2">🚚 Livreurs assignés</label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {users.map(driver => (
                        <label key={driver.id} className="flex items-center gap-2 p-3 border-2 border-gray-200 rounded-lg hover:bg-blue-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newForm.livreurIds.includes(driver.id)}
                            onChange={() => setNewForm({
                              ...newForm,
                              livreurIds: toggleLivreur(newForm.livreurIds, driver.id)
                            })}
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium">{driver.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleCreate}
                disabled={!newForm.name || !newForm.tel}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Créer le client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
