import { useState, useMemo } from 'react'
import { Package, Truck, User, MapPin, Calendar, RotateCcw, Send, Check, X } from 'lucide-react'
import { STATUS_COLORS } from '../../../firebase/constants'

export default function RetoursTab({
  profile,
  allParcels,
  drivers,
  onLoadReturnOnTruck,
  onAssignReturnDriver,
  onMarkReturnedToSender,
}: any) {
  const [selectedParcels, setSelectedParcels] = useState<string[]>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Colis retournés dans cette agence
  const returnedParcels = useMemo(() => {
    if (!Array.isArray(allParcels)) return []

    // Si agence DESTINATION (où le colis a été retourné par livreur)
    const atDestination = allParcels.filter((p: any) =>
      p.status === 'Retourné' &&
      p.destinationCity === profile?.city &&
      !p.returnToCity // Pas encore chargé sur camion retour
    )

    // Si agence SOURCE (où le colis doit revenir)
    const atSource = allParcels.filter((p: any) =>
      (p.status === 'En transit retour' || p.status === 'Retourné') &&
      p.returnToCity === profile?.city // Destination de retour = cette ville
    )

    return {
      toLoad: atDestination, // À charger sur camion retour
      received: atSource,     // Reçus à l'agence expéditeur
    }
  }, [allParcels, profile?.city])

  const toggleSelect = (id: string) => {
    setSelectedParcels(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleLoadOnTruck = async () => {
    if (selectedParcels.length === 0) {
      setError('Sélectionnez au moins un colis')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onLoadReturnOnTruck(selectedParcels)
      setSelectedParcels([])
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const handleAssignDriver = async (parcelId: string) => {
    if (!selectedDriver) {
      setError('Sélectionnez un livreur')
      return
    }
    setLoading(true)
    setError('')
    try {
      const driver = drivers.find((d: any) => d.id === selectedDriver)
      await onAssignReturnDriver(parcelId, driver)
      setSelectedDriver('')
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkReturned = async (parcelId: string) => {
    if (!confirm('Confirmer que ce colis a été retourné à l\'expéditeur ?')) return
    setLoading(true)
    setError('')
    try {
      await onMarkReturnedToSender(parcelId)
    } catch (err: any) {
      setError(err.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Section 1: Colis à charger sur camion retour */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="bg-orange-50 border-b border-orange-100 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-orange-900">
              Retours à charger sur camion ({returnedParcels.toLoad.length})
            </h3>
          </div>
          {selectedParcels.length > 0 && (
            <button
              onClick={handleLoadOnTruck}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              Charger {selectedParcels.length} colis
            </button>
          )}
        </div>
        <div className="p-4">
          {returnedParcels.toLoad.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucun colis à charger</p>
          ) : (
            <div className="space-y-2">
              {returnedParcels.toLoad.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedParcels.includes(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{p.trackingId}</div>
                    <div className="text-xs text-gray-600">
                      {p.sender?.name} → {p.receiver?.name}
                    </div>
                    <div className="text-xs text-orange-600">
                      Retourner vers : {p.originCity}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {p.returnReason || 'Retour'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Colis retournés reçus (à l'agence expéditeur) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">
              Retours reçus à l'agence expéditeur ({returnedParcels.received.length})
            </h3>
          </div>
          <p className="text-xs text-blue-600 mt-1">
            Assignez à un livreur ou marquez comme retourné à l'expéditeur
          </p>
        </div>
        <div className="p-4">
          {returnedParcels.received.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucun retour reçu</p>
          ) : (
            <div className="space-y-3">
              {returnedParcels.received.map((p: any) => (
                <div
                  key={p.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{p.trackingId}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        <div>📦 {p.sender?.name}</div>
                        <div className="text-xs">
                          📍 {p.sender?.address}, {p.sender?.city}
                        </div>
                        <div className="text-xs">📞 {p.sender?.tel}</div>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[p.status]?.bg || 'bg-gray-100'} ${STATUS_COLORS[p.status]?.text || 'text-gray-700'}`}>
                      {p.status}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {/* Assigner à livreur */}
                    <div className="flex-1 flex gap-2">
                      <select
                        value={selectedDriver}
                        onChange={(e) => setSelectedDriver(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="">Assigner à livreur...</option>
                        {drivers
                          .filter((d: any) => d.city === profile?.city && d.role === 'livreur')
                          .map((d: any) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.tel || 'Pas de tél'})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleAssignDriver(p.id)}
                        disabled={!selectedDriver || loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <User className="w-4 h-4" />
                        Assigner
                      </button>
                    </div>

                    {/* Marquer retourné */}
                    <button
                      onClick={() => handleMarkReturned(p.id)}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Retourné à l'expéditeur
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
