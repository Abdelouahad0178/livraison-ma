import { useState, useEffect, useMemo } from 'react'
import { Timestamp } from 'firebase/firestore'
import {
  FileText, Plus, Search, Printer, Eye, Edit2, Trash2, Check, X,
  Calendar, DollarSign, User, MapPin, Filter, Download, AlertCircle, CheckCircle2
} from 'lucide-react'
import {
  subscribeAllInvoices, deleteInvoice, markInvoiceAsPaid, cancelInvoice,
  getNextInvoiceNumber, createInvoice, updateInvoice, getUnbilledParcelsForClient,
  markParcelsAsInvoiced, unmarkParcelsAsInvoiced,
  type Invoice, type InvoiceItem
} from '../../../firebase/invoices'
import { subscribeClients } from '../../../firebase/clients'
import { CITIES } from '../../../firebase/constants'

export default function AdminInvoicesTab({ uid, userName }: any) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)

  // Abonnements
  useEffect(() => {
    const unsubInvoices = subscribeAllInvoices(setInvoices)
    const unsubClients = subscribeClients(setClients)
    return () => {
      unsubInvoices()
      unsubClients()
    }
  }, [])

  // Filtrage (insensible à la casse)
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (cityFilter !== 'all' && inv.agencyCity !== cityFilter) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim()
        return (
          (inv.invoiceNumber || '').toLowerCase().includes(term) ||
          (inv.clientName || '').toLowerCase().includes(term) ||
          inv.items.some(item => (item.trackingId || '').toLowerCase().includes(term))
        )
      }
      return true
    })
  }, [invoices, searchTerm, statusFilter, cityFilter])

  // Statistiques
  const stats = useMemo(() => {
    const pending = invoices.filter(i => i.status === 'pending')
    const paid = invoices.filter(i => i.status === 'paid')
    return {
      total: invoices.length,
      pending: pending.length,
      pendingAmount: pending.reduce((sum, i) => sum + i.totalAmount, 0),
      paid: paid.length,
      paidAmount: paid.reduce((sum, i) => sum + i.totalAmount, 0),
    }
  }, [invoices])

  const handleDelete = async (invoice: Invoice) => {
    if (!confirm(`Supprimer la facture ${invoice.invoiceNumber} ?`)) return
    try {
      // Démarquer les colis comme non facturés
      const parcelIds = invoice.items.map(item => item.parcelId)
      await unmarkParcelsAsInvoiced(parcelIds)
      await deleteInvoice(invoice.id!)
    } catch (error) {
      console.error('Erreur suppression facture:', error)
      alert('Erreur lors de la suppression')
    }
  }

  const handleMarkAsPaid = async (invoice: Invoice) => {
    const paymentMethod = prompt('Méthode de paiement (Espèces, Chèque, Virement) :')
    if (!paymentMethod) return
    const paymentReference = prompt('Référence de paiement (optionnel) :')
    try {
      await markInvoiceAsPaid(invoice.id!, paymentMethod, paymentReference || undefined)
    } catch (error) {
      console.error('Erreur paiement facture:', error)
      alert('Erreur lors du paiement')
    }
  }

  const handleCancel = async (invoice: Invoice) => {
    if (!confirm(`Annuler la facture ${invoice.invoiceNumber} ?`)) return
    try {
      // Démarquer les colis comme non facturés
      const parcelIds = invoice.items.map(item => item.parcelId)
      await unmarkParcelsAsInvoiced(parcelIds)
      await cancelInvoice(invoice.id!)
    } catch (error) {
      console.error('Erreur annulation facture:', error)
      alert('Erreur lors de l\'annulation')
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-600" />
            Facturation
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gestion des factures pour tous les ports</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-2 transition"
        >
          <Plus className="w-4 h-4" />
          Nouvelle facture
        </button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Total factures</div>
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-200">
          <div className="text-xs text-amber-700 uppercase font-semibold mb-1">En attente</div>
          <div className="text-2xl font-bold text-amber-800">{stats.pending}</div>
          <div className="text-sm text-amber-600 mt-1">{stats.pendingAmount.toLocaleString()} DH</div>
        </div>
        <div className="bg-green-50 rounded-xl p-4 shadow-sm border border-green-200">
          <div className="text-xs text-green-700 uppercase font-semibold mb-1">Payées</div>
          <div className="text-2xl font-bold text-green-800">{stats.paid}</div>
          <div className="text-sm text-green-600 mt-1">{stats.paidAmount.toLocaleString()} DH</div>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4 shadow-sm border border-indigo-200">
          <div className="text-xs text-indigo-700 uppercase font-semibold mb-1">Montant total</div>
          <div className="text-2xl font-bold text-indigo-800">
            {(stats.pendingAmount + stats.paidAmount).toLocaleString()} DH
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher (N° facture, client, colis)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="paid">Payées</option>
            <option value="cancelled">Annulées</option>
          </select>
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Toutes les agences</option>
            {CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setSearchTerm('')
              setStatusFilter('all')
              setCityFilter('all')
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Liste des factures */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">N° Facture</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Agence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Colis</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Aucune facture trouvée
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-semibold text-indigo-600">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">{invoice.clientName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{invoice.agencyCity}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {invoice.createdAt?.toDate?.().toLocaleDateString('fr-MA')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{invoice.items.length}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                      {invoice.totalAmount.toLocaleString()} DH
                    </td>
                    <td className="px-4 py-3">
                      {invoice.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          En attente
                        </span>
                      )}
                      {invoice.status === 'paid' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Payée
                        </span>
                      )}
                      {invoice.status === 'cancelled' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                          <X className="w-3 h-3" />
                          Annulée
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewingInvoice(invoice)}
                          className="p-1.5 hover:bg-indigo-50 rounded-lg transition text-indigo-600"
                          title="Voir détails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {invoice.status === 'pending' && (
                          <>
                            <button
                              onClick={() => setEditingInvoice(invoice)}
                              className="p-1.5 hover:bg-blue-50 rounded-lg transition text-blue-600"
                              title="Modifier"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMarkAsPaid(invoice)}
                              className="p-1.5 hover:bg-green-50 rounded-lg transition text-green-600"
                              title="Marquer comme payée"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCancel(invoice)}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition text-red-600"
                              title="Annuler"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDelete(invoice)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition text-red-600"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => printInvoice(invoice)}
                          className="p-1.5 hover:bg-gray-50 rounded-lg transition text-gray-600"
                          title="Imprimer"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modales */}
      {showCreateModal && (
        <CreateInvoiceModal
          clients={clients}
          onClose={() => setShowCreateModal(false)}
          uid={uid}
          userName={userName}
        />
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          clients={clients}
          onClose={() => setEditingInvoice(null)}
        />
      )}

      {viewingInvoice && (
        <ViewInvoiceModal
          invoice={viewingInvoice}
          onClose={() => setViewingInvoice(null)}
        />
      )}
    </div>
  )
}

// Modal de création de facture
function CreateInvoiceModal({ clients, onClose, uid, userName }: any) {
  const [step, setStep] = useState(1)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [agencyCity, setAgencyCity] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [isManualNumber, setIsManualNumber] = useState(false)
  const [portType, setPortType] = useState<'port-du' | 'port-paye'>('port-du')
  const [unbilledParcels, setUnbilledParcels] = useState<any[]>([])
  const [selectedParcels, setSelectedParcels] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const cityClients = useMemo(() => {
    if (!agencyCity) return []
    return clients.filter((c: any) =>
      (c.city || '').toLowerCase() === agencyCity.toLowerCase()
    )
  }, [clients, agencyCity])

  useEffect(() => {
    if (selectedClient && !isManualNumber) {
      getNextInvoiceNumber(agencyCity).then(setInvoiceNumber)
    }
  }, [selectedClient, agencyCity, isManualNumber])

  useEffect(() => {
    if (selectedClient) {
      console.log('🔍 Recherche parcels pour:', {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        portType,
        periodFilter
      })
      setLoading(true)
      getUnbilledParcelsForClient(selectedClient.id, portType, selectedClient.name, agencyCity)
        .then(parcels => {
          console.log('✅ Parcels trouvés:', parcels.length, parcels)
          // Filtrer par période
          let filtered = parcels
          const now = new Date()

          if (periodFilter === 'today') {
            const startOfDay = new Date(now)
            startOfDay.setHours(0, 0, 0, 0)
            const endOfDay = new Date(now)
            endOfDay.setHours(23, 59, 59, 999)
            filtered = parcels.filter((p: any) => {
              const date = p.createdAt?.toDate?.() || new Date(0)
              return date >= startOfDay && date <= endOfDay
            })
          } else if (periodFilter === 'week') {
            const startDate = new Date(now)
            startDate.setDate(startDate.getDate() - 7)
            startDate.setHours(0, 0, 0, 0)
            filtered = parcels.filter((p: any) => {
              const date = p.createdAt?.toDate?.() || new Date(0)
              return date >= startDate
            })
          } else if (periodFilter === 'month') {
            const startDate = new Date(now)
            startDate.setDate(startDate.getDate() - 30)
            startDate.setHours(0, 0, 0, 0)
            filtered = parcels.filter((p: any) => {
              const date = p.createdAt?.toDate?.() || new Date(0)
              return date >= startDate
            })
          } else if (periodFilter === 'custom' && dateFrom) {
            // 📅 CORRECTION TIMEZONE: 00:00 → 23:59
            const from = new Date(dateFrom + 'T00:00:00')
            const to = dateTo ? new Date(dateTo + 'T23:59:59') : new Date()
            filtered = parcels.filter((p: any) => {
              const date = p.createdAt?.toDate?.() || new Date(0)
              return date >= from && date <= to
            })
          }

          setUnbilledParcels(filtered)
        })
        .finally(() => setLoading(false))
    }
  }, [selectedClient, portType, periodFilter, dateFrom, dateTo])

  const totalAmount = useMemo(() => {
    return unbilledParcels
      .filter(p => selectedParcels.includes(p.id))
      .reduce((sum, p) => sum + (p.price || 0), 0)
  }, [unbilledParcels, selectedParcels])

  const handleCreate = async () => {
    if (!invoiceNumber || selectedParcels.length === 0) {
      alert('Veuillez remplir tous les champs obligatoires')
      return
    }

    setLoading(true)
    try {
      const items: InvoiceItem[] = unbilledParcels
        .filter(p => selectedParcels.includes(p.id))
        .map(p => ({
          parcelId: p.id,
          trackingId: p.trackingId,
          senderNic: p.sender?.nic || '',
          portAmount: p.price || 0,
          portType: portType,
          senderName: p.sender?.name || '',
          recipientName: p.receiver?.name || '',
          recipientCity: p.receiver?.city || '',
          createdAt: p.createdAt?.toDate?.(),
        }))

      const invoiceId = await createInvoice({
        invoiceNumber,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        agencyCity,
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : undefined,
        items,
        totalAmount,
        status: 'pending',
        notes,
        createdBy: uid,
        createdByName: userName,
      })

      // Marquer les colis comme facturés
      await markParcelsAsInvoiced(selectedParcels, invoiceId)

      alert('Facture créée avec succès !')
      onClose()
    } catch (error) {
      console.error('Erreur création facture:', error)
      alert('Erreur lors de la création')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 p-5 border-b shrink-0 bg-indigo-50">
          <FileText className="w-6 h-6 text-indigo-600" />
          <div className="flex-1">
            <h2 className="font-bold text-gray-800">Nouvelle facture</h2>
            <div className="text-xs text-indigo-600">Étape {step}/3</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-xl transition">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {/* Étape 1: Sélection client et agence */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Agence</label>
                <select
                  value={agencyCity}
                  onChange={e => {
                    setAgencyCity(e.target.value)
                    setSelectedClient(null)
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sélectionner une agence</option>
                  {CITIES.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              {agencyCity && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Client</label>
                  <select
                    value={selectedClient?.id || ''}
                    onChange={e => {
                      const client = cityClients.find((c: any) => c.id === e.target.value)
                      setSelectedClient(client)
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Sélectionner un client</option>
                    {cityClients.map((client: any) => (
                      <option key={client.id} value={client.id}>
                        {client.name} - {client.phone}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedClient && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Période à facturer
                    </label>
                    <select
                      value={periodFilter}
                      onChange={e => setPeriodFilter(e.target.value as any)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">Toutes les périodes</option>
                      <option value="today">Aujourd'hui</option>
                      <option value="week">7 derniers jours</option>
                      <option value="month">30 derniers jours</option>
                      <option value="custom">Période personnalisée</option>
                    </select>
                  </div>

                  {periodFilter === 'custom' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Date de début</label>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={e => setDateFrom(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Date de fin</label>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={e => setDateTo(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Type de port</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPortType('port-du')}
                        className={`flex-1 py-2 px-3 rounded-lg font-semibold border transition ${
                          portType === 'port-du'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                        }`}
                      >
                        Port dû
                      </button>
                      <button
                        onClick={() => setPortType('port-paye')}
                        className={`flex-1 py-2 px-3 rounded-lg font-semibold border transition ${
                          portType === 'port-paye'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                        }`}
                      >
                        Port payé
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <label className="block text-sm font-semibold text-gray-700">Numéro de facture</label>
                      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isManualNumber}
                          onChange={e => setIsManualNumber(e.target.checked)}
                          className="rounded"
                        />
                        Manuel
                      </label>
                    </div>
                    <input
                      type="text"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                      disabled={!isManualNumber}
                      placeholder="LAA-202601-001"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Étape 2: Sélection des colis */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <div className="text-sm font-semibold text-indigo-800">
                  {selectedClient.name} - {agencyCity}
                </div>
                <div className="text-xs text-indigo-600 mt-1">
                  {portType === 'port-du' ? 'Port dû' : 'Port payé'}
                </div>
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-500">Chargement des colis...</div>
              ) : unbilledParcels.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Aucun colis non facturé pour ce client
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-700">
                      {unbilledParcels.length} colis disponibles
                    </div>
                    <button
                      onClick={() => {
                        if (selectedParcels.length === unbilledParcels.length) {
                          setSelectedParcels([])
                        } else {
                          setSelectedParcels(unbilledParcels.map(p => p.id))
                        }
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                    >
                      {selectedParcels.length === unbilledParcels.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">
                            <input
                              type="checkbox"
                              checked={selectedParcels.length === unbilledParcels.length}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedParcels(unbilledParcels.map(p => p.id))
                                } else {
                                  setSelectedParcels([])
                                }
                              }}
                              className="rounded"
                            />
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">N° EXP (NIC)</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Destinataire</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Port</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {unbilledParcels.map(parcel => (
                          <tr key={parcel.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selectedParcels.includes(parcel.id)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSelectedParcels([...selectedParcels, parcel.id])
                                  } else {
                                    setSelectedParcels(selectedParcels.filter(id => id !== parcel.id))
                                  }
                                }}
                                className="rounded"
                              />
                            </td>
                            <td className="px-3 py-2 text-sm font-semibold text-indigo-600">
                              {parcel.sender?.nic || parcel.trackingId}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600">
                              {parcel.createdAt?.toDate?.().toLocaleDateString('fr-MA')}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700">
                              {parcel.receiver?.name || '-'}
                            </td>
                            <td className="px-3 py-2 text-sm font-semibold text-right text-gray-800">
                              {(parcel.price || 0).toLocaleString()} DH
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {selectedParcels.length} colis sélectionné{selectedParcels.length > 1 ? 's' : ''}
                    </div>
                    <div className="text-lg font-bold text-gray-800">
                      Total: {totalAmount.toLocaleString()} DH
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Étape 3: Informations complémentaires */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-indigo-800 mb-2">Récapitulatif</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Facture N°:</span>
                    <span className="font-semibold text-gray-800">{invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Client:</span>
                    <span className="font-semibold text-gray-800">{selectedClient.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Agence:</span>
                    <span className="font-semibold text-gray-800">{agencyCity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Colis:</span>
                    <span className="font-semibold text-gray-800">{selectedParcels.length}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-indigo-200">
                    <span className="text-indigo-700 font-semibold">Montant total:</span>
                    <span className="font-bold text-indigo-900 text-lg">{totalAmount.toLocaleString()} DH</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Date d'échéance <span className="text-xs text-gray-500">(optionnel)</span>
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Notes <span className="text-xs text-gray-500">(optionnel)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Notes supplémentaires..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t shrink-0 flex items-center justify-between gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition"
            >
              Précédent
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && (!selectedClient || !invoiceNumber)) ||
                (step === 2 && selectedParcels.length === 0)
              }
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Suivant
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {loading ? 'Création...' : 'Créer la facture'}
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Modal de modification (simplifié)
function EditInvoiceModal({ invoice, clients, onClose }: any) {
  const [notes, setNotes] = useState(invoice.notes || '')
  const [dueDate, setDueDate] = useState(
    invoice.dueDate ? new Date(invoice.dueDate.toDate()).toISOString().split('T')[0] : ''
  )

  const handleUpdate = async () => {
    try {
      await updateInvoice(invoice.id, {
        notes,
        dueDate: dueDate ? Timestamp.fromDate(new Date(dueDate)) : undefined,
      })
      alert('Facture modifiée avec succès !')
      onClose()
    } catch (error) {
      console.error('Erreur modification:', error)
      alert('Erreur lors de la modification')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center gap-3 p-5 border-b bg-indigo-50">
          <Edit2 className="w-5 h-5 text-indigo-600" />
          <div className="flex-1">
            <h2 className="font-bold text-gray-800">Modifier la facture</h2>
            <div className="text-xs text-indigo-600">{invoice.invoiceNumber}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-xl transition">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Date d'échéance</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="p-5 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition"
          >
            Annuler
          </button>
          <button
            onClick={handleUpdate}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal de visualisation
function ViewInvoiceModal({ invoice, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 p-5 border-b bg-indigo-50 shrink-0">
          <FileText className="w-6 h-6 text-indigo-600" />
          <div className="flex-1">
            <h2 className="font-bold text-gray-800">Facture {invoice.invoiceNumber}</h2>
            <div className="text-xs text-indigo-600">{invoice.clientName}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-xl transition">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Client</div>
              <div className="font-semibold text-gray-800">{invoice.clientName}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Agence</div>
              <div className="font-semibold text-gray-800">{invoice.agencyCity}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Date de création</div>
              <div className="font-semibold text-gray-800">
                {invoice.createdAt?.toDate?.().toLocaleDateString('fr-MA')}
              </div>
            </div>
            {invoice.dueDate && (
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Date d'échéance</div>
                <div className="font-semibold text-gray-800">
                  {invoice.dueDate?.toDate?.().toLocaleDateString('fr-MA')}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Créée par</div>
              <div className="font-semibold text-gray-800">{invoice.createdByName}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Statut</div>
              {invoice.status === 'pending' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                  En attente
                </span>
              )}
              {invoice.status === 'paid' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                  Payée
                </span>
              )}
              {invoice.status === 'cancelled' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                  Annulée
                </span>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Notes</div>
              <div className="text-sm text-gray-700">{invoice.notes}</div>
            </div>
          )}

          {invoice.status === 'paid' && (
            <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-xs text-green-700 uppercase font-semibold mb-2">Informations de paiement</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Date de paiement:</span>
                  <span className="font-semibold">
                    {invoice.paidAt?.toDate?.().toLocaleDateString('fr-MA')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Méthode:</span>
                  <span className="font-semibold">{invoice.paymentMethod}</span>
                </div>
                {invoice.paymentReference && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Référence:</span>
                    <span className="font-semibold">{invoice.paymentReference}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">N° Suivi</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Destinataire</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Ville</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoice.items.map((item: InvoiceItem, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm font-semibold text-indigo-600">
                      {item.senderNic || item.trackingId}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-MA') : '-'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">{item.recipientName || '-'}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{item.recipientCity || '-'}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-right">
                      {item.portAmount.toLocaleString()} DH
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-right font-bold text-gray-800">
                    Total
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-indigo-900 text-lg">
                    {invoice.totalAmount.toLocaleString()} DH
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="p-5 border-t shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition"
          >
            Fermer
          </button>
          <button
            onClick={() => printInvoice(invoice)}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// Fonction pour convertir un nombre en lettres (français)
function numberToWords(num: number): string {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix']

  if (num === 0) return 'zéro'

  const convert = (n: number): string => {
    if (n < 10) return units[n]
    if (n < 20) return teens[n - 10]
    if (n < 100) {
      const ten = Math.floor(n / 10)
      const unit = n % 10
      if (ten === 7 || ten === 9) {
        return tens[ten - 1] + '-' + teens[unit]
      }
      return tens[ten] + (unit ? '-' + units[unit] : '')
    }
    if (n < 1000) {
      const hundred = Math.floor(n / 100)
      const rest = n % 100
      return (hundred > 1 ? units[hundred] + ' ' : '') + 'cent' + (hundred > 1 && rest === 0 ? 's' : '') + (rest ? ' ' + convert(rest) : '')
    }
    if (n < 1000000) {
      const thousand = Math.floor(n / 1000)
      const rest = n % 1000
      return (thousand > 1 ? convert(thousand) + ' ' : '') + 'mille' + (rest ? ' ' + convert(rest) : '')
    }
    return n.toString()
  }

  const integerPart = Math.floor(num)
  const decimalPart = Math.round((num - integerPart) * 100)

  let result = convert(integerPart) + ' dirhams'
  if (decimalPart > 0) {
    result += ' et ' + convert(decimalPart) + ' centimes'
  }
  return result
}

// Fonction d'impression de facture
function printInvoice(invoice: Invoice) {
  const logoUrl = window.location.origin + '/LOGO.jpg'

  // Calculs TTC -> HT et TVA
  const totalTTC = invoice.totalAmount
  const totalHT = totalTTC / 1.10
  const totalTVA = totalTTC - totalHT
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Facture-${invoice.invoiceNumber}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { height: 100%; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; min-height: 100vh; display: flex; flex-direction: column; position: relative; padding: 30px 40px 20px 40px; }
    .content { flex: 1; padding-bottom: 60px; }
    .header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 2px solid #1e3a8a; }
    .header img { height: 60px; object-fit: contain; }
    .header h1 { color: #1e3a8a; font-size: 24pt; margin-bottom: 5px; text-align: center; flex: 1; }
    .header .subtitle { color: #666; font-size: 9pt; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .info-box { border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
    .info-box .label { font-size: 8pt; color: #666; text-transform: uppercase; margin-bottom: 3px; }
    .info-box .value { font-weight: bold; font-size: 11pt; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 8px; text-align: left; font-size: 9pt; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 9pt; }
    .text-right { text-align: right; }
    .total-row { background: #f0f0f0; font-weight: bold; font-size: 12pt; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 8pt; color: #666; background: white; }
    @media print {
      .footer { position: fixed; bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="content">
  <div class="header">
    <div>
      <img src="${logoUrl}" alt="Logo" style="height: 60px; margin-bottom: 8px;">
      <div style="font-size: 8pt; line-height: 1.4;">
        <div style="font-weight: bold;">Bloc H Rue 2 N°982 Agdal - Ait Melloul</div>
        <div>Tél : 05 28 30 68 58</div>
        <div>Gsm : 06 61 20 35 18 / 06 61 29 99 42</div>
        <div>E-mail : bgexpress2019@gmail.com</div>
      </div>
    </div>
    <div style="flex: 1; text-align: center;">
      <h1 style="margin: 0;">FACTURE</h1>
      <div class="subtitle">N° ${invoice.invoiceNumber}</div>
    </div>
    <div style="width: 60px;"></div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="label">Client</div>
      <div class="value">${invoice.clientName}</div>
    </div>
    <div class="info-box">
      <div class="label">Agence</div>
      <div class="value">${invoice.agencyCity}</div>
    </div>
    <div class="info-box">
      <div class="label">Date de création</div>
      <div class="value">${invoice.createdAt?.toDate?.().toLocaleDateString('fr-MA')}</div>
    </div>
    ${invoice.dueDate ? `
    <div class="info-box">
      <div class="label">Date d'échéance</div>
      <div class="value">${invoice.dueDate?.toDate?.().toLocaleDateString('fr-MA')}</div>
    </div>
    ` : ''}
  </div>

  ${invoice.notes ? `
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 10px; margin-bottom: 20px; border-radius: 5px;">
    <div style="font-size: 8pt; color: #666; text-transform: uppercase; margin-bottom: 5px;">Notes</div>
    <div style="font-size: 9pt;">${invoice.notes}</div>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>N° EXP (NIC)</th>
        <th>Date</th>
        <th>Destinataire</th>
        <th>Ville</th>
        <th class="text-right">Montant (DH)</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.items.map(item => `
        <tr>
          <td>${item.senderNic || item.trackingId}</td>
          <td>${item.createdAt ? (item.createdAt.toDate ? item.createdAt.toDate().toLocaleDateString('fr-MA') : new Date(item.createdAt).toLocaleDateString('fr-MA')) : '-'}</td>
          <td>${item.recipientName || '-'}</td>
          <td>${item.recipientCity || '-'}</td>
          <td class="text-right">${item.portAmount.toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 30px; page-break-inside: avoid;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt;">TOTAL HT</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt; width: 150px;">${totalHT.toFixed(2)} DH</td>
      </tr>
      <tr>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt;">TVA 10%</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt;">${totalTVA.toFixed(2)} DH</td>
      </tr>
      <tr style="background: #f0f0f0;">
        <td style="text-align: right; padding: 12px; font-weight: bold; font-size: 13pt;">TOTAL TTC</td>
        <td style="text-align: right; padding: 12px; font-weight: bold; font-size: 13pt;">${totalTTC.toFixed(2)} DH</td>
      </tr>
    </table>

    <div style="padding: 15px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px;">
      <p style="margin: 0; font-size: 10pt; font-weight: bold; text-align: justify;">
        Arrêté la présente facture à la somme de ${numberToWords(totalTTC)} (${totalTTC.toFixed(2)} DH) dont TVA est ${totalTVA.toFixed(2)} DH.
      </p>
    </div>
  </div>

  ${invoice.status === 'paid' ? `
  <div style="background: #d1fae5; border: 1px solid #6ee7b7; padding: 10px; margin-top: 20px; border-radius: 5px;">
    <div style="font-weight: bold; color: #065f46; margin-bottom: 5px;">✓ PAYÉE</div>
    <div style="font-size: 9pt; color: #047857;">
      Date: ${invoice.paidAt?.toDate?.().toLocaleDateString('fr-MA')} |
      Méthode: ${invoice.paymentMethod}
      ${invoice.paymentReference ? ` | Réf: ${invoice.paymentReference}` : ''}
    </div>
  </div>
  ` : ''}
  </div>

  <div class="footer">
    <div style="display: flex; justify-content: center; gap: 40px; font-size: 9pt;">
      <span>R.C : 17447</span>
      <span>T.P : 49803403</span>
      <span>I.F : 31837263</span>
      <span>CNSS : 1143595</span>
      <span>ICE : 002158803000007</span>
    </div>
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=860,height=1100')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
