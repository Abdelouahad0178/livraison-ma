import { getWorkingDateStr } from '../../utils/workingDate'

// 📝 SOURCE UNIQUE du formulaire « Nouvelle expédition » vide (AgentPage, AgentHeader, HomeTab, NewTab).
// Fonction (et non constante) : la date de travail est recalculée à chaque appel.
export const getEmptyParcelForm = () => ({
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '', receiverClientId: '',
  weight: '', nbColis: '0', natureOfGoods: 'Colis', natureOfGoodsCustomPrice: '', codAmount: '',
  serviceType: 'simple', codMixed: false, codCashAmount: '', hasRetourBL: false, shipmentMode: 'personal',
  portType: 'port_du', portPayeMethod: '', portPayeMontant: '',
  portPrice: '',
  clientId: '', clientName: '', autoDebit: false,
  deliverySectorId: '', deliveryDriverId: '',
  enGare: true,
  operationDate: getWorkingDateStr(), // Date de travail ACTUELLE à chaque appel
})

// Champs remplis automatiquement (jamais saisis par l'utilisateur) : ignorés pour savoir si le formulaire est vide.
const AUTO_FIELDS = new Set(['operationDate', 'senderCity'])

const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === ''

/**
 * true si le formulaire ne contient que les valeurs par défaut (rien de saisi par l'utilisateur).
 * Compare chaque champ à la valeur du formulaire vide ; un champ absent (undefined) vaut sa valeur
 * par défaut. « Nb colis » vide ou 0 = vide.
 */
export const isParcelFormEmpty = (form: Record<string, any> | null | undefined): boolean => {
  if (!form) return true
  const empty: Record<string, any> = getEmptyParcelForm()
  const keys = new Set([...Object.keys(empty), ...Object.keys(form)])
  for (const k of keys) {
    if (AUTO_FIELDS.has(k)) continue
    const v = form[k]
    if (k === 'nbColis') {
      if (!['', '0'].includes(String(v ?? '').trim())) return false
      continue
    }
    if (!(k in empty)) {
      // Champ hors formulaire de base (ex. natureOfGoodsCustom, notes) : vide si non renseigné / false
      if (!isBlank(v) && v !== false) return false
      continue
    }
    const d = empty[k]
    if (v === undefined || v === null) continue // absent = valeur par défaut
    if (typeof d === 'boolean') { if (Boolean(v) !== d) return false; continue }
    if (String(v).trim() !== String(d).trim()) return false
  }
  return true
}
