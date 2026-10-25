// LECTURE SEULE : conformité « Collectes par jour » — ancienne méthode (16 requêtes avec filtre de création)
// vs nouvelle (8 requêtes sans filtre + filtre de période côté page, fonctions RÉELLES de src/utils/recentCollected).
// Plusieurs villes × plusieurs périodes. Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { RECENT_SHAPES, RECENT_FORMS, createdOutsidePeriod, hasOutsideRanges, matchesRecentCollected } from '../src/utils/recentCollected'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const db = admin.firestore(), T = admin.firestore.Timestamp
const SINCE = new Date(2026, 9, 5, 8).getTime()
const FAR = T.fromMillis(Date.parse('2100-01-01T00:00:00Z'))
const sv = (f: string) => (f === 'ts' ? T.fromMillis(SINCE) : new Date(SINCE).toISOString())
const op = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(8, 0, 0, 0); return x.getTime() }
const PERIODS: [string, number, number][] = [
  ['veille', op(-1), op(0) - 2 * 3600e3 - 1],
  ['aujourd hui', op(0), op(1) - 2 * 3600e3 - 1],
  ['7 jours', op(-6), Date.now() + 864e5],
  ['tout 45 j', op(-45), 0],
]
let allOk = true
for (const city of ['Agadir', 'Casablanca', 'Marrakech', 'Ait Melloul']) {
  // Nouvelle : ensemble complet
  const set = new Map<string, any>()
  for (const [cf, df] of RECENT_SHAPES) for (const f of RECENT_FORMS) {
    const s = await db.collection('parcelsLite').where(cf, '==', city).where(df, '>=', sv(f)).where('createdAt', '<', FAR).get()
    s.docs.forEach(d => set.set(d.id, { id: d.id, ...d.data() }))
  }
  const notMatching = [...set.values()].filter(p => !matchesRecentCollected(p, city, SINCE)).length
  for (const [name, from, to] of PERIODS) {
    const now = Date.now()
    const ranges: [string, number][] = []
    if (from) ranges.push(['<', from]); if (to && to < now) ranges.push(['>', to])
    const old = new Set<string>()
    for (const [cf, df] of RECENT_SHAPES) for (const f of RECENT_FORMS) for (const [o, at] of ranges) {
      const s = await db.collection('parcelsLite').where(cf, '==', city).where(df, '>=', sv(f)).where('createdAt', o as any, T.fromMillis(at)).select().get()
      s.docs.forEach(d => old.add(d.id))
    }
    const neu = new Set(hasOutsideRanges(from, to, now) ? [...set.values()].filter(p => createdOutsidePeriod(p, from, to, now)).map(p => p.id) : [])
    const missing = [...old].filter(id => !neu.has(id)).length, extra = [...neu].filter(id => !old.has(id)).length
    const ok = !missing && !extra
    allOk &&= ok
    console.log(`${city.padEnd(12)} ${name.padEnd(12)} avant ${String(old.size).padStart(5)} | maintenant ${String(neu.size).padStart(5)} | manquantes ${missing} | en trop ${extra} ${ok ? 'OK' : 'ÉCART'}`)
  }
  if (notMatching) { allOk = false; console.log(`${city} : ${notMatching} expéditions de l'ensemble refusées par matchesRecentCollected`) }
}
console.log(allOk ? 'CONFORME' : 'NON CONFORME')
process.exit(0)
