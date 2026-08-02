import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase/config'
import { doc, getDoc } from 'firebase/firestore'
import { LogOut, FileText, Package } from 'lucide-react'
import LiveClock from '../components/LiveClock'
import WorkingDateIndicator from '../components/WorkingDateIndicator'
import AdminInvoicesTab from './admin/tabs/AdminInvoicesTab'
import FacturierExpeditionsTab from './FacturierExpeditionsTab'

export default function FacturierPage() {
  console.log('FacturierPage - Composant monté')
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'expeditions' | 'factures'>('expeditions')

  useEffect(() => {
    console.log('FacturierPage - useEffect chargement profil')
    const loadProfile = async () => {
      const user = auth.currentUser
      console.log('FacturierPage - User:', user?.uid)
      if (!user) {
        console.log('FacturierPage - Pas d\'utilisateur, redirection login')
        navigate('/login')
        return
      }

      try {
        // Charger le profil depuis Firestore
        console.log('FacturierPage - Chargement profil depuis Firestore')
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        console.log('FacturierPage - Document existe:', userDoc.exists())
        if (userDoc.exists()) {
          const userData = userDoc.data()
          console.log('FacturierPage - Rôle utilisateur:', userData.role)
          if (userData.role !== 'facturier' && userData.role !== 'admin') {
            console.log('FacturierPage - Rôle non autorisé, redirection /')
            alert('Votre rôle est: ' + userData.role + '. Rôle requis: facturier ou admin')
            navigate('/')
            return
          }
          console.log('FacturierPage - Profil chargé:', userData)
          setProfile(userData)
        } else {
          console.log('FacturierPage - Document n\'existe pas, redirection login')
          navigate('/login')
        }
      } catch (error) {
        console.error('Erreur chargement profil:', error)
        alert('Erreur: ' + (error as any)?.message)
        navigate('/login')
      } finally {
        console.log('FacturierPage - Fin chargement, loading=false')
        setLoading(false)
      }
    }

    loadProfile()
  }, [navigate])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                <FileText className="w-4 h-4 text-cyan-600" />
                <span className="font-bold text-gray-800 hidden sm:inline">Interface Facturier</span>
              </div>
              {profile?.name && (
                <span className="text-gray-400 text-sm hidden md:inline">— {profile.name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <LiveClock className="text-gray-400 hidden sm:inline" />
              <WorkingDateIndicator />
              <button
                onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Onglets */}
      {!loading && profile && (
        <div className="border-b border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('expeditions')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-semibold text-sm transition ${
                  activeTab === 'expeditions'
                    ? 'border-cyan-600 text-cyan-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Package className="w-4 h-4" />
                Expéditions (Tous types de ports)
              </button>
              <button
                onClick={() => setActiveTab('factures')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-semibold text-sm transition ${
                  activeTab === 'factures'
                    ? 'border-cyan-600 text-cyan-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FileText className="w-4 h-4" />
                Factures
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu */}
      <main className="max-w-7xl mx-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Chargement...</p>
            </div>
          </div>
        ) : profile ? (
          <>
            {console.log('FacturierPage - Render contenu, activeTab:', activeTab, 'profile:', profile?.role)}
            {/* Garder les deux onglets montés, juste cacher celui qui n'est pas actif */}
            <div style={{ display: activeTab === 'expeditions' ? 'block' : 'none' }}>
              {console.log('FacturierPage - Render FacturierExpeditionsTab')}
              <FacturierExpeditionsTab />
            </div>
            <div style={{ display: activeTab === 'factures' ? 'block' : 'none' }}>
              {console.log('FacturierPage - Render AdminInvoicesTab')}
              <AdminInvoicesTab
                uid={auth.currentUser?.uid}
                userName={profile?.name || profile?.email || 'Facturier'}
              />
            </div>
          </>
        ) : (
          <>
            {console.log('FacturierPage - Pas de profil, rien à afficher')}
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="text-red-700 font-semibold">Erreur de chargement</div>
              <div className="text-red-600 text-sm">Impossible de charger le profil utilisateur</div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
