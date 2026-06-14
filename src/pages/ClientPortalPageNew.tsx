import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { auth } from '../firebase/auth'
import { db } from '../firebase/db'
import {
  createModificationRequest, subscribeClientModificationRequests, deleteModificationRequest,
  subscribeClientParcels, subscribeClientPayments, subscribeDestinataireDeliveries,
} from '../firebase/clients'
import { createClientPortalParcel } from '../firebase/firestore'
import { Home, PackagePlus, Truck, Wallet, FileText, PenLine, ClipboardList, LogOut, Lock, KeyRound } from 'lucide-react'

/**
 * NOUVEAU SYSTÈME SIMPLIFIÉ
 *
 * L'utilisateur a directement dans son document user :
 * - clientType: 'expediteur' | 'destinataire' | 'both'
 * - clientData: { id, name, tel, city, address, ... }
 *
 * Plus besoin de charger un document client séparé !
 */

export default function ClientPortalPageNew() {
  const { clientId: routeClientId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [parcels, setParcels] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [modRequests, setModRequests] = useState<any[]>([])
  const [tab, setTab] = useState('overview')

  // Charger l'utilisateur avec ses données client intégrées
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) {
      navigate('/login')
      return
    }

    const unsub = onSnapshot(doc(db, 'users', uid), snap => {
      if (!snap.exists()) {
        setLoading(false)
        return
      }

      const userData = snap.data()

      // Vérifier que l'utilisateur a accès à ce clientId
      if (userData.clientId !== routeClientId) {
        navigate(`/clients/${userData.clientId}`)
        return
      }

      setUser(userData)
      setLoading(false)
    }, () => setLoading(false))

    return () => unsub()
  }, [routeClientId, navigate])

  // Charger les données selon le type de client
  useEffect(() => {
    if (!user?.clientId) return

    const handleError = (err?: any) => {
      console.log('Erreur chargement:', err?.code)
    }

    const isExpediteur = user.clientType === 'expediteur' || user.clientType === 'both'
    const isDestinataire = user.clientType === 'destinataire' || user.clientType === 'both'

    console.log('📦 Type client:', user.clientType, { isExpediteur, isDestinataire })

    // Charger selon le type
    const unsubs: any[] = []

    if (isExpediteur) {
      unsubs.push(subscribeClientParcels(user.clientId, setParcels, handleError))
      unsubs.push(subscribeClientPayments(user.clientId, setPayments, handleError))
    }

    if (isDestinataire && user.clientData) {
      unsubs.push(subscribeDestinataireDeliveries(user.clientData, setParcels, handleError))
    }

    unsubs.push(subscribeClientModificationRequests(user.clientId, setModRequests, handleError))

    return () => unsubs.forEach(u => u())
  }, [user?.clientId, user?.clientType])

  const handleLogout = () => {
    auth.signOut().then(() => navigate('/login'))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md">
          <h1 className="text-2xl font-bold text-red-600">Accès refusé</h1>
          <p className="mt-4 text-gray-600">Vous n'avez pas accès à ce portail client.</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 w-full bg-blue-600 text-white py-3 rounded-xl hover:bg-blue-700"
          >
            Retour connexion
          </button>
        </div>
      </div>
    )
  }

  const isExpediteur = user.clientType === 'expediteur' || user.clientType === 'both'
  const isDestinataire = user.clientType === 'destinataire' || user.clientType === 'both'

  // Navigation adaptée au type
  const NAV_ITEMS = isDestinataire && !isExpediteur
    ? [
        { key: 'overview', label: 'Accueil', Icon: Home },
        { key: 'parcels', label: 'Mes livraisons', Icon: Truck },
        { key: 'modifications', label: 'Mes demandes', Icon: ClipboardList },
      ]
    : [
        { key: 'overview', label: 'Accueil', Icon: Home },
        { key: 'new', label: 'Nouveau colis', Icon: PackagePlus },
        { key: 'parcels', label: 'Expéditions', Icon: Truck },
        { key: 'cod', label: 'Retour Fond', Icon: Wallet },
        { key: 'invoices', label: 'Factures', Icon: FileText },
        { key: 'modifications', label: 'Mes demandes', Icon: ClipboardList },
      ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black">{user.clientData?.name || 'Client'}</h1>
              <p className="text-blue-200 text-sm mt-1">
                {user.clientType === 'expediteur' && '📤 Expéditeur'}
                {user.clientType === 'destinataire' && '📥 Destinataire'}
                {user.clientType === 'both' && '📦 Expéditeur & Destinataire'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl transition"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Navigation */}
        <nav className="bg-white rounded-2xl shadow-lg p-2 mb-6 flex flex-wrap gap-2">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl transition ${
                tab === item.key
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <item.Icon size={18} />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Overview */}
        {tab === 'overview' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4">
              Bienvenue {user.clientData?.name || 'Client'} !
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <Lock className="text-blue-600 mb-2" size={24} />
                <h3 className="font-bold text-gray-900">Accès sécurisé</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Vos données sont protégées et accessibles uniquement par vous.
                </p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4">
                <Truck className="text-indigo-600 mb-2" size={24} />
                <h3 className="font-bold text-gray-900">
                  {isDestinataire && !isExpediteur ? 'Suivez vos livraisons' : 'Gérez vos expéditions'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {isDestinataire && !isExpediteur
                    ? 'Suivez en temps réel les colis qui vous sont envoyés.'
                    : 'Créez et suivez vos colis en temps réel.'}
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="font-bold mb-2">📊 Statistiques</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-black text-blue-600">{parcels.length}</div>
                  <div className="text-xs text-gray-600">Colis</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-green-600">
                    {parcels.filter(p => p.status === 'Livré').length}
                  </div>
                  <div className="text-xs text-gray-600">Livrés</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-orange-600">
                    {parcels.filter(p => p.status !== 'Livré' && p.status !== 'Retourné').length}
                  </div>
                  <div className="text-xs text-gray-600">En cours</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-purple-600">{modRequests.length}</div>
                  <div className="text-xs text-gray-600">Demandes</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Parcels */}
        {tab === 'parcels' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4">
              {isDestinataire && !isExpediteur ? '📥 Mes livraisons' : '📦 Mes expéditions'}
            </h2>
            {parcels.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Truck size={48} className="mx-auto mb-4 opacity-30" />
                <p>Aucun colis pour le moment</p>
              </div>
            ) : (
              <div className="space-y-3">
                {parcels.map(parcel => (
                  <div key={parcel.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-blue-600">{parcel.trackingId}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {isDestinataire && !isExpediteur
                            ? `De: ${parcel.senderName} → ${parcel.receiverName}`
                            : `${parcel.senderCity} → ${parcel.destinationCity}`}
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                        parcel.status === 'Livré' ? 'bg-green-100 text-green-700' :
                        parcel.status === 'Retourné' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {parcel.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Other tabs... */}
        {tab !== 'overview' && tab !== 'parcels' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-4">Section {tab}</h2>
            <p className="text-gray-600">Contenu à venir...</p>
          </div>
        )}
      </div>
    </div>
  )
}
