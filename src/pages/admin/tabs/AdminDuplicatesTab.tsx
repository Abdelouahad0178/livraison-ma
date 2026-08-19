import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, Timestamp, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { AlertTriangle, Calendar, Package, User, Edit2, Check, X } from 'lucide-react'

interface Duplicate {
  group: Array<{
    id: string
    trackingId: string
    nic: string
    createdAt: Date
    sender: string
    receiver: string
    price: number
    codAmount: number
    agentName: string
    status: string
  }>
  timeDiff: number
}

export default function AdminDuplicatesTab() {
  const [loading, setLoading] = useState(false)
  const [duplicates, setDuplicates] = useState<Duplicate[]>([])
  const [dateFilter, setDateFilter] = useState<'weeks' | 'custom'>('weeks')
  const [weeksAgo, setWeeksAgo] = useState(3)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editingNic, setEditingNic] = useState<string | null>(null)
  const [newNic, setNewNic] = useState('')
  const [updating, setUpdating] = useState(false)

  const findDuplicates = async () => {
    setLoading(true)
    try {
      // ⚡ Calculer la date de début selon le type de filtre
      let startDate: Date

      if (dateFilter === 'custom') {
        // Mode personnalisé : utiliser dateFrom ou début d'année
        if (dateFrom) {
          startDate = new Date(dateFrom + 'T00:00:00')
        } else {
          // Par défaut : début de l'année en cours
          startDate = new Date(new Date().getFullYear(), 0, 1)
        }
      } else {
        // Mode semaines
        startDate = new Date()
        startDate.setDate(startDate.getDate() - (weeksAgo * 7))
      }

      // Date de fin (optionnelle en mode custom)
      let endDate: Date | null = null
      if (dateFilter === 'custom' && dateTo) {
        endDate = new Date(dateTo + 'T23:59:59')
      }

      const parcelsRef = collection(db, 'parcels')
      const queryConstraints: any[] = [
        where('createdAt', '>=', Timestamp.fromDate(startDate))
      ]

      // Ajouter filtre de fin si date personnalisée
      if (endDate) {
        queryConstraints.push(where('createdAt', '<=', Timestamp.fromDate(endDate)))
      }

      const q = query(parcelsRef, ...queryConstraints)

      const snapshot = await getDocs(q)

      // Grouper par NIC (N° EXP du client)
      const groups = new Map<string, any[]>()

      snapshot.forEach(doc => {
        const parcel = doc.data()
        const createdAt = parcel.createdAt?.toDate() || new Date()
        const nic = parcel.senderNic || parcel.sender?.nic || ''

        // Ignorer les expéditions sans NIC
        if (!nic) return

        if (!groups.has(nic)) {
          groups.set(nic, [])
        }

        groups.get(nic)!.push({
          id: doc.id,
          trackingId: parcel.trackingId,
          nic: nic,
          createdAt,
          sender: parcel.sender?.name,
          receiver: parcel.receiver?.name,
          price: parcel.price,
          codAmount: parcel.codAmount,
          agentName: parcel.agentName,
          status: parcel.status
        })
      })

      // Trouver les doublons (même NIC, tracking IDs différents)
      const foundDuplicates: Duplicate[] = []

      groups.forEach((items, nic) => {
        if (items.length > 1) {
          // Trier par date de création
          items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

          // Toutes les expéditions avec le même NIC sont des doublons
          foundDuplicates.push({
            group: items,
            timeDiff: Math.abs(items[items.length - 1].createdAt - items[0].createdAt) / 1000
          })
        }
      })

      setDuplicates(foundDuplicates)
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateNic = async (parcelId: string, oldNic: string) => {
    if (!newNic.trim()) {
      alert('Veuillez saisir un nouveau NIC')
      return
    }

    if (newNic.trim() === oldNic) {
      alert('Le nouveau NIC est identique à l\'ancien')
      return
    }

    setUpdating(true)
    try {
      const parcelRef = doc(db, 'parcels', parcelId)
      await updateDoc(parcelRef, {
        'sender.nic': newNic.trim()
      })

      // Rafraîchir les doublons
      await findDuplicates()

      // Réinitialiser l'état d'édition
      setEditingNic(null)
      setNewNic('')

      // Signaler le changement aux autres pages
      localStorage.setItem('parcelDataUpdated', Date.now().toString())
      window.dispatchEvent(new Event('parcelDataUpdated'))

      alert('NIC mis à jour avec succès')
    } catch (error) {
      console.error('Erreur:', error)
      alert('Erreur lors de la mise à jour du NIC')
    } finally {
      setUpdating(false)
    }
  }

  // Charger les doublons au montage
  useEffect(() => {
    findDuplicates()
  }, [])

  // Recharger quand le type de filtre change
  useEffect(() => {
    // Auto-refresh quand on bascule entre modes
    if (dateFilter === 'weeks') {
      findDuplicates()
    }
  }, [dateFilter])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Détection des Doublons</h1>
            <p className="text-orange-100 mt-1">
              Analyse des expéditions créées en double
            </p>
          </div>
        </div>
      </div>

      {/* Contrôles */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Type de filtre :</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as 'weeks' | 'custom')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold"
          >
            <option value="weeks">Par semaines</option>
            <option value="custom">📅 Personnalisé</option>
          </select>

          {dateFilter === 'weeks' && (
            <select
              value={weeksAgo}
              onChange={(e) => setWeeksAgo(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value={1}>Dernière semaine</option>
              <option value={2}>2 dernières semaines</option>
              <option value={3}>3 dernières semaines</option>
              <option value={4}>4 dernières semaines</option>
              <option value={8}>2 mois</option>
              <option value={12}>3 mois</option>
            </select>
          )}

          <button
            onClick={findDuplicates}
            disabled={loading}
            className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                Analyser
              </>
            )}
          </button>
        </div>

        {/* Champs de date personnalisée */}
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-4 pl-9 border-t border-gray-100 pt-4">
            <span className="text-sm text-gray-600">Période :</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Du</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Date de début"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">au</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="Date de fin"
              />
            </div>
            <button
              onClick={() => {
                // Raccourci : année en cours
                const year = new Date().getFullYear()
                setDateFrom(`${year}-01-01`)
                setDateTo(`${year}-12-31`)
              }}
              className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-semibold hover:bg-purple-100 transition"
            >
              📅 Année {new Date().getFullYear()}
            </button>
            <button
              onClick={() => {
                // Raccourci : tout effacer
                setDateFrom('')
                setDateTo('')
              }}
              className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-100 transition"
            >
              Effacer
            </button>
          </div>
        )}
      </div>

      {/* Résultats */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Analyse en cours...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              {duplicates.length} groupe{duplicates.length !== 1 ? 's' : ''} de doublons détecté{duplicates.length !== 1 ? 's' : ''}
            </h2>
            <p className="text-sm text-gray-600">
              Expéditions avec le même N° EXP (NIC) mais tracking IDs différents
            </p>
          </div>

          {duplicates.map((dup, index) => (
            <div key={index} className="bg-white rounded-xl border-2 border-orange-200 overflow-hidden">
              <div className="bg-orange-50 px-4 py-3 border-b border-orange-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <h3 className="font-bold text-orange-900">
                    Doublon #{index + 1} - N° EXP: {dup.group[0].nic} ({dup.group.length} expéditions)
                  </h3>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {dup.group.map((item, i) => (
                  <div key={item.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold">
                        {i + 1}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-blue-600">{item.trackingId}</span>

                          {editingNic === item.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={newNic}
                                onChange={(e) => setNewNic(e.target.value)}
                                placeholder="Nouveau NIC"
                                className="px-2 py-1 border border-purple-300 rounded text-xs font-bold w-32"
                                autoFocus
                              />
                              <button
                                onClick={() => updateNic(item.id, item.nic)}
                                disabled={updating}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                OK
                              </button>
                              <button
                                onClick={() => {
                                  setEditingNic(null)
                                  setNewNic('')
                                }}
                                disabled={updating}
                                className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs font-bold hover:bg-gray-400 disabled:opacity-50"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">
                                NIC: {item.nic}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingNic(item.id)
                                  setNewNic(item.nic)
                                }}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 flex items-center gap-1"
                              >
                                <Edit2 className="w-3 h-3" />
                                Modifier
                              </button>
                            </>
                          )}

                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            item.status === 'Livré' ? 'bg-green-100 text-green-700' :
                            item.status === 'En cours de livraison' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {item.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Créé le:</span>
                            <span className="ml-2 font-semibold">{item.createdAt.toLocaleString('fr-FR')}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Agent:</span>
                            <span className="ml-2 font-semibold">{item.agentName || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Expéditeur:</span>
                            <span className="ml-2 font-semibold">{item.sender}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Destinataire:</span>
                            <span className="ml-2 font-semibold">{item.receiver}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Prix:</span>
                            <span className="ml-2 font-semibold text-green-600">{item.price} DH</span>
                          </div>
                          <div>
                            <span className="text-gray-500">COD:</span>
                            <span className="ml-2 font-semibold text-orange-600">{item.codAmount} DH</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {duplicates.length === 0 && !loading && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <div className="text-green-600 text-4xl mb-2">✓</div>
              <h3 className="text-lg font-bold text-green-900 mb-2">
                Aucun doublon détecté
              </h3>
              <p className="text-sm text-green-700">
                Toutes les expéditions sont uniques sur la période sélectionnée
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
