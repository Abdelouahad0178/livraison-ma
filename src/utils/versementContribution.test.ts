import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { build } from 'esbuild'
import { versementContributionOf } from './versementContribution'

const holders = (ids: string[]) => () => new Set(ids)
const base = { portType: 'port_du', price: 30, destinationCity: 'Agadir', originCity: 'Casablanca', status: 'Livré', createdAt: '2026-10-19T10:00:00.000Z' }

describe('copie allégée des versements — contribution d\'une expédition', () => {
  it('port dû encaissé : agence de destination, journée d\'encaissement, où est l\'argent', () => {
    const p = { ...base, portStatus: 'collected', portCollectedAt: '2026-10-20T10:00:00.000Z', portCollectedById: 'livreur' }
    expect(versementContributionOf(p, holders([]))).toEqual({ city: 'Agadir', dayKey: '2026-10-20', kind: 'portDu', bucket: 'nonRecu', amount: 30 })
    expect(versementContributionOf({ ...p, portChefReceivedAt: 'x' }, holders([]))?.bucket).toBe('aVerser')
    expect(versementContributionOf({ ...p, portCollectedById: 'chef' }, holders(['chef']))?.bucket).toBe('aVerser')
    expect(versementContributionOf({ ...p, portAdminTransferred: true }, holders([]))?.bucket).toBe('verse')
  })
  it('port payé ramassé au guichet : agence de DÉPART ; pas encore reçu tant que le chef d\'agence ne l\'a pas reçu', () => {
    const p = { ...base, portType: 'port_paye', destinationCity: 'Rabat', originCity: 'Agadir', status: 'Arrivé en agence',
      portStatus: 'collected', portCollectedAt: '2026-10-22T09:00:00.000Z', createdAt: '2026-10-22T09:00:00.000Z' }
    expect(versementContributionOf(p, holders([]))).toEqual({ city: 'Agadir', dayKey: '2026-10-22', kind: 'portPaye', bucket: 'nonRecu', amount: 30 })
    expect(versementContributionOf({ ...p, portStatus: 'received' }, holders([]))?.bucket).toBe('aVerser')
  })
  it('ne compte pas : pas encaissé, argent d\'avant le 05/10 08:00 (heure du Maroc)', () => {
    expect(versementContributionOf({ ...base, portStatus: 'pending' }, holders([]))).toBeNull()
    expect(versementContributionOf({ ...base, portStatus: 'collected', portCollectedAt: '2026-10-05T06:59:00.000Z' }, holders([]))).toBeNull()
    expect(versementContributionOf({ ...base, portStatus: 'collected', portCollectedAt: '2026-10-05T07:01:00.000Z' }, holders([]))?.dayKey).toBe('2026-10-05')
  })
  it('la version du SERVEUR (functions/shared) est à jour avec la règle des pages', async () => {
    const r = await build({
      entryPoints: ['src/utils/versementContribution.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false,
      banner: { js: '// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/versementContribution.ts — ne pas modifier.' },
    })
    const fresh = r.outputFiles[0].text
    const deployed = readFileSync('functions/shared/versementContribution.js', 'utf8')
    // Échec : lancer `node scripts/build-functions-shared.mjs`, puis redéployer la fonction syncVersementStats
    expect(deployed.replace(/\r\n/g, '\n')).toBe(fresh.replace(/\r\n/g, '\n'))
  }, 30000)
})
