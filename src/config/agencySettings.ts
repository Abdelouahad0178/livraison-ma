/**
 * 🏢 RÉGLAGES DES AGENCES (01/11/2026, diagnostic de souplesse — lot C1) : modifiables par l'ADMIN (Admin › Agences ›
 * Réglages), document Firestore `settings/agencies`, au lieu de valeurs écrites dans le code :
 *  - cities   : liste des villes / agences proposées dans les menus (ordre compris) ;
 *  - guichet  : personne qui tient le guichet du port payé dans chaque ville (avant : config/guichetHolders.ts) ;
 *  - neighbors: ville voisine (bascule « colis arrivé dans l'agence voisine », avant : Agadir ⇄ Ait Melloul écrit en dur).
 * Tant que le document n'existe pas (ou qu'un champ manque), les valeurs du CODE s'appliquent : rien ne change.
 * Lu une fois au démarrage puis suivi en direct (startAgencySettingsSync, App.tsx).
 */
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/db'
import { CITIES } from '../firebase/constants'
import { GUICHET_HOLDERS } from './guichetHolders'

export interface GuichetHolder { id: string; name: string }
export interface AgencySettings {
  cities?: string[]
  guichet?: Record<string, GuichetHolder | null>
  neighbors?: Record<string, string>
  updatedAt?: string
  updatedBy?: string
}

/** Valeurs du code (avant les réglages) — servent de secours. */
export const CODE_CITIES = [...CITIES]
export const CODE_NEIGHBORS: Record<string, string> = { 'Agadir': 'Ait Melloul', 'Ait Melloul': 'Agadir' }

let current: AgencySettings = {}
const listeners = new Set<(s: AgencySettings) => void>()

/** Applique les réglages : la liste partagée CITIES est mise à jour SUR PLACE (tous les écrans qui l'importent la voient). */
export function applyAgencySettings(s: AgencySettings | null | undefined) {
  current = s || {}
  const list = Array.isArray(current.cities) && current.cities.filter(c => typeof c === 'string' && c.trim()).length
    ? current.cities.filter(c => typeof c === 'string' && c.trim())
    : CODE_CITIES
  CITIES.splice(0, CITIES.length, ...list)
  listeners.forEach(l => l(current))
}

export const agencySettings = () => current

/** Personne qui tient le guichet de la ville (réglage, sinon valeur du code). `null` réglé = aucun détenteur. */
export function guichetHolderOf(city?: string | null): GuichetHolder | null {
  if (!city) return null
  const g = current.guichet
  if (g && Object.prototype.hasOwnProperty.call(g, city)) return g[city] || null
  return GUICHET_HOLDERS[city] || null
}

/** Ville voisine (bascule entre agences voisines) : réglage, sinon Agadir ⇄ Ait Melloul. */
export function neighborCityOf(city?: string | null): string | null {
  if (!city) return null
  const n = current.neighbors || CODE_NEIGHBORS
  return n[city] || null
}
/** Les deux villes sont voisines (dans un sens ou dans l'autre). */
export const areNeighborCities = (a?: string | null, b?: string | null) => !!a && !!b && (neighborCityOf(a) === b || neighborCityOf(b) === a)

/** Suit le document settings/agencies (une seule fois par onglet). */
let started = false
export function startAgencySettingsSync(): () => void {
  if (started) return () => {}
  started = true
  const unsub = onSnapshot(doc(db, 'settings', 'agencies'),
    snap => applyAgencySettings(snap.exists() ? (snap.data() as AgencySettings) : null),
    err => console.warn('Réglages des agences : lecture impossible, valeurs du code', err))
  return () => { started = false; unsub() }
}

/** Pour les écrans qui doivent se redessiner quand les réglages changent (Admin). */
export function subscribeAgencySettings(cb: (s: AgencySettings) => void): () => void {
  listeners.add(cb)
  cb(current)
  return () => { listeners.delete(cb) }
}
