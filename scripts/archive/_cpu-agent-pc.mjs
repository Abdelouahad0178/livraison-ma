// LECTURE SEULE : ce qui se charge pendant l'ouverture de la page Agent (noura) sur PC, jusqu'au bouton « Caisse Agence ».
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
await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
const reqs = new Map(); let t0 = 0
cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, start: e.timestamp, type: e.type }))
cdp.on('Network.responseReceived', e => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker } })
cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength } })
const evs = []; cdp.on("Tracing.dataCollected", e => evs.push(...e.value)); const tdone = new Promise(r => cdp.once("Tracing.tracingComplete", r)); await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,v8.execute", transferMode: "ReportEvents" })
const tStart = Date.now()
const nav = p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
await nav
const marks = {}
const mark = async (name, fn) => { await fn().catch(() => {}); marks[name] = Date.now() - tStart }
await Promise.all([
  mark('HTML chargé', async () => {}),
  mark('en-tête visible', () => p.locator('header').first().waitFor({ timeout: 60000 })),
  mark('bouton Caisse Agence', () => p.getByRole('button', { name: /Caisse Agence/ }).first().waitFor({ timeout: 60000 })),
])
await cdp.send("Tracing.end"); await tdone
{ const X = evs.filter(e => e.ph === "X" && e.dur); const pid = (X.find(e => e.name === "RunTask") || X[0]).pid; const t0 = Math.min(...X.filter(e=>e.pid===pid).map(e => e.ts)); const buckets = {}; for (const e of X) if (e.pid === pid && e.name === "RunTask") { const s = Math.floor((e.ts - t0) / 250000); buckets[s] = (buckets[s] || 0) + e.dur / 1000 } console.log("Processeur occupé par tranche de 0,25 s :", Object.entries(buckets).map(([k, v]) => (k * 0.25).toFixed(2) + "s:" + Math.round(v) + "ms").join(" ")); const long = X.filter(e => e.pid === pid && e.name === "RunTask" && e.dur > 50000).map(e => ((e.ts - t0) / 1e6).toFixed(2) + "s " + Math.round(e.dur / 1000) + "ms"); console.log("Tâches longues :", long.join(" | ")) }
await p.waitForTimeout(500)
const all = [...reqs.values()].filter(r => r.start)
const base = Math.min(...all.map(r => r.start))
console.log('Repères :', Object.entries(marks).map(([k, v]) => `${k} ${(v / 1000).toFixed(2)} s`).join(' | '))
const group = r => /firestore\.googleapis/.test(r.url) ? 'Firestore' : /identitytoolkit|securetoken/.test(r.url) ? 'Connexion' : /\.js(\?|$)/.test(r.url) ? 'JS' : /\.css/.test(r.url) ? 'CSS' : /\.(png|jpg|svg|webp|ico|woff2?)/.test(r.url) ? 'Image/police' : 'Autre'
const tot = {}
for (const r of all) { const g = group(r); tot[g] = tot[g] || { n: 0, ko: 0 }; tot[g].n++; tot[g].ko += (r.bytes || 0) / 1024 }
console.log('Par type :', Object.entries(tot).map(([k, v]) => `${k} ${v.n} req. ${v.ko.toFixed(0)} Ko`).join(' | '))
await b.close()
process.exit(0)
