// LECTURE SEULE : temps et volume des 16 lectures de « Collectes par jour » (noura, Agadir), navigateur, connexion 8 Mbit/s.
// Compare : actuel (depuis le 05/10) vs 14 derniers jours seulement.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('email', '==', 'noura@gmail.com').limit(1).get()
const city = u.docs[0].data().city, token = await admin.auth().createCustomToken(u.docs[0].id)
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage()
await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 8e6 / 8, uploadThroughput: 2e6 / 8 })
const res = await p.evaluate(async ({ cfg, token, city }) => {
  const V = 'https://www.gstatic.com/firebasejs/10.14.1/'
  const { initializeApp } = await import(V + 'firebase-app.js'); const { getAuth, signInWithCustomToken } = await import(V + 'firebase-auth.js')
  const F = await import(V + 'firebase-firestore.js'); const { collection, query, where, onSnapshot, Timestamp } = F
  const SHAPES = [['destinationCity', 'portCollectedAt'], ['destinationCity', 'codCollectedAt'], ['originCity', 'portPayeExpReceivedAt'], ['originCity', 'portReceivedAt']]
  const from = new Date(); from.setDate(from.getDate() - 1); from.setHours(8, 0, 0, 0)
  const to = new Date(from.getTime() + 22 * 3600e3)
  const run = async (name, since) => {
    const a = initializeApp(cfg, name); await signInWithCustomToken(getAuth(a), token); const db = F.getFirestore(a)
    const t = performance.now(); let n = 0, kb = 0
    await Promise.all(SHAPES.flatMap(([cf, df]) => [Timestamp.fromDate(since), since.toISOString()].flatMap(sv => [['<', from], ['>', to]].map(([op, at]) =>
      new Promise(r => { const un = onSnapshot(query(collection(db, 'parcelsLite'), where(cf, '==', city), where(df, '>=', sv), where('createdAt', op, Timestamp.fromDate(at))), s => { if (s.metadata.fromCache) return; un(); n += s.size; kb += JSON.stringify(s.docs.map(d => d.data())).length / 1024; r() }, () => r()) })))))
    return { ms: Math.round(performance.now() - t), n, kb: Math.round(kb) }
  }
  const s14 = new Date(); s14.setDate(s14.getDate() - 13); s14.setHours(8, 0, 0, 0)
  const j14 = await run('x2', s14); const actuel = await run('x1', new Date(2026, 9, 5, 8)); return { actuel, j14 }
}, { cfg, token, city })
console.log('Actuel (depuis 05/10) :', res.actuel.ms, 'ms,', res.actuel.n, 'lignes,', res.actuel.kb, 'Ko')
console.log('14 derniers jours     :', res.j14.ms, 'ms,', res.j14.n, 'lignes,', res.j14.kb, 'Ko')
await b.close(); process.exit(0)
