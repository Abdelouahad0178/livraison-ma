import type { TariffConfig } from '../types'

export const CITIES = [
  'Casablanca', 'Rabat', 'Agadir', 'Marrakech', 'Guelmim', 'Ait Melloul',
]

export const TARIFS: Record<string, number> = {
  Casablanca: 25,
  Rabat: 30,
  Agadir: 45,
  Marrakech: 40,
  Guelmim: 55,
  'Ait Melloul': 45, // provisoire (= Agadir), modifiable dans Admin › Tarifs
}

export const TARIF_WEIGHT_RULES = [
  { max: 5,        label: '0 - 5 kg',   extra: 0  },
  { max: 10,       label: '5 - 10 kg',  extra: 10 },
  { max: 20,       label: '10 - 20 kg', extra: 20 },
  { max: 30,       label: '20 - 30 kg', extra: 35 },
  { max: Infinity, label: '+30 kg',     extra: 55 },
]

export const DEFAULT_TARIFF_CONFIG: TariffConfig = {
  cityPrices: TARIFS,
  weightRules: TARIF_WEIGHT_RULES.map(r => ({
    max: Number.isFinite(r.max) ? r.max : null,
    label: r.label,
    extra: r.extra,
  })),
  extraPerAdditionalParcel: 5,
}

type RawWeightRule = {
  max?: number | null | string
  label?: string
  extra?: number | string
  order?: number | string
}

type RawTariffConfig = {
  cityPrices?: Record<string, number>
  weightRules?: RawWeightRule[]
  extraPerAdditionalParcel?: number | string
}

export function normalizeTariffConfig(config: RawTariffConfig = {}): TariffConfig {
  const cityPrices = { ...TARIFS, ...(config.cityPrices || {}) }
  const weightRules = (Array.isArray(config.weightRules) && config.weightRules.length > 0
    ? config.weightRules
    : DEFAULT_TARIFF_CONFIG.weightRules
  ).map((r, idx) => {
    const max = r.max === null || r.max === '' || r.max === undefined ? null : Number(r.max)
    return {
      max: Number.isFinite(max) ? max : null,
      label: r.label || (Number.isFinite(max) ? `<= ${max} kg` : '+ kg'),
      extra: Math.max(Number(r.extra) || 0, 0),
      order: Number.isFinite(Number(r.order)) ? Number(r.order) : idx,
    }
  }).sort((a, b) => {
    const ax = a.max === null ? Infinity : a.max
    const bx = b.max === null ? Infinity : b.max
    return ax - bx
  })
  return {
    cityPrices,
    weightRules,
    extraPerAdditionalParcel: Math.max(Number(config.extraPerAdditionalParcel ?? DEFAULT_TARIFF_CONFIG.extraPerAdditionalParcel) || 0, 0),
  }
}

export function calculateTariff(city: string, weight: number | string = 0, nbColis: number | string = 1, config: TariffConfig | null = null): number {
  const tariffConfig = normalizeTariffConfig(config || DEFAULT_TARIFF_CONFIG)
  const base = Number(tariffConfig.cityPrices?.[city]) || 0
  if (!base) return 0
  const kg = parseFloat(String(weight)) || 0
  const pieces = Math.max(parseInt(String(nbColis)) || 1, 1)
  const rule = tariffConfig.weightRules.find(r => kg <= (r.max === null ? Infinity : r.max)) || tariffConfig.weightRules[tariffConfig.weightRules.length - 1]
  const multiParcelExtra = pieces > 1 ? (pieces - 1) * tariffConfig.extraPerAdditionalParcel : 0
  return base + (rule?.extra ?? 0) + multiParcelExtra
}

export function codCollectedLabel(paymentType: string): string {
  switch (paymentType) {
    case 'especes':       return 'En espèces'
    case 'cheque':        return 'C/Chèque'
    case 'traite':        return 'C/Traite'
    case 'bon_livraison': return 'Retour BL'
    case 'retour_bl':     return 'Retour BL'
    default:              return 'Collecté'
  }
}

// Statuts séparés : Circuit Livraison vs Circuit Retour
export const STATUSES = [
  // Circuit Livraison Normal
  'Initialisé', 'En transit', 'Arrivé en agence', 'En cours de ramassage', 'En cours de livraison', 'Livré',
  // Point de transition
  'Retourné',
  // Circuit Retour (après transition)
  'Retour en transit', 'Retour arrivé', 'Retour finalisé',
  // Annulation
  'Annulé',
]

// Statuts du circuit livraison uniquement
export const DELIVERY_STATUSES = [
  'Initialisé', 'En transit', 'Arrivé en agence', 'En cours de ramassage', 'En cours de livraison', 'Livré',
]

// Statuts du circuit retour uniquement
export const RETURN_STATUSES = [
  'Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé',
]

export const COD_PAYMENT_TYPES = [
  { key: 'especes',       label: 'Espèces',          emoji: '💵', bg: 'bg-green-100',  text: 'text-green-700',  darkBg: 'bg-green-900/40',  darkText: 'text-green-300'  },
  { key: 'cheque',        label: 'Chèque',           emoji: '📋', bg: 'bg-blue-100',   text: 'text-blue-700',   darkBg: 'bg-blue-900/40',   darkText: 'text-blue-300'   },
  { key: 'traite',        label: 'Traite',           emoji: '📝', bg: 'bg-indigo-100', text: 'text-indigo-700', darkBg: 'bg-indigo-900/40', darkText: 'text-indigo-300' },
  { key: 'bon_livraison', label: 'Bon de livraison', emoji: '🧾', bg: 'bg-gray-100',   text: 'text-gray-600',   darkBg: 'bg-gray-700/40',   darkText: 'text-gray-300'   },
]

// ─────────────────────────────────────────────────────────────────────────────
// Type de paiement RETOUR FOND (COD) — source de vérité unique
// `serviceType` (choisi à la création) = UN SEUL type principal par expédition.
// Exception RF MIXTE : Espèces + un chèque OU une traite (jamais chèque + traite) →
// serviceType = document, codMixed = true, codCashAmount = part espèces,
// codAmount = TOTAL. Lecture par type : src/utils/codParts.ts (codPartsOf).
// D'anciens colis peuvent encore contenir une liste 'cheque,traite' (ancien écran
// multi-sélection) : la lecture reste tolérante, mais l'écriture est normalisée
// (voir normalizeServiceType / sanitizeParcelCodWrite). `codPaymentType` est dérivé
// de serviceType ; il ne fait foi que s'il est cohérent avec le service demandé.
// ─────────────────────────────────────────────────────────────────────────────
const COD_TYPE_ALIASES: Record<string, string> = {
  especes: 'especes',
  cod_especes: 'especes',
  cheque: 'cheque',
  cod_cheque: 'cheque',
  traite: 'traite',
  cod_traite: 'traite',
  retour_bl: 'bon_livraison',
  bon_livraison: 'bon_livraison',
}

function normalizeCodTypes(raw: any): string[] {
  return String(raw ?? '')
    .toLowerCase()
    .split(',')
    .map(s => COD_TYPE_ALIASES[s.trim()])
    .filter(Boolean)
}

/** Type de paiement COD réel d'un colis ('especes' | 'cheque' | 'traite' | 'bon_livraison' | ''). */
export function codPaymentTypeOf(parcel: any): string {
  const service   = normalizeCodTypes(parcel?.serviceType)
  const collected = normalizeCodTypes(parcel?.codPaymentType)
  // Le type saisi à l'encaissement prime uniquement s'il fait partie du service demandé
  if (collected.length && (service.length === 0 || service.includes(collected[0]))) return collected[0]
  if (service.length) return service[0]
  return collected[0] || ''
}

/** Types de service acceptés (une seule valeur par expédition). */
const VALID_SERVICE_TYPE_KEYS = ['simple', 'especes', 'cheque', 'traite', 'retour_bl', 'retourne', 'oc']
/** Services sans retour de fonds : montant RF forcé à 0, codPaymentType null. */
export const NON_COD_SERVICE_TYPES = ['simple', 'retour_bl']

/**
 * Ramène un serviceType à UNE seule valeur. Une liste 'traite,cheque' (ancien écran
 * multi-sélection) n'est jamais enregistrée : on garde le premier type valide.
 */
export function normalizeServiceType(raw: any): string {
  const s = String(raw ?? '').trim()
  if (!s.includes(',')) return s
  const parts = s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  const first = parts.find(x => VALID_SERVICE_TYPE_KEYS.includes(x)) || parts[0] || ''
  console.warn(`[serviceType] valeur multiple "${s}" refusée → "${first}" (un seul type de retour de fonds par expédition)`)
  return first
}

/** codPaymentType attendu pour un serviceType ('especes' | 'cheque' | 'traite' | 'bon_livraison' | ''). */
export function codPaymentTypeForService(serviceType: any): string {
  return COD_TYPE_ALIASES[normalizeServiceType(serviceType).toLowerCase()] || ''
}

const VALUE_COD_TYPES = ['especes', 'cheque', 'traite']

/**
 * Garde-fou de la couche d'écriture (createParcel / updateParcel / encaissements) :
 * - serviceType jamais multiple ;
 * - codPaymentType jamais contradictoire avec serviceType (espèces / chèque / traite).
 * Modifie `data` sur place (l'appelant affiche ainsi exactement ce qui est enregistré).
 * `currentServiceType` : serviceType déjà en base quand le patch ne le contient pas.
 */
export function sanitizeParcelCodWrite<T extends Record<string, any>>(data: T, currentServiceType?: any): T {
  if (!data || typeof data !== 'object') return data
  const d = data as Record<string, any>
  if (typeof d.serviceType === 'string' && d.serviceType.includes(',')) {
    d.serviceType = normalizeServiceType(d.serviceType)
  }
  const st = 'serviceType' in d ? d.serviceType : currentServiceType
  const expected = codPaymentTypeForService(st)
  const cpt = d.codPaymentType
  if ('codPaymentType' in d && cpt && VALUE_COD_TYPES.includes(expected) && VALUE_COD_TYPES.includes(cpt) && cpt !== expected) {
    console.warn(`[codPaymentType] "${cpt}" incohérent avec serviceType "${st}" → "${expected}"`)
    d.codPaymentType = expected
  }
  // 💵+📋 RF MIXTE (Espèces + UN chèque OU UNE traite) : serviceType = le document,
  // codAmount = TOTAL, codCashAmount = part espèces (voir src/utils/codParts.ts).
  // Un mixte n'est valable qu'avec un serviceType chèque/traite et une part espèces > 0
  // strictement inférieure au total.
  if (d.codMixed === true) {
    const cash = parseFloat(String(d.codCashAmount ?? '')) || 0
    const total = 'codAmount' in d ? (parseFloat(String(d.codAmount ?? '')) || 0) : null
    if (!['cheque', 'traite'].includes(expected) || cash <= 0 || (total !== null && total <= cash)) {
      console.warn(`[codMixed] RF mixte invalide (service "${st}", espèces ${cash}, total ${total}) → annulé`)
      d.codMixed = false
      d.codCashAmount = 0
    }
  } else if ('codMixed' in d && d.codMixed !== true) {
    d.codMixed = false
    d.codCashAmount = 0
  }
  return data
}

/** Libellé affichable du type de paiement COD (vide si inconnu). */
export function codPaymentTypeLabel(parcel: any): string {
  const t = codPaymentTypeOf(parcel)
  return t ? (COD_PAYMENT_TYPES.find(x => x.key === t)?.label || t) : ''
}

export const COD_STATUS: Record<string, { label: string; bg: string; text: string; dot: string; darkBg: string; darkText: string }> = {
  pending:   { label: 'En attente',   bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', darkBg: 'bg-yellow-900/40', darkText: 'text-yellow-300' },
  collected: { label: 'Collecté',     bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500',   darkBg: 'bg-blue-900/40',   darkText: 'text-blue-300'   },
  remis:     { label: 'Remis agence', bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  darkBg: 'bg-green-900/40',  darkText: 'text-green-300'  },
}

export const PORT_TYPES = [
  { key: 'port_paye',                      label: 'Port payé',            emoji: '✅' },
  { key: 'port_du',                        label: 'Port dû',              emoji: '💰' },
  { key: 'port_du_cheque',                 label: 'Port dû chèque',       emoji: '📋' },
  { key: 'port_en_compte_expediteur',      label: 'En compte Exp',        emoji: '📤' },
  { key: 'port_en_compte_destinataire',    label: 'En compte Dest',       emoji: '📥' },
  { key: 'port_en_compte',                 label: 'En compte (ancien)',   emoji: '📊' },  // Pour compatibilité
]

export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Initialisé':            { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: 'bg-gray-400'   },
  'En transit':            { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  'Arrivé en agence':      { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'En cours de livraison': { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  'Livré':                 { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Retourné':              { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  'Retour en transit':     { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  'Retour arrivé':         { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Retour finalisé':       { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Retourné à l\'expéditeur': { bg: 'bg-teal-100', text: 'text-teal-700',  dot: 'bg-teal-500'   },
  'Annulé':                { bg: 'bg-gray-200',   text: 'text-gray-800',   dot: 'bg-gray-600'   },
}

export const MOD_TYPES = [
  { key: 'type_paiement', label: 'Type de paiement COD',  icon: '💳' },
  { key: 'adresse',       label: 'Adresse destinataire',   icon: '📍' },
  { key: 'telephone',     label: 'Téléphone destinataire', icon: '📞' },
  { key: 'nom',           label: 'Nom destinataire',       icon: '👤' },
  { key: 'montant_cod',   label: 'Montant RETOUR FOND',    icon: '💰' },
  { key: 'annulation',    label: 'Annulation / Retour',    icon: '↩️' },
]

export const COD_TYPE_OPTIONS = [
  { key: 'especes',   label: 'Contre espèces' },
  { key: 'cheque',    label: 'Contre chèque' },
  { key: 'traite',    label: 'Contre traite' },
]

// Types de service disponibles pour les expéditions
export const ALL_SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
  { key: 'retourne',  label: 'Retourné',  emoji: '↩️' },
]

export const DIRECTOR_PERMISSIONS = [
  { key: 'expeditions', label: 'Expéditions', emoji: '📦', desc: 'Voir et modifier tous les colis' },
  { key: 'cod', label: 'RETOUR FOND / Remboursements', emoji: '💰', desc: 'Gérer les remboursements RETOUR FOND' },
  { key: 'users', label: 'Utilisateurs', emoji: '👥', desc: 'Gérer agents, chauffeurs et salariés' },
  { key: 'activity', label: 'Activité', emoji: '📊', desc: "Suivi d'activité de l'équipe" },
  { key: 'clients', label: 'Clients', emoji: '🤝', desc: 'Gestion de la clientèle' },
  { key: 'fleet', label: 'Parc véhicules', emoji: '🚗', desc: 'Gestion du parc automobile' },
  { key: 'caisse', label: 'Caisse', emoji: '🏦', desc: 'Suivi des mouvements de caisse' },
  { key: 'employees', label: 'Dossiers RH', emoji: '📋', desc: 'Fiches RH et informations employés' },
  { key: 'backups', label: 'Sauvegardes', emoji: '🛡️', desc: 'Exporter une sauvegarde complète' },
]

export const CAISSE_CATEGORIES = [
  { key: 'port_paye', type: 'entree', label: 'Frais port payé', emoji: '📬', color: 'bg-blue-100 text-blue-700' },
  { key: 'port_du', type: 'entree', label: 'Frais port dû', emoji: '📮', color: 'bg-orange-100 text-orange-700' },
  { key: 'cod_agence', type: 'entree', label: 'RETOUR FOND espèces — Agence', emoji: '💵', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'cod_agent', type: 'entree', label: 'RETOUR FOND espèces — Chauffeur', emoji: '💰', color: 'bg-green-100 text-green-700' },
  { key: 'cod_cheque', type: 'entree', label: 'RETOUR FOND par chèque', emoji: '📋', color: 'bg-blue-100 text-blue-700' },
  { key: 'cod_traite', type: 'entree', label: 'RETOUR FOND par traite', emoji: '📝', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'doc_agent', type: 'entree', label: 'Documents agent', emoji: '📄', color: 'bg-blue-100 text-blue-700' },
  { key: 'depot_agent', type: 'entree', label: 'Depot agent en agence', emoji: '🏦', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'recuperation_caissier', type: 'entree', label: 'Recuperation du caissier', emoji: '💵', color: 'bg-green-100 text-green-700' },
  { key: 'versement_livreur', type: 'entree', label: 'Versement livreur (Port dû / COD)', emoji: '🚚', color: 'bg-lime-100 text-lime-700' },
  { key: 'autre_entree', type: 'entree', label: 'Autre entrée', emoji: '➕', color: 'bg-teal-100 text-teal-700' },
  { key: 'remboursement_cod', type: 'sortie', label: 'Remboursement RETOUR FOND — Colis retourné', emoji: '↩️', color: 'bg-red-100 text-red-700' },
  { key: 'cod_sortie_source', type: 'sortie', label: 'RETOUR FOND envoyé agence source', emoji: '📤', color: 'bg-orange-100 text-orange-700' },
  { key: 'versement_banque', type: 'sortie', label: 'Versement RETOUR FOND à la banque', emoji: '🏦', color: 'bg-blue-100 text-blue-700' },
  { key: 'cod_regle_expediteur', type: 'sortie', label: 'RETOUR FOND réglé expéditeur', emoji: '💸', color: 'bg-green-100 text-green-700' },
  { key: 'remise_caissier', type: 'sortie', label: 'Remise au caissier', emoji: '🤝', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'remise_admin', type: 'sortie', label: "Transfert a l'Admin", emoji: '🏛️', color: 'bg-purple-100 text-purple-700' },
  { key: 'restitution_agent', type: 'sortie', label: 'Restitution a l agent', emoji: '🔁', color: 'bg-green-100 text-green-700' },
  { key: 'eau', type: 'sortie', label: 'Eau', emoji: '💧', color: 'bg-sky-100 text-sky-700' },
  { key: 'electricite', type: 'sortie', label: 'Électricité', emoji: '⚡', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'telephone', type: 'sortie', label: 'Téléphone / Internet', emoji: '📞', color: 'bg-indigo-100 text-indigo-700' },
  { key: 'loyer', type: 'sortie', label: 'Loyer', emoji: '🏠', color: 'bg-orange-100 text-orange-700' },
  { key: 'fournitures', type: 'sortie', label: 'Fournitures bureau', emoji: '📦', color: 'bg-gray-100 text-gray-700' },
  { key: 'salaire', type: 'sortie', label: 'Salaire personnel', emoji: '👤', color: 'bg-purple-100 text-purple-700' },
  { key: 'avance', type: 'sortie', label: 'Avance sur salaire', emoji: '💸', color: 'bg-pink-100 text-pink-700' },
  { key: 'autre_charge', type: 'sortie', label: 'Autre charge', emoji: '📝', color: 'bg-red-100 text-red-700' },
]

export const REGLEMENT_MODES = [
  { key: 'especes', label: 'Espèces', emoji: '💵', color: 'green' },
  { key: 'cheque', label: 'Contre-Chèque', emoji: '📋', color: 'blue' },
  { key: 'traite', label: 'Traite', emoji: '📝', color: 'purple' },
]

export const REGLEMENT_STATUSES = [
  { key: 'en_attente', label: 'En attente', color: 'amber' },
  { key: 'encaisse', label: 'Encaissé', color: 'blue' },
  { key: 'remis_chef', label: 'Remis au chef', color: 'indigo' },
  { key: 'verse_banque', label: 'Versé banque', color: 'green' },
  { key: 'rejete', label: 'Rejeté', color: 'red' },
]
