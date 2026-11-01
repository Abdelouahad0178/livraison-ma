import { useEffect, useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { Settings2, ArrowUp, ArrowDown, X, Plus, Save } from 'lucide-react'
import { db } from '../../../firebase/db'
import { CITIES } from '../../../firebase/constants'
import {
  subscribeAgencySettings, guichetHolderOf, neighborCityOf, type GuichetHolder,
} from '../../../config/agencySettings'
import { DELAY_BOUNDS, activeDays, recentCollectDays } from '../../../config/siteDelays'

/**
 * 🏢 Réglages des agences (01/11/2026, lot C1) : l'admin change lui-même la liste des villes, la personne qui tient
 * le guichet du port payé et la ville voisine (bascule entre agences voisines), sans modifier le code.
 * Document settings/agencies (écriture admin seul) ; tout le site le suit en direct (config/agencySettings.ts).
 */

const ROLE_LABELS: Record<string, string> = {
  chef_agence: "Chef d'agence", agentpro: 'Agent PRO', aide_agent: 'Aide agent', chef_exploitation: "Chef d'exploitation",
  livreur: 'Livreur', 'livreur-gare': 'Livreur gare', pointeur_encaisseur: 'Pointeur', caissier: 'Caissier',
}

interface Draft {
  cities: string[]; guichet: Record<string, GuichetHolder | null>; neighbors: Record<string, string>
  delays: { collectDays: number; activeDays: number }
}

const draftFromCurrent = (): Draft => {
  const cities = [...CITIES]
  const guichet: Draft['guichet'] = {}
  const neighbors: Draft['neighbors'] = {}
  cities.forEach(c => {
    guichet[c] = guichetHolderOf(c)
    const n = neighborCityOf(c)
    if (n) neighbors[c] = n
  })
  return { cities, guichet, neighbors, delays: { collectDays: recentCollectDays(), activeDays: activeDays() } }
}

const clampDays = (v: number, b: { min: number; max: number; code: number }) =>
  Number.isFinite(v) ? Math.min(b.max, Math.max(b.min, Math.round(v))) : b.code

/** Ville voisine dans les deux sens : A ⇄ B (l'ancienne voisine de A et celle de B sont libérées). */
function setNeighbor(neighbors: Record<string, string>, city: string, other: string): Record<string, string> {
  const next = { ...neighbors }
  for (const c of [city, other]) {
    const old = next[c]
    if (old && next[old] === c) delete next[old]
    delete next[c]
  }
  if (other) { next[city] = other; next[other] = city }
  return next
}

export default function AgencySettingsCard({ users, adminName }: { users: any[]; adminName: string }) {
  const [draft, setDraft] = useState<Draft>(draftFromCurrent)
  const [dirty, setDirty] = useState(false)
  const [newCity, setNewCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Suit le document : tant que l'admin n'a rien modifié, l'écran montre les réglages en vigueur
  useEffect(() => subscribeAgencySettings(() => { if (!dirty) setDraft(draftFromCurrent()) }), [dirty])

  const staffByCity = useMemo(() => {
    const m = new Map<string, any[]>()
    ;(users || []).forEach(u => {
      if (!u?.city || u.role === 'client' || u.role === 'admin' || u.blocked) return
      if (!m.has(u.city)) m.set(u.city, [])
      m.get(u.city)!.push(u)
    })
    m.forEach(list => list.sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email))))
    return m
  }, [users])

  const change = (fn: (d: Draft) => Draft) => { setDraft(d => fn(d)); setDirty(true); setMessage(null) }

  const move = (i: number, delta: number) => change(d => {
    const cities = [...d.cities]
    const j = i + delta
    if (j < 0 || j >= cities.length) return d
    ;[cities[i], cities[j]] = [cities[j], cities[i]]
    return { ...d, cities }
  })

  const removeCity = (city: string) => {
    if (!window.confirm(`Retirer « ${city} » des listes de villes ?\nLes expéditions existantes de cette ville ne sont pas modifiées.`)) return
    change(d => {
      const guichet = { ...d.guichet }
      delete guichet[city]
      return { ...d, cities: d.cities.filter(c => c !== city), guichet, neighbors: setNeighbor(d.neighbors, city, '') }
    })
  }

  const addCity = () => {
    const name = newCity.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (draft.cities.some(c => c.toLowerCase() === name.toLowerCase())) { setMessage({ type: 'error', text: `« ${name} » est déjà dans la liste.` }); return }
    change(d => ({ ...d, cities: [...d.cities, name], guichet: { ...d.guichet, [name]: null } }))
    setNewCity('')
  }

  const setGuichet = (city: string, uid: string) => change(d => {
    const u = (users || []).find(x => x.id === uid)
    const holder = uid && u ? { id: uid, name: String(u.name || u.email || uid) } : (uid ? d.guichet[city] || null : null)
    return { ...d, guichet: { ...d.guichet, [city]: holder } }
  })

  const save = async () => {
    if (!draft.cities.length) { setMessage({ type: 'error', text: 'Il faut au moins une ville.' }); return }
    setBusy(true)
    try {
      const guichet: Record<string, GuichetHolder | null> = {}
      draft.cities.forEach(c => { guichet[c] = draft.guichet[c] || null })
      const neighbors: Record<string, string> = {}
      Object.entries(draft.neighbors).forEach(([a, b]) => { if (draft.cities.includes(a) && draft.cities.includes(b)) neighbors[a] = b })
      const delays = {
        collectDays: clampDays(draft.delays.collectDays, DELAY_BOUNDS.collectDays),
        activeDays: clampDays(draft.delays.activeDays, DELAY_BOUNDS.activeDays),
      }
      await setDoc(doc(db, 'settings', 'agencies'), {
        cities: draft.cities, guichet, neighbors, delays, updatedAt: new Date().toISOString(), updatedBy: adminName,
      })
      setDirty(false)
      setMessage({ type: 'success', text: 'Réglages enregistrés : tout le site les applique tout de suite.' })
    } catch (e: any) {
      setMessage({ type: 'error', text: `Enregistrement impossible : ${e?.message || e}` })
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => { setDraft(draftFromCurrent()); setDirty(false); setMessage(null) }

  return (
    <div className="bg-white rounded-2xl border border-cyan-100 shadow-sm p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-60">
          <h3 className="font-black text-gray-800 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-cyan-600" /> Réglages des agences
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Villes proposées dans les menus (dans cet ordre), personne qui tient le guichet du port payé, et ville voisine
            (expédition arrivée par erreur dans l'agence voisine).
          </p>
        </div>
        {dirty && (
          <div className="flex gap-2">
            <button onClick={cancel} disabled={busy}
              className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-bold hover:bg-gray-50 transition">
              Annuler
            </button>
            <button onClick={save} disabled={busy}
              className="inline-flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl transition">
              <Save className="w-4 h-4" /> {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="py-2 pr-2 w-16">Ordre</th>
              <th className="py-2 pr-3">Ville</th>
              <th className="py-2 pr-3">Guichet (port payé)</th>
              <th className="py-2 pr-3">Ville voisine</th>
              <th className="py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {draft.cities.map((city, i) => {
              const staff = staffByCity.get(city) || []
              const holder = draft.guichet[city] || null
              const holderListed = !holder || staff.some(u => u.id === holder.id)
              return (
                <tr key={city} className="border-b border-gray-50">
                  <td className="py-2 pr-2">
                    <div className="flex gap-1">
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="Monter"
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === draft.cities.length - 1} title="Descendre"
                        className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                  <td className="py-2 pr-3 font-bold text-gray-800 whitespace-nowrap">{city}</td>
                  <td className="py-2 pr-3">
                    <select value={holder?.id || ''} onChange={e => setGuichet(city, e.target.value)}
                      className="w-full min-w-44 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                      <option value="">— Aucun (reste « En gare - {city} ») —</option>
                      {!holderListed && holder && <option value={holder.id}>{holder.name}</option>}
                      {staff.map(u => (
                        <option key={u.id} value={u.id}>{u.name || u.email} · {ROLE_LABELS[u.role] || u.role}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select value={draft.neighbors[city] || ''} onChange={e => change(d => ({ ...d, neighbors: setNeighbor(d.neighbors, city, e.target.value) }))}
                      className="w-full min-w-36 border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                      <option value="">— Aucune —</option>
                      {draft.cities.filter(c => c !== city).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <button onClick={() => removeCity(city)} title={`Retirer ${city}`}
                      className="p-1 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50"><X className="w-4 h-4" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={newCity} onChange={e => setNewCity(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCity() }}
          placeholder="Nouvelle ville (ex. Tiznit)"
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm min-w-52" />
        <button onClick={addCity}
          className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold px-3 py-2 rounded-xl transition">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
        <span className="text-xs text-gray-400">Nouvelle ville : pensez aussi à son tarif (Admin › Tarifs).</span>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-100">
        <h4 className="font-bold text-gray-800 text-sm">⏱️ Durées</h4>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            ['collectDays', 'Collectes par jour', 'Nombre de journées des cartes « Collectes par jour » et « Valeurs (COD) collectées par jour » (Caisse Agence, Collecte du soir).'],
            ['activeDays', '« Tout » et archivage', "Jours chargés par le filtre « Tout » ; c'est aussi l'âge auquel toute expédition est archivée automatiquement. Plus de jours = pages plus lentes."],
          ] as const).map(([key, label, help]) => {
            const b = DELAY_BOUNDS[key]
            return (
              <label key={key} className="block bg-gray-50 rounded-xl p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-700">{label}</span>
                  <span className="flex items-center gap-1.5">
                    <input type="number" min={b.min} max={b.max} value={draft.delays[key]}
                      onChange={e => { const v = Number(e.target.value); change(d => ({ ...d, delays: { ...d.delays, [key]: v } })) }}
                      onBlur={() => change(d => ({ ...d, delays: { ...d.delays, [key]: clampDays(d.delays[key], b) } }))}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right bg-white" />
                    <span className="text-xs text-gray-500">jours</span>
                  </span>
                </span>
                <span className="block text-xs text-gray-400 mt-1">{help} De {b.min} à {b.max} jours (avant : {b.code}).</span>
              </label>
            )
          })}
        </div>
      </div>

      {message && (
        <div className={`mt-3 text-sm font-semibold px-4 py-2.5 rounded-xl ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
        }`}>{message.text}</div>
      )}
    </div>
  )
}
