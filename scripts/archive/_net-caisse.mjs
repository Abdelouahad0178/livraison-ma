// LECTURE SEULE : temps et volume de CHAQUE lecture Firestore de Caisse Agence (compte noura), téléphone simulé
// (4G : 170 ms, 9 Mbit/s). Chaque lecture est lancée seule, puis toutes ensemble comme sur la vraie page. Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('email', '==', 'noura@gmail.com').limit(1).get()
const city = u.docs[0].data().city
const token = await admin.auth().createCustomToken(u.docs[0].id)
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
const p = await ctx.newPage()
await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 })
const res = await p.evaluate(async ({ cfg, token, city }) => {
  const V = 'https://www.gstatic.com/firebasejs/10.14.1/'
  const { initializeApp } = await import(V + 'firebase-app.js')
  const { getAuth, signInWithCustomToken } = await import(V + 'firebase-auth.js')
  const F = await import(V + 'firebase-firestore.js')
  const { collection, query, where, orderBy, limit, onSnapshot, Timestamp } = F
  const app = initializeApp(cfg)
  await signInWithCustomToken(getAuth(app), token)
  const now = new Date(); const d0 = new Date(now); d0.setHours(8, 0, 0, 0); if (now.getHours() < 6) d0.setDate(d0.getDate() - 1)
  const since = Timestamp.fromDate(d0)
  const iso2 = new Date(Date.now() - 2 * 86400000).toISOString()
  const RET = ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']
  const defs = db => {
    const P = collection(db, 'parcels'), L = collection(db, 'parcelsLite')
    return {
      'journée départ (complet)': query(P, where('originCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc')),
      'journée arrivée (complet)': query(P, where('destinationCity', '==', city), where('createdAt', '>=', since), orderBy('createdAt', 'desc')),
      'en gare (Arrivé en agence)': query(P, where('destinationCity', '==', city), where('status', '==', 'Arrivé en agence'), where('isArchived', '==', false)),
      'ports payés à verser': query(P, where('originCity', '==', city), where('portType', '==', 'port_paye'), where('portStatus', '==', 'collected')),
      'retours destinationCity': query(P, where('destinationCity', '==', city), where('status', 'in', RET), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(5000)),
      'retours returnToCity': query(P, where('returnToCity', '==', city), where('status', 'in', RET), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(5000)),
      'retours createdByCity': query(P, where('createdByCity', '==', city), where('status', 'in', RET), where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(5000)),
      'réceptions port (lite 2 j)': query(L, where('destinationCity', '==', city), where('portExpReceivedAt', '>=', iso2)),
      'réceptions COD (lite 2 j)': query(L, where('destinationCity', '==', city), where('codExpReceivedAt', '>=', iso2)),
      'réceptions PP (lite 2 j)': query(L, where('originCity', '==', city), where('portPayeExpReceivedAt', '>=', iso2)),
    }
  }
  const run = (q) => new Promise(r => { const t = performance.now(); const un = onSnapshot(q, s => { if (s.metadata.fromCache) return; un(); r({ ms: Math.round(performance.now() - t), n: s.size, kb: Math.round(JSON.stringify(s.docs.map(d => d.data())).length / 1024) }) }, e => r({ err: e.code })) })
  const out = { seul: {}, ensemble: {} }
  // Chaque lecture seule (instance Firestore neuve à chaque fois : pas de cache partagé)
  let i = 0
  for (const name of Object.keys(defs(F.getFirestore(app)))) {
    const a = initializeApp(cfg, 'a' + (i++)); await signInWithCustomToken(getAuth(a), token)
    out.seul[name] = await run(defs(F.getFirestore(a))[name])
  }
  // Toutes ensemble (comme la vraie page)
  const a = initializeApp(cfg, 'tous'); await signInWithCustomToken(getAuth(a), token)
  const qs = defs(F.getFirestore(a)); const t = performance.now()
  await Promise.all(Object.entries(qs).map(async ([k, q]) => { out.ensemble[k] = await run(q) }))
  out.totalEnsemble = Math.round(performance.now() - t)
  return out
}, { cfg, token, city })
console.log('Ville :', city)
console.log('\nCHAQUE LECTURE SEULE :')
for (const [k, v] of Object.entries(res.seul)) console.log(' ', k.padEnd(30), v.err ? 'ERREUR ' + v.err : `${String(v.ms).padStart(6)} ms  ${String(v.n).padStart(5)} exp.  ${String(v.kb).padStart(6)} Ko`)
console.log('\nTOUTES ENSEMBLE (comme la page) :')
for (const [k, v] of Object.entries(res.ensemble)) console.log(' ', k.padEnd(30), v.err ? 'ERREUR ' + v.err : `${String(v.ms).padStart(6)} ms`)
console.log('  total :', res.totalEnsemble, 'ms')
await b.close()
process.exit(0)
