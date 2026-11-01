// LECTURE SEULE : comptes chauffeur / livreur et dernière connexion (Firebase Auth), sans afficher d'e-mail ni de secret.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
for (const role of ['chauffeur', 'livreur']) {
  const us = (await admin.firestore().collection('users').where('role', '==', role).get()).docs
  let recent = 0, last = []
  for (const u of us) {
    try {
      const a = await admin.auth().getUser(u.id)
      const t = a.metadata.lastRefreshTime || a.metadata.lastSignInTime
      const days = t ? Math.round((Date.now() - Date.parse(t)) / 864e5) : null
      if (days !== null && days <= 7) { recent++; last.push(`${u.data().name} (${days} j)`) }
    } catch { /* compte Auth absent */ }
  }
  console.log(`${role} : ${us.length} comptes, ${recent} actifs ces 7 jours${last.length ? ' → ' + last.slice(0, 12).join(', ') : ''}`)
}
process.exit(0)
