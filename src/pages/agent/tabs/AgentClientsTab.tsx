import { useState, useEffect } from 'react'
import { Users, Search, Plus, Edit2, Save, X, Trash2, Truck, ChevronUp, ChevronDown } from 'lucide-react'
import { subscribeClients, createClient, updateClient, deleteClient, Client } from '../../../firebase/clients'
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
  const [showEditModal, setShowEditModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showLivreursModal, setShowLivreursModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
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

  // Fonction helper pour obtenir les livreurs valides uniques
  const getValidLivreurIds = (livreurIds?: string[]) => {
    if (!livreurIds) return []
    // Filtrer les IDs vides et les doublons
    return [...new Set(livreurIds.filter(id => id && id.trim() !== ''))]
  }

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
      name: client.name || '',
      tel: client.tel || '',
      email: client.email || '',
      address: client.address || '',
      city: client.city || agencyCity,
      nic: client.nic || '',
      accountType: client.accountType || 'cash',
      remise: client.remise || 0,
      isExpediteur: client.isExpediteur || false,
      isDestinataire: client.isDestinataire || false,
      secteurId: client.secteurId || '',
      secteurName: client.secteurName || '',
      livreurIds: client.livreurIds || [],
    })
    setShowEditModal(true)
  }

  const handleSave = async (clientId: string) => {
    try {
      await updateClient(clientId, editForm)
      setEditingId(null)
      setShowEditModal(false)
      setMsg({ type: 'success', text: '✅ Client mis à jour' })
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ ' + error.message })
    }
  }

  const handleDelete = async (clientId: string) => {
    if (deleteConfirm !== clientId) {
      setDeleteConfirm(clientId)
      setMsg({ type: 'info', text: '⚠️ Cliquez encore une fois pour confirmer la suppression' })
      setTimeout(() => setDeleteConfirm(null), 3000)
      return
    }
    try {
      setMsg({ type: 'info', text: '🔄 Suppression en cours...' })
      await deleteClient(clientId)
      setDeleteConfirm(null)
      setMsg({ type: 'success', text: '✅ Client supprimé avec succès' })
    } catch (error: any) {
      console.error('Erreur suppression client:', error)
      setMsg({ type: 'error', text: '❌ Erreur: ' + (error.message || 'Impossible de supprimer') })
      setDeleteConfirm(null)
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

  const handleShowLivreurs = (client: Client) => {
    setSelectedClient(client)
    setShowLivreursModal(true)
  }

  const handleCleanupInvalidLivreurs = async () => {
    if (!selectedClient) return

    const validLivreurs = getValidLivreurIds(selectedClient.livreurIds)

    // Filtrer uniquement les IDs qui correspondent à de vrais livreurs
    const realLivreurs = validLivreurs.filter(id =>
      users.some(u => u.id === id)
    )

    if (realLivreurs.length === validLivreurs.length) {
      setMsg({ type: 'info', text: 'ℹ️ Aucun ID invalide à nettoyer' })
      return
    }

    try {
      await updateClient(selectedClient.id, { livreurIds: realLivreurs })
      setSelectedClient({ ...selectedClient, livreurIds: realLivreurs })
      setMsg({
        type: 'success',
        text: `✅ ${validLivreurs.length - realLivreurs.length} ID(s) invalide(s) supprimé(s)`
      })
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ Erreur: ' + error.message })
    }
  }

  const handleSetPrimaryLivreur = async (livreurId: string) => {
    if (!selectedClient) return

    const currentLivreurIds = getValidLivreurIds(selectedClient.livreurIds)
    const newLivreurIds = [
      livreurId,
      ...currentLivreurIds.filter(id => id !== livreurId)
    ]

    try {
      await updateClient(selectedClient.id, { livreurIds: newLivreurIds })
      setMsg({ type: 'success', text: '✅ Livreur principal mis à jour' })
      // Mettre à jour le client sélectionné
      setSelectedClient({ ...selectedClient, livreurIds: newLivreurIds })
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ Erreur: ' + error.message })
    }
  }

  const handleMoveLivreurUp = async (index: number) => {
    if (!selectedClient || index === 0) return

    const newLivreurIds = [...getValidLivreurIds(selectedClient.livreurIds)]
    const temp = newLivreurIds[index]
    newLivreurIds[index] = newLivreurIds[index - 1]
    newLivreurIds[index - 1] = temp

    try {
      await updateClient(selectedClient.id, { livreurIds: newLivreurIds })
      setSelectedClient({ ...selectedClient, livreurIds: newLivreurIds })
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ Erreur: ' + error.message })
    }
  }

  const handleMoveLivreurDown = async (index: number) => {
    if (!selectedClient) return
    const livreurIds = getValidLivreurIds(selectedClient.livreurIds)
    if (index === livreurIds.length - 1) return

    const newLivreurIds = [...livreurIds]
    const temp = newLivreurIds[index]
    newLivreurIds[index] = newLivreurIds[index + 1]
    newLivreurIds[index + 1] = temp

    try {
      await updateClient(selectedClient.id, { livreurIds: newLivreurIds })
      setSelectedClient({ ...selectedClient, livreurIds: newLivreurIds })
    } catch (error: any) {
      setMsg({ type: 'error', text: '❌ Erreur: ' + error.message })
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
                  <button onClick={() => handleEdit(client)} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg" title="Modifier">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    className={`px-3 py-2 ${deleteConfirm === client.id ? 'bg-red-700 animate-pulse' : 'bg-red-600 hover:bg-red-700'} text-white rounded-lg font-semibold transition flex items-center gap-2`}
                    title={deleteConfirm === client.id ? 'Cliquer pour confirmer la suppression' : 'Supprimer le client'}
                  >
                    <Trash2 className="w-4 h-4" />
                    {deleteConfirm === client.id && <span className="text-xs">Confirmer?</span>}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 text-sm flex-wrap">
                {client.isExpediteur && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">📤 Expéditeur</span>}
                {client.isDestinataire && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold">📥 Destinataire</span>}
                {client.secteurName && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-semibold">🏘️ {client.secteurName}</span>}
                {(() => {
                  const validLivreurs = getValidLivreurIds(client.livreurIds)
                  return validLivreurs.length > 0 && (
                    <button
                      onClick={() => handleShowLivreurs(client)}
                      className="px-3 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-full font-semibold transition cursor-pointer"
                    >
                      🚚 {validLivreurs.length} livreur(s)
                    </button>
                  )
                })()}
              </div>
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

      {/* Modal Modifier Client */}
      {showEditModal && editingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Modifier client</h3>
              <button onClick={() => { setShowEditModal(false); setEditingId(null) }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2">Nom complet *</label>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Nom du client"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Téléphone *</label>
                  <input
                    value={editForm.tel}
                    onChange={(e) => setEditForm({ ...editForm, tel: e.target.value })}
                    placeholder="06xxxxxxxx"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="email@exemple.com"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2">Adresse</label>
                  <input
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    placeholder="Adresse complète"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Ville</label>
                  <select
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">NIC / CIN</label>
                  <input
                    value={editForm.nic}
                    onChange={(e) => setEditForm({ ...editForm, nic: e.target.value })}
                    placeholder="NIC ou CIN"
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Type de compte</label>
                  <select
                    value={editForm.accountType}
                    onChange={(e) => setEditForm({ ...editForm, accountType: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="credit">Crédit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Remise (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editForm.remise}
                    onChange={(e) => setEditForm({ ...editForm, remise: Number(e.target.value) })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

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

              <button
                onClick={() => handleSave(editingId)}
                disabled={!editForm.name || !editForm.tel}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Enregistrer les modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Livreurs */}
      {showLivreursModal && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-800">Livreurs assignés</h3>
                <p className="text-sm text-gray-600">{selectedClient.name}</p>
              </div>
              <button
                onClick={() => {
                  setShowLivreursModal(false)
                  setSelectedClient(null)
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const validLivreurs = getValidLivreurIds(selectedClient.livreurIds)

              if (validLivreurs.length === 0) {
                return (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Truck className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Aucun livreur assigné</p>
                  </div>
                )
              }

              const realLivreurs = validLivreurs.filter(id =>
                users.some(u => u.id === id)
              )
              const hasInvalidIds = validLivreurs.length > realLivreurs.length

              return (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <p className="text-blue-800 font-semibold">
                      ⭐ Le premier livreur de la liste est utilisé par défaut lors de la création de colis
                    </p>
                  </div>

                  {hasInvalidIds && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-yellow-800">
                            ⚠️ IDs invalides détectés
                          </p>
                          <p className="text-xs text-yellow-700 mt-1">
                            {validLivreurs.length - realLivreurs.length} ID(s) ne correspondent pas à des livreurs valides
                          </p>
                        </div>
                        <button
                          onClick={handleCleanupInvalidLivreurs}
                          className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-semibold rounded-lg transition whitespace-nowrap"
                        >
                          Nettoyer
                        </button>
                      </div>
                    </div>
                  )}

                  {validLivreurs.map((livreurId, index) => {
                    const driver = users.find(u => u.id === livreurId)
                    if (!driver) return null

                    const isPrimary = index === 0

                  return (
                    <div
                      key={livreurId}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 transition ${
                        isPrimary
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isPrimary ? 'bg-orange-500' : 'bg-gray-300'
                        }`}>
                          <Truck className={`w-5 h-5 ${isPrimary ? 'text-white' : 'text-gray-600'}`} />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-800">{driver.name}</p>
                          {isPrimary && (
                            <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full">
                              PRINCIPAL
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {driver.tel} • {driver.city}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleMoveLivreurUp(index)}
                          disabled={index === 0}
                          className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition"
                          title="Monter"
                        >
                          <ChevronUp className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleMoveLivreurDown(index)}
                          disabled={index === selectedClient.livreurIds!.length - 1}
                          className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition"
                          title="Descendre"
                        >
                          <ChevronDown className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>

                      {!isPrimary && (
                        <button
                          onClick={() => handleSetPrimaryLivreur(livreurId)}
                          className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition"
                        >
                          Définir comme principal
                        </button>
                      )}
                    </div>
                  )
                })}

                  <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                    <p className="font-semibold mb-1">💡 Astuce:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Utilisez les flèches pour réorganiser l'ordre des livreurs</li>
                      <li>Cliquez sur "Définir comme principal" pour mettre un livreur en première position</li>
                      <li>Le livreur principal est automatiquement sélectionné lors de la création de colis</li>
                    </ul>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
