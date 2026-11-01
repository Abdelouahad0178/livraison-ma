// LECTURE SEULE : fichiers JS téléchargés à l'ouverture de /agent puis à l'ouverture de Caisse Agence (noura).
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import { chromium } from 'playwright'
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))) })
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const cfg = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID }
const u = await admin.firestore().collection('users').where('email', '==', 'noura@gmail.com').limit(1).get()
const token = await admin.auth().createCustomToken(u.docs[0].id)
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
const p = await ctx.newPage()
let phase = 'connexion'
const files = []
p.on('response', async r => { const url = r.url(); if (!/arelanc\.web\.app\/assets\/.*\.js$/.test(url)) return; let len = 0; try { len = (await r.body()).length } catch {} ; files.push({ phase, f: url.split('/').pop().replace(/-[\w-]{8}\.js$/, ''), kb: Math.round(len / 1024) }) })
await p.goto('https://arelanc.web.app/login', { waitUntil: 'load' })
await p.evaluate(async ({ cfg, token }) => {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js')
  const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
  await signInWithCustomToken(getAuth(initializeApp(cfg)), token)
}, { cfg, token })
// Nouveau contexte de chargement : comme un utilisateur qui ouvre directement /agent (cache navigateur vidé)
await ctx.clearCookies().catch(() => {})
phase = 'ouverture /agent'
const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.clearBrowserCache'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
await p.getByRole('button', { name: /Caisse Agence/ }).first().waitFor({ timeout: 60000 })
await p.waitForTimeout(8000)
phase = 'Caisse Agence'
await p.getByRole('button', { name: /Caisse Agence/ }).first().click()
await p.waitForTimeout(10000)
for (const ph of ['ouverture /agent', 'Caisse Agence']) {
  const l = files.filter(x => x.phase === ph).sort((a, b) => b.kb - a.kb)
  console.log(`\n== ${ph} : ${l.length} fichiers, ${l.reduce((s, x) => s + x.kb, 0)} Ko`)
  l.forEach(x => console.log(String(x.kb).padStart(5), 'Ko', x.f))
}
await b.close()
process.exit(0)
