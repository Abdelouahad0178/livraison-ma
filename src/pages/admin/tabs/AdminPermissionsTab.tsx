import { useState, useEffect } from 'react'
import { Save, ShieldCheck, UserCog, X, CheckCircle } from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'

interface FieldPermission {
  field: string
  label: string
  category: 'sender' | 'receiver' | 'parcel' | 'status'
}

interface ActionPermission {
  action: string
  label: string
  description: string
}

const ACTION_PERMISSIONS: ActionPermission[] = [
  { action: 'add_sector', label: 'Ajouter des secteurs', description: 'Créer de nouveaux secteurs de livraison' },
  { action: 'add_driver', label: 'Ajouter des livreurs', description: 'Créer de nouveaux comptes livreurs' },
]

const EDITABLE_FIELDS: FieldPermission[] = [
  // Informations expéditeur
  { field: 'sender.name', label: 'Nom expéditeur', category: 'sender' },
  { field: 'sender.tel', label: 'Téléphone expéditeur', category: 'sender' },
  { field: 'sender.city', label: 'Ville expéditeur', category: 'sender' },
  { field: 'sender.address', label: 'Adresse expéditeur', category: 'sender' },
  { field: 'sender.nic', label: 'N° EXP (NIC)', category: 'sender' },

  // Informations destinataire
  { field: 'receiver.name', label: 'Nom destinataire', category: 'receiver' },
  { field: 'receiver.tel', label: 'Téléphone destinataire', category: 'receiver' },
  { field: 'receiver.city', label: 'Ville destinataire', category: 'receiver' },
  { field: 'receiver.address', label: 'Adresse destinataire', category: 'receiver' },

  // Informations colis
  { field: 'serviceType', label: 'Type de service', category: 'parcel' },
  { field: 'codAmount', label: 'Montant COD', category: 'parcel' },
  { field: 'weight', label: 'Poids', category: 'parcel' },
  { field: 'nbColis', label: 'Nombre de colis', category: 'parcel' },
  { field: 'price', label: 'Prix/Tarif', category: 'parcel' },
  { field: 'portType', label: 'Type de port (payé/dû/en compte)', category: 'parcel' },
  { field: 'notes', label: 'Notes/Observations', category: 'parcel' },
  { field: 'fragile', label: 'Fragile', category: 'parcel' },

  // Statut
  { field: 'status', label: 'Statut du colis', category: 'status' },
]

interface AdminPermissionsTabProps {
  // Add any props if needed
}

export default function AdminPermissionsTab(_props: AdminPermissionsTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Permissions par rôle - Champs éditables
  const [chefAgencePermissions, setChefAgencePermissions] = useState<string[]>([])
  const [aideAgentPermissions, setAideAgentPermissions] = useState<string[]>([])

  // Permissions par rôle - Actions
  const [chefAgenceActions, setChefAgenceActions] = useState<string[]>([])

  // Charger les permissions depuis Firestore
  useEffect(() => {
    loadPermissions()
  }, [])

  const loadPermissions = async () => {
    setLoading(true)
    try {
      const docRef = doc(db, 'settings', 'editPermissions')
      const snapshot = await getDoc(docRef)

      if (snapshot.exists()) {
        const data = snapshot.data()
        setChefAgencePermissions(data.chef_agence || [])
        setAideAgentPermissions(data.aide_agent || [])
        setChefAgenceActions(data.chef_agence_actions || [])
      } else {
        // Permissions par défaut: chef d'agence peut tout modifier sauf statut
        const defaultChef = EDITABLE_FIELDS
          .filter(f => f.category !== 'status')
          .map(f => f.field)
        setChefAgencePermissions(defaultChef)

        // Aide agent peut modifier seulement certains champs
        setAideAgentPermissions([
          'sender.name', 'sender.tel', 'sender.address',
          'receiver.name', 'receiver.tel', 'receiver.address',
          'notes'
        ])
      }
    } catch (error) {
      console.error('Erreur chargement permissions:', error)
      setMessage({ type: 'error', text: 'Erreur lors du chargement des permissions' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const docRef = doc(db, 'settings', 'editPermissions')
      await setDoc(docRef, {
        chef_agence: chefAgencePermissions,
        aide_agent: aideAgentPermissions,
        chef_agence_actions: chefAgenceActions,
        updatedAt: new Date().toISOString(),
      })

      setMessage({ type: 'success', text: '✅ Permissions enregistrées avec succès!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      console.error('Erreur sauvegarde permissions:', error)
      setMessage({ type: 'error', text: '❌ Erreur lors de la sauvegarde' })
    } finally {
      setSaving(false)
    }
  }

  const togglePermission = (role: 'chef' | 'aide', field: string) => {
    if (role === 'chef') {
      setChefAgencePermissions(prev =>
        prev.includes(field)
          ? prev.filter(f => f !== field)
          : [...prev, field]
      )
    } else {
      setAideAgentPermissions(prev =>
        prev.includes(field)
          ? prev.filter(f => f !== field)
          : [...prev, field]
      )
    }
  }

  const selectAll = (role: 'chef' | 'aide', category?: string) => {
    const fields = category
      ? EDITABLE_FIELDS.filter(f => f.category === category).map(f => f.field)
      : EDITABLE_FIELDS.map(f => f.field)

    if (role === 'chef') {
      setChefAgencePermissions(prev => [...new Set([...prev, ...fields])])
    } else {
      setAideAgentPermissions(prev => [...new Set([...prev, ...fields])])
    }
  }

  const deselectAll = (role: 'chef' | 'aide', category?: string) => {
    const fields = category
      ? EDITABLE_FIELDS.filter(f => f.category === category).map(f => f.field)
      : EDITABLE_FIELDS.map(f => f.field)

    if (role === 'chef') {
      setChefAgencePermissions(prev => prev.filter(f => !fields.includes(f)))
    } else {
      setAideAgentPermissions(prev => prev.filter(f => !fields.includes(f)))
    }
  }

  const categories = [
    { key: 'sender' as const, label: '📤 Expéditeur', color: 'blue' },
    { key: 'receiver' as const, label: '📥 Destinataire', color: 'green' },
    { key: 'parcel' as const, label: '📦 Colis', color: 'purple' },
    { key: 'status' as const, label: '🔄 Statut', color: 'orange' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Chargement des permissions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Permissions de modification</h1>
            <p className="text-blue-100 mt-1">
              Définir quels champs peuvent être modifiés par chaque rôle
            </p>
          </div>
        </div>
      </div>

      {/* Message de confirmation */}
      {message && (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <X className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {/* Bouton Sauvegarder en haut */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Enregistrement...' : 'Enregistrer les permissions'}
        </button>
      </div>

      {/* Grille des permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chef d'agence */}
        <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-lg">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <UserCog className="w-6 h-6 text-white" />
              <h2 className="text-xl font-black text-white">Chef d'agence</h2>
            </div>
            <p className="text-blue-100 text-sm mt-1">
              {chefAgencePermissions.length} / {EDITABLE_FIELDS.length} champs autorisés
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* Boutons rapides */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => selectAll('chef')}
                className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition font-medium"
              >
                ✓ Tout sélectionner
              </button>
              <button
                onClick={() => deselectAll('chef')}
                className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition font-medium"
              >
                ✗ Tout désélectionner
              </button>
            </div>

            {/* Champs par catégorie */}
            {categories.map(cat => {
              const categoryFields = EDITABLE_FIELDS.filter(f => f.category === cat.key)
              const selectedCount = categoryFields.filter(f => chefAgencePermissions.includes(f.field)).length

              return (
                <div key={cat.key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className={`bg-${cat.color}-50 p-3 flex items-center justify-between`}>
                    <span className="font-bold text-gray-800">{cat.label}</span>
                    <div className="flex gap-2">
                      <span className="text-xs text-gray-600">
                        {selectedCount}/{categoryFields.length}
                      </span>
                      <button
                        onClick={() => selectAll('chef', cat.key)}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Tous
                      </button>
                      <button
                        onClick={() => deselectAll('chef', cat.key)}
                        className="text-xs text-gray-600 hover:underline"
                      >
                        Aucun
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {categoryFields.map(field => (
                      <label
                        key={field.field}
                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={chefAgencePermissions.includes(field.field)}
                          onChange={() => togglePermission('chef', field.field)}
                          className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Aide agent */}
        <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-lg">
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-4 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <UserCog className="w-6 h-6 text-white" />
              <h2 className="text-xl font-black text-white">Aide agent</h2>
            </div>
            <p className="text-amber-100 text-sm mt-1">
              {aideAgentPermissions.length} / {EDITABLE_FIELDS.length} champs autorisés
            </p>
          </div>

          <div className="p-4 space-y-4">
            {/* Boutons rapides */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => selectAll('aide')}
                className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition font-medium"
              >
                ✓ Tout sélectionner
              </button>
              <button
                onClick={() => deselectAll('aide')}
                className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition font-medium"
              >
                ✗ Tout désélectionner
              </button>
            </div>

            {/* Champs par catégorie */}
            {categories.map(cat => {
              const categoryFields = EDITABLE_FIELDS.filter(f => f.category === cat.key)
              const selectedCount = categoryFields.filter(f => aideAgentPermissions.includes(f.field)).length

              return (
                <div key={cat.key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className={`bg-${cat.color}-50 p-3 flex items-center justify-between`}>
                    <span className="font-bold text-gray-800">{cat.label}</span>
                    <div className="flex gap-2">
                      <span className="text-xs text-gray-600">
                        {selectedCount}/{categoryFields.length}
                      </span>
                      <button
                        onClick={() => selectAll('aide', cat.key)}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Tous
                      </button>
                      <button
                        onClick={() => deselectAll('aide', cat.key)}
                        className="text-xs text-gray-600 hover:underline"
                      >
                        Aucun
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {categoryFields.map(field => (
                      <label
                        key={field.field}
                        className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={aideAgentPermissions.includes(field.field)}
                          onChange={() => togglePermission('aide', field.field)}
                          className="w-5 h-5 text-amber-600 rounded border-gray-300 focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="text-sm text-gray-700">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Permissions d'actions pour Chef d'agence */}
      <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-lg">
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 p-4 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-black text-white">Permissions d'actions - Chef d'agence</h2>
              <p className="text-violet-100 text-sm mt-1">
                Autoriser le chef d'agence à effectuer certaines actions
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {ACTION_PERMISSIONS.map(action => (
            <label
              key={action.action}
              className="flex items-start gap-4 p-4 hover:bg-gray-50 rounded-xl cursor-pointer transition border-2 border-gray-100"
            >
              <input
                type="checkbox"
                checked={chefAgenceActions.includes(action.action)}
                onChange={() => {
                  setChefAgenceActions(prev =>
                    prev.includes(action.action)
                      ? prev.filter(a => a !== action.action)
                      : [...prev, action.action]
                  )
                }}
                className="w-6 h-6 mt-1 text-violet-600 rounded border-gray-300 focus:ring-2 focus:ring-violet-500"
              />
              <div className="flex-1">
                <div className="font-bold text-gray-800 text-base">{action.label}</div>
                <div className="text-sm text-gray-600 mt-1">{action.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Bouton Sauvegarder en bas */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Enregistrement...' : 'Enregistrer les permissions'}
        </button>
      </div>
    </div>
  )
}
