/**
 * 🛡️ CONTRÔLE AVANT MISE EN LIGNE (01/11/2026) — lancé automatiquement par `firebase deploy` (firebase.json → predeploy).
 *   node scripts/predeploy-check.mjs hosting     # site : règles partagées + TypeScript (≤ base) + tests + construction
 *   node scripts/predeploy-check.mjs functions   # fonctions : règles partagées + chargement de functions/index.js + tests
 * Une étape en échec → la mise en ligne est ANNULÉE (code de sortie ≠ 0). Les tests déjà réussis sur EXACTEMENT les mêmes
 * fichiers depuis moins de 30 min ne sont pas relancés (déploiement site + fonctions à la suite).
 * TypeScript : le projet a des erreurs anciennes (« base », scripts/tsc-baseline.json) ; on refuse seulement s'il y en a PLUS.
 */
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const target = process.argv[2] || 'hosting'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..') // racine du projet, quel que soit le dossier courant
const OK_FILE = join(ROOT, 'node_modules', '.predeploy-ok.json')
const run = (label, cmd) => {
  process.stdout.write(`\n▶ ${label}…\n`)
  try { return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) }
  catch (e) { return { failed: true, out: `${e.stdout || ''}${e.stderr || ''}` } }
}
const fail = (msg, out = '') => {
  console.error(`\n❌ MISE EN LIGNE ANNULÉE — ${msg}\n`)
  if (out) console.error(String(out).split('\n').slice(-40).join('\n'))
  process.exit(1)
}

// Empreinte du CONTENU des fichiers qui comptent : sert à ne pas relancer les mêmes tests (une recompilation à l'identique
// des règles partagées change la date des fichiers, pas leur contenu)
function fingerprint() {
  const h = createHash('sha256')
  const add = p => { h.update(p); h.update(readFileSync(p)) }
  const walk = dir => {
    if (!existsSync(dir)) return
    for (const f of readdirSync(dir).sort()) {
      if (f === 'node_modules') continue
      const p = join(dir, f), s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|mjs|cjs|json|rules)$/.test(f)) add(p)
    }
  }
  ;['src', 'functions', 'scripts/build-functions-shared.mjs', 'firestore.rules'].forEach(p => {
    const full = join(ROOT, p)
    if (existsSync(full) && statSync(full).isFile()) add(full); else walk(full)
  })
  return h.digest('hex')
}

// 1. Règles partagées navigateur → serveur (functions/shared) à jour
let r = run('Règles partagées pour le serveur', 'node scripts/build-functions-shared.mjs')
if (r.failed) fail('compilation des règles partagées impossible', r.out)

// 2. TypeScript : pas d'erreur NOUVELLE (site seulement)
if (target === 'hosting') {
  const base = JSON.parse(readFileSync(join(ROOT, 'scripts', 'tsc-baseline.json'), 'utf8')).errors
  r = run('TypeScript', 'npx tsc --noEmit -p .')
  const out = typeof r === 'string' ? r : r.out
  const n = (out.match(/error TS\d+/g) || []).length
  if (n > base) fail(`${n - base} erreur(s) TypeScript nouvelle(s) (${n} au lieu de ${base} au plus)`, out.split('\n').filter(l => /error TS/.test(l)).join('\n'))
  console.log(`  ✓ ${n} erreur(s) TypeScript (base : ${base})`)
}

// 3. Fonctions : le code serveur se charge
if (target === 'functions') {
  r = run('Chargement des fonctions serveur', 'node -e "require(\'./functions/index.js\')"')
  if (r.failed) fail('functions/index.js ne se charge pas', r.out)
  console.log('  ✓ functions/index.js se charge')
}

// 4. Tests (sautés si déjà réussis sur les mêmes fichiers il y a moins de 30 min)
const fp = fingerprint()
let cached = null
try { cached = JSON.parse(readFileSync(OK_FILE, 'utf8')) } catch { /* aucun */ }
if (cached && cached.fp === fp && Date.now() - cached.at < 30 * 60000) {
  console.log(`\n▶ Tests : déjà réussis sur ces fichiers à ${new Date(cached.at).toLocaleTimeString('fr-FR')} (${cached.summary})`)
} else {
  r = run('Tests (vitest)', 'npx vitest run --maxWorkers=3')
  const out = typeof r === 'string' ? r : r.out
  const summary = (out.match(/Tests\s+[^\n]+/) || ['?'])[0].replace(/\s+/g, ' ').trim()
  if (r.failed || /failed/.test(summary)) fail(`tests en échec (${summary})`, out.split('\n').filter(l => /FAIL|×|AssertionError|Error:/.test(l)).slice(0, 30).join('\n'))
  console.log(`  ✓ ${summary}`)
  try { writeFileSync(OK_FILE, JSON.stringify({ fp: fingerprint(), at: Date.now(), summary })) } catch { /* sans importance */ }
}

// 5. Construction du site
if (target === 'hosting') {
  r = run('Construction du site', 'npm run build')
  if (r.failed) fail('la construction du site a échoué', r.out)
  console.log('  ✓ site construit (dist/)')
}
console.log(`\n✅ Contrôle avant mise en ligne réussi (${target}).\n`)
