// Script temporaire — supprimer tous les utilisateurs Firebase Auth
// Usage: node deleteAllAuthUsers.mjs
import admin from 'firebase-admin'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const serviceAccount = require('./serviceAccount.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

async function deleteAllUsers() {
  let deleted = 0
  let nextPageToken

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken)
    const uids = result.users.map(u => u.uid)

    if (uids.length > 0) {
      const res = await admin.auth().deleteUsers(uids)
      deleted += res.successCount
      if (res.failureCount > 0) {
        console.error('Échecs:', res.errors)
      }
    }

    nextPageToken = result.pageToken
  } while (nextPageToken)

  console.log(`✓ ${deleted} utilisateur(s) Auth supprimé(s).`)
  process.exit(0)
}

deleteAllUsers().catch(err => { console.error(err); process.exit(1) })
