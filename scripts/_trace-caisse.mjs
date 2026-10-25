// LECTURE SEULE : trace navigateur (téléphone simulé) pendant l'ouverture de Caisse Agence (noura) :
// temps passé en calcul des styles, mise en page, dessin, script… Aucune action.
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
await p.goto('https://arelanc.web.app/agent', { waitUntil: 'domcontentloaded' })
const menu = p.locator('header button.md\\:hidden').last()
await menu.waitFor({ timeout: 120000 })
await p.waitForTimeout(6000)
await menu.click()
const events = []
cdp.on('Tracing.dataCollected', e => events.push(...e.value))
const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })
const t1 = Date.now()
await p.getByRole('button', { name: /Caisse Agence/ }).last().click()
await p.locator('h3').filter({ hasText: /[A-Za-z]/ }).first().waitFor({ timeout: 120000 }).catch(() => {})
const tCaisse = Date.now() - t1
await cdp.send('Tracing.end'); await done
// Temps PROPRE par type d'événement (thread principal du rendu)
const main = events.filter(e => e.ph === 'X' && e.dur)
const pid = (main.find(e => e.name === 'RunTask') || main[0])?.pid
const by = {}
for (const e of main) if (e.pid === pid && ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'RasterTask', 'ParseHTML', 'FunctionCall', 'EvaluateScript', 'v8.compile', 'MajorGC', 'MinorGC', 'HitTest', 'ParseAuthorStyleSheet', 'RecalculateStyles', 'UpdateLayerTree', 'Commit'].includes(e.name)) by[e.name] = (by[e.name] || 0) + e.dur / 1000
const nodes = await p.evaluate(() => document.getElementsByTagName('*').length)
console.log('Caisse affichée en', (tCaisse / 1000).toFixed(1), 's | éléments dans la page :', nodes)
Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, ms]) => console.log(' ', (ms / 1000).toFixed(2), 's', k))
// Les plus gros recalculs de style / mises en page
const big = main.filter(e => e.pid === pid && (e.name === 'UpdateLayoutTree' || e.name === 'Layout')).sort((a, b) => b.dur - a.dur).slice(0, 6)
big.forEach(e => console.log('  gros', e.name, (e.dur / 1000).toFixed(0), 'ms', e.args?.elementCount ? `éléments ${e.args.elementCount}` : '', e.args?.beginData?.dirtyObjects ? `objets ${e.args.beginData.dirtyObjects}` : ''))
await b.close()
process.exit(0)
