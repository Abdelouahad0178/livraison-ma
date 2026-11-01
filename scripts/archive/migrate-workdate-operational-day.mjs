/**
 * 🔄 Script de migration: Recalculer workDate selon la journée d'opération (8h → 6h le lendemain)
 *
 * Contexte: calculateWorkDate() utilisait auparavant date.toISOString().split('T')[0],
 * ce qui convertit en UTC et provoque un décalage de journée pour les colis créés
 * près de minuit heure du Maroc. Ce bug est corrigé côté code (src/firebase/parcels.ts
 * délègue maintenant à getOperationalDayString), mais les colis DÉJÀ en base ont un
 * workDate figé au moment de leur création avec l'ancienne logique (ou l'ancienne
 * logique calendaire simple). Ce script recalcule workDate pour TOUS les colis
 * existants à partir de leur createdAt réel, avec la même règle que l'application.
 *
 * Usage:
 *   node scripts/migrate-workdate-operational-day.mjs --dry-run   # simulation, aucune écriture
 *   node scripts/migrate-workdate-operational-day.mjs             # applique les changements
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

// ⏰ Doit rester identique à src/config/operationalDay.ts (START_HOUR: 8, END_HOUR: 6)
const START_HOUR = 8
const END_HOUR = 6

/**
 * Reproduit exactement getOperationalDayString() de src/config/operationalDay.ts,
 * en s'ancrant sur le fuseau horaire du Maroc quel que soit le fuseau du serveur
 * qui exécute ce script.
 */
function getOperationalDayString(date) {
  const sourceDate = new Date(date)

  const casablancaTime = new Date(
    sourceDate.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' })
  )

  const hour = casablancaTime.getHours()
  const minute = casablancaTime.getMinutes()
  const currentMinutes = hour * 60 + minute
  const endMinutes = END_HOUR * 60

  const d = new Date(casablancaTime)
  if (currentMinutes < endMinutes) {
    d.setDate(d.getDate() - 1)
  }
  d.setHours(START_HOUR, 0, 0, 0)

  return d.toISOString().split('T')[0]
}

function getCreatedAtDate(data) {
  if (data.createdAt?.toDate) return data.createdAt.toDate()
  if (data.createdAt) return new Date(data.createdAt)
  if (data.history?.[0]?.timestamp) return new Date(data.history[0].timestamp)
  return null
}

async function migrateWorkDates() {
  console.log(DRY_RUN ? '🔍 SIMULATION (--dry-run) — aucune écriture ne sera faite\n' : '🔄 Début migration workDate (journée d\'opération)...\n')

  const parcelsRef = db.collection('parcels')
  const snapshot = await parcelsRef.get()

  console.log(`📦 ${snapshot.size} colis à analyser`)

  let batch = db.batch()
  let batchCount = 0
  let totalUpdated = 0
  let unchanged = 0
  let skippedNoDate = 0
  const examples = []

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const createdAtDate = getCreatedAtDate(data)

    if (!createdAtDate || isNaN(createdAtDate.getTime())) {
      skippedNoDate++
      continue
    }

    const correctWorkDate = getOperationalDayString(createdAtDate)

    if (data.workDate === correctWorkDate) {
      unchanged++
      continue
    }

    if (examples.length < 20) {
      examples.push({ id: doc.id, before: data.workDate, after: correctWorkDate, createdAt: createdAtDate.toISOString() })
    }

    if (!DRY_RUN) {
      batch.update(doc.ref, { workDate: correctWorkDate })
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

  if (!DRY_RUN && batchCount > 0) {
    await batch.commit()
    console.log(`✅ Dernier batch de ${batchCount} colis mis à jour`)
  }

  console.log('\n📊 RÉSUMÉ:')
  console.log(`   Total colis: ${snapshot.size}`)
  console.log(`   Déjà corrects: ${unchanged}`)
  console.log(`   ${DRY_RUN ? 'À corriger (simulation)' : 'Corrigés'}: ${totalUpdated}`)
  console.log(`   Ignorés (aucune date exploitable): ${skippedNoDate}`)

  if (examples.length > 0) {
    console.log('\n🔎 Exemples de changements:')
    examples.forEach(e => {
      console.log(`   ${e.id}: ${e.before ?? '(absent)'} → ${e.after}  (createdAt: ${e.createdAt})`)
    })
  }

  console.log(DRY_RUN ? '\n✅ Simulation terminée. Relancer sans --dry-run pour appliquer.' : '\n✅ Migration terminée!')

  process.exit(0)
}

migrateWorkDates().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
