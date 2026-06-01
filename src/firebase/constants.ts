import type { TariffConfig } from '../types'

export const CITIES = [
  'Casablanca', 'Rabat', 'Agadir', 'Marrakech', 'Tanger',
  'Fès', 'Meknès', 'Oujda', 'Laâyoune', 'Dakhla',
  'Kenitra', 'Tétouan', 'Safi', 'El Jadida', 'Beni Mellal', 'Guelmim', 'Ait Melloul',
]

export const TARIFS: Record<string, number> = {
  Casablanca: 25, Rabat: 30, Agadir: 45, Marrakech: 40,
  Tanger: 40, Fès: 35, Meknès: 35, Oujda: 50,
  Laâyoune: 60, Dakhla: 75, Kenitra: 30, Tétouan: 42,
  Safi: 38, 'El Jadida': 32, 'Beni Mellal': 38, Guelmim: 55, 'Ait Melloul': 45,
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

export const STATUSES = [
  'Initialisé', 'En transit', 'Arrivé en agence',
  'En cours de livraison', 'Livré', 'Retourné', 'En transit retour',
]

export const COD_PAYMENT_TYPES = [
  { key: 'especes',       label: 'Espèces',          emoji: '💵', bg: 'bg-green-100',  text: 'text-green-700',  darkBg: 'bg-green-900/40',  darkText: 'text-green-300'  },
  { key: 'cheque',        label: 'Chèque',           emoji: '📋', bg: 'bg-blue-100',   text: 'text-blue-700',   darkBg: 'bg-blue-900/40',   darkText: 'text-blue-300'   },
  { key: 'traite',        label: 'Traite',           emoji: '📝', bg: 'bg-indigo-100', text: 'text-indigo-700', darkBg: 'bg-indigo-900/40', darkText: 'text-indigo-300' },
  { key: 'bon_livraison', label: 'Bon de livraison', emoji: '🧾', bg: 'bg-gray-100',   text: 'text-gray-600',   darkBg: 'bg-gray-700/40',   darkText: 'text-gray-300'   },
]

export const COD_STATUS: Record<string, { label: string; bg: string; text: string; dot: string; darkBg: string; darkText: string }> = {
  pending:   { label: 'En attente',   bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', darkBg: 'bg-yellow-900/40', darkText: 'text-yellow-300' },
  collected: { label: 'Collecté',     bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500',   darkBg: 'bg-blue-900/40',   darkText: 'text-blue-300'   },
  remis:     { label: 'Remis agence', bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  darkBg: 'bg-green-900/40',  darkText: 'text-green-300'  },
}

export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Initialisé':            { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: 'bg-gray-400'   },
  'En transit':            { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  'Arrivé en agence':      { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'En cours de livraison': { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  'Livré':                 { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Retourné':              { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  'En transit retour':     { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
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
  { key: 'retour_bl', label: 'Retour bon de livraison' },
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
