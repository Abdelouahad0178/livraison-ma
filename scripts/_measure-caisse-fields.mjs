// LECTURE SEULE : poids de chaque champ de parcelsLite (Agadir, 45 jours) et champs lus par les pages de caisse
// (fermeture des imports de CaisseChefTab + pages exploitation). Aucune écriture.
import admin from 'firebase-admin'
import { readFileSync, existsSync, statSync } from 'fs'
import path from 'path'

const sa = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

// ── 1. Fermeture des imports des pages de caisse ──
const ROOTS = ['src/pages/agent/tabs/CaisseChefTab.tsx', 'src/pages/ChefExploitationPage.tsx']
const seen = new Set()
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec)
  for (const c of [base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx']) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}
const stack = ROOTS.map(r => path.resolve(r))
while (stack.length) {
  const f = stack.pop()
  if (seen.has(f)) continue
  seen.add(f)
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const r = resolve(f, m[1] || m[2])
    if (r && !/\.test\./.test(r)) stack.push(r)
  }
}
const closureText = [...seen].map(f => readFileSync(f, 'utf8')).join('\n')
console.log('Fichiers dans la fermeture des pages de caisse :', seen.size)

// ── 2. Poids des champs (parcelsLite, Agadir, 45 jours) ──
const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 45 * 864e5))
const docs = new Map()
for (const field of ['originCity', 'destinationCity']) {
  const snap = await db.collection('parcelsLite').where(field, '==', 'Agadir').where('createdAt', '>=', since).orderBy('createdAt', 'desc').get()
  snap.docs.forEach(d => docs.set(d.id, d.data()))
}
const size = v => JSON.stringify(v ?? null).length + 2
const perField = new Map()
let total = 0
for (const d of docs.values()) for (const [k, v] of Object.entries(d)) {
  const s = size(v) + k.length
  total += s
  const e = perField.get(k) || { bytes: 0, n: 0 }
  e.bytes += s; e.n++
  perField.set(k, e)
}
const used = k => new RegExp(`(?:\\.|\\?\\.|['"\`])${k}\\b|\\b${k}\\s*[:,}=]`).test(closureText)
const rows = [...perField.entries()].map(([k, e]) => ({ k, ...e, used: used(k) })).sort((a, b) => b.bytes - a.bytes)
const unusedBytes = rows.filter(r => !r.used).reduce((s, r) => s + r.bytes, 0)
console.log(`Expéditions : ${docs.size} — ${(total / 1e6).toFixed(1)} Mo (JSON approx.)`)
console.log(`Champs JAMAIS lus par la caisse : ${rows.filter(r => !r.used).length} / ${rows.length} — ${(unusedBytes / 1e6).toFixed(1)} Mo (${(100 * unusedBytes / total).toFixed(0)} %)`)
console.log('\nNon lus (par poids) :')
rows.filter(r => !r.used).slice(0, 80).forEach(r => console.log(`  ${r.k.padEnd(34)} ${(r.bytes / 1e3).toFixed(0).padStart(7)} Ko  ${r.n}`))
console.log('\nLus, les 25 plus lourds :')
rows.filter(r => r.used).slice(0, 25).forEach(r => console.log(`  ${r.k.padEnd(34)} ${(r.bytes / 1e3).toFixed(0).padStart(7)} Ko  ${r.n}`))
process.exit(0)
