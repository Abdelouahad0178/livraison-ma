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
// LECTURE SEULE : filtre dans Expéditions → Accueil → Expéditions : les filtres doivent être revenus à l'état normal
const info = async () => p.evaluate(() => {
  const inp = [...document.querySelectorAll('input')].find(i => /Recherche rapide/i.test(i.placeholder || ''))
  const b = document.body.innerText
  return `recherche="${inp ? inp.value : '?'}" | ${(b.match(/\d+ resultat\(s\)/) || ['?'])[0]} | puce période : ${(b.match(/\n(Tout|Aujourd'hui|7 jours|Ce mois|Journée[^\n]*)\n/) || ['', '?'])[1]}`
})
await p.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /Expéditions/.test(b.innerText)), null, { timeout: 60000 })
await p.getByRole('button', { name: /Expéditions/ }).first().click(); await p.waitForTimeout(5000)
console.log('1. ouverture        :', await info())
const inp = p.getByPlaceholder(/Recherche rapide/)
await inp.fill('CAPRAM'); await p.waitForTimeout(4000)
console.log('2. après filtre     :', await info())
await p.getByText('Accueil').first().click(); await p.waitForTimeout(1500)
await p.getByRole('button', { name: /Expéditions/ }).first().click(); await p.waitForTimeout(5000)
console.log('3. retour Expéditions :', await info())
await b.close(); process.exit(0)
