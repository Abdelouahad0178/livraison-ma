import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { runRules, summarize } = require('../../functions/controlRules.js')

const now = Date.parse('2026-10-16T12:00:00Z')
const from = Date.parse('2026-10-15T07:00:00Z')
const to = Date.parse('2026-10-17T06:59:59Z')
const iso = (h: number) => new Date(now - h * 3600e3).toISOString()
const users = new Map([
  ['chefMk', { name: 'CHEF MK', role: 'chef_agence', city: 'Marrakech' }],
  ['chefCa', { name: 'SAID', role: 'chef_agence', city: 'Casablanca' }],
])
const rulesOf = (parcels: any[], lots: any[] = [], extra: any = {}) =>
  runRules({ parcels, lots, users, from, to, now, envoiItemKeys: new Set(), ...extra }).map((a: any) => a.rule)

describe('Contrôleur — règles', () => {
  it('1. pointée alors que non livrée', () => {
    expect(rulesOf([{ id: 'a', status: 'Arrivé en agence', controlled: true, controlledAt: iso(2), codAmount: 100, codStatus: 'pending', destinationCity: 'Agadir' }]))
      .toContain('pointe_non_livre')
    expect(rulesOf([{ id: 'a', status: 'Livré', controlled: true, controlledAt: iso(2), codAmount: 100, history: [{ status: 'Livré' }], destinationCity: 'Agadir' }]))
      .not.toContain('pointe_non_livre')
  })
  it('2. livrée par une autre agence', () => {
    const p = { id: 'b', status: 'Livré', deliveredAt: iso(3), deliveredById: 'chefMk', destinationCity: 'Casablanca', history: [{ status: 'Livré' }] }
    expect(rulesOf([p])).toContain('livre_mauvaise_agence')
    expect(rulesOf([{ ...p, deliveredById: 'chefCa' }])).not.toContain('livre_mauvaise_agence')
  })
  it('3. livré sans historique', () => {
    expect(rulesOf([{ id: 'c', status: 'Livré', deliveredAt: iso(3), history: [{ status: 'Arrivé en agence' }], destinationCity: 'Casablanca' }]))
      .toContain('livre_sans_historique')
  })
  it('4/5. encaissé non reçu, reçu non envoyé (> 24 h), sauf s\'il est dans un envoi', () => {
    expect(rulesOf([{ id: 'd', portType: 'port_du', portStatus: 'collected', portCollectedAt: iso(30), price: 25 }])).toContain('encaisse_non_recu')
    expect(rulesOf([{ id: 'd', portType: 'port_du', portStatus: 'collected', portCollectedAt: iso(5), price: 25 }])).not.toContain('encaisse_non_recu')
    const r = { id: 'e', portType: 'port_du', portStatus: 'collected', portCollectedAt: iso(40), portExpReceivedAt: iso(30), price: 25 }
    expect(rulesOf([r])).toContain('recu_non_envoye')
    expect(rulesOf([r], [], { envoiItemKeys: new Set(['port_du:e']) })).not.toContain('recu_non_envoye')
  })
  it('7. ville hors liste', () => {
    expect(rulesOf([{ id: 'f', receiver: { city: 'taroudante' }, destinationCity: 'Ait Melloul', createdAt: iso(3) }])).toContain('ville_incoherente')
    expect(rulesOf([{ id: 'f', receiver: { city: 'Ait Melloul' }, destinationCity: 'Ait Melloul', createdAt: iso(3) }])).not.toContain('ville_incoherente')
  })
  it('8. saisie datée d\'une autre journée', () => {
    expect(rulesOf([{ id: 'g', createdAt: '2026-10-14T11:00:00Z', _createTime: Date.parse('2026-10-16T10:00:00Z') }])).toContain('saisie_autre_jour')
    // saisie à 02h du matin = journée de la veille : normal
    expect(rulesOf([{ id: 'g', createdAt: '2026-10-15T11:00:00Z', _createTime: Date.parse('2026-10-16T01:00:00Z') }])).not.toContain('saisie_autre_jour')
  })
  it('10. lot non réceptionné > 3 jours', () => {
    expect(rulesOf([], [{ number: 'BV-1', status: 'cree', createdAt: iso(80), fromCity: 'Agadir', toCity: 'Casablanca', parcelIds: ['x'] }])).toContain('lot_non_recu')
  })
  it('12. arrivée confirmée ailleurs, sauf destination changée ensuite par l\'admin', () => {
    const p = { id: 'h', destinationCity: 'Ait Melloul', chefPointedAt: iso(6), chefPointedById: 'chefCa' }
    expect(rulesOf([p])).toContain('arrivee_mauvaise_agence')
    expect(rulesOf([{ ...p, adminChanges: [{ field: 'Ville destination', changedAt: iso(4) }] }])).not.toContain('arrivee_mauvaise_agence')
  })
  it('rapport allégé : erreurs répétées regroupées par utilisateur, comptées par expédition', () => {
    const many = [1, 2, 3].map(i => ({ id: `z${i}`, senderNic: `N${i}`, status: 'En cours de livraison', deliveryAssignedAt: iso(60), deliveryDriverName: 'LIV1', destinationCity: 'Agadir' }))
    const a = runRules({ parcels: many, lots: [], users, from, to, now })
    expect(a).toHaveLength(1)
    expect(a[0].count).toBe(3)
    expect(summarize(a).total).toBe(3)
    expect(summarize(a).lines).toBe(1)
  })
  it('résumé', () => {
    const a = runRules({ parcels: [{ id: 'c', status: 'Livré', deliveredAt: iso(3), history: [], destinationCity: 'Casablanca' }], lots: [], users, from, to, now })
    expect(summarize(a).bySeverity.orange).toBe(1)
  })
})
