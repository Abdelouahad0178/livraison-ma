import { useState, useEffect } from 'react'
import { AlertTriangle, Search, Filter, CheckCircle, XCircle, Clock, MapPin, MessageSquare, Eye, EyeOff } from 'lucide-react'
import { getAllLostParcels, LostParcelDeclaration } from '../../../firebase/lostParcels'

interface DriverLostParcelsTabProps {
  driverUid: string
  driverName: string
}

export default function DriverLostParcelsTab({ driverUid, driverName }: DriverLostParcelsTabProps) {
  const [lostParcels, setLostParcels] = useState<LostParcelDeclaration[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'declared' | 'found' | 'confirmed_lost'>('all')
  const [expandedParcel, setExpandedParcel] = useState<string | null>(null)

  useEffect(() => {
    loadMyLostParcels()
  }, [driverUid])

  const loadMyLostParcels = async () => {
    setLoading(true)
    try {
      const all = await getAllLostParcels()
      // Filtrer uniquement les colis déclarés par ce chauffeur
      const mine = all.filter(lp => lp.declaredBy.uid === driverUid)
      // Trier par date (plus récent en premier)
      mine.sort((a, b) => b.declaredAt.toMillis() - a.declaredAt.toMillis())
      setLostParcels(mine)
    } catch (error) {
      console.error('Erreur chargement colis perdus:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTimeElapsed = (declaredAt: any) => {
    const now = Date.now()
    const declared = declaredAt.toMillis()
    const elapsed = now - declared
    const hours = Math.floor(elapsed / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (days > 0) return `Il y a ${days}j`
    if (hours > 0) return `Il y a ${hours}h`
    return 'Récent'
  }

  const getResponseStats = (lp: LostParcelDeclaration) => {
    const total = Object.keys(lp.responses).length
    const responded = Object.values(lp.responses).filter(r => r.responded).length
    const found = Object.values(lp.responses).filter(r => r.responded && r.found).length
    return { total, responded, found }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'found': return 'bg-green-100 text-green-700 border-green-300'
      case 'confirmed_lost': return 'bg-gray-200 text-gray-700 border-gray-400'
      default: return 'bg-amber-100 text-amber-700 border-amber-300'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'found': return '✅ Retrouvé'
      case 'confirmed_lost': return '❌ Perdu confirmé'
      case 'searching': return '🔍 En recherche active'
      default: return '🔍 En recherche'
    }
  }

  // Filtrage
  const filtered = lostParcels.filter(lp => {
    const matchSearch = !searchTerm ||
      lp.trackingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lp.lastKnownLocation.toLowerCase().includes(searchTerm.toLowerCase())

    const matchStatus = statusFilter === 'all' || lp.status === statusFilter

    return matchSearch && matchStatus
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Chargement...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header avec stats */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-4 border-2 border-red-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-800">📦 Mes colis perdus</h2>
            <p className="text-sm text-gray-600 mt-1">
              {lostParcels.length} déclaration{lostParcels.length > 1 ? 's' : ''} au total
            </p>
            <div className="flex gap-3 mt-2 text-xs">
              <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-semibold">
                🔍 {lostParcels.filter(lp => lp.status === 'declared' || lp.status === 'searching').length} en recherche
              </span>
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">
                ✅ {lostParcels.filter(lp => lp.status === 'found').length} retrouvé{lostParcels.filter(lp => lp.status === 'found').length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recherche et filtres */}
      <div className="space-y-2">
        {/* Barre de recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par tracking ID ou ville..."
            className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Filtres par statut */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'Tous', count: lostParcels.length },
            { key: 'declared', label: 'En recherche', count: lostParcels.filter(lp => lp.status === 'declared' || lp.status === 'searching').length },
            { key: 'found', label: 'Retrouvés', count: lostParcels.filter(lp => lp.status === 'found').length },
            { key: 'confirmed_lost', label: 'Perdus', count: lostParcels.filter(lp => lp.status === 'confirmed_lost').length }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key as any)}
              className={`shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                statusFilter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Liste des colis */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {searchTerm || statusFilter !== 'all'
                ? 'Aucun colis ne correspond à votre recherche'
                : 'Vous n\'avez déclaré aucun colis perdu'}
            </p>
          </div>
        ) : (
          filtered.map(lp => {
            const { total, responded, found } = getResponseStats(lp)
            const isExpanded = expandedParcel === lp.id

            return (
              <div
                key={lp.id}
                className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden"
              >
                {/* Header du colis */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-mono font-bold text-lg text-red-700">{lp.trackingId}</p>
                      <p className="text-xs text-gray-500 mt-1">{getTimeElapsed(lp.declaredAt)}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(lp.status)}`}>
                      {getStatusLabel(lp.status)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <MapPin className="w-4 h-4" />
                    <span>Dernière localisation : <strong>{lp.lastKnownLocation}</strong></span>
                  </div>

                  {/* Barre de progression des réponses */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600">Réponses des agences</span>
                      <span className="font-bold text-gray-800">{responded}/{total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          found > 0 ? 'bg-green-500' :
                          responded === total ? 'bg-blue-500' :
                          responded > total / 2 ? 'bg-blue-400' :
                          'bg-amber-400'
                        }`}
                        style={{ width: `${(responded / total) * 100}%` }}
                      />
                    </div>
                  </div>

                  {found > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2 mb-3">
                      <p className="text-xs text-green-700 font-semibold">
                        🎉 {found} agence{found > 1 ? 's ont' : ' a'} trouvé ce colis !
                      </p>
                    </div>
                  )}

                  {/* Bouton voir détails */}
                  <button
                    onClick={() => setExpandedParcel(isExpanded ? null : lp.id)}
                    className="w-full px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                  >
                    {isExpanded ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        Masquer les détails
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Voir les réponses ({responded})
                      </>
                    )}
                  </button>
                </div>

                {/* Détails expandables */}
                {isExpanded && (
                  <div className="border-t-2 border-gray-100 p-4 bg-gray-50">
                    {/* Mes détails */}
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 mb-2">Mes informations :</p>
                      <div className="bg-white rounded-lg p-3 text-sm">
                        <p className="text-gray-700">{lp.details || 'Aucun détail fourni'}</p>
                      </div>
                    </div>

                    {/* Réponses des agences */}
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">Réponses des agences :</p>
                      <div className="space-y-2">
                        {Object.entries(lp.responses).map(([city, response]) => (
                          <div
                            key={city}
                            className={`p-3 rounded-lg border ${
                              response.responded
                                ? response.found
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-white border-gray-200'
                                : 'bg-amber-50 border-amber-200'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-sm">{city}</span>
                              {response.responded ? (
                                response.found ? (
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-gray-500" />
                                )
                              ) : (
                                <Clock className="w-5 h-5 text-amber-500" />
                              )}
                            </div>
                            {response.responded ? (
                              <>
                                <p className="text-xs text-gray-600 mb-1">
                                  {response.found ? '✅ Colis trouvé' : '❌ Colis non trouvé'}
                                </p>
                                {response.comment && (
                                  <div className="mt-2 pt-2 border-t border-current/20">
                                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" /> Commentaire :
                                    </p>
                                    <p className="text-xs text-gray-700 italic">"{response.comment}"</p>
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-amber-600">En attente de réponse...</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
