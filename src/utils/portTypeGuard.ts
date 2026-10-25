/**
 * 🔒 Type de port d'une expédition DÉJÀ ENCAISSÉE : changement refusé (diagnostic du 24/10/2026, point 1.3).
 * Avant, un port dû collecté en espèces pouvait être passé « en compte » juste après (écran pas à jour) : la caisse
 * ne compte que les ports dus, l'argent encaissé disparaissait des totaux (19 expéditions, 1 115 DH à Agadir).
 * Il faut d'abord ANNULER l'encaissement, puis changer le type.
 * - Port dû (espèces ou chèque) collecté / reçu → reste un port dû.
 * - Port payé déjà remis au chef d'exploitation / reçu par le chef d'agence → reste un port payé.
 * Renvoie le message de refus, ou null si le changement est permis.
 */
export function portTypeChangeBlock(p: any, nextType: string): string | null {
  if (!p || !nextType || nextType === p.portType) return null
  const nicOf = p.senderNic || p.sender?.nic || p.trackingId || p.id || ''
  const collected = p.portStatus === 'collected' || p.portStatus === 'received'
  const isPortDu = (p.portType === 'port_du' || p.portType === 'port_du_cheque') && !p.portPayeMethod
  if (isPortDu && collected && nextType !== 'port_du' && nextType !== 'port_du_cheque') {
    return `${nicOf} : port dû déjà encaissé${p.portCollectedBy ? ` par ${p.portCollectedBy}` : ''} — annulez d'abord l'encaissement avant de changer le type de port.`
  }
  if (p.portType === 'port_paye' && nextType !== 'port_paye' && (p.portStatus === 'received' || !!p.portPayeExpReceivedAt)) {
    return `${nicOf} : port payé déjà remis / reçu — annulez d'abord la réception avant de changer le type de port.`
  }
  return null
}
