import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { BACKUP_COLLECTIONS, BACKUP_EXCLUDED_DERIVED } from './backupCollections'

// Toutes les collections citées dans les règles Firestore
const rules = readFileSync('firestore.rules', 'utf8')
const dansLesRegles = [...new Set([...rules.matchAll(/match \/([A-Za-z_]+)\/\{/g)].map(m => m[1]))].filter(n => n !== 'databases' && n !== 'documents')

describe('Sauvegarde manuelle : liste des collections', () => {
  it('pas de doublon', () => {
    expect(new Set(BACKUP_COLLECTIONS).size).toBe(BACKUP_COLLECTIONS.length)
  })
  it('une copie recalculée n\'est jamais sauvegardée', () => {
    expect(BACKUP_COLLECTIONS.filter(c => BACKUP_EXCLUDED_DERIVED.includes(c))).toEqual([])
  })
  it('les vraies données essentielles y sont', () => {
    for (const c of ['parcels', 'parcels_archive', 'users', 'clients', 'caisseEntries', 'arrivages', 'deliverySheets', 'valeursLots', 'valeursLotItems', 'deliverySignatures', 'commercialInvoices', 'commercialPayslips', 'settings']) {
      expect(BACKUP_COLLECTIONS).toContain(c)
    }
  })
  it('toute collection des règles Firestore est classée : sauvegardée, ou exclue en connaissance de cause', () => {
    // Sous-collections et collections techniques sans donnée propre
    const sansDonnee = ['agencies', 'daily', 'agents', 'drivers', 'global', 'publicTracking', 'signatures', 'mail']
    const nonClassees = dansLesRegles.filter(c => !BACKUP_COLLECTIONS.includes(c) && !BACKUP_EXCLUDED_DERIVED.includes(c) && !sansDonnee.includes(c))
    // Si ce test échoue : ajouter la nouvelle collection dans backupCollections.ts (données) ou BACKUP_EXCLUDED_DERIVED (copie)
    expect(nonClassees).toEqual([])
  })
})

