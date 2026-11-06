/**
 * 🗂️ « Anciennes à régler » (05/11/2026) — expéditions créées depuis le 05/10, plus vieilles que la fenêtre des listes
 * (45 jours par défaut), PAS rangées parce qu'elles ne sont pas terminées ou pas réglées (port dû / COD en attente).
 * Liste préparée chaque nuit par l'archivage automatique (archiveWatch/oldUnsettled, functions/weeklyArchiving.js) ;
 * à l'ouverture, l'état ACTUEL de chaque expédition est relu (parcelsLite) : celles réglées / rangées depuis la nuit
 * disparaissent. Règle commune : utils/archiveRule.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase/db'
import { isArchiveSettled, isCodSettledForArchive, isPortSettledForArchive, unsettledReason } from '../../utils/archiveRule'
import { fmtFixed as fmtAmt } from '../../utils/formatNumber'

type Item = { id: string; nic: string; status: string; createdAt: string; from: string; to: string; city: string; port: number; cod: number; driver: string; reason: string }
type Watch = { at: string; windowDays: number; total: number; complete: boolean; cities: Record<string, { count: number; port: number; cod: number; items: Item[] }> }

const frDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca' }) : '—')
const num = (v: any) => { const n = Number.parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

export default function OldUnsettledCard({ city, onOpen }: { city?: string; onOpen?: (nic: string) => void }) {
  const [watch, setWatch] = useState<Watch | null>(null)
  const [open, setOpen] = useState(false)
  const [live, setLive] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let off = false
    getDoc(doc(db, 'archiveWatch', 'oldUnsettled'))
      .then(s => { if (!off) setWatch(s.exists() ? (s.data() as Watch) : null) })
      .catch(e => { if (!off) setError(e?.message || String(e)) })
    return () => { off = true }
  }, [])

  const items = useMemo(() => {
    if (!watch) return [] as Item[]
    const groups = city ? [watch.cities?.[city]].filter(Boolean) : Object.values(watch.cities || {})
    return groups.flatMap(g => g!.items || [])
  }, [watch, city])

  // État actuel relu à l'ouverture (par paquets de 30) : réglées ou rangées depuis la nuit → retirées de la liste
  useEffect(() => {
    if (!open || !items.length || live) return
    let off = false
    const ids = items.map(i => i.id)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
    Promise.all(chunks.map(c => getDocs(query(collection(db, 'parcelsLite'), where(documentId(), 'in', c)))))
      .then(snaps => {
        if (off) return
        const m: Record<string, any> = {}
        snaps.forEach(s => s.docs.forEach(d => { m[d.id] = d.data() }))
        setLive(m)
      })
      .catch(e => { if (!off) setError(e?.message || String(e)) })
    return () => { off = true }
  }, [open, items, live])

  const rows = useMemo(() => items
    .map(i => {
      const cur = live?.[i.id]
      if (!cur) return live ? null : i // pas encore relue : affichée telle quelle ; relue mais introuvable : retirée
      if (cur.isArchived || isArchiveSettled(cur)) return null
      return { ...i, status: cur.status || i.status, reason: unsettledReason(cur),
        port: isPortSettledForArchive(cur) ? 0 : num(cur.price),
        cod: isCodSettledForArchive(cur) ? 0 : num(cur.codAmount) }
    })
    .filter(Boolean) as Item[], [items, live])

  if (error) return null
  if (!watch) return null
  const total = city ? (watch.cities?.[city]?.count || 0) : watch.total
  if (!total) return null
  const shown = open && live ? rows.length : total
  const sumPort = (open && live ? rows : items).reduce((s, i) => s + (i.port || 0), 0)
  const sumCod = (open && live ? rows : items).reduce((s, i) => s + (i.cod || 0), 0)

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full p-3 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-amber-100/60 transition">
        <div>
          <div className="font-bold text-amber-900">🗂️ Anciennes à régler — {shown} expédition{shown > 1 ? 's' : ''}</div>
          <div className="text-xs text-amber-800">
            Plus de {watch.windowDays} jours, plus dans les listes du jour, pas rangées car pas terminées ou pas réglées
            {sumPort ? ` · port dû ${fmtAmt(sumPort)} DH` : ''}{sumCod ? ` · COD ${fmtAmt(sumCod)} DH` : ''}
          </div>
        </div>
        <span className="text-xs font-semibold text-amber-900">{open ? '▲ Masquer' : '▼ Voir la liste'}</span>
      </button>
      {open && (
        <div className="border-t border-amber-200 bg-white overflow-x-auto">
          {!live && <div className="p-3 text-xs text-gray-500">Vérification de l'état actuel…</div>}
          {live && rows.length === 0 && <div className="p-3 text-sm text-green-700">✅ Tout est réglé depuis la liste de cette nuit.</div>}
          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 border-b">
                <th className="text-left py-2 px-3">N° EXP</th><th className="text-left py-2 px-3">Créée le</th>
                {!city && <th className="text-left py-2 px-3">Agence</th>}
                <th className="text-left py-2 px-3">Trajet</th><th className="text-left py-2 px-3">Ce qui reste à faire</th>
                <th className="text-right py-2 px-3">Port dû</th><th className="text-right py-2 px-3">COD</th><th className="text-left py-2 px-3">Livreur</th>
              </tr></thead>
              <tbody>
                {rows.map(i => (
                  <tr key={i.id} className="border-b border-gray-100">
                    <td className="py-1.5 px-3 font-mono text-xs font-semibold">
                      {onOpen ? <button onClick={() => onOpen(i.nic)} className="text-blue-700 hover:underline" title="Ouvrir dans la recherche pour encaisser / livrer">🔎 {i.nic}</button> : i.nic}
                    </td>
                    <td className="py-1.5 px-3 text-xs">{frDate(i.createdAt)}</td>
                    {!city && <td className="py-1.5 px-3 text-xs">{i.city || '—'}</td>}
                    <td className="py-1.5 px-3 text-xs">{i.from} → {i.to}</td>
                    <td className="py-1.5 px-3 text-xs">{i.reason}</td>
                    <td className="py-1.5 px-3 text-right text-xs tabular-nums">{i.port ? `${fmtAmt(i.port)} DH` : '—'}</td>
                    <td className="py-1.5 px-3 text-right text-xs tabular-nums">{i.cod ? `${fmtAmt(i.cod)} DH` : '—'}</td>
                    <td className="py-1.5 px-3 text-xs">{i.driver || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="p-2 text-[11px] text-gray-500">Liste préparée cette nuit ({frDate(watch.at)}){onOpen ? ' · 🔎 ouvre l\'expédition dans la recherche (encaisser, livrer…)' : ''}.</div>
        </div>
      )}
    </div>
  )
}
