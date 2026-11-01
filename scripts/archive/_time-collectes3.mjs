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
// LECTURE SEULE : chronologie de la carte (2e ouverture) — Caisse affichée, journées affichées, chargement terminé
for (const essai of ['1re', '2e']) {
  await p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
  const btn = p.getByRole('button', { name: /Caisse Agence/ }).first()
  await btn.waitFor({ timeout: 60000 }); await p.waitForTimeout(1500)
  const t1 = Date.now(); await btn.click()
  const head = p.getByText(/Collectes par jour/).first()
  await head.waitFor({ timeout: 60000 }); const tCard = Date.now() - t1; await head.click()
  const marks = []
  let last = ''
  while (Date.now() - t1 < 15000) {
    const s = await p.evaluate(() => { const b = document.body.innerText; const h = [...document.querySelectorAll('*')].find(e => e.children.length < 3 && /Collectes par jour/.test(e.textContent || '')); let c = h; for (let i = 0; i < 6 && c && !/DH[sS]*DH[sS]*DH/.test(c.innerText || ''); i++) c = c.parentElement; const rows = c ? ((c.innerText || '').match(/bd{1,2}s+(oct|nov|sept)/gi) || []).length : -1; return `lignes ${rows} | statut ${(b.match(/(Reste à verser|Versé à l'admin|Rien à verser)/g) || []).length} j ${b.includes('Chargement des collectes') ? '⏳' : '✓'} ${b.includes('Chargement') && /\d+ expéditions? chargée/.test(b) ? 'caisse⏳' : ''}` })
    if (s !== last) { marks.push(`${((Date.now() - t1) / 1000).toFixed(1)}s ${s}`); last = s }
    await p.waitForTimeout(100)
  }
  console.log(essai, `carte ${(tCard / 1000).toFixed(1)}s →`, marks.join(' | '))
  await p.waitForTimeout(6000)
}
await b.close(); process.exit(0)
