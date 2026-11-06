import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import { readFileSync } from 'fs'
import {
  isArchiveSettled, shouldArchiveNow, shouldWakeArchived, isOldUnsettled, isArchivedButUnsettled, oldUnsettledItem, unsettledReason,
} from './archiveRule'

const DAY = 86400000
const NOW = Date.parse('2026-11-25T12:00:00Z')
const OCT10 = Date.parse('2026-10-10T10:00:00Z') // après le 05/10 : argent suivi
const SEP25 = Date.parse('2026-09-25T10:00:00Z') // période d'essai
const livre = { status: 'Livré', price: 30, portType: 'port_du', portStatus: 'collected', codAmount: 0, createdAt: OCT10 }

describe('Archivage : terminé ET réglé seulement (05/11/2026)', () => {
  it('livrée, port encaissé, sans COD : réglée', () => {
    expect(isArchiveSettled(livre)).toBe(true)
    expect(isArchiveSettled({ ...livre, portType: 'port_en_compte_destinataire', portStatus: undefined })).toBe(true)
    expect(isArchiveSettled({ ...livre, portType: 'port_paye', portStatus: 'received' })).toBe(true)
    expect(isArchiveSettled({ ...livre, price: 0, portStatus: undefined })).toBe(true)
  })
  it('port dû non encaissé, port payé sans encaissement : pas réglée', () => {
    expect(isArchiveSettled({ ...livre, portStatus: undefined })).toBe(false)
    expect(isArchiveSettled({ ...livre, portType: 'port_paye', portStatus: undefined })).toBe(false)
    expect(isArchiveSettled({ ...livre, portType: 'port_du_cheque', portStatus: null })).toBe(false)
  })
  it('COD : réglé seulement reçu par le chef d\'agence / réglé / payé au client', () => {
    expect(isArchiveSettled({ ...livre, codAmount: 500, codStatus: 'pending' })).toBe(false)
    expect(isArchiveSettled({ ...livre, codAmount: 500, codStatus: 'collected' })).toBe(false)
    expect(isArchiveSettled({ ...livre, codAmount: 500, codStatus: 'remis' })).toBe(true)
    expect(isArchiveSettled({ ...livre, codAmount: 500, codStatus: 'regle' })).toBe(true)
    expect(isArchiveSettled({ ...livre, codAmount: 500, codStatus: 'collected', codSenderPaid: true })).toBe(true)
  })
  it('non terminées : jamais réglées ; retour finalisé selon son port ; annulée réglée', () => {
    for (const st of ['En cours de livraison', 'Arrivé en agence', 'En transit', 'Retourné', 'Initialisé']) expect(isArchiveSettled({ ...livre, status: st })).toBe(false)
    expect(isArchiveSettled({ ...livre, status: 'Retour finalisé', codAmount: 900, codStatus: 'pending' })).toBe(true)
    expect(isArchiveSettled({ ...livre, status: 'Retour finalisé', portStatus: undefined })).toBe(false)
    expect(isArchiveSettled({ status: 'Annulé', price: 30, portType: 'port_du' })).toBe(true)
  })
  it('depuis le 05/10 : rangée après 30 jours SEULEMENT si réglée — plus jamais « tout après 45 jours »', () => {
    expect(shouldArchiveNow(livre, NOW, 45)).toBe(true) // 46 jours, réglée
    expect(shouldArchiveNow({ ...livre, createdAt: NOW - 29 * DAY }, NOW, 45)).toBe(false) // pas encore 30 jours
    expect(shouldArchiveNow({ ...livre, portStatus: undefined }, NOW, 45)).toBe(false) // port dû non encaissé, 46 jours
    expect(shouldArchiveNow({ ...livre, status: 'En cours de livraison' }, NOW, 45)).toBe(false)
    expect(shouldArchiveNow({ ...livre, status: 'Arrivé en agence' }, NOW + 300 * DAY, 45)).toBe(false) // jamais, même 1 an après
    expect(shouldArchiveNow({ ...livre, isArchived: true }, NOW, 45)).toBe(false)
  })
  it('période d\'essai (avant le 05/10) : ancienne règle gardée', () => {
    const trial = { ...livre, createdAt: SEP25, portStatus: undefined }
    expect(shouldArchiveNow({ ...trial, status: 'Arrivé en agence' }, NOW, 45)).toBe(true) // 61 jours > 45
    expect(shouldArchiveNow({ ...trial, status: 'Livré' }, SEP25 + 20 * DAY, 45)).toBe(false) // essai, 20 jours : pas encore
    const trial35 = { status: 'Livré', price: 30, portType: 'port_du', codAmount: 0, createdAt: SEP25 }
    expect(shouldArchiveNow(trial35, SEP25 + 35 * DAY, 45)).toBe(true) // livrée sans COD > 30 j (ancienne règle)
    expect(shouldArchiveNow({ ...trial35, codAmount: 500 }, SEP25 + 35 * DAY, 45)).toBe(false) // COD : attend 45 j
  })
  it('réveil : rangée et réglée → redevient à régler', () => {
    const before = { ...livre, isArchived: true }
    expect(shouldWakeArchived(before, { ...before, portStatus: null })).toBe(true) // encaissement annulé
    expect(shouldWakeArchived(before, { ...before, status: 'Arrivé en agence' })).toBe(true) // livraison annulée
    expect(shouldWakeArchived(before, { ...before, remark: 'x' })).toBe(false) // toujours réglée
    expect(shouldWakeArchived({ ...before, isArchived: false }, { ...before, portStatus: null })).toBe(false) // pas rangée avant
    expect(shouldWakeArchived({ ...before, createdAt: SEP25 }, { ...before, createdAt: SEP25, portStatus: null })).toBe(false) // essai
    expect(isArchivedButUnsettled({ ...before, portStatus: null })).toBe(true)
    expect(isArchivedButUnsettled(before)).toBe(false)
  })
  it('anciennes à régler : non rangées, depuis le 05/10, au-delà de la fenêtre des listes, pas réglées', () => {
    expect(isOldUnsettled({ ...livre, portStatus: undefined }, NOW, 45)).toBe(true) // 46 jours
    expect(isOldUnsettled({ ...livre, portStatus: undefined }, NOW, 60)).toBe(false) // encore dans la fenêtre
    expect(isOldUnsettled(livre, NOW, 45)).toBe(false) // réglée
    expect(isOldUnsettled({ ...livre, status: 'En cours de livraison', createdAt: SEP25 }, NOW, 45)).toBe(false) // essai
    expect(isOldUnsettled({ ...livre, status: 'En cours de livraison', isArchived: true }, NOW, 45)).toBe(false)
  })
  it('ligne de liste et raison en mots simples', () => {
    const p = { ...livre, senderNic: '1234567', portStatus: undefined, codAmount: 800, codStatus: 'collected', destinationCity: 'Agadir', originCity: 'Casablanca' }
    expect(unsettledReason(p)).toBe('port non encaissé + COD encaissé, pas encore reçu par le chef d\'agence')
    expect(unsettledReason({ ...p, status: 'En cours de livraison' })).toBe('statut « En cours de livraison »')
    expect(oldUnsettledItem('x', p)).toMatchObject({ id: 'x', nic: '1234567', city: 'Agadir', port: 30, cod: 800, status: 'Livré' })
    expect(oldUnsettledItem('y', { ...p, wasReturned: true, returnToCity: 'Casablanca' }).city).toBe('Casablanca')
  })
  it('la version du SERVEUR (functions/shared) est à jour avec la règle de la page', async () => {
    const r = await build({
      entryPoints: ['src/utils/archiveRule.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false,
      banner: { js: '// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/archiveRule.ts — ne pas modifier.' },
    })
    // Échec : lancer `node scripts/build-functions-shared.mjs`, puis redéployer scheduledWeeklyArchiving / wakeArchivedParcel
    expect(readFileSync('functions/shared/archiveRule.js', 'utf8').replace(/\r\n/g, '\n')).toBe(r.outputFiles[0].text.replace(/\r\n/g, '\n'))
  }, 30000)
})
