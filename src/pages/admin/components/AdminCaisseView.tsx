import { useState, useEffect, useMemo } from 'react'
import { Building2, TrendingUp, Package, Users, Calendar, CheckCircle, Clock } from 'lucide-react'
import { CITIES } from '../../../firebase/constants'
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore'
import { db } from '../../../firebase/config'

interface Props {
  onClose: () => void
}

export default function AdminCaisseView({ onClose }: Props) {
  const [selectedCity, setSelectedCity] = useState<string>(CITIES[0] || '')
  const [parcels, setParcels] = useState<any[]>([])
  const [adminTransfers, setAdminTransfers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filtre de date
  const [datePreset, setDatePreset] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Charger les colis de la ville sélectionnée
  useEffect(() => {
    if (!selectedCity) return

    setLoading(true)

    // Charger les parcels par originCity
    const q1 = query(
      collection(db, 'parcels'),
      where('originCity', '==', selectedCity),
      orderBy('createdAt', 'desc'),
      limit(500)
    )

    // Charger les parcels par createdByCity
    const q2 = query(
      collection(db, 'parcels'),
      where('createdByCity', '==', selectedCity),
      orderBy('createdAt', 'desc'),
      limit(500)
    )

    // Charger les parcels par destinationCity (pour les ports dûs collectés)
    const q3 = query(
      collection(db, 'parcels'),
      where('destinationCity', '==', selectedCity),
      orderBy('createdAt', 'desc'),
      limit(500)
    )

    const parcelsMap = new Map()

    const unsub1 = onSnapshot(q1, (snap1) => {
      snap1.docs.forEach(d => parcelsMap.set(d.id, { id: d.id, ...d.data() }))
      updateParcels()
    })

    const unsub2 = onSnapshot(q2, (snap2) => {
      snap2.docs.forEach(d => parcelsMap.set(d.id, { id: d.id, ...d.data() }))
      updateParcels()
    })

    const unsub3 = onSnapshot(q3, (snap3) => {
      snap3.docs.forEach(d => parcelsMap.set(d.id, { id: d.id, ...d.data() }))
      updateParcels()
    })

    const updateParcels = () => {
      setParcels(Array.from(parcelsMap.values()))
      setLoading(false)
    }

    return () => {
      unsub1()
      unsub2()
      unsub3()
    }
  }, [selectedCity])

  // Charger les versements admin de la ville
  useEffect(() => {
    if (!selectedCity) return

    const q = query(
      collection(db, 'adminTransfers'),
      where('city', '==', selectedCity),
      orderBy('createdAt', 'desc')
    )

    const unsub = onSnapshot(q, (snap) => {
      setAdminTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    return () => unsub()
  }, [selectedCity])

  // Appliquer le filtre de date
  const getDateRange = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    switch (datePreset) {
      case 'today':
        return { start: today, end: new Date() }
      case 'week': {
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - 7)
        return { start: weekStart, end: new Date() }
      }
      case 'month': {
        const monthStart = new Date(today)
        monthStart.setMonth(today.getMonth() - 1)
        return { start: monthStart, end: new Date() }
      }
      case 'custom': {
        if (dateFrom && dateTo) {
          return {
            start: new Date(dateFrom),
            end: new Date(new Date(dateTo).setHours(23, 59, 59, 999))
          }
        }
        return null
      }
      default:
        return null
    }
  }

  const dateRange = getDateRange()

  const filteredParcels = useMemo(() => {
    if (!dateRange) return parcels
    return parcels.filter(p => {
      const date = p.createdAt?.toDate?.() || new Date(p.createdAt)
      return date >= dateRange.start && date <= dateRange.end
    })
  }, [parcels, dateRange])

  const filteredTransfers = useMemo(() => {
    if (!dateRange) return adminTransfers
    return adminTransfers.filter(t => {
      const date = t.createdAt?.toDate?.() || new Date(t.createdAt)
      return date >= dateRange.start && date <= dateRange.end
    })
  }, [adminTransfers, dateRange])

  // Calculer les statistiques
  const stats = useMemo(() => {
    const portsDus = filteredParcels.filter(p =>
      p.portType === 'port_du' &&
      ['Livré', 'En cours de livraison'].includes(p.status) &&
      p.status !== 'Retourné'
    )

    const portsPayes = filteredParcels.filter(p =>
      p.portType === 'port_paye' &&
      !p.portPayeMethod &&
      p.portStatus === 'received' &&
      (p.createdByCity === selectedCity || p.originCity === selectedCity)
    )

    const portsDusCollectes = filteredParcels.filter(p =>
      p.portType === 'port_du' &&
      !p.portPayeMethod &&
      (p.portStatus === 'collected' || p.portStatus === 'received') &&
      p.destinationCity === selectedCity
    )

    const totalPortsDus = portsDus.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)
    const totalPortsPayes = portsPayes.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)
    const totalPortsDusCollectes = portsDusCollectes.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0)

    // Total collecté = ports dûs collectés + ports payés reçus
    const totalCollecte = totalPortsDusCollectes + totalPortsPayes

    const totalVerse = filteredTransfers
      .filter(t => t.status === 'confirmed')
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)

    const solde = Math.max(0, totalCollecte - totalVerse)

    return {
      nbPortsDus: portsDus.length,
      totalPortsDus,
      nbPortsPayes: portsPayes.length,
      totalPortsPayes,
      nbCollectes: portsDusCollectes.length,
      totalPortsDusCollectes,
      totalCollecte,
      totalVerse,
      solde
    }
  }, [filteredParcels, filteredTransfers])

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Sélecteur de ville */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
          <Building2 className="w-6 h-6 text-purple-600 shrink-0" />
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="w-full sm:flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>

        {/* Filtre de date */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Calendar className="w-5 h-5 text-gray-600 shrink-0" />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDatePreset('all')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                datePreset === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tout
            </button>
            <button
              onClick={() => setDatePreset('today')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                datePreset === 'today'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => setDatePreset('week')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                datePreset === 'week'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              7 jours
            </button>
            <button
              onClick={() => setDatePreset('month')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                datePreset === 'month'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              30 jours
            </button>
            <button
              onClick={() => setDatePreset('custom')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                datePreset === 'custom'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Personnalisé
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full sm:w-auto">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-gray-500 hidden sm:inline">à</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}
        </div>
      </div>

      {/* Statistiques */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500">Chargement...</div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {/* Résumé financier Chef d'agence → Admin */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600 shrink-0" />
              <span className="text-sm sm:text-base">Résumé financier - Chef d'agence → Admin</span>
            </h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden">
                  <table className="min-w-full w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Description</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Nombre</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="hover:bg-blue-50">
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">Ports Payés reçus</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900">{stats.nbPortsPayes}</td>
                    <td className="py-3 px-4 text-sm text-right font-bold text-blue-600">
                      {stats.totalPortsPayes.toLocaleString('fr-MA')} DH
                    </td>
                  </tr>
                  <tr className="hover:bg-green-50">
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">Ports Dûs collectés</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900">{stats.nbCollectes}</td>
                    <td className="py-3 px-4 text-sm text-right font-bold text-green-600">
                      {stats.totalPortsDusCollectes.toLocaleString('fr-MA')} DH
                    </td>
                  </tr>
                  <tr className="bg-purple-50 border-t-2 border-purple-200">
                    <td className="py-3 px-4 text-sm font-bold text-gray-900">Total à verser à l'Admin</td>
                    <td className="py-3 px-4 text-sm text-right font-bold text-gray-900">
                      {stats.nbPortsPayes + stats.nbCollectes}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-purple-700 text-lg">
                      {stats.totalCollecte.toLocaleString('fr-MA')} DH
                    </td>
                  </tr>
                  <tr className="hover:bg-amber-50">
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">Versements déjà effectués</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900">
                      {filteredTransfers.filter(t => t.status === 'confirmed').length}
                    </td>
                    <td className="py-3 px-4 text-sm text-right font-bold text-amber-600">
                      -{stats.totalVerse.toLocaleString('fr-MA')} DH
                    </td>
                  </tr>
                  <tr className="bg-gradient-to-r from-purple-100 to-pink-100 border-t-2 border-purple-300">
                    <td className="py-4 px-4 text-base font-black text-gray-900">Reste à verser</td>
                    <td className="py-4 px-4"></td>
                    <td className="py-4 px-4 text-right font-black text-purple-700 text-2xl">
                      {stats.solde.toLocaleString('fr-MA')} DH
                    </td>
                  </tr>
                </tbody>
              </table>
                </div>
              </div>
            </div>
          </div>

          {/* Historique des versements */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex flex-wrap items-center gap-2">
              <Users className="w-5 h-5 shrink-0" />
              <span className="text-sm sm:text-base">Historique des versements</span>
              <span className="text-xs sm:text-sm font-normal text-gray-500">
                ({filteredTransfers.length} versement{filteredTransfers.length > 1 ? 's' : ''})
              </span>
            </h3>
            {filteredTransfers.length === 0 ? (
              <p className="text-gray-500 text-center py-8 text-sm">Aucun versement</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <div className="overflow-hidden">
                <table className="min-w-full w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">Date</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">Agent</th>
                      <th className="text-left py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">Type</th>
                      <th className="text-right py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">Montant</th>
                      <th className="text-center py-3 px-2 sm:px-4 text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTransfers.map(transfer => (
                      <tr key={transfer.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm text-gray-900">
                          <div className="whitespace-nowrap">
                            {transfer.createdAt?.toDate?.()?.toLocaleDateString('fr-MA', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            }) || '-'}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap">
                            {transfer.createdAt?.toDate?.()?.toLocaleTimeString('fr-MA', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm text-gray-900 font-medium">
                          <div className="max-w-[120px] sm:max-w-none truncate">{transfer.fromName || '-'}</div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm text-gray-600">
                          <div className="whitespace-nowrap">
                            {transfer.type === 'bank' ? 'Virement' :
                             transfer.type === 'cash' ? 'Espèces' :
                             transfer.type || 'Non spécifié'}
                          </div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm text-right font-bold text-gray-900">
                          <div className="whitespace-nowrap">{parseFloat(transfer.amount || 0).toLocaleString('fr-MA')} DH</div>
                        </td>
                        <td className="py-3 px-2 sm:px-4 text-center">
                          {transfer.status === 'confirmed' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircle className="w-3 h-3" />
                              Confirmé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              <Clock className="w-3 h-3" />
                              En attente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
