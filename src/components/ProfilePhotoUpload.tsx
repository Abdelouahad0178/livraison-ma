import { useState, useRef, useEffect } from 'react'
import { Camera, Upload, X } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { storage, db } from '../firebase/config'

interface ProfilePhotoUploadProps {
  userId: string
  currentPhotoURL?: string
  userName?: string
  size?: 'sm' | 'md' | 'lg'
  editable?: boolean
}

export default function ProfilePhotoUpload({
  userId,
  currentPhotoURL,
  userName = '',
  size = 'md',
  editable = true
}: ProfilePhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [photoURL, setPhotoURL] = useState(currentPhotoURL)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 🔥 CORRECTION: Synchroniser avec les props quand elles changent
  useEffect(() => {
    console.log('📸 currentPhotoURL changé:', currentPhotoURL)
    setPhotoURL(currentPhotoURL)
  }, [currentPhotoURL])

  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24'
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Vérifier le type de fichier
    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image')
      return
    }

    // Vérifier la taille (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('L\'image ne doit pas dépasser 5 MB')
      return
    }

    setUploading(true)
    setError('')

    try {
      console.log('🔵 Début upload photo pour userId:', userId)

      // Upload vers Firebase Storage
      const storageRef = ref(storage, `profile-photos/${userId}/${Date.now()}_${file.name}`)
      console.log('🔵 Uploading to Storage:', storageRef.fullPath)

      const snapshot = await uploadBytes(storageRef, file)
      console.log('✅ Upload Storage réussi')

      const downloadURL = await getDownloadURL(snapshot.ref)
      console.log('✅ URL obtenue:', downloadURL)

      // Mettre à jour Firestore
      console.log('🔵 Mise à jour Firestore...')
      await updateDoc(doc(db, 'users', userId), {
        photoURL: downloadURL
      })
      console.log('✅ Firestore mis à jour avec succès!')

      setPhotoURL(downloadURL)
      setUploading(false)
      alert('✅ Photo sauvegardée avec succès!')
    } catch (err: any) {
      console.error('❌ Erreur upload photo:', err)
      console.error('❌ Code erreur:', err.code)
      console.error('❌ Message:', err.message)
      setError(err.message || 'Erreur lors de l\'upload')
      setUploading(false)
      alert('❌ Erreur: ' + (err.message || 'Erreur inconnue'))
    }
  }

  const handleRemovePhoto = async () => {
    if (!window.confirm('Supprimer votre photo de profil ?')) return

    setUploading(true)
    try {
      await updateDoc(doc(db, 'users', userId), {
        photoURL: null
      })
      setPhotoURL(undefined)
      setUploading(false)
    } catch (err: any) {
      console.error('Erreur suppression photo:', err)
      setError(err.message || 'Erreur lors de la suppression')
      setUploading(false)
    }
  }

  const initials = userName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="relative group">
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold ${size === 'sm' ? 'text-sm' : size === 'md' ? 'text-lg' : 'text-2xl'} shadow-lg relative`}>
        {photoURL ? (
          <img
            src={photoURL}
            alt={userName}
            className="w-full h-full object-cover object-center"
            style={{ objectPosition: 'center 30%' }}
          />
        ) : (
          <span>{initials || '?'}</span>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {editable && !uploading && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
            title="Changer la photo"
          >
            <Camera className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      )}

      {photoURL && editable && (
        <button
          onClick={handleRemovePhoto}
          disabled={uploading}
          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600 disabled:opacity-50"
          title="Supprimer la photo"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {error && (
        <div className="absolute top-full left-0 mt-2 bg-red-100 border border-red-200 text-red-700 text-xs px-2 py-1 rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  )
}
