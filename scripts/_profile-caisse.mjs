// LECTURE SEULE : profil processeur (téléphone simulé) pendant l'ouverture de Caisse Agence (noura). Aucune action.
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('email', '==', 'noura@gmail.com').limit(1).get()
const token = await admin.auth().createCustomToken(u.docs[0].id)
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
await p.evaluate(async ({ cfg, token }) => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js')
  const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
  await signInWithCustomToken(getAuth(initializeApp(cfg)), token)
}, { cfg, token })
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
// Requêtes Firestore pendant la Caisse (début → fin)
const fs = []
cdp.on('Network.requestWillBeSent', e => { if (/firestore\.googleapis\.com/.test(e.request.url)) fs.push({ id: e.requestId, t: e.timestamp }) })
await p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
const menu = p.locator('header button.md\\:hidden').last()
await menu.waitFor({ timeout: 120000 })
await p.waitForTimeout(6000)
await menu.click()
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start')
const t1 = Date.now()
await p.getByRole('button', { name: /Caisse Agence/ }).last().click()
await p.locator('h3').filter({ hasText: /[A-Za-z]/ }).first().waitFor({ timeout: 120000 }).catch(() => {})
const tCaisse = Date.now() - t1
const { profile } = await cdp.send('Profiler.stop')
// Temps propre par fonction (fichier:fonction)
const dt = new Map(); const nodes = new Map(profile.nodes.map(n => [n.id, n]))
const counts = new Map(); profile.samples.forEach((s, i) => counts.set(s, (counts.get(s) || 0) + (profile.timeDeltas[i] || 0)))
for (const [id, us] of counts) { const n = nodes.get(id); const cf = n.callFrame; const file = (cf.url || '').split('/').pop().replace(/-[\w-]{8}\.js$/, '') || '(navigateur)'; const k = `${cf.functionName || '(anonyme)'} @ ${file}`; dt.set(k, (dt.get(k) || 0) + us) }
const total = [...dt.values()].reduce((s, x) => s + x, 0)
const byFile = new Map(); for (const [k, us] of dt) { const f = k.split(' @ ')[1]; byFile.set(f, (byFile.get(f) || 0) + us) }
console.log('Caisse affichée en', (tCaisse / 1000).toFixed(1), 's — processeur occupé', (total / 1e6).toFixed(1), 's')
console.log('\nPar fichier :'); [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([f, us]) => console.log(' ', (us / 1e6).toFixed(2), 's', f))
console.log('\nFonctions les plus coûteuses :'); [...dt].sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, us]) => console.log(' ', (us / 1e6).toFixed(2), 's', k))
await b.close()
process.exit(0)
