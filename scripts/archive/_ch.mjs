// Lecture seule : expéditions avec historique de changement du COD (codAmountHistory), par ville d'origine
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(); db.settings({ preferRest: true })
const s = await db.collection('parcels').select('codAmountHistory', 'originCity', 'destinationCity', 'senderNic', 'createdAt').get()
const withH = s.docs.filter(d => (d.get('codAmountHistory') || []).length)
const by = {}; withH.forEach(d => { const k = d.get('originCity') || '?'; by[k] = (by[k] || 0) + 1 })
console.log('total avec historique COD :', withH.length, by)
const mk = withH.filter(d => d.get('originCity') === 'Marrakech' || d.get('destinationCity') === 'Marrakech')
console.log('liées à Marrakech (origine ou destination) :', mk.length)
mk.slice(0, 30).forEach(d => console.log(' ', d.get('senderNic'), d.get('originCity'), '→', d.get('destinationCity'), (d.get('codAmountHistory') || []).length, 'ligne(s)', d.get('createdAt')?.toDate?.().toLocaleDateString('fr-FR')))
process.exit(0)
