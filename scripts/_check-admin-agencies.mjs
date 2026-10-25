// LECTURE SEULE : période affichée à l'ouverture de « COD par agence » et « Port par agence » (compte admin, aucun clic d'action)
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('role', '==', 'admin').limit(1).get()
const token = await admin.auth().createCustomToken(u.docs[0].id)
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage()
await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
await p.evaluate(async ({ cfg, token }) => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js')
  const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
  await signInWithCustomToken(getAuth(initializeApp(cfg)), token)
}, { cfg, token })
await p.goto('https://arelanc.web.app/admin', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => [...document.querySelectorAll("button")].some(b => /Port par agence/i.test(b.innerText)), null, { timeout: 60000 })
const names = await p.evaluate(() => [...document.querySelectorAll("button")].map(b => b.innerText.trim()).filter(t => /agence/i.test(t)).slice(0, 12)); console.log("Boutons :", names)
const SHOT = process.env.SHOT_DIR
for (const [i, name] of [[2, /Port par agence/i]]) {
  const btn = p.getByRole("button", { name }).first()
  if (!(await btn.count())) { console.log("absent", String(name)); continue }
  await btn.click(); await p.waitForTimeout(7000)
  await p.screenshot({ path: `${SHOT}/admin-agences-${i}.png`, clip: { x: 0, y: 0, width: 1440, height: 520 } })
  console.log("capture", i)
}
await p.getByText("Accueil").first().click(); await p.waitForTimeout(1500)
await p.getByRole("button", { name: /Expéditions/ }).first().click(); await p.waitForTimeout(6000)
await p.screenshot({ path: `${SHOT}/admin-exp.png`, clip: { x: 0, y: 0, width: 1440, height: 620 } }); console.log("capture exp")
await b.close(); process.exit(0)
