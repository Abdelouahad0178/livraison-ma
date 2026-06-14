import { useState, useEffect } from 'react'
import { Archive, Calendar, RotateCcw, Search, TrendingDown, AlertCircle, CheckCircle, Trash2 } from 'lucide-react'
import { collection, query, where, orderBy, limit, getDocs, doc, deleteDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { getFunctions, httpsCallable } from 'firebase/functions'

export default function AdminArchivageTab() {
  const [stats, setStats] = useState<any>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveResult, setArchiveResult] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [archivedParcels, setArchivedParcels] = useState<any[]>([])
  const [loadingArchives, setLoadingArchives] = useState(false)
  const [daysInput, setDaysInput] = useState('7')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['Livré', 'Retourné', 'Retour finalisé'])
  const [selectedCity, setSelectedCity] = useState<string>('Toutes')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState<any>(null)

  const functions = getFunctions()
  const CITIES = ['Toutes', 'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan']
  const ARCHIVABLE_STATUSES = ['Livré', 'Retourné', 'Retour finalisé']

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const now = new Date()
      const days7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const days7AgoTimestamp = Timestamp.fromDate(days7Ago)

      const archivableStatuses = ['Livré', 'Retourné', 'Retour finalisé']
      let totalArchivable = 0

      for (const status of archivableStatuses) {
        const q = query(
          collection(db, 'parcels'),
          where('status', '==', status),
          where('createdAt', '<', days7AgoTimestamp),
          limit(1000)
        )
        const snapshot = await getDocs(q)
        totalArchivable += snapshot.size
      }

      const archiveSnapshot = await getDocs(query(collection(db, 'parcels_archive'), limit(1000)))

      setStats({
        totalArchivable,
        totalArchived: archiveSnapshot.size,
        estimatedSavings: `${((totalArchivable * 0.5) / 1000).toFixed(2)} €/mois`
      })
    } catch (error) {
      console.error('Erreur stats:', error)
    }
  }

  const handleManualArchive = async () => {
    if (selectedStatuses.length === 0) {
      alert('⚠️ Sélectionnez au moins un statut')
      return
    }

    const statusText = selectedStatuses.join(', ')
    const cityText = selectedCity === 'Toutes' ? 'toutes les villes' : selectedCity
    if (!confirm(`Archiver les colis:\n• Status: ${statusText}\n• Ville: ${cityText}\n• Plus de ${daysInput} jours\n\nContinuer?`)) return

    setArchiving(true)
    setArchiveResult(null)

    try {
      const manualArchive = httpsCallable(functions, 'manualArchive')
      const result = await manualArchive({
        olderThanDays: parseInt(daysInput),
        statuses: selectedStatuses,
        city: selectedCity === 'Toutes' ? null : selectedCity
      })

      setArchiveResult({ success: true, ...result.data })
      await loadStats()
    } catch (error: any) {
      setArchiveResult({ success: false, error: error.message })
    } finally {
      setArchiving(false)
    }
  }

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const handleSearchArchive = async () => {
    if (!searchQuery.trim()) {
      alert('⚠️ Entrez un terme de recherche')
      return
    }

    setLoadingArchives(true)
    try {
      const q = query(collection(db, 'parcels_archive'), limit(100))
      const snapshot = await getDocs(q)
      const parcels = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((p: any) =>
          p.trackingId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.sender?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.receiver?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a: any, b: any) => {
          const dateA = a.archivedAt?.toDate?.() || new Date(0)
          const dateB = b.archivedAt?.toDate?.() || new Date(0)
          return dateB.getTime() - dateA.getTime()
        })

      setArchivedParcels(parcels)
      if (parcels.length === 0) {
        alert(`Aucun résultat pour "${searchQuery}"`)
      }
    } catch (error: any) {
      console.error('Erreur recherche:', error)
      alert('❌ Erreur: ' + error.message)
    } finally {
      setLoadingArchives(false)
    }
  }

  const handleRestoreParcel = async (parcel: any) => {
    if (!confirm(`Restaurer le colis ${parcel.trackingId}?`)) return

    try {
      const { archivedAt, archivedReason, archivedBy, archivedByName, ...parcelData } = parcel
      await setDoc(doc(db, 'parcels', parcel.id), parcelData)
      await deleteDoc(doc(db, 'parcels_archive', parcel.id))

      setArchivedParcels(prev => prev.filter(p => p.id !== parcel.id))
      await loadStats()

      alert('✅ Colis restauré!')
    } catch (error: any) {
      alert('❌ Erreur: ' + error.message)
    }
  }

  const handleDeleteArchive = async (deleteAll: boolean = false) => {
    const confirmMsg = deleteAll
      ? '⚠️ ATTENTION!\n\nSupprimer TOUTES les archives?\nCette action est IRRÉVERSIBLE!\n\nTaper "SUPPRIMER" pour confirmer:'
      : `Supprimer les archives de plus de ${daysInput} jours?\n\nCette action est IRRÉVERSIBLE!`

    if (deleteAll) {
      const userInput = prompt(confirmMsg)
      if (userInput !== 'SUPPRIMER') return
    } else {
      if (!confirm(confirmMsg)) return
    }

    setDeleting(true)
    setDeleteResult(null)

    try {
      const deleteArchive = httpsCallable(functions, 'deleteArchive')
      const result = await deleteArchive({
        deleteAll,
        olderThanDays: deleteAll ? null : parseInt(daysInput)
      })

      setDeleteResult({ success: true, ...result.data })
      await loadStats()
      setArchivedParcels([])
    } catch (error: any) {
      setDeleteResult({ success: false, error: error.message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Archive className="w-8 h-8 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Archivage Automatique</h1>
          <p className="text-sm text-gray-600">Optimisation performances - Archive chaque nuit à 2h</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200">
            <div className="flex items-center gap-3 mb-2">
              <Archive className="w-6 h-6 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">Archivables</span>
            </div>
            <div className="text-3xl font-bold text-purple-900">{stats.totalArchivable}</div>
            <div className="text-xs text-purple-700 mt-1">Colis &gt; 7 jours</div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown className="w-6 h-6 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Archivés</span>
            </div>
            <div className="text-3xl font-bold text-blue-900">{stats.totalArchived}</div>
            <div className="text-xs text-blue-700 mt-1">Dans parcels_archive</div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="w-6 h-6 text-green-600" />
              <span className="text-sm font-medium text-green-900">Économies</span>
            </div>
            <div className="text-3xl font-bold text-green-900">{stats.estimatedSavings}</div>
            <div className="text-xs text-green-700 mt-1">Réduction Firebase</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-600" />
          Archivage Manuel
        </h2>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <strong>🔄 Automatique:</strong> Chaque nuit à 2h, archive colis &gt; 7 jours (statuts finaux). Optimisé pour 2000 colis/jour.
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Colis de plus de (jours):
              </label>
              <input
                type="number"
                value={daysInput}
                onChange={e => setDaysInput(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                min="30"
                max="365"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ville (optionnel):
              </label>
              <select
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                {CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Statuts à archiver:
            </label>
            <div className="flex flex-wrap gap-2">
              {ARCHIVABLE_STATUSES.map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    selectedStatuses.includes(status)
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleManualArchive}
            disabled={archiving || selectedStatuses.length === 0}
            className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-bold"
          >
            {archiving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Archivage en cours...
              </>
            ) : (
              <>
                <Archive className="w-5 h-5" />
                🚀 Archiver maintenant
              </>
            )}
          </button>
        </div>

        {archiveResult && (
          <div className={`mt-4 p-4 rounded-lg ${archiveResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {archiveResult.success ? (
              <div className="text-green-900">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <strong>Archivage terminé!</strong>
                </div>
                <p className="text-sm mt-1">{archiveResult.totalArchived} colis archivés</p>
                <p className="text-xs text-green-700 mt-1">Limite: {new Date(archiveResult.cutoffDate).toLocaleDateString('fr-MA')}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                >
                  🔄 Recharger la page pour voir les changements
                </button>
              </div>
            ) : (
              <div className="text-red-900">
                <strong>❌ Erreur:</strong> {archiveResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-red-100 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-red-600" />
          Supprimer les Archives
        </h2>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-900">
              <strong>⚠️ DANGER:</strong> La suppression des archives est <strong>IRRÉVERSIBLE</strong>. Les colis supprimés ne pourront PAS être récupérés.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleDeleteArchive(false)}
            disabled={deleting}
            className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
          >
            {deleting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Suppression...
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                Supprimer archives &gt; {daysInput} jours
              </>
            )}
          </button>

          <button
            onClick={() => handleDeleteArchive(true)}
            disabled={deleting}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-bold"
          >
            {deleting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Suppression...
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5" />
                🗑️ SUPPRIMER TOUT
              </>
            )}
          </button>
        </div>

        {deleteResult && (
          <div className={`mt-4 p-4 rounded-lg ${deleteResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {deleteResult.success ? (
              <div className="text-green-900">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  <strong>Suppression terminée!</strong>
                </div>
                <p className="text-sm mt-1">{deleteResult.totalDeleted} archives supprimées définitivement</p>
              </div>
            ) : (
              <div className="text-red-900">
                <strong>❌ Erreur:</strong> {deleteResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-blue-600" />
          Consulter Archives
        </h2>

        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSearchArchive()}
            placeholder="Rechercher (tracking, expéditeur, destinataire)..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearchArchive}
            disabled={loadingArchives}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loadingArchives ? 'Recherche...' : 'Rechercher'}
          </button>
        </div>

        {archivedParcels.length > 0 && (
          <div className="space-y-2">
            {archivedParcels.map(parcel => (
              <div key={parcel.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <div className="font-mono font-bold text-gray-900">{parcel.trackingId}</div>
                  <div className="text-sm text-gray-600">
                    {parcel.sender?.name} → {parcel.receiver?.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Archivé: {parcel.archivedAt?.toDate?.()?.toLocaleDateString('fr-MA') || 'N/A'}
                  </div>
                </div>
                <button
                  onClick={() => handleRestoreParcel(parcel)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restaurer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
