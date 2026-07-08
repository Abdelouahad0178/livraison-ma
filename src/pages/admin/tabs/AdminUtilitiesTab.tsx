import { useState } from 'react'
import { db } from '../../../firebase/config'
import { collection, query, where, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore'
import { AlertCircle, CheckCircle2, Wrench, Trash2 } from 'lucide-react'
import WorkingDateManager from '../../../components/WorkingDateManager'

export default function AdminUtilitiesTab() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [nicsToDelete, setNicsToDelete] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteResult, setDeleteResult] = useState<string>('')

  const fixGareDriverCity = async () => {
    setLoading(true)
    setResult(null)

    try {
      // Trouver le livreur-gare
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'livreur-gare')
      )

      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        setResult({
          type: 'info',
          message: '⚠️ Aucun livreur-gare trouvé dans le système'
        })
        setLoading(false)
        return
      }

      let fixed = 0
      let skipped = 0

      for (const userDoc of snapshot.docs) {
        const userData = userDoc.data()

        // Si city n'existe pas ou est vide
        if (!userData.city || userData.city.trim() === '') {
          const city = prompt(
            `Entrez la ville pour ${userData.name || userData.email}:`,
            'Agadir'
          )

          if (city && city.trim() !== '') {
            await updateDoc(doc(db, 'users', userDoc.id), {
              city: city.trim()
            })
            fixed++
          } else {
            skipped++
          }
        } else {
          console.log(`✓ ${userData.email} a déjà une ville: ${userData.city}`)
        }
      }

      setResult({
        type: 'success',
        message: `✅ Correction terminée!\n${fixed} livreur(s)-gare corrigé(s)\n${skipped} ignoré(s)`
      })

    } catch (error: any) {
      console.error('Erreur:', error)
      setResult({
        type: 'error',
        message: `❌ Erreur: ${error.message}`
      })
    } finally {
      setLoading(false)
    }
  }

  const fixAllUsersWithoutCity = async () => {
    setLoading(true)
    setResult(null)

    try {
      const snapshot = await getDocs(collection(db, 'users'))

      let found = 0
      let fixed = 0

      for (const userDoc of snapshot.docs) {
        const userData = userDoc.data()

        if (!userData.city || userData.city.trim() === '') {
          found++
          console.log(`⚠️ Utilisateur sans ville: ${userData.email} (${userData.role})`)

          // Demander confirmation
          const shouldFix = window.confirm(
            `Ajouter une ville pour:\n${userData.email}\nRôle: ${userData.role}\n\nCliquez OK pour saisir la ville`
          )

          if (shouldFix) {
            const city = prompt(
              `Ville pour ${userData.name || userData.email}:`,
              userData.role === 'admin' ? 'Casablanca' : ''
            )

            if (city && city.trim() !== '') {
              await updateDoc(doc(db, 'users', userDoc.id), {
                city: city.trim()
              })
              fixed++
            }
          }
        }
      }

      if (found === 0) {
        setResult({
          type: 'success',
          message: '✅ Tous les utilisateurs ont une ville définie!'
        })
      } else {
        setResult({
          type: 'success',
          message: `✅ Traitement terminé!\n${found} utilisateur(s) trouvé(s) sans ville\n${fixed} corrigé(s)`
        })
      }

    } catch (error: any) {
      console.error('Erreur:', error)
      setResult({
        type: 'error',
        message: `❌ Erreur: ${error.message}`
      })
    } finally {
      setLoading(false)
    }
  }

  const deleteParcelsByNic = async () => {
    if (!nicsToDelete.trim()) {
      setDeleteResult('⚠️ Veuillez saisir au moins un N° EXP')
      return
    }

    const nics = nicsToDelete.split(/[,\s]+/).map(n => n.trim()).filter(n => n)

    if (nics.length === 0) {
      setDeleteResult('⚠️ Aucun N° EXP valide trouvé')
      return
    }

    const confirmed = window.confirm(
      `⚠️ ATTENTION: Vous allez supprimer définitivement ${nics.length} expédition(s):\n\n${nics.join(', ')}\n\nCette action est IRRÉVERSIBLE!\n\nVoulez-vous continuer?`
    )

    if (!confirmed) {
      setDeleteResult('❌ Suppression annulée')
      return
    }

    setDeleteLoading(true)
    setDeleteResult('🔍 Recherche des expéditions...')

    let deleted = 0
    let notFound = 0
    const details: string[] = []

    try {
      for (const nic of nics) {
        const q = query(
          collection(db, 'parcels'),
          where('sender.nic', '==', nic)
        )

        const snapshot = await getDocs(q)

        if (snapshot.empty) {
          notFound++
          details.push(`❌ ${nic}: Non trouvé`)
        } else {
          for (const docSnapshot of snapshot.docs) {
            const parcel = docSnapshot.data()
            await deleteDoc(doc(db, 'parcels', docSnapshot.id))
            deleted++
            details.push(`✅ ${nic} (${parcel.trackingId}): Supprimé`)
          }
        }
      }

      setDeleteResult(
        `✅ Suppression terminée!\n\n` +
        `📊 Résumé:\n` +
        `• ${deleted} expédition(s) supprimée(s)\n` +
        `• ${notFound} N° EXP non trouvé(s)\n\n` +
        `📋 Détails:\n${details.join('\n')}`
      )

      // Vider le champ
      setNicsToDelete('')

    } catch (error: any) {
      setDeleteResult(`❌ Erreur lors de la suppression: ${error.message}`)
    } finally {
      setDeleteLoading(false)
    }
  }

  const fixPortTypes = async () => {
    if (!confirm('⚠️ Cette opération va corriger les portType de TOUTES les expéditions en fonction de leur serviceType.\n\nLogique:\n• serviceType avec "especes", "cheque" ou "traite" → Port Payé\n• serviceType "simple" (sans paiement) → Port En Compte\n• Port Dû reste inchangé\n\nContinuer ?')) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      // Récupérer tous les colis
      const parcelsRef = collection(db, 'parcels')
      const snapshot = await getDocs(parcelsRef)

      let updatedCount = 0
      let portPayeCount = 0
      let portEnCompteCount = 0
      let portDuCount = 0
      let skippedCount = 0

      for (const docSnapshot of snapshot.docs) {
        const parcel = docSnapshot.data()
        const currentPortType = parcel.portType
        const serviceType = parcel.serviceType || ''

        // Si c'est déjà port_du, on ne change pas (cas spécifique)
        if (currentPortType === 'port_du') {
          portDuCount++
          continue
        }

        // Déterminer le nouveau portType basé sur le serviceType
        let newPortType = currentPortType

        const hasPaymentImmediat = serviceType.includes('especes') ||
                                   serviceType.includes('cheque') ||
                                   serviceType.includes('traite')

        if (hasPaymentImmediat) {
          newPortType = 'port_paye'
        } else {
          newPortType = 'port_en_compte'
        }

        // Mettre à jour uniquement si le portType a changé
        if (newPortType !== currentPortType) {
          await updateDoc(doc(db, 'parcels', docSnapshot.id), {
            portType: newPortType
          })

          updatedCount++
          if (newPortType === 'port_paye') portPayeCount++
          if (newPortType === 'port_en_compte') portEnCompteCount++
        } else {
          skippedCount++
        }
      }

      setResult({
        type: 'success',
        message: `✅ Correction terminée!\n\n📊 Total: ${snapshot.size} colis\n✏️ Mis à jour: ${updatedCount}\n  → Port Payé: ${portPayeCount}\n  → Port En Compte: ${portEnCompteCount}\n📮 Port Dû (non modifié): ${portDuCount}\n✓ Déjà corrects: ${skippedCount}`
      })

    } catch (error: any) {
      console.error('Erreur:', error)
      setResult({
        type: 'error',
        message: `❌ Erreur: ${error.message}`
      })
    } finally {
      setLoading(false)
    }
  }

  const fixCodPaymentTypes = async () => {
    if (!confirm('⚠️ Cette opération va définir "especes" comme mode de paiement par défaut pour tous les COD qui n\'ont pas de mode de paiement défini.\n\nContinuer ?')) {
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const parcelsRef = collection(db, 'parcels')
      const snapshot = await getDocs(parcelsRef)

      let updatedCount = 0
      let skippedCount = 0

      for (const docSnapshot of snapshot.docs) {
        const parcel = docSnapshot.data()
        const codAmount = parseFloat(parcel.codAmount) || 0

        // Si le colis a un COD mais pas de codPaymentType
        if (codAmount > 0 && !parcel.codPaymentType) {
          await updateDoc(doc(db, 'parcels', docSnapshot.id), {
            codPaymentType: 'especes'
          })
          updatedCount++
        } else {
          skippedCount++
        }
      }

      setResult({
        type: 'success',
        message: `✅ Correction terminée!\n\n📊 Total: ${snapshot.size} colis\n✏️ Mis à jour: ${updatedCount}\n✓ Ignorés: ${skippedCount}`
      })

    } catch (error: any) {
      console.error('Erreur:', error)
      setResult({
        type: 'error',
        message: `❌ Erreur: ${error.message}`
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
          <Wrench className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Utilitaires Admin</h1>
          <p className="text-gray-500 text-sm">Outils de maintenance et correction</p>
        </div>
      </div>

      {/* Gestionnaire de date de travail */}
      <WorkingDateManager />

      {/* Message résultat */}
      {result && (
        <div className={`mb-6 p-4 rounded-xl border-2 ${
          result.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          result.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-start gap-3">
            {result.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 mt-0.5" />
            )}
            <div className="flex-1 whitespace-pre-line">{result.message}</div>
          </div>
        </div>
      )}

      {/* Outils */}
      <div className="space-y-4">
        {/* Corriger livreurs-gare */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 mb-2">
                🚉 Corriger les livreurs-gare
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Ajoute le champ <code className="bg-gray-100 px-2 py-0.5 rounded">city</code> aux livreurs-gare qui n'en ont pas.
                <br />
                <span className="text-xs text-gray-500">
                  Nécessaire pour que les colis s'affichent dans leur interface.
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={fixGareDriverCity}
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-semibold rounded-lg hover:shadow-lg transition disabled:opacity-50"
          >
            {loading ? 'Correction en cours...' : 'Corriger les livreurs-gare'}
          </button>
        </div>

        {/* Corriger tous les utilisateurs */}
        <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 mb-2">
                👥 Vérifier tous les utilisateurs
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Trouve tous les utilisateurs sans ville et permet de la définir.
                <br />
                <span className="text-xs text-gray-500">
                  Parcourt tous les comptes et demande confirmation pour chaque correction.
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={fixAllUsersWithoutCity}
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:shadow-lg transition disabled:opacity-50"
          >
            {loading ? 'Vérification en cours...' : 'Vérifier tous les utilisateurs'}
          </button>
        </div>

        {/* Corriger les portType */}
        <div className="bg-white rounded-xl border-2 border-purple-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 mb-2">
                💼 Corriger les types de port (Port Payé / En Compte)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Corrige automatiquement le <code className="bg-gray-100 px-2 py-0.5 rounded">portType</code> de toutes les expéditions en fonction de leur <code className="bg-gray-100 px-2 py-0.5 rounded">serviceType</code>.
                <br />
                <span className="text-xs text-gray-500 mt-2 block">
                  • <strong>Port Payé</strong> : serviceType contient "especes", "cheque" ou "traite" (paiement immédiat)
                  <br />
                  • <strong>Port En Compte</strong> : serviceType "simple" sans paiement (crédit client)
                  <br />
                  • <strong>Port Dû</strong> reste inchangé (destinataire paie à la livraison)
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={fixPortTypes}
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition disabled:opacity-50"
          >
            {loading ? 'Correction en cours...' : 'Corriger tous les portType'}
          </button>
        </div>

        {/* Corriger les modes de paiement COD */}
        <div className="bg-white rounded-xl border-2 border-orange-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 mb-2">
                💰 Corriger les modes de paiement COD
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Définit "especes" comme mode de paiement par défaut pour tous les COD qui n'ont pas de <code className="bg-gray-100 px-2 py-0.5 rounded">codPaymentType</code> défini.
                <br />
                <span className="text-xs text-gray-500 mt-2 block">
                  • Corrige les COD existants sans mode de paiement
                  <br />
                  • Permet d'afficher la répartition complète par mode de paiement
                  <br />
                  • Les nouveaux COD auront automatiquement "especes" par défaut
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={fixCodPaymentTypes}
            disabled={loading}
            className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-lg hover:shadow-lg transition disabled:opacity-50"
          >
            {loading ? 'Correction en cours...' : 'Corriger les modes de paiement COD'}
          </button>
        </div>

        {/* Réinitialiser les portType */}
        <div className="bg-white rounded-xl border-2 border-purple-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 mb-2">
                🔄 Réinitialiser les Types de Port
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Permet de corriger les <code className="bg-gray-100 px-2 py-0.5 rounded">portType</code> incorrects des expéditions.
                <br />
                <span className="text-xs text-gray-500 mt-2 block">
                  • Utile si beaucoup de colis ont été créés avec un portType incorrect
                  <br />
                  • Vous pourrez ensuite corriger manuellement chaque expédition
                </span>
              </p>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Réinitialiser tous les portType à :
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!confirm('⚠️ Voulez-vous réinitialiser TOUS les portType à "Port payé" ?\n\nCette action affectera toutes les expéditions. Vous pourrez ensuite les corriger manuellement une par une.')) {
                          return
                        }
                        setLoading(true)
                        setMsg({ type: '', text: '' })
                        try {
                          const snapshot = await getDocs(collection(db, 'parcels'))
                          let count = 0
                          for (const docSnapshot of snapshot.docs) {
                            await updateDoc(doc(db, 'parcels', docSnapshot.id), {
                              portType: 'port_paye'
                            })
                            count++
                          }
                          setMsg({ type: 'success', text: `✅ ${count} expéditions mises à jour avec portType = "port_paye"` })
                        } catch (err: any) {
                          setMsg({ type: 'error', text: `❌ ${err.message}` })
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
                    >
                      ✅ Port payé
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('⚠️ Voulez-vous réinitialiser TOUS les portType à "Port dû" ?\n\nCette action affectera toutes les expéditions. Vous pourrez ensuite les corriger manuellement une par une.')) {
                          return
                        }
                        setLoading(true)
                        setMsg({ type: '', text: '' })
                        try {
                          const snapshot = await getDocs(collection(db, 'parcels'))
                          let count = 0
                          for (const docSnapshot of snapshot.docs) {
                            await updateDoc(doc(db, 'parcels', docSnapshot.id), {
                              portType: 'port_du'
                            })
                            count++
                          }
                          setMsg({ type: 'success', text: `✅ ${count} expéditions mises à jour avec portType = "port_du"` })
                        } catch (err: any) {
                          setMsg({ type: 'error', text: `❌ ${err.message}` })
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition disabled:opacity-50"
                    >
                      📮 Port dû
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('⚠️ Voulez-vous réinitialiser TOUS les portType à "En compte" ?\n\nCette action affectera toutes les expéditions. Vous pourrez ensuite les corriger manuellement une par une.')) {
                          return
                        }
                        setLoading(true)
                        setMsg({ type: '', text: '' })
                        try {
                          const snapshot = await getDocs(collection(db, 'parcels'))
                          let count = 0
                          for (const docSnapshot of snapshot.docs) {
                            await updateDoc(doc(db, 'parcels', docSnapshot.id), {
                              portType: 'port_en_compte'
                            })
                            count++
                          }
                          setMsg({ type: 'success', text: `✅ ${count} expéditions mises à jour avec portType = "port_en_compte"` })
                        } catch (err: any) {
                          setMsg({ type: 'error', text: `❌ ${err.message}` })
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition disabled:opacity-50"
                    >
                      💼 En compte
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Supprimer des expéditions par N° EXP */}
        <div className="bg-white rounded-xl border-2 border-red-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-800 mb-2">
                🗑️ Supprimer des expéditions par N° EXP
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Supprime définitivement des expéditions en utilisant leurs N° EXP.
                <br />
                <span className="text-xs text-red-600 font-semibold">
                  ⚠️ ATTENTION: Cette action est IRRÉVERSIBLE!
                </span>
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                N° EXP à supprimer (séparés par des virgules ou espaces)
              </label>
              <textarea
                value={nicsToDelete}
                onChange={e => setNicsToDelete(e.target.value)}
                placeholder="Exemple: 2605502, 1123242, 1116319"
                rows={3}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-red-400 focus:outline-none font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Vous pouvez coller plusieurs N° EXP séparés par des virgules, espaces ou retours à la ligne
              </p>
            </div>

            {deleteResult && (
              <div className={`p-4 rounded-lg border-2 text-sm whitespace-pre-line ${
                deleteResult.startsWith('✅') ? 'bg-green-50 border-green-200 text-green-800' :
                deleteResult.startsWith('❌') ? 'bg-red-50 border-red-200 text-red-800' :
                'bg-blue-50 border-blue-200 text-blue-800'
              }`}>
                {deleteResult}
              </div>
            )}

            <button
              onClick={deleteParcelsByNic}
              disabled={deleteLoading || !nicsToDelete.trim()}
              className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteLoading ? '🔄 Suppression en cours...' : '🗑️ Supprimer les expéditions'}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1 text-sm text-blue-800">
              <strong>Note:</strong> Ces outils corrigent les problèmes de structure de données.
              Utilisez-les après avoir créé de nouveaux rôles ou détecté des problèmes de permissions.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
