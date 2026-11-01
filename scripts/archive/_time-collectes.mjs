// LECTURE SEULE : temps d'ouverture de Caisse Agence (noura) sur PC — écran 1366 px, connexion ADSL/fibre
// (latence 40 ms, 20 Mbit/s), processeur normal. Première ouverture (sans mémoire) puis deuxième (avec mémoire).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('email', '==', 'noura@gmail.com').limit(1).get()
const token = await admin.auth().createCustomToken(u.docs[0].id)
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } })
const p = await ctx.newPage()
await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
await p.evaluate(async ({ cfg, token }) => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js')
  const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
  await signInWithCustomToken(getAuth(initializeApp(cfg)), token)
}, { cfg, token })
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 20e6 / 8, uploadThroughput: 5e6 / 8 })
// LECTURE SEULE : temps jusqu'à la fin du chargement de « Collectes par jour » (Caisse Agence, PC)
for (const essai of ['1re', '2e']) {
  await p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
  const btn = p.getByRole('button', { name: /Caisse Agence/ }).first()
  await btn.waitFor({ timeout: 60000 }); await p.waitForTimeout(1500)
  const t1 = Date.now(); await btn.click()
  await p.getByText(/Collectes par jour/).first().waitFor({ timeout: 60000 }).catch(() => {})
  const tCard = Date.now() - t1
  await p.waitForFunction(() => !document.body.innerText.includes('Chargement des collectes'), null, { timeout: 120000, polling: 200 }).catch(() => {})
  console.log(`${essai} : carte visible ${(tCard / 1000).toFixed(1)} s | collectes chargées ${((Date.now() - t1) / 1000).toFixed(1)} s`)
}
await b.close(); process.exit(0)
