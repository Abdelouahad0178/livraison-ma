// Read-only navigation benchmark. Authentication/presence follow the normal app flow;
// no parcel, payment, setting, or account is modified.
import { readFileSync, writeFileSync } from 'node:fs'
import { initializeApp, cert, deleteApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { chromium } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config({ quiet: true })
const args = process.argv.slice(2)
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback
const origin = new URL(option('--origin', 'https://arelanc.web.app')).origin
const device = option('--device', 'desktop')
const runs = Number(option('--runs', '2'))
const output = option('--output', '')
const allowedOrigins = ['https://arelanc.web.app', 'http://127.0.0.1:5184']
if (!allowedOrigins.includes(origin) || !Number.isInteger(runs) || runs < 1 || runs > 5) throw new Error('Invalid benchmark parameters')
const key = JSON.parse(readFileSync('serviceAccountKey.json', 'utf8'))
if (key.project_id !== 'arelanc' || process.env.VITE_FIREBASE_PROJECT_ID !== key.project_id) throw new Error('Firebase project mismatch')
const admin = initializeApp({ credential: cert(key) }, 'navigation-benchmark')
const db = getFirestore(admin)
const user = await db.collection('users').where('email', '==', option('--email', 'noura@gmail.com')).limit(1).get()
if (user.empty || user.docs[0].data().role !== 'chef_agence') throw new Error('A chief account is required for this benchmark')
const token = await getAuth(admin).createCustomToken(user.docs[0].id)
const config = { apiKey: process.env.VITE_FIREBASE_API_KEY, authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: key.project_id }
const browser = await chromium.launch()
const results = []
try {
  for (let run = 0; run < runs; run++) {
    const mobile = device === 'mobile'
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
      isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block',
    })
    try {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.name))
      await page.addInitScript(() => {
        window.__navigationTasks = []
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) window.__navigationTasks.push(e.duration)
        }).observe({ type: 'longtask', buffered: true })
      })
      const cdp = await context.newCDPSession(page)
      const configureNetwork = async () => {
        await cdp.send('Network.enable')
        await cdp.send('Network.clearBrowserCache')
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false, latency: mobile ? 170 : 40,
          downloadThroughput: (mobile ? 9e6 : 20e6) / 8, uploadThroughput: (mobile ? 1.5e6 : 5e6) / 8,
        })
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 })
      }
      await configureNetwork()
      const publicStarted = Date.now()
      await page.goto(origin + '/', { waitUntil: 'domcontentloaded' })
      await page.locator('h1').first().waitFor({ timeout: 60000 })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const publicHome = { name: 'openPublicHome', ms: Date.now() - publicStarted }
      await page.goto(origin + '/login', { waitUntil: 'load' })
      await page.evaluate(async ({ config, token }) => {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js')
        const { getAuth, signInWithCustomToken } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
        await signInWithCustomToken(getAuth(initializeApp(config)), token)
      }, { config, token })
      await configureNetwork()
      const step = async (name, action, ready) => {
        const started = Date.now()
        await action()
        await ready()
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const ms = Date.now() - started
        return { name, ms }
      }
      const opening = await step('openAgent', () => page.goto(origin + '/agent', { waitUntil: 'domcontentloaded' }), async () => {
        if (mobile) {
          await page.locator('header button.md\\:hidden').last().waitFor({ timeout: 60000 })
        } else {
          await page.getByRole('button', { name: /Caisse Agence/ }).first().waitFor({ timeout: 60000 })
        }
      })
      const actions = []
      const openTab = async label => {
        const started = Date.now()
        if (mobile) await page.locator('header button.md\\:hidden').last().click()
        const button = page.getByRole('button', { name: label }).first()
        if (!mobile) { await button.hover(); await page.waitForTimeout(180) }
        const beforeClick = Date.now()
        await button.click()
        actions.push({ target: String(label), prepareMs: beforeClick - started, clickMs: Date.now() - beforeClick })
      }
      const expeditionsReady = () => page.getByPlaceholder(/Rechercher par N° EXP/).first().waitFor({ timeout: 60000 })
      const expeditions = await step('firstExpeditions', () => openTab(/Expéditions/), expeditionsReady)
      const saisie = await step('firstEntry', () => openTab(mobile ? /Nouveau colis/ : /Saisie colis/), () => page.locator('input[name="senderName"], input[placeholder*="expéditeur"], input[placeholder*="EXP"]').first().waitFor({ timeout: 60000 }))
      const returnToExpeditions = await step('returnExpeditions', () => openTab(/Expéditions/), expeditionsReady)
      await page.evaluate(() => scrollTo(0, 400))
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const stats = await page.evaluate(() => {
        const scripts = performance.getEntriesByType('resource').filter(e => /\/assets\/.*\.js(?:\?|$)/.test(e.name))
        return {
          scriptRequests: scripts.length,
          scriptDecodedBytes: scripts.reduce((sum, e) => sum + (e.decodedBodySize || 0), 0),
          unrequestedCashTabLoaded: scripts.some(e => /\/CaisseChefTab-.*\.js/.test(e.name)),
          longTasks: window.__navigationTasks.length,
          longTaskTotalMs: Math.round(window.__navigationTasks.reduce((sum, n) => sum + n, 0)),
          maxLongTaskMs: Math.round(Math.max(0, ...window.__navigationTasks)),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          headerVisibleAfterScroll: (document.querySelector('header')?.getBoundingClientRect().bottom || 0) > 0,
        }
      })
      results.push({ run: run + 1, steps: [publicHome, opening, expeditions, saisie, returnToExpeditions], actions, ...stats, runtimeErrors: errors })
      console.log(JSON.stringify({ run: run + 1, device, steps: results.at(-1).steps, actions, runtimeErrors: errors.length }))
    } finally { await context.close() }
  }
  const report = { date: new Date().toISOString(), origin, device, serviceWorkers: 'blocked', runs: results }
  if (output) writeFileSync(output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ device, complete: true, runs: results.length, output: output || null }))
} finally {
  await browser.close()
  await db.terminate()
  await deleteApp(admin)
}
