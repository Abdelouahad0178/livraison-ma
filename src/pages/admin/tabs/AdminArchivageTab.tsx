import DateInput from '../../../components/DateInput'
import { useState, useEffect } from 'react'
import { Archive, Calendar, RotateCcw, TrendingDown, AlertCircle, CheckCircle, Trash2 } from 'lucide-react'
import { collection, query, where, limit, getDocs, getCountFromServer, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { CITIES } from '../../../firebase/constants'
import AdminArchiveBrowser from '../components/AdminArchiveBrowser'

export default function AdminArchivageTab() {
  const [stats, setStats] = useState<any>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveResult, setArchiveResult] = useState<any>(null)
  const [archiveRevision, setArchiveRevision] = useState(0)
  const [daysInput, setDaysInput] = useState('7')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['Livré', 'Retourné', 'Retour finalisé'])
  const [selectedCity, setSelectedCity] = useState<string>('Toutes')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteResult, setDeleteResult] = useState<any>(null)

  // Nouveaux filtres pour archivage précis
  const [selectedServiceType, setSelectedServiceType] = useState<string>('Tous')
  const [selectedPortType, setSelectedPortType] = useState<string>('Tous')
  const [archiveDateFrom, setArchiveDateFrom] = useState('')
  const [archiveDateTo, setArchiveDateTo] = useState('')

  const functions = getFunctions()
  const ARCHIVABLE_STATUSES = ['Livré', 'Retourné', 'Retour finalisé']
  const SERVICE_TYPES = ['Tous', 'Standard', 'Express', 'Économique', 'Premium']
  const PORT_TYPES = ['Tous', 'Port simple', 'Port contre-remboursement', 'Franco']

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

      const [softArchiveCount, separateArchiveCount] = await Promise.all([
        getCountFromServer(query(collection(db, 'parcels'), where('isArchived', '==', true))),
        getCountFromServer(collection(db, 'parcels_archive'))
      ])
      const archivedInParcels = softArchiveCount.data().count
      const archivedInSeparateCollection = separateArchiveCount.data().count

      setStats({
        totalArchivable,
        totalArchived: archivedInParcels + archivedInSeparateCollection,
        archivedInParcels,
        archivedInSeparateCollection,
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
    const serviceTypeText = selectedServiceType === 'Tous' ? 'tous' : selectedServiceType
    const portTypeText = selectedPortType === 'Tous' ? 'tous' : selectedPortType
    const dateRangeText = archiveDateFrom || archiveDateTo
      ? `Du ${archiveDateFrom || 'début'} au ${archiveDateTo || 'aujourd\'hui'}`
      : 'Toutes dates'

    const confirmMessage = `Archiver les colis:\n• Statuts: ${statusText}\n• Ville: ${cityText}\n• Plus de ${daysInput} jours\n• Type de service: ${serviceTypeText}\n• Type de port: ${portTypeText}\n• ${dateRangeText}\n\nContinuer?`

    if (!confirm(confirmMessage)) return

    setArchiving(true)
    setArchiveResult(null)

    try {
      const manualArchive = httpsCallable(functions, 'manualArchive')
      const result = await manualArchive({
        olderThanDays: parseInt(daysInput),
        statuses: selectedStatuses,
        city: selectedCity === 'Toutes' ? null : selectedCity,
        serviceType: selectedServiceType === 'Tous' ? null : selectedServiceType,
        portType: selectedPortType === 'Tous' ? null : selectedPortType,
        dateFrom: archiveDateFrom || null,
        dateTo: archiveDateTo || null
      })

      setArchiveResult({ success: true, ...(result.data as Record<string, any>) })
      setArchiveRevision(value => value + 1)
      await loadStats()
    } catch (error: any) {
      setArchiveResult({ success: false, error: error.message })
    } finally {
      setArchiving(false)
    }
  }

  // 🗄️ Archivage automatique (soft delete - marque isArchived=true)
  const [autoArchiving, setAutoArchiving] = useState(false)
  const [autoArchiveResult, setAutoArchiveResult] = useState<any>(null)

  const handleAutoArchiving = async () => {
    const confirmMessage = `🗄️ ARCHIVAGE AUTOMATIQUE\n\nMarquer comme archivés tous les colis:\n• TOUS statuts (Livré, En transit, Arrivé, etc.)\n• De plus de 30 jours\n• COD payé (pour livrés uniquement)\n\nLes colis resteront accessibles via recherche.\n\nContinuer?`

    if (!confirm(confirmMessage)) return

    setAutoArchiving(true)
    setAutoArchiveResult(null)

    try {
      const manualArchiving = httpsCallable(functions, 'manualArchiving')
      const result = await manualArchiving()

      setAutoArchiveResult({ success: true, ...(result.data as Record<string, any>) })
      setArchiveRevision(value => value + 1)
      await loadStats()

      const data = result.data as any
      const archived = data?.totalArchived || 0
      const processed = data?.totalProcessed || 0

      alert(`✅ Archivage terminé!\n\n${archived} colis archivés sur ${processed} colis parcourus (+30j)`)
    } catch (error: any) {
      setAutoArchiveResult({ success: false, error: error.message })
      alert('❌ Erreur: ' + error.message)
    } finally {
      setAutoArchiving(false)
    }
  }

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const handleDeleteArchive = async (deleteAll: boolean = false) => {
    const confirmMsg = deleteAll
      ? '⚠️ ATTENTION!\n\nSupprimer TOUTES les archives transférées?\nCette action est IRRÉVERSIBLE!\n\nTaper "SUPPRIMER" pour confirmer:'
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

      setDeleteResult({ success: true, ...(result.data as Record<string, any>) })
      await loadStats()
      setArchiveRevision(value => value + 1)
    } catch (error: any) {
      setDeleteResult({ success: false, error: error.message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl xl:max-w-none xl:w-[95%] mx-auto">
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
            <div className="text-3xl font-bold text-blue-900">{stats.totalArchived.toLocaleString('fr-FR')}</div>
            <div className="text-xs text-blue-700 mt-1">
              {stats.archivedInParcels.toLocaleString('fr-FR')} archivées sur place + {stats.archivedInSeparateCollection.toLocaleString('fr-FR')} transférées aux archives
            </div>
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

      {/* 🗄️ ARCHIVAGE AUTOMATIQUE (SOFT DELETE) */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-300 p-6 mb-6">
        <h2 className="text-xl font-bold text-green-900 mb-3 flex items-center gap-2">
          <Archive className="w-6 h-6 text-green-600" />
          🗄️ Archivage Intelligent (Recommandé)
        </h2>

        <div className="bg-white rounded-lg p-4 mb-4 border border-green-200">
          <p className="text-sm text-gray-700 mb-2">
            <strong className="text-green-700">Archivage soft:</strong> Marque les vieux colis comme archivés sans les supprimer.
          </p>
          <ul className="text-sm text-gray-600 space-y-1 ml-5 list-disc">
            <li><strong>TOUS statuts</strong> (Livré, En transit, Arrivé, Retour, etc.) de <strong>+30 jours</strong></li>
            <li>COD payé vérifié pour les livrés (protection comptable)</li>
            <li>Accessibles via recherche avec checkbox "Inclure archives"</li>
            <li>⚡ Allège le site de ~70-80%</li>
          </ul>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleAutoArchiving}
            disabled={autoArchiving}
            className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
          >
            {autoArchiving ? (
              <>
                <RotateCcw className="w-5 h-5 animate-spin" />
                Archivage en cours...
              </>
            ) : (
              <>
                <Archive className="w-5 h-5" />
                Archiver maintenant (30+ jours)
              </>
            )}
          </button>

          {autoArchiveResult && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              autoArchiveResult.success
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}>
              {autoArchiveResult.success ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  {autoArchiveResult.totalArchived} colis archivés
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5" />
                  {autoArchiveResult.error}
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-500 bg-gray-50 rounded p-3 border border-gray-200">
          ⏰ <strong>Automatique:</strong> Chaque samedi à 2h00 du matin (heure Casablanca)
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-600" />
          Archivage Manuel (Ancien système)
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
                {['Toutes', ...CITIES].map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type de service (optionnel):
              </label>
              <select
                value={selectedServiceType}
                onChange={e => setSelectedServiceType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                {SERVICE_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type de port (optionnel):
              </label>
              <select
                value={selectedPortType}
                onChange={e => setSelectedPortType(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                {PORT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date de création du (optionnel):
              </label>
              <DateInput
                value={archiveDateFrom}
                onChange={e => setArchiveDateFrom(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date de création au (optionnel):
              </label>
              <DateInput
                value={archiveDateTo}
                onChange={e => setArchiveDateTo(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
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
          Supprimer les archives transférées
        </h2>
        <p className="text-sm text-gray-600 mb-4">Ces actions concernent les archives transférées par l’ancien système.</p>

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

      <AdminArchiveBrowser revision={archiveRevision} onRestored={loadStats} />
    </div>
  )
}
