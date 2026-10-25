import { describe, it, expect } from 'vitest'
import { computeCaisseView, groupCodCollectesParJour, isCaisseCodCollecte } from '../../utils/agencyCaisseRules'
import { getOperationalDayString } from '../../config/operationalDay'
import {
  codStepOf, codAnomaliesOf, codPeriodOf, codCollectesOfAgency, circuitByAgency, codTypeMatches, stepCityOf, inAgency,
} from './codControl'

const HOUR = 3600 * 1000
const NOW = Date.now()
const ago = (h: number) => new Date(NOW - h * HOUR).toISOString()
const CASA = 'Casablanca'

const exp = (id: string, extra: any = {}) => ({
  id, senderNic: `N${id}`, originCity: 'Agadir', destinationCity: CASA, status: 'Livré',
  serviceType: 'especes', codAmount: 100, createdAt: new Date(NOW - 72 * HOUR), ...extra,
})

describe('codStepOf — étape actuelle du circuit', () => {
  it('à collecter / chez livreur / reçu chef d\'exploitation / reçu chef d\'agence', () => {
    expect(codStepOf(exp('a', { codStatus: 'pending', status: 'En cours de livraison' }))).toBe('a_collecter')
    expect(codStepOf(exp('b', { codStatus: 'collected', codCollectedAt: ago(5) }))).toBe('chez_livreur')
    expect(codStepOf(exp('c', { codStatus: 'collected', codCollectedAt: ago(5), codExpReceivedAt: ago(2) }))).toBe('recu_exploitation')
    expect(codStepOf(exp('d', { codStatus: 'remis', codCollectedAt: ago(5), codRemisAt: ago(1) }))).toBe('recu_agence')
  })
  it('envoyé / pointé / arrivé / payé — l\'étape la plus avancée l\'emporte', () => {
    const base = { codStatus: 'remis', codCollectedAt: ago(50) }
    expect(codStepOf(exp('e', { ...base, codSentToSource: true }))).toBe('envoye')
    expect(codStepOf(exp('f', { ...base, centralDeposited: true }))).toBe('envoye')
    expect(codStepOf(exp('g', { ...base, controlled: true }))).toBe('pointe')
    expect(codStepOf(exp('h', { ...base, controlled: true, deliveryControlled: true }))).toBe('arrive')
    expect(codStepOf(exp('i', { ...base, controlled: true, deliveryControlled: true, centralSupplierPaymentStatus: 'paid' }))).toBe('paye')
  })
  it('hors circuit : avant le 05/10/2026, retournée, Retour BL', () => {
    expect(codStepOf(exp('j', { codStatus: 'collected', codCollectedAt: '2026-09-20T10:00:00.000Z' }))).toBe('avant_debut')
    expect(codStepOf(exp('k', { codStatus: 'pending', status: 'Retourné', returnedAt: ago(3) }))).toBe('retourne')
    expect(codStepOf(exp('l', { serviceType: 'bon_livraison', codStatus: 'pending' }))).toBe('hors_valeur')
  })
  it('agence de l\'étape : destination pour l\'encaissement, origine pour le retour à l\'expéditeur', () => {
    expect(stepCityOf(exp('m', { codStatus: 'collected', codCollectedAt: ago(1) }))).toBe(CASA)
    expect(stepCityOf(exp('n', { codStatus: 'remis', controlled: true }))).toBe('Agadir')
    expect(inAgency(exp('o'), 'Agadir')).toBe(true)
    expect(inAgency(exp('o'), 'Marrakech')).toBe(false)
  })
})

describe('codAnomaliesOf — À surveiller', () => {
  it('livrée non collectée, collecté > 48 h, chèque pointé sans données', () => {
    expect(codAnomaliesOf(exp('a', { codStatus: 'pending' }), 3, NOW)).toEqual(['livree_non_collectee'])
    expect(codAnomaliesOf(exp('b', { codStatus: 'collected', codCollectedAt: ago(49) }), 3, NOW)).toEqual(['collecte_48h'])
    expect(codAnomaliesOf(exp('c', { codStatus: 'collected', codCollectedAt: ago(47) }), 3, NOW)).toEqual([])
    const chq = exp('d', { serviceType: 'cheque', codStatus: 'remis', controlled: true, controlledAt: ago(1) })
    expect(codAnomaliesOf(chq, 3, NOW)).toEqual(['doc_sans_donnees'])
    expect(codAnomaliesOf({ ...chq, codDocuments: [{ numero: '1', banque: 'CIH' }] }, 3, NOW)).toEqual([])
  })
  it('seuil en jours après l\'envoi', () => {
    const sent = exp('e', { codStatus: 'remis', codSentToSource: true, codSentToSourceAt: ago(4 * 24) })
    expect(codAnomaliesOf(sent, 3, NOW)).toEqual(['envoye_non_pointe'])
    expect(codAnomaliesOf(sent, 5, NOW)).toEqual([])
    expect(codAnomaliesOf(exp('f', { codStatus: 'remis', controlled: true, controlledAt: ago(80) }), 3, NOW)).toEqual(['pointe_non_arrive'])
    expect(codAnomaliesOf(exp('g', { codStatus: 'remis', deliveryControlled: true, deliveryControlledAt: ago(80) }), 3, NOW)).toEqual(['arrive_non_paye'])
  })
  it('aucune anomalie pour l\'argent d\'avant le 05/10/2026', () => {
    expect(codAnomaliesOf(exp('h', { codStatus: 'collected', codCollectedAt: '2026-09-20T10:00:00.000Z' }), 3, NOW)).toEqual([])
  })
})

describe('« COD collectés » = règle de Caisse Agence (computeCaisseView)', () => {
  // Échantillon : espèces, chèque, mixte, collecté par « En gare », reçu chef d'agence, retourné, avant le 05/10,
  // autre agence, non collecté, Retour BL, Timestamp-like
  const sample = [
    exp('1', { codStatus: 'collected', codCollectedAt: ago(2), codCollectedBy: 'Livreur A' }),
    exp('2', { serviceType: 'cheque', codAmount: 500, codStatus: 'collected', codCollectedAt: ago(30) }),
    exp('3', { serviceType: 'cheque', codMixed: true, codCashAmount: 200, codAmount: 700, codStatus: 'remis', codCollectedAt: ago(26), deliveryDriverName: 'En gare - Casablanca' }),
    exp('4', { codStatus: 'remis', codCollectedAt: ago(100), codRemisAt: ago(90) }),
    exp('5', { codStatus: 'collected', codCollectedAt: ago(3), status: 'Retourné', returnedAt: ago(1) }),
    exp('6', { codStatus: 'collected', codCollectedAt: '2026-09-20T10:00:00.000Z' }),
    exp('7', { destinationCity: 'Agadir', codStatus: 'collected', codCollectedAt: ago(4) }),
    exp('8', { codStatus: 'pending' }),
    exp('9', { serviceType: 'traite', codAmount: 900, codStatus: 'collected', codCollectedAt: { toDate: () => new Date(NOW - 50 * HOUR) } }),
    exp('10', { serviceType: 'bon_livraison', codStatus: 'collected', codCollectedAt: ago(6) }),
  ]
  const view = computeCaisseView({ city: CASA, allDisplayParcels: sample, garePending: [], datePreset: 'all', now: new Date(NOW) })

  it('mêmes journées, mêmes nombres, mêmes montants par type, mêmes expéditions', () => {
    const today = getOperationalDayString(new Date(NOW))
    const period = { fromKey: '2000-01-01', toKey: today }
    const mine = codCollectesOfAgency(sample, CASA, period)
    const strip = (rows: any[]) => rows.map(([k, d]: any) => [k, d.count, d.montant, d.especes, d.cheque, d.traite, d.parcels.map((p: any) => p.id).sort()])
    expect(strip(mine.parJour)).toEqual(strip(view.codCollectesParJour))
    expect(mine.parJour.length).toBeGreaterThan(0)
  })
  it('classification identique expédition par expédition', () => {
    const inCaisse = new Set(view.codCollectesParJour.flatMap(([, d]) => d.parcels.map((p: any) => p.id)))
    for (const p of sample) expect(isCaisseCodCollecte(p, CASA)).toBe(inCaisse.has(p.id))
    // Retourné, avant le 05/10, autre agence, non collecté : exclus
    for (const id of ['5', '6', '7', '8']) expect(inCaisse.has(id)).toBe(false)
  })
  it('la période filtre sur le JOUR DE COLLECTE', () => {
    const today = getOperationalDayString(new Date(NOW))
    const onlyToday = codCollectesOfAgency(sample, CASA, { fromKey: today, toKey: today })
    expect(onlyToday.parJour.every(([k]) => k === today)).toBe(true)
    expect(onlyToday.count).toBe(groupCodCollectesParJour(sample, CASA).find(([k]) => k === today)?.[1].count ?? 0)
  })
})

describe('codPeriodOf / filtres', () => {
  it('presets et période personnalisée appliquée seulement avec les deux dates', () => {
    expect(codPeriodOf('today', '', '', '2026-10-12')).toMatchObject({ fromKey: '2026-10-12', toKey: '2026-10-12', days: 1 })
    expect(codPeriodOf('week', '', '', '2026-10-12')).toMatchObject({ fromKey: '2026-10-06', toKey: '2026-10-12', days: 7 })
    expect(codPeriodOf('month', '', '', '2026-10-12')).toMatchObject({ fromKey: '2026-10-01', toKey: '2026-10-12' })
    expect(codPeriodOf('custom', '2026-09-01', '', '2026-10-12')).toMatchObject({ fromKey: '2026-10-06', label: '7 derniers jours' })
    expect(codPeriodOf('custom', '2026-09-10', '2026-09-01', '2026-10-12')).toMatchObject({ fromKey: '2026-09-01', toKey: '2026-09-10' })
    expect(codPeriodOf('custom', '2026-01-01', '2026-12-31', '2026-10-12').cappedFrom).toBe(365)
  })
  it('type de COD : un mixte apparaît sous Espèces, sous son document et sous Mixte', () => {
    const mixte = exp('x', { serviceType: 'cheque', codMixed: true, codCashAmount: 50, codAmount: 150 })
    expect(codTypeMatches(mixte, 'especes')).toBe(true)
    expect(codTypeMatches(mixte, 'cheque')).toBe(true)
    expect(codTypeMatches(mixte, 'mixte')).toBe(true)
    expect(codTypeMatches(mixte, 'traite')).toBe(false)
  })
  it('circuit par agence : chaque expédition comptée une fois', () => {
    const list = [exp('a', { codStatus: 'pending' }), exp('b', { codStatus: 'remis', controlled: true })]
    const { byCity, total } = circuitByAgency(list)
    expect(total.a_collecter).toEqual({ n: 1, m: 100 })
    expect(byCity.get(CASA)!.a_collecter.n).toBe(1)
    expect(byCity.get('Agadir')!.pointe).toEqual({ n: 1, m: 100 })
  })
})
