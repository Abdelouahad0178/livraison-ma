import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { HEALTH_RULES } = require('../../functions/healthCheck.js')

// 🩺 Contrôle quotidien (functions/healthCheck.js) : chaque règle repère SEULEMENT l'incohérence visée
const t = (k: string, p: any) => HEALTH_RULES[k].test(p)
describe('contrôle quotidien de la santé des données — règles', () => {
  it('date de livraison restée (hors « Livré » et hors retours)', () => {
    expect(t('livraison_restee', { status: 'Arrivé en agence', deliveredAt: '2026-10-30T13:39:00Z' })).toBe(true)
    expect(t('livraison_restee', { status: 'Livré', deliveredAt: '2026-10-30T13:39:00Z' })).toBe(false)
    expect(t('livraison_restee', { status: 'Retourné', deliveredAt: '2026-10-30T13:39:00Z' })).toBe(false)
    expect(t('livraison_restee', { status: 'Arrivé en agence' })).toBe(false)
  })
  it('« COD versé à l\'admin » sans COD encaissé', () => {
    expect(t('cod_verse_sans_encaissement', { adminTransferred: true, codAmount: 500, codStatus: 'pending' })).toBe(true)
    expect(t('cod_verse_sans_encaissement', { adminTransferred: true, codAmount: 500, codStatus: 'remis' })).toBe(false)
    expect(t('cod_verse_sans_encaissement', { adminTransferred: true, codAmount: 0 })).toBe(false)
  })
  it('port non encaissé avec traces de réception (cas 1088479D)', () => {
    expect(t('port_non_encaisse_avec_reception', { portStatus: 'pending', portChefReceivedAt: '2026-10-20T22:13:00Z' })).toBe(true)
    expect(t('port_non_encaisse_avec_reception', { portStatus: 'collected', portChefReceivedAt: '2026-10-20T22:13:00Z' })).toBe(false)
  })
})
