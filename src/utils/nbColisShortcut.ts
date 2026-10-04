// ⚡ Raccourci de saisie dans le champ « Nb colis » (puis Entrée ou sortie du champ) :
//   <nb colis?> <PORT> <montant port> [<retour de fonds>] [<nature>] [k<poids>]
//   PORT : ds = Port dû · ps = Port payé (espèce) · dc = Port dû chèque
//          ce = Compte expéditeur · cd = Compte destinataire
//          (compat : « d » / « p » seuls = ds / ps, ex. 2d45, 2p45)
//   Retour de fonds : e<montant> espèces · c<montant> chèque · t<montant> traite
//          (espèces + UN document possible : e200c800 ; chèque + traite interdit)
//   Nature : p = Palette · b = Bagages (défaut : Colis) — seulement APRÈS le montant du port
//   Poids  : k<kg>
// Ex. 2ds45 · 3ps40 · 2dc45 · 2ce45 · 2ds45e500 · 2ds45e200c800 · 2ds45p · 3ds45c1500k8
// Tolère majuscules, espaces, virgule décimale, suffixe « dh » après un montant et la rangée
// de chiffres AZERTY tapée sans Maj (é→2, "→3, à→0, …).

export type NbColisShortcutPortType =
  | 'port_du'
  | 'port_paye'
  | 'port_du_cheque'
  | 'port_en_compte_expediteur'
  | 'port_en_compte_destinataire'

/** Retour de fonds, dans la représentation du FORMULAIRE de création :
 *  mixte → serviceType = document, codAmount = part document, codCashAmount = part espèces. */
export interface NbColisShortcutCod {
  serviceType: 'especes' | 'cheque' | 'traite'
  codAmount: string
  codMixed: boolean
  codCashAmount: string
  /** Total du retour de fonds (espèces + document) */
  total: string
}

export interface NbColisShortcut {
  nbColis: string
  portType: NbColisShortcutPortType
  amount: string
  cod?: NbColisShortcutCod
  nature?: 'Palette' | 'Bagages'
  weight?: string
}

/** null = pas un raccourci ; { error } = raccourci reconnu mais invalide ; { shortcut } = OK. */
export type NbColisShortcutAnalysis = { shortcut: NbColisShortcut; error?: undefined } | { error: string; shortcut?: undefined } | null

const AZERTY_DIGITS: Record<string, string> = {
  '&': '1', 'é': '2', '"': '3', "'": '4', '(': '5',
  '-': '6', 'è': '7', '_': '8', 'ç': '9', 'à': '0',
}

const normalizeShortcutInput = (raw: string): string =>
  String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[&é"'(\-è_çà]/g, (c) => AZERTY_DIGITS[c] || c)

const PORT_CODES: Record<string, NbColisShortcutPortType> = {
  ds: 'port_du', d: 'port_du',
  ps: 'port_paye', p: 'port_paye',
  dc: 'port_du_cheque',
  ce: 'port_en_compte_expediteur',
  cd: 'port_en_compte_destinataire',
}

const AMOUNT = '(\\d+(?:[.,]\\d+)?)'
// Préfixe : <nb?><code port><montant>[dh] — codes longs avant les codes courts (ds avant d…)
const PREFIX_RE = new RegExp(`^(\\d*)(ds|ps|dc|ce|cd|d|p)${AMOUNT}(?:dh)?`)
const COD_RE = new RegExp(`^([ect])${AMOUNT}(?:dh)?`)
const WEIGHT_RE = new RegExp(`^k${AMOUNT}(?:kg)?`)
const NATURE_RE = /^([pb])/

const toNum = (s: string) => s.replace(',', '.')
const fmt = (n: number) => String(Math.round(n * 100) / 100)

export const analyzeNbColisShortcut = (raw: string): NbColisShortcutAnalysis => {
  const v = normalizeShortcutInput(raw)
  const m = v.match(PREFIX_RE)
  if (!m) return null
  const amount = toNum(m[3])
  if (!(parseFloat(amount) > 0)) return null
  const nb = parseInt(m[1] || '', 10)

  const cod: Partial<Record<'e' | 'c' | 't', string>> = {}
  let nature: 'Palette' | 'Bagages' | undefined
  let weight: string | undefined
  let rest = v.slice(m[0].length)
  while (rest) {
    let t: RegExpMatchArray | null
    if ((t = rest.match(COD_RE))) {
      const k = t[1] as 'e' | 'c' | 't'
      if (cod[k] !== undefined) return { error: `Retour de fonds « ${k} » saisi deux fois.` }
      const a = toNum(t[2])
      if (!(parseFloat(a) > 0)) return { error: `Montant « ${k} » invalide (doit être > 0).` }
      cod[k] = a
    } else if ((t = rest.match(WEIGHT_RE))) {
      if (weight !== undefined) return { error: 'Poids (k) saisi deux fois.' }
      const w = toNum(t[1])
      if (!(parseFloat(w) > 0)) return { error: 'Poids invalide (doit être > 0).' }
      weight = w
    } else if ((t = rest.match(NATURE_RE))) {
      if (nature !== undefined) return { error: 'Une seule nature possible (p = Palette ou b = Bagages).' }
      nature = t[1] === 'p' ? 'Palette' : 'Bagages'
    } else {
      return { error: `Raccourci invalide près de « ${rest} ».` }
    }
    rest = rest.slice(t[0].length)
  }

  if (cod.c !== undefined && cod.t !== undefined) {
    return { error: 'Chèque et traite ne peuvent pas être combinés (espèces + UN chèque OU UNE traite).' }
  }

  const shortcut: NbColisShortcut = {
    nbColis: String(nb > 0 ? nb : 1),
    portType: PORT_CODES[m[2]],
    amount,
  }
  const docKey = cod.c !== undefined ? 'c' : cod.t !== undefined ? 't' : null
  if (docKey) {
    const docType = docKey === 'c' ? 'cheque' : 'traite'
    const doc = cod[docKey] as string
    if (cod.e !== undefined) {
      shortcut.cod = {
        serviceType: docType, codAmount: doc, codMixed: true, codCashAmount: cod.e,
        total: fmt(parseFloat(doc) + parseFloat(cod.e)),
      }
    } else {
      shortcut.cod = { serviceType: docType, codAmount: doc, codMixed: false, codCashAmount: '', total: doc }
    }
  } else if (cod.e !== undefined) {
    shortcut.cod = { serviceType: 'especes', codAmount: cod.e, codMixed: false, codCashAmount: '', total: cod.e }
  }
  if (nature) shortcut.nature = nature
  if (weight) shortcut.weight = weight
  return { shortcut }
}

export const parseNbColisShortcut = (raw: string): NbColisShortcut | null =>
  analyzeNbColisShortcut(raw)?.shortcut || null

/** Saisie normale (pas un raccourci) : ne garder que les chiffres (AZERTY corrigé). */
export const nbColisDigitsOnly = (raw: string): string =>
  normalizeShortcutInput(raw).replace(/[^0-9]/g, '')

/** Aide courte affichée sous le champ + infobulle détaillée. */
export const NB_COLIS_SHORTCUT_HINT =
  '⚡ nb + port (ds/ps/dc/ce/cd) + montant [+ e/c/t montant] [p/b] [k poids] + Entrée · ex. 2ds45e200c800'
export const NB_COLIS_SHORTCUT_TITLE = [
  'Raccourci « Nb colis » (puis Entrée) : <nb colis><PORT><montant>[retour de fonds][nature][k<poids>]',
  'PORT : ds = Port dû · ps = Port payé (espèce) · dc = Port dû chèque · ce = Compte expéditeur · cd = Compte destinataire',
  'Retour de fonds : e<montant> = espèces · c<montant> = chèque · t<montant> = traite (espèces + UN chèque OU UNE traite)',
  'Nature : p = Palette · b = Bagages (défaut Colis) · Poids : k<kg>',
  'Ex. 2ds45 · 3ps40 · 2dc45 · 2ce45 · 2cd45 · 2ds45e500 · 2ds45c1200 · 2ds45t3000 · 2ds45e200c800 · 2ds45p · 3ds45c1500k8',
].join('\n')
