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
