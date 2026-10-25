import { describe, it, expect } from 'vitest'
import {
  computeAgencyPortStats, cashPortTotal, followUpWindow, pendingEnvoiPortParcelIds, buildExploitationFollowUp,
  buildChefAgenceFollowUp, transferNature, buildCaisseSituation, invoiceNumbersByParcel, buildEnCompteFollowUp, toMs,
} from './agencyFollowUp'
import { MONEY_START } from './moneyFlow'

// Fenêtre de test : 10/10/2026 08h → 13/10/2026 06h (après le début du vrai calcul)
const START = new Date(2026, 9, 10, 8, 0, 0).getTime()
const END = new Date(2026, 9, 13, 6, 0, 0).getTime()
const W = followUpWindow(START, END)
const iso = (d: number, h = 12) => new Date(2026, 9, d, h, 0, 0).toISOString()
const ts = (d: number, h = 12) => { const ms = new Date(2026, 9, d, h, 0, 0).getTime(); return { toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000), nanoseconds: 0 } }
const CITY = 'Agadir'

describe('computeAgencyPortStats (règles de l\'onglet)', () => {
  const parcels = [
    { id: 'a', originCity: CITY, destinationCity: 'Rabat', portType: 'port_paye', price: '30', portStatus: 'received' },
    { id: 'b', originCity: 'Rabat', destinationCity: CITY, portType: 'port_du', price: 40, portStatus: 'collected', status: 'Arrivé en agence' },
    { id: 'c', originCity: 'Rabat', destinationCity: CITY, portType: 'port_du', price: 25, status: 'Arrivé en agence' },
    { id: 'd', originCity: 'Rabat', destinationCity: CITY, portType: 'port_du_cheque', price: 50, portStatus: 'received', status: 'Livré' },
    { id: 'e', originCity: CITY, destinationCity: 'Rabat', portType: 'port_en_compte_expediteur', price: 70 },
    { id: 'f', originCity: 'Rabat', destinationCity: CITY, portType: 'port_en_compte_destinataire', price: 80, status: 'Livré' },
    { id: 'g', originCity: CITY, destinationCity: 'Rabat', portType: 'port_paye', price: 15, portPayeMethod: 'virement', portStatus: 'collected' },
    // Pas encore visible à destination : hors périmètre théorique d'Agadir
    { id: 'h', originCity: 'Rabat', destinationCity: CITY, portType: 'port_du', price: 99, status: 'En attente' },
  ]
  it('vue théorique : payé/en compte exp. à l\'origine, dû/chèque/en compte dest. à destination', () => {
    const s = computeAgencyPortStats(parcels, { viewMode: 'theoretical' }).find(x => x.city === CITY)!
    expect(s.portPaye).toBe(45)
    expect(s.portDu).toBe(65)
    expect(s.portDuCheque).toBe(50)
    expect(s.enCompteExp).toBe(70)
    expect(s.enCompteDest).toBe(80)
    expect(cashPortTotal(s)).toBe(160)
    expect(s.nbUnique).toBe(7)
  })
  it('situation caisse : argent collecté seulement (port payé sans portPayeMethod)', () => {
    const s = computeAgencyPortStats(parcels, { viewMode: 'physical' }).find(x => x.city === CITY)!
    expect(s.portPaye).toBe(30)
    expect(s.portDu).toBe(40)
    expect(s.portDuCheque).toBe(50)
    expect(s.enCompteExp).toBe(0)
  })
  it('une seule ville demandée = mêmes chiffres que toutes les villes', () => {
    const all = computeAgencyPortStats(parcels, { viewMode: 'theoretical' }).find(x => x.city === CITY)
    const one = computeAgencyPortStats(parcels, { viewMode: 'theoretical', cities: [CITY] })
    expect(one).toHaveLength(1)
    expect(one[0]).toEqual(all)
  })
  it('filtre direction « envoyées »', () => {
    const s = computeAgencyPortStats(parcels, { viewMode: 'theoretical', directionFilter: 'sent' }).find(x => x.city === CITY)!
    expect(s.portDu).toBe(0)
    expect(s.portPaye).toBe(45)
  })
})

describe('outils', () => {
  it('toMs accepte Timestamp, ISO, Date, {seconds}', () => {
    const ms = new Date(2026, 9, 11, 9).getTime()
    expect(toMs(new Date(ms))).toBe(ms)
    expect(toMs(new Date(ms).toISOString())).toBe(ms)
    expect(toMs({ seconds: ms / 1000, nanoseconds: 0 })).toBe(ms)
    expect(toMs(null)).toBeNull()
    expect(toMs('pas une date')).toBeNull()
  })
  it('fenêtre jamais avant le début du vrai calcul', () => {
    const w = followUpWindow(new Date(2026, 9, 1).getTime(), END)
    expect(w.startMs).toBe(MONEY_START.getTime())
    expect(w.clamped).toBe(true)
    expect(W.clamped).toBe(false)
  })
})

describe('1. chef d\'exploitation', () => {
  const docs = [
    // Port dû reçu par le chef d'exploitation puis validé
    { id: 'p1', destinationCity: CITY, portType: 'port_du', price: 40, portExpReceivedAt: iso(10, 20), portExpReceivedBy: 'Exp', portChefReceivedAt: iso(11, 9), portChefReceivedBy: 'Chef' },
    // Port dû chèque reçu, dans un envoi en attente
    { id: 'p2', destinationCity: CITY, portType: 'port_du', portDuReceivedMethod: 'cheque', price: 60, portExpReceivedAt: iso(11, 20) },
    // Port dû reçu, pas encore envoyé
    { id: 'p3', destinationCity: CITY, portType: 'port_du', price: 25, portExpReceivedAt: iso(12, 20) },
    // Reçu par le chef d'agence en remplacement → exclu
    { id: 'p4', destinationCity: CITY, portType: 'port_du', price: 99, portExpReceivedAt: iso(11), portExpReceivedRole: 'chef_agence', portChefReceivedAt: iso(11) },
    // Port payé ramassé remis par En gare, puis reçu par le chef d'agence
    { id: 'p5', originCity: CITY, portType: 'port_paye', price: 30, portPayeExpReceivedAt: iso(10, 21), portStatus: 'received', portReceivedAt: iso(11, 10), portReceivedBy: 'Chef' },
    // Hors fenêtre
    { id: 'p6', destinationCity: CITY, portType: 'port_du', price: 77, portExpReceivedAt: iso(14) },
    // Autre ville
    { id: 'p7', destinationCity: 'Rabat', portType: 'port_du', price: 11, portExpReceivedAt: iso(11) },
  ]
  const pending = pendingEnvoiPortParcelIds([
    { status: 'envoye', items: [{ parcelId: 'p2', kind: 'port_du' }, { parcelId: 'x', kind: 'cod' }] },
    { status: 'valide', items: [{ parcelId: 'p3', kind: 'port_du' }] },
  ])
  it('envois en attente : ports seulement', () => {
    expect([...pending]).toEqual(['p2'])
  })
  it('reçu / remis / reste', () => {
    const r = buildExploitationFollowUp([...docs, docs[0]], CITY, W, pending)
    expect(r.recu).toEqual({ n: 4, amount: 155 })
    expect(r.remis).toEqual({ n: 2, amount: 70 })
    expect(r.reste).toEqual({ n: 2, amount: 85 })
    expect(r.enAttente).toEqual({ n: 1, amount: 60 })
    const p2 = r.lines.find(l => l.id === 'p2')!
    expect(p2.method).toBe('cheque')
    expect(p2.state).toBe('envoye')
    expect(r.lines.find(l => l.id === 'p5')!.validatedBy).toBe('Chef')
    expect(r.lines.find(l => l.id === 'p3')!.state).toBe('chez_exp')
  })
})

describe('2. chef d\'agence', () => {
  const entries = [
    { id: 'envoi_E1_port', type: 'entree', category: 'port_du', amount: 40, createdAt: ts(11, 9), cashierName: 'Chef' },
    { id: 'envoi_E1_pp', type: 'entree', category: 'port_paye', amount: 30, createdAt: ts(11, 9), cashierName: 'Chef' },
    { id: 'r1', type: 'entree', category: 'port_du', amount: 99, createdAt: ts(11), description: "Port dû reçu par le chef d'agence (en l'absence du chef d'exploitation) — X", cashierName: 'Chef' },
    { id: 'r2', type: 'entree', category: 'port_du', amount: 10, createdAt: ts(12), description: 'Saisie manuelle' },
    { id: 'cod1', type: 'entree', category: 'cod_agent', amount: 500, createdAt: ts(11) },
    { id: 'old', type: 'entree', category: 'port_du', amount: 1000, createdAt: ts(9) },
    { id: 's1', type: 'sortie', category: 'remise_admin', amount: 100, createdAt: ts(12), agentName: 'Chef' },
    { id: 's2', type: 'sortie', category: 'remise_admin', amount: 300, createdAt: ts(12) },
    { id: 's3', type: 'sortie', category: 'remise_admin', amount: 20, createdAt: ts(12) },
    { id: 's4', type: 'sortie', category: 'versement_banque', amount: 200, createdAt: ts(12) },
    { id: 's5', type: 'sortie', category: 'remise_caissier', amount: 50, createdAt: ts(12) },
    { id: 's6', type: 'sortie', category: 'loyer', amount: 1500, createdAt: ts(12) },
  ]
  const transfers = [
    { id: 't1', caisseEntryId: 's1', type: 'port_du', status: 'confirmed', fromName: 'Chef', amount: 100 },
    { id: 't2', caisseEntryId: 's2', type: 'cod', status: 'pending', amount: 300 },
    { id: 't3', caisseEntryId: 's3', type: 'port_du', status: 'rejected', amount: 20 },
    { id: 't4', type: 'ports_payes', status: 'pending', amount: 15, createdAt: ts(12), fromName: 'Admin' },
    { id: 't5', type: 'port_du', status: 'confirmed', amount: 999, createdAt: ts(20) },
  ]
  const r = buildChefAgenceFollowUp(entries, transfers, W)
  it('reçu en caisse : ports seulement, par origine', () => {
    expect(r.recu.n).toBe(4)
    expect(r.recu.amount).toBe(179)
    expect(r.recu.envoi).toBe(70)
    expect(r.recu.direct).toBe(99)
    expect(r.recu.autre).toBe(10)
  })
  it('versements : ports comptés, COD / rejetés / internes écartés', () => {
    expect(r.verse).toEqual({ n: 2, amount: 115 })
    expect(r.ecarte).toEqual({ n: 4, amount: 570 })
    expect(r.solde).toBe(64)
    const s1 = r.versements.find(v => v.id === 's1')!
    expect(s1.status).toBe('confirmed')
    expect(s1.counted).toBe(true)
    expect(r.versements.find(v => v.id === 's2')!.nature).toBe('cod')
    expect(r.versements.find(v => v.id === 's3')!.counted).toBe(false)
    expect(r.versements.find(v => v.id === 's4')!.nature).toBe('cod')
    expect(r.versements.find(v => v.id === 's5')!.nature).toBe('interne')
    expect(r.versements.find(v => v.id === 'transfer_t4')!.kind).toBe('admin_direct')
    expect(r.versements.some(v => v.id === 'transfer_t5')).toBe(false)
  })
  it('nature d\'un transfert', () => {
    expect(transferNature({ type: 'port_du', codParcelIds: ['x'] })).toBe('cod')
    expect(transferNature({ codParcelIds: [] })).toBe('ports')
    expect(transferNature({ type: 'compte_expediteur' })).toBe('en_compte')
    expect(transferNature(null)).toBe('ports')
  })
})

describe('3. solde caisse vs théorique', () => {
  it('soldes et écart', () => {
    const s = buildCaisseSituation({ portPaye: 30, portDu: 40, portDuCheque: 50 }, { portPaye: 45, portDu: 65, portDuCheque: 50 }, 100)
    expect(s.encaisse.total).toBe(120)
    expect(s.theorique.total).toBe(160)
    expect(s.soldeCaisse).toBe(20)
    expect(s.soldeTheorique).toBe(60)
    expect(s.ecart).toBe(40)
  })
  it('sans données', () => {
    const s = buildCaisseSituation(undefined, null, 0)
    expect(s.soldeCaisse).toBe(0)
    expect(s.ecart).toBe(0)
  })
})

describe('4. ports en compte', () => {
  const parcels = [
    { id: 'e1', originCity: CITY, destinationCity: 'Rabat', portType: 'port_en_compte_expediteur', price: 70, sender: { name: 'ACME' }, createdAt: ts(11) },
    { id: 'e2', originCity: CITY, destinationCity: 'Rabat', portType: 'port_en_compte', price: 30, invoiced: true, createdAt: ts(11) },
    { id: 'e3', originCity: CITY, destinationCity: 'Rabat', portType: 'port_en_compte_expediteur', price: 20, createdAt: ts(12) },
    { id: 'd1', originCity: 'Rabat', destinationCity: CITY, portType: 'port_en_compte_destinataire', price: 80, status: 'Livré', receiver: { name: 'BETA' }, createdAt: ts(11) },
    { id: 'd2', originCity: 'Rabat', destinationCity: CITY, portType: 'port_en_compte_destinataire', price: 15, status: 'En attente', createdAt: ts(11) },
    { id: 'x', originCity: CITY, destinationCity: 'Rabat', portType: 'port_paye', price: 30, createdAt: ts(11) },
  ]
  const map = invoiceNumbersByParcel([
    { status: 'paid', invoiceNumber: 'F-001', items: [{ parcelId: 'e1' }] },
    { status: 'cancelled', invoiceNumber: 'F-002', items: [{ parcelId: 'e3' }] },
  ])
  it('facturé = facture non annulée ou invoiced === true', () => {
    const r = buildEnCompteFollowUp(parcels, CITY, map)
    expect(r.exp.total).toEqual({ n: 3, amount: 120 })
    expect(r.exp.facture).toEqual({ n: 2, amount: 100 })
    expect(r.exp.nonFacture).toEqual({ n: 1, amount: 20 })
    expect(r.dest.total).toEqual({ n: 1, amount: 80 })
    expect(r.dest.nonFacture).toEqual({ n: 1, amount: 80 })
    expect(r.lines.find(l => l.id === 'e1')!.invoiceNumber).toBe('F-001')
    expect(r.lines.find(l => l.id === 'd1')!.client).toBe('BETA')
  })
  it('mêmes montants que la vue théorique de l\'onglet', () => {
    const r = buildEnCompteFollowUp(parcels, CITY, map)
    const s = computeAgencyPortStats(parcels, { viewMode: 'theoretical', cities: [CITY] })[0]
    expect(r.exp.total.amount).toBe(s.enCompteExp)
    expect(r.dest.total.amount).toBe(s.enCompteDest)
  })
})
