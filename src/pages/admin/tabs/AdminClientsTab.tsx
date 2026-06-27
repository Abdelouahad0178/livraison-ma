import { useState, useEffect } from 'react'
import { Users, Search, Plus, Edit2, Save, X, MapPin, Truck, Key, Trash2 } from 'lucide-react'
import { subscribeClients, createClient, updateClient, Client } from '../../../firebase/clients'
import { subscribeAllUsers, subscribeAllSectors } from '../../../firebase/firestore'
import { CITIES } from '../../../firebase/constants'
import { createClientPortalAccount } from '../../../firebase/portalAccounts'
import { findPassageClients, deletePassageClients, type PassageClient } from '../../../utils/cleanupPassageClients'

export default function AdminClientsTab() {
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
    city: '',
    nic: '',
    accountType: 'cash',
    remise: 0,
    isExpediteur: false,
    isDestinataire: false,
    secteurId: '',
    secteurName: '',
    livreurIds: [] as string[],
  })
  const [portalCreation, setPortalCreation] = useState<{ clientId: string; loading: boolean; credentials?: { email: string; password: string }; error?: string } | null>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [emailInput, setEmailInput] = useState('')
  const [cleanupState, setCleanupState] = useState<{
    loading: boolean
    passageClients: PassageClient[]
    showModal: boolean
    result?: { deleted: number; errors: number }
  }>({
    loading: false,
    passageClients: [],
    showModal: false,
  })

  useEffect(() => {
    const unsubClients = subscribeClients((data: any[]) => {
      setClients(data as Client[])
      setLoading(false)
    })
    const unsubUsers = subscribeAllUsers((data: any[]) => {
      setUsers(data)
    })
    const unsubSectors = subscribeAllSectors((data: any[]) => {
      setSectors(data)
    })
    return () => {
      unsubClients()
      unsubUsers()
      unsubSectors()
    }
  }, [])

  const drivers = users.filter(u => u.role === 'driver' || u.role === 'livreur')

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
      alert('✅ Client mis à jour')
    } catch (error: any) {
      alert('❌ ' + error.message)
    }
  }

  const handleCreate = async () => {
    try {
      // Créer le client
      const clientId = await createClient(newForm)

      // ⭐ Créer automatiquement un compte portail si email fourni
      if (newForm.email && newForm.email.trim()) {
        try {
          const { db } = await import('../../../firebase/config')
          const { doc, getDoc } = await import('firebase/firestore')

          // Récupérer le client créé
          const clientSnap = await getDoc(doc(db, 'clients', clientId))
          if (clientSnap.exists()) {
            const clientData = { id: clientSnap.id, ...clientSnap.data() }

            // Créer le compte portail
            const result = await createClientPortalAccount(clientData as Client, newForm.email)

            if (result.success) {
              alert(`✅ Client et compte portail créés !\n📧 Email: ${result.email}\n🔑 Mot de passe: ${result.password}`)
            } else {
              alert(`✅ Client créé\n⚠️ Compte portail: ${result.message}`)
            }
          }
        } catch (portalError: any) {
          console.error('Erreur création portail:', portalError)
          alert(`✅ Client créé\n⚠️ Erreur création compte portail: ${portalError.message}`)
        }
      } else {
        alert('✅ Client créé (sans compte portail - pas d\'email)')
      }

      setShowNewModal(false)
      setNewForm({
        name: '',
        tel: '',
        email: '',
        address: '',
        city: '',
        nic: '',
        accountType: 'cash',
        remise: 0,
        isExpediteur: false,
        isDestinataire: false,
        secteurId: '',
        secteurName: '',
        livreurIds: [],
      })
    } catch (error: any) {
      alert('❌ ' + error.message)
    }
  }

  const handleCreatePortalAccount = async (client: Client) => {
    if (client.portalUid) {
      alert('❌ Ce client a déjà un compte portail')
      return
    }
    setSelectedClient(client)
    setEmailInput(client.portalEmail || `${client.tel}@portail.livraison.ma`)
    setShowEmailModal(true)
  }

  const handleConfirmCreatePortal = async () => {
    if (!selectedClient) return
    if (!emailInput.trim()) {
      alert('❌ Veuillez saisir un email')
      return
    }
    if (!emailInput.includes('@')) {
      alert('❌ Email invalide')
      return
    }
    setShowEmailModal(false)
    setPortalCreation({ clientId: selectedClient.id, loading: true })
    try {
      const result = await createClientPortalAccount(selectedClient, emailInput.trim())
      setPortalCreation({
        clientId: selectedClient.id,
        loading: false,
        credentials: { email: result.email, password: result.password }
      })
      setSelectedClient(null)
      setEmailInput('')
    } catch (error: any) {
      setPortalCreation({
        clientId: selectedClient.id,
        loading: false,
        error: error.message
      })
      setSelectedClient(null)
      setEmailInput('')
    }
  }

  const handleFindPassageClients = async () => {
    setCleanupState({ loading: true, passageClients: [], showModal: false })
    try {
      const clients = await findPassageClients()
      setCleanupState({ loading: false, passageClients: clients, showModal: true })
    } catch (error: any) {
      alert('❌ Erreur: ' + error.message)
      setCleanupState({ loading: false, passageClients: [], showModal: false })
    }
  }

  const handleDeletePassageClients = async () => {
    if (cleanupState.passageClients.length === 0) return

    setCleanupState({ ...cleanupState, loading: true })
    try {
      const result = await deletePassageClients(cleanupState.passageClients)
      setCleanupState({
        loading: false,
        passageClients: [],
        showModal: true,
        result,
      })
    } catch (error: any) {
      alert('❌ Erreur: ' + error.message)
      setCleanupState({ ...cleanupState, loading: false })
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
              <h2 className="font-bold text-gray-800">Gestion des clients</h2>
              <p className="text-sm text-gray-600">{filteredClients.length} clients</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleFindPassageClients}
              disabled={cleanupState.loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition"
            >
              {cleanupState.loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Nettoyer clients de passage
            </button>
            <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition">
              <Plus className="w-4 h-4" /> Nouveau client
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom, tél, adresse..."
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
                    <span>📍 {client.city}</span>
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
                    <>
                      <button onClick={() => handleEdit(client)} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {!client.portalUid && (
                        <button
                          onClick={() => handleCreatePortalAccount(client)}
                          disabled={portalCreation?.clientId === client.id && portalCreation.loading}
                          className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                          title="Créer compte portail"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      )}
                    </>
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
                      {sectors.filter(s => s.city === client.city).map(s => (
                        <option key={s.id} value={s.id}>
                          {s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {drivers.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold mb-2">🚚 Livreurs assignés</label>
                      <div className="grid grid-cols-2 gap-2">
                        {drivers.map(driver => (
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
                            <span className="text-sm font-medium">{driver.name} ({driver.city})</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex gap-3 text-sm">
                    {client.isExpediteur && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">📤 Expéditeur</span>}
                    {client.isDestinataire && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold">📥 Destinataire</span>}
                    {client.secteurName && <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-semibold">🏘️ {client.secteurName}</span>}
                    {client.livreurIds && client.livreurIds.length > 0 && (
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full font-semibold">
                        🚚 {client.livreurIds.length} livreur(s)
                      </span>
                    )}
                    {client.portalUid && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-semibold">🔐 Portail activé</span>}
                  </div>

                  {/* Affichage identifiants portail */}
                  {portalCreation?.clientId === client.id && portalCreation.credentials && (
                    <div className="mt-3 bg-green-50 border-2 border-green-200 rounded-lg p-4">
                      <h4 className="font-bold text-green-800 mb-2">✅ Compte portail créé !</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-semibold text-gray-700">Email :</span>
                          <code className="ml-2 bg-white px-2 py-1 rounded border border-green-300">{portalCreation.credentials.email}</code>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">Mot de passe :</span>
                          <code className="ml-2 bg-white px-2 py-1 rounded border border-green-300">{portalCreation.credentials.password}</code>
                        </div>
                        <p className="text-xs text-green-700 mt-2">⚠️ Notez ces identifiants, ils ne seront plus affichés !</p>
                        <button
                          onClick={() => setPortalCreation(null)}
                          className="mt-2 px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                        >
                          Fermer
                        </button>
                      </div>
                    </div>
                  )}

                  {portalCreation?.clientId === client.id && portalCreation.error && (
                    <div className="mt-3 bg-red-50 border-2 border-red-200 rounded-lg p-4">
                      <p className="text-red-800 font-semibold">❌ Erreur : {portalCreation.error}</p>
                      <button
                        onClick={() => setPortalCreation(null)}
                        className="mt-2 px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700"
                      >
                        Fermer
                      </button>
                    </div>
                  )}
                </>
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
                  <label className="block text-sm font-semibold mb-2">Ville</label>
                  <select
                    value={newForm.city}
                    onChange={(e) => setNewForm({ ...newForm, city: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Sélectionner...</option>
                    {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                  </select>
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
                    {sectors.filter(s => s.city === newForm.city).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}
                      </option>
                    ))}
                  </select>
                  {newForm.city && sectors.filter(s => s.city === newForm.city).length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Aucun secteur configuré pour {newForm.city}</p>
                  )}
                </div>

                {drivers.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold mb-2">🚚 Livreurs assignés</label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {drivers.map(driver => (
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
                          <span className="text-sm font-medium">{driver.name} ({driver.city})</span>
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

      {/* Modal Email Compte Portail */}
      {showEmailModal && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Créer compte portail</h3>
              <button onClick={() => { setShowEmailModal(false); setSelectedClient(null); setEmailInput('') }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">Client : <strong>{selectedClient.name}</strong></p>
              <label className="block text-sm font-semibold mb-2">Email du portail *</label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="client@example.com"
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">Le mot de passe sera généré automatiquement</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setShowEmailModal(false); setSelectedClient(null); setEmailInput('') }}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmCreatePortal}
                disabled={!emailInput.trim() || !emailInput.includes('@')}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition disabled:opacity-50"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nettoyage Clients de Passage */}
      {cleanupState.showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-red-600">
                {cleanupState.result ? '✅ Nettoyage terminé' : '⚠️ Clients de passage à supprimer'}
              </h3>
              <button
                onClick={() => setCleanupState({ loading: false, passageClients: [], showModal: false })}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cleanupState.result ? (
              // Résultat de la suppression
              <div className="space-y-4">
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                  <p className="font-semibold text-green-800">
                    ✅ {cleanupState.result.deleted} client(s) supprimé(s) de Firestore
                  </p>
                  {cleanupState.result.errors > 0 && (
                    <p className="text-red-600 mt-2">
                      ❌ {cleanupState.result.errors} erreur(s)
                    </p>
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  Ces clients seront automatiquement sauvegardés dans localStorage lors de leur prochaine utilisation.
                </p>
              </div>
            ) : cleanupState.passageClients.length === 0 ? (
              // Aucun client trouvé
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                <p className="font-semibold text-green-800">
                  ✅ Aucun client de passage trouvé dans Firestore
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Tous les clients enregistrés sont des clients réguliers.
                </p>
              </div>
            ) : (
              // Liste des clients à supprimer
              <div className="space-y-4">
                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                  <p className="font-semibold text-yellow-800">
                    {cleanupState.passageClients.length} client(s) de passage trouvé(s)
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Ces clients ont été créés automatiquement lors de la création de colis et ne devraient pas être dans Firestore.
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    Critères: Cash, pas d'email, pas de NIC, remise = 0, créé automatiquement
                  </p>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {cleanupState.passageClients.map((client, index) => (
                    <div key={client.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{index + 1}. {client.name}</p>
                          <p className="text-sm text-gray-600">
                            📞 {client.tel} • 📍 {client.city}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setCleanupState({ loading: false, passageClients: [], showModal: false })}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDeletePassageClients}
                    disabled={cleanupState.loading}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition"
                  >
                    {cleanupState.loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Suppression...
                      </div>
                    ) : (
                      `Supprimer ${cleanupState.passageClients.length} client(s)`
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
