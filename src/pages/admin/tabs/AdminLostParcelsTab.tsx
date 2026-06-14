import { useState, useEffect } from 'react'
import { AlertTriangle, Search, Filter, Trash2, CheckCircle, XCircle } from 'lucide-react'
import { getAllLostParcels, deleteLostParcel, LostParcelDeclaration } from '../../../firebase/lostParcels'

export default function AdminLostParcelsTab() {
  const [lostParcels, setLostParcels] = useState<LostParcelDeclaration[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'declared' | 'found' | 'confirmed_lost'>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    loadLostParcels()
  }, [])

  const loadLostParcels = async () => {
    setLoading(true)
    try {
      const all = await getAllLostParcels()
      all.sort((a, b) => b.declaredAt.toMillis() - a.declaredAt.toMillis())
      setLostParcels(all)
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (lp: LostParcelDeclaration) => {
    if (confirmDelete !== lp.id) {
      setConfirmDelete(lp.id)
      setTimeout(() => setConfirmDelete(null), 3000)
      return
    }
    setDeleting(lp.id)
    try {
      await deleteLostParcel(lp.id, lp.parcelId)
      setConfirmDelete(null)
      await loadLostParcels()
      alert('✅ Supprimé')
    } catch (error: any) {
      alert('❌ ' + error.message)
    } finally {
      setDeleting(null)
    }
  }

  const filtered = lostParcels.filter(lp => {
    const matchSearch = !searchTerm || lp.trackingId.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === 'all' || lp.status === statusFilter
    return matchSearch && matchStatus
  })

  const stats = {
    total: lostParcels.length,
    declared: lostParcels.filter(lp => lp.status === 'declared' || lp.status === 'searching').length,
    found: lostParcels.filter(lp => lp.status === 'found').length,
    lost: lostParcels.filter(lp => lp.status === 'confirmed_lost').length
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          <div>
            <h2 className="font-bold text-gray-800">Tous les colis perdus</h2>
            <p className="text-sm text-gray-600">{stats.total} déclarations au total</p>
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-semibold">🔍 {stats.declared} en recherche</span>
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">✅ {stats.found} trouvés</span>
          <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full font-semibold">❌ {stats.lost} perdus</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher..." className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none" />
        </div>

        <div className="flex gap-2">
          {[
            { key: 'all', label: 'Tous', count: stats.total },
            { key: 'declared', label: 'En recherche', count: stats.declared },
            { key: 'found', label: 'Trouvés', count: stats.found },
            { key: 'confirmed_lost', label: 'Perdus', count: stats.lost }
          ].map(({ key, label, count }) => (
            <button key={key} onClick={() => setStatusFilter(key as any)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${statusFilter === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl"><p className="text-gray-500">Aucun colis</p></div>
        ) : (
          filtered.map(lp => (
            <div key={lp.id} className="bg-white border-2 border-gray-200 rounded-xl p-4">
              <div className="flex justify-between mb-3">
                <div>
                  <p className="font-mono font-bold text-lg text-red-700">{lp.trackingId}</p>
                  <p className="text-sm text-gray-600">{lp.declaredAt.toDate().toLocaleDateString('fr-FR')}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${lp.status === 'found' ? 'bg-green-100 text-green-700' : lp.status === 'confirmed_lost' ? 'bg-gray-200 text-gray-700' : 'bg-amber-100 text-amber-700'}`}>
                  {lp.status === 'found' ? '✅ Trouvé' : lp.status === 'confirmed_lost' ? '❌ Perdu' : '🔍 Recherche'}
                </span>
              </div>
              <div className="space-y-1 mb-3 text-sm">
                <p><strong>Localisation :</strong> {lp.lastKnownLocation}</p>
                <p><strong>Détails :</strong> {lp.details}</p>
                <p><strong>Déclaré par :</strong> {lp.declaredBy.name} ({lp.declaredBy.role} - {lp.declaredBy.city})</p>
                <p><strong>Réponses :</strong> {Object.values(lp.responses).filter(r => r.responded).length} / {Object.keys(lp.responses).length} agences</p>
              </div>

              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Réponses des agences :</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(lp.responses).map(([city, resp]) => (
                    <div key={city} className={`p-2 rounded text-xs ${resp.responded ? (resp.found ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200') : 'bg-amber-50 border border-amber-200'}`}>
                      <div className="flex items-center gap-1">
                        {resp.responded ? (resp.found ? <CheckCircle className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-gray-500" />) : <AlertTriangle className="w-3 h-3 text-amber-600" />}
                        <span className="font-semibold">{city}</span>
                      </div>
                      {resp.comment && <p className="text-gray-600 mt-1">"{resp.comment}"</p>}
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={() => handleDelete(lp)} disabled={deleting === lp.id} className={`w-full mt-3 px-4 py-2 rounded-lg text-sm font-semibold ${confirmDelete === lp.id ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                {deleting === lp.id ? '...' : confirmDelete === lp.id ? '⚠️ Confirmer ?' : '🗑️ Supprimer'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
