// ☁️ Alerte sur l'accueil Admin (06/11/2026) : la sauvegarde automatique a plus de 8 jours, ou elle est incomplète.
// Elle a échoué 8 semaines sans que personne le sache. État lu dans le contrôle quotidien (healthChecks/latest).
import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../firebase/config'

export default function CloudBackupAlert() {
  const [b, setB] = useState<any>(null)
  useEffect(() => {
    let off = false
    getDoc(doc(db, 'healthChecks', 'latest')).then(s => { if (!off) setB(s.data()?.backup || null) }).catch(() => {})
    return () => { off = true }
  }, [])
  if (!b?.stale) return null
  return (
    <div className="mt-4 text-sm font-semibold px-4 py-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
      ⚠️ La sauvegarde automatique ne fonctionne pas :{' '}
      {b.lastAt
        ? `dernière le ${new Date(b.lastAt).toLocaleDateString('fr-FR')} (il y a ${b.ageDays} jours)${b.errors ? `, ${b.errors} collection(s) incomplète(s)` : ''}.`
        : 'aucun fichier trouvé.'}{' '}
      Voir « Santé des données » dans les Rapports du Contrôleur.
    </div>
  )
}
