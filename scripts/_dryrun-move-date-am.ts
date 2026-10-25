// LECTURE SEULE (essai à blanc) : 9 expéditions Ait Melloul (elkerdaoui1) 23/10 → 24/10 — état actuel et effet du décalage
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { shiftParcelDates } from '../src/utils/shiftParcelDates'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore()
const NICS = ['1225005', '1225004', '1225003', '1065671', '1065672', '1059199', '1225408', '1225006', '1092253']
const now = Date.now()
const ms = (v: any) => v?.toMillis ? v.toMillis() : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? Date.parse(v) : null
const fmt = (t: number) => new Date(t).toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })
for (const nic of NICS) {
  const s = await db.collection('parcels').where('senderNic', '==', nic).get()
  if (!s.size) { console.log(nic, 'INTROUVABLE'); continue }
  for (const d of s.docs) {
    const p: any = d.data()
    const { patch, count } = shiftParcelDates(p, 1, m => admin.firestore.Timestamp.fromMillis(m))
    // Dates qui passeraient dans le futur
    const future: string[] = []
    const walk = (v: any, path: string) => { const t = ms(v); if (t !== null) { if (t + 864e5 > now) future.push(`${path}=${fmt(t + 864e5)}`) ; return }
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`)); else if (v && typeof v === 'object' && !v.toMillis) Object.entries(v).forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k)) }
    for (const k of Object.keys(patch)) walk(p[k], k)
    console.log(`${nic} (${d.id}) | ${p.originCity} → ${p.destinationCity} | créée ${fmt(ms(p.createdAt)!)} | workDate ${p.workDate} | par ${p.agentName || p.createdByName || '?'} | statut ${p.status} | port ${p.portType}/${p.portStatus || '-'} | COD ${p.codAmount || 0}/${p.codStatus || '-'}`)
    console.log(`   ${count} dates décalées ; champs : ${Object.keys(patch).join(', ')}`)
    if (future.length) console.log(`   ⚠️ dans le FUTUR après décalage (${future.length}) : ${future.slice(0, 6).join(' ; ')}${future.length > 6 ? ' …' : ''}`)
  }
}
process.exit(0)
