import { useMemo, useState } from 'react'
import { Clock, Building2, User, Calendar, Filter, TrendingUp, TrendingDown, Wallet, CheckCircle } from 'lucide-react'
import { PORT_ECHEANCES } from '../../../firebase/constants'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'

interface Props {
  allParcels: any[]
  profile: any
}

export default function AgentPortsEnCompteTab({ allParcels, profile }: Props) {
  const [filterType, setFilterType] = useState<'all' | 'expediteur' | 'destinataire'>('all')
  const [filterEcheance, setFilterEcheance] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'enCours' | 'echus'>('all')
  const [filterPaiement, setFilterPaiement] = useState<'all' | 'regle' | 'nonRegle'>('all')
  const [filterLivreur, setFilterLivreur] = useState<string>('all')
  const [filterDateDebut, setFilterDateDebut] = useState<string>('')
  const [filterDateFin, setFilterDateFin] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [reglementLoading, setReglementLoading] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const myCity = profile?.city || ''

  // Liste des livreurs qui ont fait des livraisons en compte
  const livreurs = useMemo(() => {
    const livreurSet = new Set<string>()
    allParcels.forEach(p => {
      if (p.portDeliveredBy && p.portType === 'port_en_compte_destinataire') {
        const isMyCity = p.destinationCity === myCity
        if (isMyCity) {
          livreurSet.add(p.portDeliveredBy)
        }
      }
    })
    return Array.from(livreurSet).sort()
  }, [allParcels, myCity])

  // Fonction pour régler un port en compte
  const handleReglement = async (parcelId: string) => {
    if (!confirm('Confirmer le règlement de ce port en compte ?')) return

    setReglementLoading(parcelId)
    try {
      await updateDoc(doc(db, 'parcels', parcelId), {
        portPaid: true,
        portPaidAt: new Date().toISOString(),
        portPaidBy: profile?.name || 'Chef d\'agence'
      })
      setMsg({ type: 'success', text: '✅ Port en compte réglé avec succès !' })
      setTimeout(() => setMsg(null), 3000)
    } catch (error) {
      console.error('Erreur lors du règlement:', error)
      setMsg({ type: 'error', text: '❌ Erreur lors du règlement' })
      setTimeout(() => setMsg(null), 3000)
    } finally {
      setReglementLoading(null)
    }
  }

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

  // Filtrer les colis avec ports en compte de MA ville
  const portsEnCompteParcels = useMemo(() => {
    return allParcels.filter(p => {
      const isPortEnCompte = p.portType === 'port_en_compte_expediteur' ||
                             p.portType === 'port_en_compte_destinataire' ||
                             p.portType === 'port_en_compte'  // Type générique (anciens colis)
      if (!isPortEnCompte) return false

      // Filtre par ville : seulement MA ville
      // Port en compte expéditeur : ville d'origine = ma ville
      // Port en compte destinataire : ville de destination = ma ville
      // Type générique : ville d'origine OU de destination = ma ville
      const isMyCity = (p.portType === 'port_en_compte_expediteur' && p.originCity === myCity) ||
                       (p.portType === 'port_en_compte_destinataire' && p.destinationCity === myCity) ||
                       (p.portType === 'port_en_compte' && (p.originCity === myCity || p.destinationCity === myCity))
      if (!isMyCity) return false

      // Filtre par type
      if (filterType === 'expediteur' && p.portType !== 'port_en_compte_expediteur') return false
      if (filterType === 'destinataire' && p.portType !== 'port_en_compte_destinataire') return false

      // Filtre par échéance
      if (filterEcheance !== 'all' && p.portEcheance !== filterEcheance) return false

      // Filtre par statut d'échéance
      if (filterStatus === 'enCours' && isOverdue(p.createdAt, p.portEcheance)) return false
      if (filterStatus === 'echus' && !isOverdue(p.createdAt, p.portEcheance)) return false

      // Filtre par paiement
      if (filterPaiement === 'regle' && !p.portPaid) return false
      if (filterPaiement === 'nonRegle' && p.portPaid) return false

      // Filtre par livreur (seulement pour ports en compte destinataire)
      if (filterLivreur !== 'all' && p.portType === 'port_en_compte_destinataire' && p.portDeliveredBy !== filterLivreur) return false

      // Filtre par date
      if (filterDateDebut || filterDateFin) {
        const parcelDate = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt)

        if (filterDateDebut) {
          const dateDebut = new Date(filterDateDebut)
          dateDebut.setHours(0, 0, 0, 0)
          if (parcelDate < dateDebut) return false
        }

        if (filterDateFin) {
          const dateFin = new Date(filterDateFin)
          dateFin.setHours(23, 59, 59, 999)
          if (parcelDate > dateFin) return false
        }
      }

      // Recherche textuelle
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const searchableFields = [
          p.sender?.nic || '',
          p.clientName || '',
          p.sender?.name || '',
          p.receiver?.name || '',
          p.receiver?.tel || '',
          p.portDeliveredBy || '',
          p.id || '',
          (p.price || '').toString()
        ].join(' ').toLowerCase()

        if (!searchableFields.includes(query)) return false
      }

      return true
    })
  }, [allParcels, filterType, filterEcheance, filterStatus, filterPaiement, filterLivreur, filterDateDebut, filterDateFin, searchQuery, myCity])

  // Statistiques
  const stats = useMemo(() => {
    const expediteur = portsEnCompteParcels.filter(p => p.portType === 'port_en_compte_expediteur')
    const destinataire = portsEnCompteParcels.filter(p => p.portType === 'port_en_compte_destinataire')

    const totalExpediteur = expediteur.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)
    const totalDestinataire = destinataire.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)

    const echus = portsEnCompteParcels.filter(p => isOverdue(p.createdAt, p.portEcheance))
    const totalEchus = echus.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)

    const regles = portsEnCompteParcels.filter(p => p.portPaid)
    const totalRegles = regles.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)

    const nonRegles = portsEnCompteParcels.filter(p => !p.portPaid)
    const totalNonRegles = nonRegles.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)

    return {
      countExpediteur: expediteur.length,
      countDestinataire: destinataire.length,
      totalExpediteur,
      totalDestinataire,
      total: totalExpediteur + totalDestinataire,
      countEchus: echus.length,
      totalEchus,
      countRegles: regles.length,
      totalRegles,
      countNonRegles: nonRegles.length,
      totalNonRegles,
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
      {/* Message de succès/erreur */}
      {msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
          msg.type === 'success' ? 'bg-green-100 border border-green-300 text-green-800' : 'bg-red-100 border border-red-300 text-red-800'
        }`}>
          {msg.text}
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-7 h-7 text-purple-600" />
            Ports en Compte - {myCity}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Suivi des ports en compte expéditeur et destinataire de votre agence
          </p>
        </div>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700">Ports réglés</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">{stats.countRegles}</p>
              <p className="text-sm font-semibold text-emerald-800 mt-1">{formatAmount(stats.totalRegles)} DH</p>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-600 opacity-50" />
          </div>
        </div>
      </div>

      {/* Deuxième ligne de statistiques : Non réglés */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-700">Ports non réglés (En attente)</p>
              <p className="text-2xl font-bold text-amber-900 mt-1">{stats.countNonRegles}</p>
              <p className="text-sm font-semibold text-amber-800 mt-1">{formatAmount(stats.totalNonRegles)} DH</p>
            </div>
            <Wallet className="w-8 h-8 text-amber-600 opacity-50" />
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
          <div className="md:col-span-1">
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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            <label className="block text-xs font-medium text-gray-700 mb-1">Statut échéance</label>
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

          {/* Filtre par paiement */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Paiement</label>
            <select
              value={filterPaiement}
              onChange={(e) => setFilterPaiement(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">Tous</option>
              <option value="regle">✅ Réglés</option>
              <option value="nonRegle">⏳ Non réglés</option>
            </select>
          </div>

          {/* Filtre par livreur */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Livreur</label>
            <select
              value={filterLivreur}
              onChange={(e) => setFilterLivreur(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">Tous les livreurs</option>
              {livreurs.map(livreur => (
                <option key={livreur} value={livreur}>{livreur}</option>
              ))}
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Livreur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Échéance</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Paiement</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Colis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {portsEnCompteParcels.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    Aucun port en compte trouvé pour votre agence
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
                      <td className="px-4 py-3">
                        {parcel.portType === 'port_en_compte_destinataire' && parcel.portDeliveredBy ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                            🚚 {parcel.portDeliveredBy}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
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
                      <td className="px-4 py-3">
                        {parcel.portPaid ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Réglé
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                            ⏳ Non réglé
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!parcel.portPaid ? (
                          <button
                            onClick={() => handleReglement(parcel.id)}
                            disabled={reglementLoading === parcel.id}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                          >
                            {reglementLoading === parcel.id ? (
                              <>⏳ Règlement...</>
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5" />
                                Régler
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Réglé le {new Date(parcel.portPaidAt).toLocaleDateString('fr-FR')}
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
