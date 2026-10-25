// LECTURE SEULE : vitesse de la Caisse Agence de noura@gmail.com, simulée sur TÉLÉPHONE
// (écran 390 px, réseau 4G : 9 Mbit/s, latence 170 ms, processeur 4× plus lent). Cache vidé. Aucune action.
// Usage : node scripts/_speed-phone.mjs [nombre de mesures, défaut 2]
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('email', '==', 'noura@gmail.com').limit(1).get()
const token = await admin.auth().createCustomToken(u.docs[0].id)
const RUNS = Number(process.argv[2] || 2)
const results = []
const b = await chromium.launch()
for (let run = 0; run < RUNS; run++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
  await p.evaluate(async ({ cfg, token }) => {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js')
    const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
    await signInWithCustomToken(getAuth(initializeApp(cfg)), token)
  }, { cfg, token })
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Network.clearBrowserCache')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 170, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  let jsKB = 0
  p.on('response', async r => { if (/\/assets\/.*\.js$/.test(r.url())) { try { jsKB += (await r.body()).length / 1024 } catch {} } })
  const t0 = Date.now()
  await p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
  const menu = p.locator('header button.md\\:hidden').last()
  await menu.waitFor({ timeout: 120000 })
  const tOpen = Date.now() - t0
  await p.waitForTimeout(6000) // l'utilisateur regarde l'accueil quelques secondes
  await menu.click()
  const t1 = Date.now()
  await p.getByRole('button', { name: /Caisse Agence/ }).last().click()
  await p.locator('h3').filter({ hasText: /En gare|rachida|[A-Za-z]/ }).first().waitFor({ timeout: 120000 }).catch(() => {})
  const tCaisse = Date.now() - t1
  results.push({ ouverture_s: +(tOpen / 1000).toFixed(1), caisse_s: +(tCaisse / 1000).toFixed(1), codeJs_Mo: +(jsKB / 1024).toFixed(2) })
  await ctx.close()
}
await b.close()
const avg = k => +(results.reduce((s, r) => s + r[k], 0) / results.length).toFixed(1)
console.log(JSON.stringify({ mesures: results, moyenne: { ouverture_s: avg('ouverture_s'), caisse_s: avg('caisse_s') } }, null, 1))
process.exit(0)
