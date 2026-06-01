import { useState, useEffect } from 'react'
import { Archive, Download, Server, AlertCircle, CheckCircle, Clock, TrendingDown } from 'lucide-react'
import {
  getColisArchivables,
  archiverColis,
  getStatistiquesArchivage,
  exporterColisJSON,
  exporterColisCSV,
  telechargerFichier,
  POLITIQUES_PREDEFINIES,
  ArchivagePolicy,
  ArchivageResult
} from '../../../firebase/archivage'
import { CITIES } from '../../../firebase/constants'

export default function AdminArchivageTab() {
  const [serverUrl, setServerUrl] = useState('http://localhost:3001')
  const [selectedPolicy, setSelectedPolicy] = useState<keyof typeof POLITIQUES_PREDEFINIES>('STANDARD')
  const [selectedCity, setSelectedCity] = useState<string>('all')
  const [stats, setStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [lastResult, setLastResult] = useState<ArchivageResult | null>(null)

  // Charger les statistiques
  useEffect(() => {
    loadStats()
  }, [selectedCity])

  const loadStats = async () => {
    setLoadingStats(true)
    try {
      const city = selectedCity === 'all' ? undefined : selectedCity
      const statistics = await getStatistiquesArchivage(city)
      setStats(statistics)
    } catch (error) {
      console.error('Erreur stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const handleArchiver = async () => {
    if (!confirm(`Archiver ${stats?.total || 0} colis vers ${serverUrl} ?`)) {
      return
    }

    setArchiving(true)
    setLastResult(null)

    try {
      const city = selectedCity === 'all' ? undefined : selectedCity
      const policy = POLITIQUES_PREDEFINIES[selectedPolicy]
      const colis = await getColisArchivables(city, policy)

      const result = await archiverColis(colis, serverUrl, policy)
      setLastResult(result)

      if (result.success) {
        await loadStats()  // Recharger les stats
      }
    } catch (error: any) {
      setLastResult({
        success: false,
        archived: 0,
        errors: stats?.total || 0,
        details: [`Erreur: ${error.message}`]
      })
    } finally {
      setArchiving(false)
    }
  }

  const handleExportJSON = async () => {
    const city = selectedCity === 'all' ? undefined : selectedCity
    const policy = POLITIQUES_PREDEFINIES[selectedPolicy]
    const colis = await getColisArchivables(city, policy)

    const json = exporterColisJSON(colis)
    const date = new Date().toISOString().split('T')[0]
    telechargerFichier(json, `archive-${date}.json`, 'application/json')
  }

  const handleExportCSV = async () => {
    const city = selectedCity === 'all' ? undefined : selectedCity
    const policy = POLITIQUES_PREDEFINIES[selectedPolicy]
    const colis = await getColisArchivables(city, policy)

    const csv = exporterColisCSV(colis)
    const date = new Date().toISOString().split('T')[0]
    telechargerFichier(csv, `archive-${date}.csv`, 'text/csv')
  }

  const policy = POLITIQUES_PREDEFINIES[selectedPolicy]

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Archive className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Archivage Local</h2>
            <p className="text-white/90 text-sm mt-1">
              Archivez les anciens colis sur serveur local pour optimiser Firestore
            </p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Server className="w-5 h-5 text-purple-600" />
          Configuration
        </h3>

        <div className="grid md:grid-cols-3 gap-4">
          {/* URL Serveur */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              URL Serveur Local
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              placeholder="http://localhost:3001"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Politique */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              Politique d'Archivage
            </label>
            <select
              value={selectedPolicy}
              onChange={e => setSelectedPolicy(e.target.value as any)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            >
              <option value="CONSERVATIVE">Conservative (6 mois)</option>
              <option value="STANDARD">Standard (3 mois)</option>
              <option value="AGGRESSIVE">Aggressive (1 mois)</option>
            </select>
          </div>

          {/* Ville */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              Ville
            </label>
            <select
              value={selectedCity}
              onChange={e => setSelectedCity(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            >
              <option value="all">Toutes les villes</option>
              {CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Détails Politique */}
        <div className="mt-4 bg-purple-50 rounded-xl p-4">
          <h4 className="text-xs font-bold text-purple-900 mb-2">Critères d'Archivage</h4>
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-purple-600 font-semibold">Délai:</span>{' '}
              <span className="text-purple-900">{policy.delaiMinimumJours} jours</span>
            </div>
            <div>
              <span className="text-purple-600 font-semibold">Statuts:</span>{' '}
              <span className="text-purple-900">{policy.statutsArchivables.join(', ')}</span>
            </div>
            <div>
              <span className="text-purple-600 font-semibold">COD payé:</span>{' '}
              <span className="text-purple-900">{policy.seulementCodPaye ? 'Oui' : 'Non'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-indigo-600" />
            Colis Archivables
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl p-4 text-white text-center">
              <p className="text-3xl font-black">{stats.total}</p>
              <p className="text-xs font-medium opacity-90 mt-1">Total archivables</p>
            </div>

            {Object.entries(stats.parStatut).map(([statut, count]: [string, any]) => {
              const colors: Record<string, string> = {
                'Livré': 'from-green-500 to-emerald-600',
                'Retourné': 'from-orange-500 to-red-600',
                'Annulé': 'from-gray-500 to-slate-600'
              }
              return (
                <div key={statut} className={`bg-gradient-to-br ${colors[statut] || 'from-blue-500 to-cyan-600'} rounded-xl p-4 text-white text-center`}>
                  <p className="text-2xl font-black">{count}</p>
                  <p className="text-xs font-medium opacity-90 mt-1">{statut}</p>
                </div>
              )
            })}
          </div>

          {/* Par mois */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="text-xs font-bold text-gray-600 mb-3">Répartition par Mois</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {Object.entries(stats.parMois)
                .sort(([a], [b]) => b.localeCompare(a))
                .slice(0, 12)
                .map(([mois, count]: [string, any]) => (
                  <div key={mois} className="flex justify-between items-center bg-white rounded-lg px-3 py-2">
                    <span className="text-gray-600 font-medium">{mois}</span>
                    <span className="text-purple-600 font-bold">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-800 mb-4">Actions</h3>

        <div className="grid md:grid-cols-3 gap-3">
          {/* Archiver vers Serveur */}
          <button
            onClick={handleArchiver}
            disabled={archiving || !stats?.total}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Archive className="w-5 h-5" />
            {archiving ? 'Archivage...' : `Archiver ${stats?.total || 0} colis`}
          </button>

          {/* Export JSON */}
          <button
            onClick={handleExportJSON}
            disabled={!stats?.total}
            className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            Export JSON
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            disabled={!stats?.total}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Résultat */}
      {lastResult && (
        <div className={`rounded-2xl border p-6 ${lastResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-start gap-3">
            {lastResult.success ? (
              <CheckCircle className="w-6 h-6 text-green-600 shrink-0 mt-1" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-1" />
            )}
            <div className="flex-1">
              <h4 className={`font-bold ${lastResult.success ? 'text-green-900' : 'text-red-900'}`}>
                {lastResult.success ? 'Archivage Réussi' : 'Erreur d\'Archivage'}
              </h4>
              <div className={`mt-2 text-sm space-y-1 ${lastResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {lastResult.details.map((detail, i) => (
                  <p key={i}>• {detail}</p>
                ))}
                {lastResult.success && (
                  <p className="font-semibold mt-3">
                    ✅ {lastResult.archived} colis archivés et supprimés de Firestore
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4" />
          Comment ça marche ?
        </h4>
        <div className="text-xs text-blue-800 space-y-1">
          <p>1. <strong>Sélectionnez</strong> la politique d'archivage (délai minimum avant archivage)</p>
          <p>2. <strong>Vérifiez</strong> le nombre de colis archivables dans les statistiques</p>
          <p>3. <strong>Exportez</strong> en JSON/CSV pour sauvegarde locale OU</p>
          <p>4. <strong>Archivez</strong> vers serveur local (les colis seront supprimés de Firestore)</p>
          <p className="mt-2 font-semibold">⚠️ Assurez-vous que votre serveur local est démarré sur {serverUrl}</p>
        </div>
      </div>
    </div>
  )
}
