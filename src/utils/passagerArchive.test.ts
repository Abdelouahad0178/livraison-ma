import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import { readFileSync } from 'fs'
import {
  isPassagerArchiveCandidate, isPassagerParcel, isOldEnoughForPassagerArchive, passagerArchiveFields, passagerNamesOf,
  PASSAGER_ARCHIVED_BY,
} from './passagerArchive'

const NOW = Date.parse('2026-11-04T12:00:00Z')
const DAY = 86400000
const base = {
  status: 'Livré', codAmount: 0, serviceType: 'simple', portType: 'port_du', portStatus: 'collected',
  senderNameNorm: 'mohamed arar', receiverNameNorm: 'abdelilah qanass', createdAt: NOW - 20 * DAY,
}

describe('Archivage des passagers à 15 jours', () => {
  it('expédition livrée, simple, port dû encaissé : candidate', () => {
    expect(isPassagerArchiveCandidate(base)).toBe(true)
    expect(isPassagerArchiveCandidate({ ...base, portType: 'port_paye', portStatus: 'received' })).toBe(true)
    expect(isPassagerArchiveCandidate({ ...base, serviceType: undefined })).toBe(true)
  })
  it('port pas encore payé / encaissé : jamais', () => {
    expect(isPassagerArchiveCandidate({ ...base, portStatus: undefined })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, portStatus: 'pending' })).toBe(false)
  })
  it('client en compte, COD, chèque + espèces, retour BL, pas livrée, déjà archivée : jamais', () => {
    expect(isPassagerArchiveCandidate({ ...base, portType: 'port_en_compte_expediteur' })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, portType: 'port_en_compte_destinataire' })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, codAmount: 500 })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, codMixed: true })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, serviceType: 'retour_bl' })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, status: 'Arrivé en agence' })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, isArchived: true })).toBe(false)
    expect(isPassagerArchiveCandidate({ ...base, receiverNameNorm: '  ' })).toBe(false)
  })
  it('passager = expéditeur ET destinataire vus au plus 2 fois dans toute la base', () => {
    const seen = (m: Record<string, number>) => (n: string) => m[n] ?? 0
    expect(isPassagerParcel(base, seen({ 'mohamed arar': 1, 'abdelilah qanass': 2 }))).toBe(true)
    expect(isPassagerParcel(base, seen({ 'mohamed arar': 1, 'abdelilah qanass': 3 }))).toBe(false) // destinataire régulier
    expect(isPassagerParcel(base, seen({ 'mohamed arar': 5018, 'abdelilah qanass': 1 }))).toBe(false) // expéditeur client
    expect(isPassagerParcel(base, seen({ 'mohamed arar': 1 }))).toBe(false) // nom introuvable : prudence
  })
  it('15 jours révolus depuis la création', () => {
    expect(isOldEnoughForPassagerArchive({ createdAt: NOW - 16 * DAY }, NOW)).toBe(true)
    expect(isOldEnoughForPassagerArchive({ createdAt: NOW - 14 * DAY }, NOW)).toBe(false)
    expect(isOldEnoughForPassagerArchive({ createdAt: { toMillis: () => NOW - 20 * DAY } }, NOW)).toBe(true)
    expect(isOldEnoughForPassagerArchive({}, NOW)).toBe(false)
  })
  it('noms à compter et champs écrits', () => {
    expect(passagerNamesOf({ senderNameNorm: 'a', receiverNameNorm: 'a' })).toEqual(['a'])
    expect(passagerArchiveFields(NOW)).toEqual({ isArchived: true, archivedAt: '2026-11-04T12:00:00.000Z', archivedBy: PASSAGER_ARCHIVED_BY })
  })
  it('la version du SERVEUR (functions/shared) est à jour avec la règle de la page', async () => {
    const r = await build({
      entryPoints: ['src/utils/passagerArchive.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false,
      banner: { js: '// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/passagerArchive.ts — ne pas modifier.' },
    })
    // Échec : lancer `node scripts/build-functions-shared.mjs`, puis redéployer la fonction scheduledWeeklyArchiving
    expect(readFileSync('functions/shared/passagerArchive.js', 'utf8').replace(/\r\n/g, '\n')).toBe(r.outputFiles[0].text.replace(/\r\n/g, '\n'))
  }, 30000)
})
