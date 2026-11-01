/**
 * 🔄 Script de migration: Normaliser deliveredAt en chaîne ISO
 *
 * Contexte: deliveredAt existe en base sous deux formats selon le chemin d'écriture
 * historique du colis : chaîne ISO (format utilisé partout dans l'app actuellement) ou
 * Timestamp Firestore natif (résidu du bouton "Livrer" de Caisse Agence qui écrivait un
 * objet Date natif, corrigé depuis). L'affichage a été corrigé pour gérer les deux formats
 * (voir ParcelsTab.tsx / AgentPage.tsx), mais ce script convertit les Timestamp résiduels
 * en chaîne ISO pour uniformiser la donnée.
 *
 * Usage:
 *   node scripts/migrate-deliveredAt-format.mjs --dry-run   # simulation, aucune écriture
 *   node scripts/migrate-deliveredAt-format.mjs             # applique les changements
 */

import admin from 'firebase-admin'
import { readFileSync } from 'fs'

const DRY_RUN = process.argv.includes('--dry-run')

const serviceAccount = JSON.parse(
  readFileSync('./serviceAccountKey.json', 'utf8')
)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

async function migrateDeliveredAt() {
  console.log(DRY_RUN ? '🔍 SIMULATION (--dry-run) — aucune écriture ne sera faite\n' : '🔄 Début migration deliveredAt (normalisation ISO)...\n')

  const snapshot = await db.collection('parcels').where('status', '==', 'Livré').get()

  console.log(`📦 ${snapshot.size} colis "Livré" à analyser`)

  let batch = db.batch()
  let batchCount = 0
  let totalUpdated = 0
  let alreadyString = 0
  let noDeliveredAt = 0
  const examples = []

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const v = data.deliveredAt

    if (v === undefined || v === null) {
      noDeliveredAt++
      continue
    }
    if (typeof v === 'string') {
      alreadyString++
      continue
    }
    if (v && typeof v.toDate === 'function') {
      const iso = v.toDate().toISOString()

      if (examples.length < 20) {
        examples.push({ id: doc.id, trackingId: data.trackingId, before: 'Timestamp', after: iso })
      }

      if (!DRY_RUN) {
        batch.update(doc.ref, { deliveredAt: iso })
        batchCount++

        if (batchCount >= 500) {
          await batch.commit()
          console.log(`✅ Batch de ${batchCount} colis mis à jour (total: ${totalUpdated + batchCount})`)
          batch = db.batch()
          batchCount = 0
        }
      }

      totalUpdated++
    }
  }

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit()
    console.log(`✅ Dernier batch de ${batchCount} colis mis à jour`)
  }

  console.log('\n📊 RÉSUMÉ:')
  console.log(`   Total colis "Livré": ${snapshot.size}`)
  console.log(`   Déjà en chaîne ISO: ${alreadyString}`)
  console.log(`   Sans deliveredAt (non touché): ${noDeliveredAt}`)
  console.log(`   ${DRY_RUN ? 'À convertir (simulation)' : 'Convertis'}: ${totalUpdated}`)

  if (examples.length > 0) {
    console.log('\n🔎 Exemples de conversions:')
    examples.forEach(e => {
      console.log(`   ${e.id} (${e.trackingId || '—'}): ${e.before} → ${e.after}`)
    })
  }

  console.log(DRY_RUN ? '\n✅ Simulation terminée. Relancer sans --dry-run pour appliquer.' : '\n✅ Migration terminée!')

  process.exit(0)
}

migrateDeliveredAt().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
