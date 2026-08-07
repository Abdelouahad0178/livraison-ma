import { useState, useEffect } from 'react'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { AlertTriangle, Calendar, Package, User } from 'lucide-react'

interface Duplicate {
  group: Array<{
    id: string
    trackingId: string
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
  const [weeksAgo, setWeeksAgo] = useState(3)

  const findDuplicates = async () => {
    setLoading(true)
    try {
      const weeksAgoDate = new Date()
      weeksAgoDate.setDate(weeksAgoDate.getDate() - (weeksAgo * 7))

      const parcelsRef = collection(db, 'parcels')
      const q = query(
        parcelsRef,
        where('createdAt', '>=', Timestamp.fromDate(weeksAgoDate))
      )

      const snapshot = await getDocs(q)

      // Grouper par clé unique
      const groups = new Map<string, any[]>()

      snapshot.forEach(doc => {
        const parcel = doc.data()
        const createdAt = parcel.createdAt?.toDate() || new Date()

        const key = [
          parcel.sender?.name || '',
          parcel.sender?.tel || '',
          parcel.receiver?.name || '',
          parcel.receiver?.tel || '',
          parcel.price || 0,
          parcel.codAmount || 0,
          parcel.weight || 0
        ].join('|').toLowerCase()

        if (!groups.has(key)) {
          groups.set(key, [])
        }

        groups.get(key)!.push({
          id: doc.id,
          trackingId: parcel.trackingId,
          createdAt,
          sender: parcel.sender?.name,
          receiver: parcel.receiver?.name,
          price: parcel.price,
          codAmount: parcel.codAmount,
          agentName: parcel.agentName,
          status: parcel.status
        })
      })

      // Filtrer les doublons (créés dans les 10 secondes)
      const foundDuplicates: Duplicate[] = []

      groups.forEach(items => {
        if (items.length > 1) {
          for (let i = 0; i < items.length - 1; i++) {
            for (let j = i + 1; j < items.length; j++) {
              const timeDiff = Math.abs(items[i].createdAt - items[j].createdAt) / 1000
              if (timeDiff <= 10) {
                foundDuplicates.push({
                  group: items,
                  timeDiff
                })
                break
              }
            }
          }
        }
      })

      setDuplicates(foundDuplicates)
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    findDuplicates()
  }, [])

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
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
        <Calendar className="w-5 h-5 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Période :</span>
        <select
          value={weeksAgo}
          onChange={(e) => setWeeksAgo(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value={1}>Dernière semaine</option>
          <option value={2}>2 dernières semaines</option>
          <option value={3}>3 dernières semaines</option>
          <option value={4}>4 dernières semaines</option>
        </select>
        <button
          onClick={findDuplicates}
          disabled={loading}
          className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Analyse en cours...' : 'Analyser'}
        </button>
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
              Expéditions identiques créées à moins de 10 secondes d'intervalle
            </p>
          </div>

          {duplicates.map((dup, index) => (
            <div key={index} className="bg-white rounded-xl border-2 border-orange-200 overflow-hidden">
              <div className="bg-orange-50 px-4 py-3 border-b border-orange-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <h3 className="font-bold text-orange-900">
                    Doublon #{index + 1} - Écart: {dup.timeDiff.toFixed(1)} secondes
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
                        <div className="flex items-center gap-3">
                          <Package className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-blue-600">{item.trackingId}</span>
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
