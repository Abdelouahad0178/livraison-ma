/**
 * 💸 Circuit UNIQUE de l'argent des expéditions (ports dus, COD, ports payés ramassés) :
 *   1. le livreur — ou « En gare - <ville> » au guichet — encaisse auprès du client ;
 *   2. le chef d'exploitation le REÇOIT le soir (Collecte du soir) puis l'ENVOIE ;
 *   3. le chef d'agence VALIDE l'envoi (onglet « Valeurs à valider ») : seule cette validation
 *      écrit en caisse agence (src/firebase/valeursEnvois.ts → validateEnvoi).
 * Le chef d'agence ne reçoit donc plus rien directement d'un livreur.
 */
export const VIA_EXPLOITATION_MSG =
  "Circuit de l'argent : à recevoir par le chef d'exploitation (Collecte du soir), qui l'envoie ensuite au chef d'agence (onglet « Valeurs à valider »)."

// ── 📅 Début du vrai calcul : jour d'opération du 05/10/2026 (08:00) ─────────
// Avant cette date : période d'essais. Tout argent ENCAISSÉ avant (port dû, port payé, COD) n'entre
// dans AUCUN solde de caisse ni de COD. Les expéditions restent intactes et visibles partout ;
// seul leur argent d'avant la date est ignoré dans les calculs. Un encaissement fait à partir de la
// date compte normalement, même pour une expédition créée avant.
export const MONEY_START = new Date(2026, 9, 5, 8, 0, 0)

const toTime = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  const d = typeof v?.toDate === 'function' ? v.toDate()
    : typeof v?.seconds === 'number' ? new Date(v.seconds * 1000)
    : v instanceof Date ? v : new Date(v)
  const t = d.getTime()
  return Number.isNaN(t) ? null : t
}
const createdOf = (p: any) => p?.createdAt ?? p?.history?.[0]?.timestamp
const beforeStart = (v: any) => { const t = toTime(v); return t !== null && t < MONEY_START.getTime() }

/** COD encaissé (collecté / remis / réglé) avant le début du vrai calcul. */
export const isCodMoneyBeforeStart = (p: any): boolean =>
  !!p?.codStatus && p.codStatus !== 'pending' && beforeStart(p.codCollectedAt ?? p.codRemisAt ?? createdOf(p))
/** Port dû encaissé avant le début du vrai calcul. */
export const isPortDuMoneyBeforeStart = (p: any): boolean =>
  p?.portType === 'port_du' && (p.portStatus === 'collected' || p.portStatus === 'received')
  && beforeStart(p.portCollectedAt ?? createdOf(p))
/** Port payé d'une expédition créée avant le début du vrai calcul (payé à la création). */
export const isPortPayeMoneyBeforeStart = (p: any): boolean => p?.portType === 'port_paye' && beforeStart(createdOf(p))
/** Port (dû ou payé) d'avant le début du vrai calcul. */
export const isPortMoneyBeforeStart = (p: any): boolean => isPortDuMoneyBeforeStart(p) || isPortPayeMoneyBeforeStart(p)
/**
 * Expédition dont TOUT l'argent (port dû / port payé / COD) a été encaissé avant le début du vrai calcul :
 * aucun montant à compter ni à encaisser → retirée des calculs de solde des pages « argent ».
 * Un port dû ou un COD encore à encaisser la garde dans les calculs (il comptera à son encaissement).
 */
export const isFullyPreStartMoney = (p: any): boolean => {
  const hasCod = (Number.parseFloat(String(p?.codAmount ?? '').replace(',', '.')) || 0) > 0
  const portDuOpen = p?.portType === 'port_du' && !isPortDuMoneyBeforeStart(p)
  const codOpen = hasCod && !isCodMoneyBeforeStart(p)
  return (isPortMoneyBeforeStart(p) || isCodMoneyBeforeStart(p)) && !portDuOpen && !codOpen
}
export const moneyFromStart = <T,>(list: T[]): T[] => (list || []).filter(p => !isFullyPreStartMoney(p))
/** Liste réduite à l'argent COD COMPTÉ (sans les COD encaissés avant le 05/10/2026). */
export const codMoneyOnly = <T,>(list: T[]): T[] => (list || []).filter(p => !isCodMoneyBeforeStart(p))
/** Ligne de caisse (caisseEntries, transferts…) antérieure au début du vrai calcul. */
export const isEntryBeforeStart = (e: any): boolean => beforeStart(e?.createdAt ?? e?.date)
export const entriesFromStart = <T,>(list: T[]): T[] => (list || []).filter(e => !isEntryBeforeStart(e))

/** Message côté livreur (page Livreur, fenêtre « Versement au Chef »). */
export const DRIVER_VIA_EXPLOITATION_MSG =
  "Remettez vos ports dus, valeurs (COD) et ports payés au chef d'exploitation, qui les reçoit le soir (Collecte du soir). Plus de nouveau versement direct au chef d'agence."

/** Réception directe chef d'agence ← livreur désactivée (voir VIA_EXPLOITATION_MSG). */
export function blockDirectChefReception(): never {
  throw new Error(VIA_EXPLOITATION_MSG)
}
