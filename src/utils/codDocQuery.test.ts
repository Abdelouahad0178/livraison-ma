import { describe, it, expect } from 'vitest'
import { codDocTypeOf, COD_DOC_SERVICE_TYPE_VALUES, COD_DOC_PAYMENT_TYPE_VALUES } from './codParts'

// Filtres serveur de l'analyseur chèques : chaque valeur interrogée doit bien désigner un chèque / une
// traite (sinon la requête ramènerait des expéditions inutiles, sans risque d'erreur grâce au filtre exact),
// et les cas usuels doivent tous être couverts (sinon des chèques manqueraient).
describe('valeurs des filtres serveur « COD chèque / traite »', () => {
  it('chaque serviceType interrogé est un chèque ou une traite', () => {
    for (const v of COD_DOC_SERVICE_TYPE_VALUES) expect(['cheque', 'traite']).toContain(codDocTypeOf({ serviceType: v }))
  })

  it('chaque codPaymentType interrogé est un chèque / une traite quand le service n\'est pas un type COD', () => {
    for (const v of COD_DOC_PAYMENT_TYPE_VALUES) {
      expect(['cheque', 'traite']).toContain(codDocTypeOf({ serviceType: 'oc', codPaymentType: v }))
      expect(['cheque', 'traite']).toContain(codDocTypeOf({ codPaymentType: v }))
    }
  })

  it('les expéditions chèque / traite courantes sont couvertes par l\'une des deux requêtes', () => {
    const covered = (p: any) => COD_DOC_SERVICE_TYPE_VALUES.includes(p.serviceType) || COD_DOC_PAYMENT_TYPE_VALUES.includes(p.codPaymentType)
    const samples = [
      { serviceType: 'cheque', codPaymentType: 'cheque' },
      { serviceType: 'traite' },
      { serviceType: 'cheque', codMixed: true, codCashAmount: 100, codAmount: 300 },
      { serviceType: 'cod_traite' },
      { serviceType: 'oc', codPaymentType: 'cheque' },
      { serviceType: '', codPaymentType: 'traite' },
      { serviceType: 'traite,cheque' },
    ]
    for (const p of samples) {
      expect(codDocTypeOf(p)).not.toBe('')
      expect(covered(p)).toBe(true)
    }
  })
})
