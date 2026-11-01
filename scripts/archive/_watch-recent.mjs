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
for (const essai of ['1re', '2e']) {
  const t0 = Date.now()
  await p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
  await p.getByRole('button', { name: /Expéditions/ }).first().click({ timeout: 60000 })
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(2500)
    const txt = await p.evaluate(() => { const b = document.body.innerText; const m = b.match(/[^\n]*(hargement|expéditions? chargée|journée)[^\n]*/g) || []; const c = b.match(/\d[\d\s]* expéditions?/); return [...new Set(m)].slice(0, 3).join(' || ') + ' ## ' + (c ? c[0] : '') })
    console.log(essai, ((Date.now() - t0) / 1000).toFixed(0) + 's', txt.slice(0, 220))
  }
}
await b.close(); process.exit(0)
