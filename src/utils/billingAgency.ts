// 🧾 Règles de facturation PARTAGÉES (Facturier, Chef d'agence : Ports en compte + Expéditions,
// factures). Une seule définition pour que les décomptes par client/agence coïncident partout.

// Normalisation des noms/villes : insensible à la casse, aux accents (COPÏMA = COPIMA) et aux espaces.
// ⚡ Appelée des centaines de milliers de fois par filtrage (15 000 expéditions × ~10 champs) :
// - chemin rapide si le texte est purement ASCII (NFD + retrait des diacritiques = identité) ;
// - mémo par chaîne (fonction pure : même entrée → même sortie), vidé au-delà de 60 000 entrées.
const NORM_NAME_CACHE = new Map<string, string>()
const normNameRaw = (str: string): string => {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return normNameSlow(str)
  }
  return str.toLowerCase().replace(/\s+/g, ' ').trim()
}
export const normName = (s: unknown): string => {
  const str = String(s ?? '')
  let r = NORM_NAME_CACHE.get(str)
  if (r === undefined) {
    r = normNameRaw(str)
    if (NORM_NAME_CACHE.size >= 60000) NORM_NAME_CACHE.clear()
    NORM_NAME_CACHE.set(str, r)
  }
  return r
}
const normNameSlow = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export const isPortEnCompteType = (t?: string): boolean => !!t && t.startsWith('port_en_compte')

// Compte EXPÉDITEUR : type explicite ou ancien type générique 'port_en_compte' (facturé à l'origine).
export const isCompteExpediteurType = (t?: string): boolean =>
  t === 'port_en_compte_expediteur' || t === 'port_en_compte'

// Agence qui FACTURE l'expédition : l'agence de DESTINATION pour un port en compte destinataire
// (le client destinataire paie là où il reçoit), sinon l'agence d'ORIGINE (celle qui a saisi
// l'expédition : originCity, avec repli sur la ville de l'expéditeur pour les anciens colis).
export const billingAgencyOf = (p: any): string =>
  p?.portType === 'port_en_compte_destinataire'
    ? String(p?.destinationCity || p?.receiver?.city || '')
    : String(p?.originCity || p?.sender?.city || '')

export const isBilledByAgency = (p: any, city?: string | null): boolean =>
  !!city && normName(billingAgencyOf(p)) === normName(city)

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 🏢 PÉRIMÈTRE D'UNE AGENCE et RÉPARTITION DES PORTS — règle UNIQUE partagée par la page Chef
// d'agence (onglet Expéditions : liste, nombre, totaux) et Admin « Port par Agence ».
// Avant, Admin comptait à la destination des expéditions que le chef ne voit pas encore
// (saisies non chargées, retours) et lisait d'anciens champs sender.port / receiver.port :
// mêmes filtres, totaux différents (ex. Marrakech 01→28/09 : +240 DH de Port dû sur un retour).
// ─────────────────────────────────────────────────────────────────────────────────────────────

// Statuts pour lesquels une expédition est visible par l'agence de DESTINATION.
const DESTINATION_VISIBLE_STATUSES = ['En transit', 'Arrivé en agence', 'En cours de livraison', 'Livré', 'Retourné']

// Visible par l'agence de destination : chargée / arrivée / prise en charge. Les RETOURS
// (wasReturned) n'y figurent pas : ils sont gérés dans l'onglet Retours.
export const isVisibleInDestinationAgency = (p: any = {}): boolean => {
  if (p?.wasReturned) return false
  return !!(
    p?.visibleInDestinationAgency ||
    p?.shipmentLoadedAt ||
    p?.destinationArrivedAt ||
    p?.destinationAgentId ||
    p?.chauffeurId ||
    DESTINATION_VISIBLE_STATUSES.includes(p?.status)
  )
}

// Expédition ENVOYÉE par l'agence (ville d'expédition, repli sur la ville de l'expéditeur).
export const isSentFromAgency = (p: any, city?: string | null): boolean =>
  !!city && (p?.originCity === city || p?.sender?.city === city)

// Expédition REÇUE par l'agence : ville de destination ET déjà visible à destination.
export const isReceivedInAgency = (p: any, city?: string | null): boolean =>
  !!city && (p?.destinationCity === city || p?.receiver?.city === city) && isVisibleInDestinationAgency(p)

export type AgencyDirection = 'all' | 'sent' | 'received'

// Expédition dans le périmètre de l'agence pour une direction (« Tous » = envoyées OU reçues).
export const isInAgencyScope = (p: any, city: string | null | undefined, direction: AgencyDirection = 'all'): boolean =>
  direction === 'sent' ? isSentFromAgency(p, city)
    : direction === 'received' ? isReceivedInAgency(p, city)
      : isSentFromAgency(p, city) || isReceivedInAgency(p, city)

export interface AgencyPortAmounts {
  portPaye: number
  portDu: number
  portDuCheque: number
  enCompteExp: number
  enCompteDest: number
}

// Ports d'une expédition revenant à l'agence (montant = p.price, type = p.portType) :
// Port payé / En compte expéditeur → agence d'ORIGINE ; Port dû (espèces, chèque) /
// En compte destinataire → agence de DESTINATION. À appliquer aux expéditions du périmètre.
export const agencyPortAmounts = (p: any, city?: string | null): AgencyPortAmounts => {
  const out: AgencyPortAmounts = { portPaye: 0, portDu: 0, portDuCheque: 0, enCompteExp: 0, enCompteDest: 0 }
  if (!city) return out
  const price = parseFloat(p?.price) || 0
  const t = p?.portType
  const isOrig = p?.originCity === city || p?.sender?.city === city
  const isDest = p?.destinationCity === city || p?.receiver?.city === city
  if (isOrig && t === 'port_paye') out.portPaye = price
  if (isOrig && isCompteExpediteurType(t)) out.enCompteExp = price
  if (isDest && t === 'port_du') out.portDu = price
  if (isDest && t === 'port_du_cheque') out.portDuCheque = price
  if (isDest && t === 'port_en_compte_destinataire') out.enCompteDest = price
  return out
}
