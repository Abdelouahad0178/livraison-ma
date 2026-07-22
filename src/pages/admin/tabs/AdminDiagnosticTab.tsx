import { useState } from 'react'
import { BarChart3, AlertTriangle, CheckCircle } from 'lucide-react'
import { getAllParcels } from '../../../firebase/parcels'
import { CITIES } from '../../../firebase/constants'

export default function AdminDiagnosticTab() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  const runDiagnostic = async () => {
    setLoading(true)
    setResults(null)

    try {
      console.log('📊 Chargement de tous les colis...')
      const parcels = await getAllParcels()
      console.log(`✅ ${parcels.length} colis chargés`)

      // Analyser
      const cityStats: Record<string, { origin: number, destination: number, sender: number, receiver: number, total: number }> = {}
      CITIES.forEach(city => {
        cityStats[city] = { origin: 0, destination: 0, sender: 0, receiver: 0, total: 0 }
      })

      let withCity = 0
      let withoutCity = 0
      const orphans: any[] = []

      let singleCity = 0  // Colis avec une seule ville
      let multiCity = 0   // Colis avec plusieurs villes différentes
      let zeroCities = 0  // Colis sans aucune ville

      parcels.forEach((p: any) => {
        const originCity = p.originCity
        const destCity = p.destinationCity

        if (!originCity && !destCity) {
          withoutCity++
          orphans.push({
            id: p.trackingId || p.id,
            senderCity: p.sender?.city || 'N/A',
            receiverCity: p.receiver?.city || 'N/A'
          })
        } else {
          withCity++
        }

        const senderCity = p.sender?.city
        const receiverCity = p.receiver?.city

        // Compter séparément chaque champ
        if (originCity && cityStats[originCity]) {
          cityStats[originCity].origin++
        }
        if (destCity && cityStats[destCity]) {
          cityStats[destCity].destination++
        }
        if (senderCity && cityStats[senderCity]) {
          cityStats[senderCity].sender++
        }
        if (receiverCity && cityStats[receiverCity]) {
          cityStats[receiverCity].receiver++
        }

        // Compter pour total chef d'agence: un colis compte si AU MOINS un champ correspond
        const citiesForThisParcel = new Set<string>()
        if (originCity) citiesForThisParcel.add(originCity)
        if (destCity) citiesForThisParcel.add(destCity)
        if (senderCity) citiesForThisParcel.add(senderCity)
        if (receiverCity) citiesForThisParcel.add(receiverCity)

        // Analyser combien de villes différentes
        if (citiesForThisParcel.size === 0) {
          zeroCities++
        } else if (citiesForThisParcel.size === 1) {
          singleCity++
        } else {
          multiCity++
        }

        citiesForThisParcel.forEach(city => {
          if (cityStats[city]) {
            cityStats[city].total++
          }
        })
      })

      // Calculer la somme
      const sumTotal = Object.values(cityStats).reduce((sum, stats) => sum + stats.total, 0)

      setResults({
        totalParcels: parcels.length,
        withCity,
        withoutCity,
        orphans,
        cityStats,
        sumTotal,
        singleCity,
        multiCity,
        zeroCities
      })
    } catch (error) {
      console.error('❌ Erreur:', error)
      alert('Erreur: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const difference = results ? Math.abs(results.totalParcels - results.sumTotal) : 0

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-6 shadow-xl text-white">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8" />
          <div>
            <h2 className="text-2xl font-black">Diagnostic Villes</h2>
            <p className="text-purple-100 text-sm mt-1">
              Compare le total Admin vs la somme des colis par ville (chefs d'agence)
            </p>
          </div>
        </div>
      </div>

      {/* Bouton lancer */}
      {!results && (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
          <p className="text-gray-600 mb-4">
            Cet outil va charger <strong>tous les colis</strong> et analyser leur répartition par ville.
          </p>
          <button
            onClick={runDiagnostic}
            disabled={loading}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? '⏳ Analyse en cours...' : '🚀 Lancer le diagnostic'}
          </button>
        </div>
      )}

      {/* Résultats */}
      {results && (
        <>
          {/* Vue d'ensemble */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">📊 Vue d'ensemble</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-gray-600 font-medium">Total colis dans la base</span>
                <span className="text-2xl font-black text-blue-600">{results.totalParcels.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-gray-600 font-medium">Colis avec UNE seule ville</span>
                <span className="text-xl font-bold text-green-600">{results.singleCity.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-gray-600 font-medium">Colis avec PLUSIEURS villes</span>
                <span className="text-xl font-bold text-purple-600">{results.multiCity.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-gray-600 font-medium">Colis SANS ville (orphelins)</span>
                <span className="text-xl font-bold text-red-600">{results.withoutCity.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Flux Entrée/Sortie par ville */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">🔄 Flux Entrée/Sortie par ville</h3>
            <p className="text-sm text-gray-600 mb-4">
              <strong>Vérification cohérence:</strong> Les colis qui PARTENT de toutes les villes = Les colis qui ARRIVENT dans toutes les villes = Total
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-gray-700">Ville</th>
                    <th className="px-3 py-2 text-right font-bold text-red-700">📤 Envois<br/>(originCity)</th>
                    <th className="px-3 py-2 text-right font-bold text-green-700">📥 Réceptions<br/>(destinationCity)</th>
                    <th className="px-3 py-2 text-right font-bold text-gray-600">sender.city</th>
                    <th className="px-3 py-2 text-right font-bold text-gray-600">receiver.city</th>
                    <th className="px-3 py-2 text-right font-bold text-blue-700 bg-blue-50">Balance<br/>(Envois+Réceptions)</th>
                  </tr>
                </thead>
                <tbody>
                  {CITIES.map(city => {
                    const stats = results.cityStats[city]
                    const balance = stats.origin + stats.destination
                    return (
                      <tr key={city} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-800">{city}</td>
                        <td className="px-3 py-2 text-right text-red-600 font-semibold">{stats.origin.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-green-600 font-semibold">{stats.destination.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{stats.sender.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{stats.receiver.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-600 bg-blue-50">{balance.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gradient-to-r from-red-50 to-green-50 font-bold border-t-4 border-gray-400">
                    <td className="px-4 py-4 text-right text-gray-800">TOTAUX</td>
                    <td className="px-4 py-4 text-right text-xl text-red-700 bg-red-100">
                      {Object.values(results.cityStats).reduce((sum: number, s: any) => sum + s.origin, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right text-xl text-green-700 bg-green-100">
                      {Object.values(results.cityStats).reduce((sum: number, s: any) => sum + s.destination, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-600">
                      {Object.values(results.cityStats).reduce((sum: number, s: any) => sum + s.sender, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-600">
                      {Object.values(results.cityStats).reduce((sum: number, s: any) => sum + s.receiver, 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-right text-xl text-blue-700 bg-blue-100">
                      {Object.values(results.cityStats).reduce((sum: number, s: any) => sum + s.origin + s.destination, 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr className="bg-gradient-to-r from-purple-50 to-blue-50 font-bold border-t-2 border-purple-300">
                    <td colSpan={5} className="px-4 py-4 text-right text-gray-800">
                      TOTAL RÉEL (colis uniques)
                    </td>
                    <td className="px-4 py-4 text-right text-2xl text-purple-700 bg-purple-100">
                      {results.totalParcels.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Analyse */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 mb-4">⚠️ Analyse</h3>

            {/* Colis orphelins */}
            {results.withoutCity > 0 ? (
              <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-bold text-amber-900 mb-2">
                      {results.withoutCity} colis orphelins détectés
                    </h4>
                    <p className="text-sm text-amber-800 mb-2">
                      Ces colis n'ont ni <code className="bg-amber-100 px-1 rounded">originCity</code> ni <code className="bg-amber-100 px-1 rounded">destinationCity</code> définis.
                      Ils ne seront vus par aucun chef d'agence!
                    </p>
                    {results.orphans.length > 0 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer font-semibold text-amber-900 hover:text-amber-700">
                          Voir les {Math.min(results.orphans.length, 50)} premiers orphelins
                        </summary>
                        <div className="mt-3 bg-white rounded border border-amber-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-amber-100">
                              <tr>
                                <th className="px-3 py-2 text-left">ID</th>
                                <th className="px-3 py-2 text-left">sender.city</th>
                                <th className="px-3 py-2 text-left">receiver.city</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.orphans.slice(0, 50).map((o: any, i: number) => (
                                <tr key={i} className="border-b border-amber-100">
                                  <td className="px-3 py-2 font-mono text-xs">{o.id}</td>
                                  <td className="px-3 py-2">{o.senderCity}</td>
                                  <td className="px-3 py-2">{o.receiverCity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-green-900">Aucun colis orphelin</h4>
                    <p className="text-sm text-green-800">
                      Tous les colis ont une ville d'origine ou de destination définie.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Vérification cohérence flux */}
            {(() => {
              const totalEnvois = Object.values(results.cityStats).reduce((sum: number, s: any) => sum + s.origin, 0)
              const totalReceptions = Object.values(results.cityStats).reduce((sum: number, s: any) => sum + s.destination, 0)
              const coherent = (totalEnvois === totalReceptions && totalEnvois === results.totalParcels)

              return coherent ? (
                <div className="bg-green-50 border-l-4 border-green-500 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-green-900 mb-2">✅ Flux cohérents</h4>
                      <div className="text-sm text-green-800 space-y-2">
                        <p className="font-semibold">Bilan matière correct:</p>
                        <div className="bg-green-100 p-3 rounded space-y-1">
                          <p>📤 Total ENVOIS (originCity): <strong>{totalEnvois.toLocaleString()}</strong></p>
                          <p>📥 Total RÉCEPTIONS (destinationCity): <strong>{totalReceptions.toLocaleString()}</strong></p>
                          <p>📦 Total colis uniques: <strong>{results.totalParcels.toLocaleString()}</strong></p>
                        </div>
                        <p className="pt-2">
                          ✓ Chaque colis qui PART d'une ville ARRIVE dans une autre<br/>
                          ✓ Aucun colis perdu ou en double
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border-l-4 border-red-500 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-red-900 mb-2">⚠️ INCOHÉRENCE DÉTECTÉE</h4>
                      <div className="text-sm text-red-800 space-y-2">
                        <p className="font-semibold">Bilan matière incorrect:</p>
                        <div className="bg-red-100 p-3 rounded space-y-1">
                          <p>📤 Total ENVOIS (originCity): <strong>{totalEnvois.toLocaleString()}</strong></p>
                          <p>📥 Total RÉCEPTIONS (destinationCity): <strong>{totalReceptions.toLocaleString()}</strong></p>
                          <p>📦 Total colis uniques: <strong>{results.totalParcels.toLocaleString()}</strong></p>
                        </div>
                        {totalEnvois !== totalReceptions && (
                          <p className="pt-2 font-bold">
                            ❌ Envois ≠ Réceptions (différence: {Math.abs(totalEnvois - totalReceptions).toLocaleString()})
                          </p>
                        )}
                        {totalEnvois !== results.totalParcels && (
                          <p className="font-bold">
                            ❌ Envois ≠ Total (différence: {Math.abs(totalEnvois - results.totalParcels).toLocaleString()})
                          </p>
                        )}
                        <p className="pt-2 text-amber-900">
                          Des colis ont peut-être des villes origine/destination manquantes ou invalides!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Bouton relancer */}
          <div className="text-center">
            <button
              onClick={runDiagnostic}
              disabled={loading}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-50 transition"
            >
              {loading ? '⏳ Analyse en cours...' : '🔄 Relancer le diagnostic'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
