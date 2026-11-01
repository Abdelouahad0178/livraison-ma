// LECTURE SEULE : reproduit la recherche de l'onglet Expéditions de la page ADMIN (aucune action, aucun clic de modification).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('role', '==', 'admin').limit(1).get()
const token = await admin.auth().createCustomToken(u.docs[0].id)
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1500, height: 900 } })).newPage()
p.on('console', m => { if (/Recherche|Serveur|résultats/i.test(m.text())) console.log('   [console]', m.text().slice(0, 160)) })
await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
await p.evaluate(async ({ cfg, token }) => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js')
  const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
  await signInWithCustomToken(getAuth(initializeApp(cfg)), token)
}, { cfg, token })
await p.goto('https://arelanc.web.app/admin', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(8000)
const box = p.locator('input[placeholder*="Recherche rapide"]').first()
if (!(await box.isVisible().catch(() => false))) {
  await p.screenshot({ path: 'scripts/_repro-accueil.png' })
  await p.getByText(/^\s*Expéditions\s*$/).first().click().catch(() => {})
  await p.waitForTimeout(4000)
}
await box.waitFor({ timeout: 60000 })
for (const q of process.argv.slice(2)) {
  await box.fill('')
  await p.waitForTimeout(1500)
  await box.fill(q)
  await p.waitForTimeout(7000)
  const found = await p.locator('body').innerText().then(t => /1085840D/.test(t))
  const shot = `scripts/_repro-${q}-${q === q.toUpperCase() ? 'MAJ' : 'min'}.png`
  await p.screenshot({ path: shot, fullPage: false })
  console.log(`« ${q} » → ${found ? '1085840D AFFICHÉ' : '1085840D ABSENT'} (capture : ${shot})`)
}
await b.close()
process.exit(0)
