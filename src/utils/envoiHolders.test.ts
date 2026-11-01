import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { holderTotalsOf } = require('../../functions/envoiContrib.js')

// 💰 Totaux « reste à verser » par compte (envoiHolders) — même découpage que le bloc Versements au chef d'agence
const it_ = (kind: string, type: string, amount: number, holders = ['ex']) => ({ parcelId: 'p', kind, type, amount, holders })
describe('holderTotalsOf — reste à verser par compte et par type de versement', () => {
  it('ports (dus + payés ramassés) et COD espèces', () => {
    expect(holderTotalsOf({ items: [it_('port_du', 'especes', 30), it_('port_paye', 'especes', 25)] })).toEqual({ ex: { ports: 55 } })
    expect(holderTotalsOf({ items: [it_('port_du', 'especes', 30), it_('cod', 'especes', 400)] })).toEqual({ ex: { ports: 30, cod_especes: 400 } })
  })
  it('COD mixte (chèque + espèces) : toute l\'expédition dans « chèques / traites », part espèces à part', () => {
    expect(holderTotalsOf({ items: [it_('cod', 'especes', 400), it_('cod', 'cheque', 600)] })).toEqual({ ex: { cod_docs: 1000, cod_docs_cash: 400 } })
  })
  it('plusieurs détenteurs : chacun voit la valeur ; rien → aucun total', () => {
    expect(holderTotalsOf({ items: [it_('port_du', 'especes', 30, ['ex', 'liv'])] })).toEqual({ ex: { ports: 30 }, liv: { ports: 30 } })
    expect(holderTotalsOf(null)).toEqual({})
  })
})
