import { describe, it, expect } from 'vitest'
import { build } from 'esbuild'
import { readFileSync } from 'fs'
import { searchTokensOf, searchDocOf, wordQueryOf, wordQueryMatches, chequeNumbersOf } from './searchWords'

const p = {
  sender: { name: 'Nouredine BAKRIM' }, receiver: { name: 'M2A ZONE AUTO ' }, clientName: 'Société Élan',
  codDocuments: [{ type: 'cheque', numero: '1234 567' }, { type: 'traite', numero: 'TR-99812' }], portDuChequeNumero: '7654321',
  createdAt: '2026-11-03T10:00:00Z',
}
const hit = (term: string, scope: any = 'all') => { const q = wordQueryOf(term, scope); return !!q && wordQueryMatches(searchTokensOf(p), q) }

describe('Recherche par mot (Admin)', () => {
  it('un mot au milieu du nom est trouvé, avec ou sans majuscules / accents', () => {
    expect(hit('BAKRIM')).toBe(true)
    expect(hit('bakr')).toBe(true) // début de mot
    expect(hit('ZONE AUTO')).toBe(true)
    expect(hit('auto m2a')).toBe(true) // ordre des mots libre
    expect(hit('elan')).toBe(true) // client en compte, accent ignoré
    expect(hit('societe')).toBe(true)
  })
  it('tous les mots tapés doivent être dans le MÊME nom', () => {
    expect(hit('M2A CASA')).toBe(false)
    expect(hit('kri')).toBe(false) // milieu de mot : non (début de mot seulement)
    expect(hit('BAKRIM ZONE')).toBe(false) // un mot chez l'expéditeur, l'autre chez le destinataire
  })
  it('portée expéditeur / destinataire', () => {
    expect(hit('BAKRIM', 'sender')).toBe(true)
    expect(hit('BAKRIM', 'receiver')).toBe(false)
    expect(hit('ZONE', 'receiver')).toBe(true)
  })
  it('numéro de chèque ou de traite (entier ou début), espaces et tirets ignorés', () => {
    expect(chequeNumbersOf(p)).toEqual(['1234567', 'TR99812', '7654321'])
    expect(hit('1234567')).toBe(true)
    expect(hit('1234')).toBe(true)
    expect(hit('TR-99812')).toBe(true)
    expect(hit('7654321')).toBe(true)
    expect(hit('7777777')).toBe(false)
  })
  it('rien à chercher sous 3 lettres utiles', () => {
    expect(wordQueryOf('ab')).toBeNull()
    expect(wordQueryOf('  ')).toBeNull()
  })
  it('document d\'index : jetons triés et date', () => {
    const d = searchDocOf(p)
    expect(d.d).toBe(Date.parse('2026-11-03T10:00:00Z'))
    expect(d.w).toContain('s:bakrim')
    expect(d.w).toContain('r:m2a')
    expect(d.w).toEqual([...d.w].sort())
  })
  it('la version du SERVEUR (functions/shared) est à jour avec la règle de la page', async () => {
    const r = await build({
      entryPoints: ['src/utils/searchWords.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false,
      banner: { js: '// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/searchWords.ts — ne pas modifier.' },
    })
    // Échec : lancer `node scripts/build-functions-shared.mjs`, puis redéployer la fonction syncParcelSearch
    expect(readFileSync('functions/shared/searchWords.js', 'utf8').replace(/\r\n/g, '\n')).toBe(r.outputFiles[0].text.replace(/\r\n/g, '\n'))
  }, 30000)
})
