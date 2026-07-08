import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { doc, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'

export default function DriverGarePageTest() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const uid = auth.currentUser?.uid

  useEffect(() => {
    if (!uid) {
      setLoading(false)
      return
    }

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      {
        next: (snap) => {
          if (!snap.exists()) {
            navigate('/login')
            return
          }

          const raw = snap.data()

          // NETTOYER - extraire SEULEMENT les strings
          const cleanProfile = {
            role: String(raw?.role || ''),
            name: String(raw?.name || ''),
            email: String(raw?.email || ''),
            city: String(raw?.city || '')
          }

          if (cleanProfile.role !== 'livreur-gare') {
            alert('❌ Accès réservé aux livreurs en gare')
            signOut(auth)
            return
          }

          setProfile(cleanProfile)
        },
        error: (err) => {
          console.error('❌ Erreur profil:', err)
          navigate('/login')
        }
      }
    )

    return () => unsubUser()
  }, [uid, navigate])

  if (!uid) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-xl mb-4">❌ Non connecté</p>
        <button
          onClick={() => navigate('/login')}
          className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Aller à la connexion
        </button>
      </div>
    </div>
  }

  if (!profile) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <p>Chargement du profil...</p>
    </div>
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-4">🚉 Page Livreur en Gare (TEST)</h1>
      <div className="bg-gray-800 p-6 rounded-lg">
        <p><strong>Nom:</strong> {profile.name}</p>
        <p><strong>Email:</strong> {profile.email}</p>
        <p><strong>Ville:</strong> {profile.city}</p>
        <p><strong>Rôle:</strong> {profile.role}</p>
      </div>
      <p className="mt-4 text-green-400">✅ Si vous voyez ceci, le problème est résolu!</p>
    </div>
  )
}
