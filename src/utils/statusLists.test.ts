import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLOSED_STATUSES, RETURN_STATUSES, STATUSES, isReturnStatus } from '../firebase/constants'

// ↩️🏁 01/11/2026 (lot D) — UNE liste des statuts de retour pour tout le site ; les copies du serveur (CommonJS, ne peuvent
// pas importer le TypeScript) doivent rester identiques.
const serverList = (file: string) => {
  const src = readFileSync(new URL(`../../functions/${file}`, import.meta.url), 'utf8')
  const m = src.match(/const RETURN_STATUSES = (\[[^\]]*\])/)
  if (!m) throw new Error(`${file} : RETURN_STATUSES introuvable`)
  return JSON.parse(m[1].replace(/'/g, '"'))
}

describe('listes de statuts uniques', () => {
  it('statuts de retour = les 4 statuts du circuit retour, tous dans STATUSES', () => {
    expect(RETURN_STATUSES).toEqual(['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé'])
    RETURN_STATUSES.forEach(s => expect(STATUSES).toContain(s))
    expect(isReturnStatus('Retour arrivé')).toBe(true)
    expect(isReturnStatus('Livré')).toBe(false)
    expect(isReturnStatus(undefined)).toBe(false)
  })
  it('terminé = livré, annulé ou circuit retour', () => {
    expect([...CLOSED_STATUSES].sort()).toEqual(['Annulé', 'Livré', ...RETURN_STATUSES].sort())
  })
  it.each(['commercial.js', 'healthCheck.js'])('copie serveur identique : functions/%s', file => {
    expect(serverList(file)).toEqual(RETURN_STATUSES)
  })
})
