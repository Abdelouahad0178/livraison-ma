import { useMemo, useState } from 'react'
import { Clock, Building2, User, Calendar, Filter, TrendingUp, TrendingDown } from 'lucide-react'
import { PORT_ECHEANCES, CITIES } from '../../../firebase/constants'
import { parcelWorkDate } from '../../../utils/dateFilter'

interface Props {
  allParcels: any[]
}

export default function AdminPortsEnCompteTab({ allParcels }: Props) {
  const [filterType, setFilterType] = useState<'all' | 'expediteur' | 'destinataire'>('all')
  const [filterEcheance, setFilterEcheance] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'enCours' | 'echus'>('all')
  const [filterCity, setFilterCity] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filterDateDebut, setFilterDateDebut] = useState<string>('')
  const [filterDateFin, setFilterDateFin] = useState<string>('')

  // Calculer la date d'échéance d'un colis
  const calculateDueDate = (createdAt: any, echeance: string | null): Date | null => {
    if (!echeance) return null
    const created = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt)
    const echObj = PORT_ECHEANCES.find(e => e.key === echeance)
    if (!echObj) return null
    const dueDate = new Date(created)
    dueDate.setDate(dueDate.getDate() + echObj.days)
    return dueDate
  }

  // Vérifier si un colis est échu
  const isOverdue = (createdAt: any, echeance: string | null): boolean => {
    const dueDate = calculateDueDate(createdAt, echeance)
    if (!dueDate) return false
    return new Date() > dueDate
  }

  // ⚡ CASCADE DE FILTRES (même correction que AdminExpeditionsTab) :
  // recherche → date → autres filtres. La recherche ne court-circuite JAMAIS
  // le filtre de période : ses résultats sont re-filtrés par date en aval.

  // Étape 0: Ne garder que les colis "port en compte"
  const basePortsParcels = useMemo(() =>
    allParcels.filter(p =>
      p.portType === 'port_en_compte_expediteur' || p.portType === 'port_en_compte_destinataire'
    )
  , [allParcels])

  // Étape 1: Recherche textuelle
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return basePortsParcels
    const query = searchQuery.toLowerCase()
    return basePortsParcels.filter(p => {
      const searchableFields = [
        p.sender?.nic || '',
        p.clientName || '',
        p.sender?.name || '',
        p.receiver?.name || '',
        p.receiver?.phone || '',
        p.portDeliveredBy || '',
        p.id || '',
        (p.price || '').toString()
      ].join(' ').toLowerCase()
      return searchableFields.includes(query)
    })
  }, [basePortsParcels, searchQuery])

  // Étape 2: Filtre de période appliqué SUR les résultats de recherche
  // 📅 parcelWorkDate = helper partagé (workDate en priorité, comme
  // expeditionWorkDate dans AdminPage) → même filtre que l'onglet Expéditions
  const dateFiltered = useMemo(() => {
    if (!filterDateDebut && !filterDateFin) return searchFiltered

    return searchFiltered.filter(p => {
      const date = parcelWorkDate(p)
      if (!date) return true // Si pas de date, on inclut le colis

      if (filterDateDebut) {
        const startDate = new Date(filterDateDebut + 'T00:00:00')
        if (date < startDate) return false
      }

      if (filterDateFin) {
        const endDate = new Date(filterDateFin + 'T23:59:59')
        if (date > endDate) return false
      }

      return true
    })
  }, [searchFiltered, filterDateDebut, filterDateFin])

  // Étape 3: Autres filtres (type, échéance, statut, ville)
  const portsEnCompteParcels = useMemo(() => {
    return dateFiltered.filter(p => {
      // Filtre par type
      if (filterType === 'expediteur' && p.portType !== 'port_en_compte_expediteur') return false
      if (filterType === 'destinataire' && p.portType !== 'port_en_compte_destinataire') return false

      // Filtre par échéance
      if (filterEcheance !== 'all' && p.portEcheance !== filterEcheance) return false

      // Filtre par statut d'échéance
      if (filterStatus === 'enCours' && isOverdue(p.createdAt, p.portEcheance)) return false
      if (filterStatus === 'echus' && !isOverdue(p.createdAt, p.portEcheance)) return false

      // Filtre par ville
      if (filterCity !== 'all') {
        // Pour port en compte expéditeur: filtrer par ville d'origine
        if (p.portType === 'port_en_compte_expediteur' && p.originCity !== filterCity) return false
        // Pour port en compte destinataire: filtrer par ville de destination
        if (p.portType === 'port_en_compte_destinataire' && p.destinationCity !== filterCity) return false
      }

      return true
    })
  }, [dateFiltered, filterType, filterEcheance, filterStatus, filterCity])

  // Statistiques
  const stats = useMemo(() => {
    const expediteur = portsEnCompteParcels.filter(p => p.portType === 'port_en_compte_expediteur')
    const destinataire = portsEnCompteParcels.filter(p => p.portType === 'port_en_compte_destinataire')

    const totalExpediteur = expediteur.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)
    const totalDestinataire = destinataire.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)

    const echus = portsEnCompteParcels.filter(p => isOverdue(p.createdAt, p.portEcheance))
    const totalEchus = echus.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)

    return {
      countExpediteur: expediteur.length,
      countDestinataire: destinataire.length,
      totalExpediteur,
      totalDestinataire,
      total: totalExpediteur + totalDestinataire,
      countEchus: echus.length,
      totalEchus,
    }
  }, [portsEnCompteParcels])

  // Formater la date
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Formater le montant
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-purple-600" />
            Ports en Compte
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Suivi des ports en compte expéditeur et destinataire
          </p>
        </div>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-blue-700">Ports en compte expéditeur</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{stats.countExpediteur}</p>
              <p className="text-sm font-semibold text-blue-800 mt-1">{formatAmount(stats.totalExpediteur)} DH</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-purple-700">Ports en compte destinataire</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{stats.countDestinataire}</p>
              <p className="text-sm font-semibold text-purple-800 mt-1">{formatAmount(stats.totalDestinataire)} DH</p>
            </div>
            <TrendingDown className="w-8 h-8 text-purple-600 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-green-700">Total ports en compte</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{portsEnCompteParcels.length}</p>
              <p className="text-sm font-semibold text-green-800 mt-1">{formatAmount(stats.total)} DH</p>
            </div>
            <Building2 className="w-8 h-8 text-green-600 opacity-50" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-red-700">Comptes échus</p>
              <p className="text-2xl font-bold text-red-900 mt-1">{stats.countEchus}</p>
              <p className="text-sm font-semibold text-red-800 mt-1">{formatAmount(stats.totalEchus)} DH</p>
            </div>
            <Clock className="w-8 h-8 text-red-600 opacity-50" />
          </div>
        </div>
      </div>

      {/* Recherche et Filtrage par Date */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Recherche & Date</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Barre de recherche */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">🔍 Recherche</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="N° EXP, Client, Livreur, Téléphone..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Date début */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">📅 Date début</label>
            <input
              type="date"
              value={filterDateDebut}
              onChange={(e) => setFilterDateDebut(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>

          {/* Date fin */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">📅 Date fin</label>
            <input
              type="date"
              value={filterDateFin}
              onChange={(e) => setFilterDateFin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>

        {/* Bouton réinitialiser */}
        {(searchQuery || filterDateDebut || filterDateFin) && (
          <button
            onClick={() => {
              setSearchQuery('')
              setFilterDateDebut('')
              setFilterDateFin('')
            }}
            className="mt-3 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition"
          >
            ❌ Réinitialiser la recherche
          </button>
        )}
      </div>

      {/* Filtres */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">Filtres</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Filtre par ville */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ville</label>
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">Toutes les villes</option>
              {CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* Filtre par type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type de port</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">Tous les types</option>
              <option value="expediteur">Port en compte expéditeur</option>
              <option value="destinataire">Port en compte destinataire</option>
            </select>
          </div>

          {/* Filtre par échéance */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Échéance</label>
            <select
              value={filterEcheance}
              onChange={(e) => setFilterEcheance(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">Toutes les échéances</option>
              {PORT_ECHEANCES.map(ech => (
                <option key={ech.key} value={ech.key}>{ech.label}</option>
              ))}
            </select>
          </div>

          {/* Filtre par statut */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Statut</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="enCours">En cours (non échus)</option>
              <option value="echus">Échus</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tableau des ports en compte */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">N° EXP</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Échéance</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Colis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {portsEnCompteParcels.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Aucun port en compte trouvé
                  </td>
                </tr>
              ) : (
                portsEnCompteParcels.map((parcel) => {
                  const dueDate = calculateDueDate(parcel.createdAt, parcel.portEcheance)
                  const overdue = isOverdue(parcel.createdAt, parcel.portEcheance)
                  const createdDate = parcel.createdAt?.toDate ? parcel.createdAt.toDate() : new Date(parcel.createdAt)

                  return (
                    <tr key={parcel.id} className={`hover:bg-gray-50 ${overdue ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">
                        {parcel.sender?.nic || parcel.id}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          parcel.portType === 'port_en_compte_expediteur'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {parcel.portType === 'port_en_compte_expediteur' ? '📤 Expéditeur' : '📥 Destinataire'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-900 font-medium">{parcel.clientName || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {formatAmount(parseFloat(parcel.price) || 0)} DH
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                          <Clock className="w-3 h-3 mr-1" />
                          {parcel.portEcheance || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs font-medium text-gray-700">
                            {formatDate(createdDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {overdue ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                            ⚠️ Échu
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                            ✓ En cours
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <span className="font-medium">{parcel.status}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
