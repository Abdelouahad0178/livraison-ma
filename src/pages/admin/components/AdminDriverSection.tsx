import { useMemo, useState } from 'react'
import { auth } from '../../../firebase/config'
import { reassignAnyStatus } from '../../exploitation/exploitationActions'

/**
 * 🚚 Fenêtre « Changer le statut » de l'admin : livreur ACTUEL de l'expédition + changement de livreur parmi ceux
 * de la MÊME ville (ville de livraison = destination). Même opération que le chef d'exploitation (reassignAnyStatus) :
 * « Arrivé en agence » / « En cours de livraison » → passe « En cours de livraison » chez le nouveau livreur
 * (ou reste en agence pour « En gare ») ; autres statuts (Livré…) conservés, seul le livreur change.
 */
export default function AdminDriverSection({ parcel, users, onChanged }: Readonly<{
  parcel: any
  users: any[]
  onChanged: (patch: Record<string, any>) => void
}>) {
  const city: string = parcel.destinationCity || parcel.receiver?.city || ''
  const drivers = useMemo(() => (users || [])
    .filter((u: any) => u.city === city && (u.role === 'livreur' || u.role === 'livreur-gare') && !u.blocked)
    .map((u: any) => ({ id: u.id, name: u.role === 'livreur-gare' ? `En gare - ${city}` : (u.name || u.email || 'Livreur'), depot: u.role === 'livreur-gare' }))
    .sort((a, b) => Number(a.depot) - Number(b.depot) || a.name.localeCompare(b.name)), [users, city])
  const [driverId, setDriverId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const current = parcel.deliveryDriverName || ''

  const run = async () => {
    const d = drivers.find(x => x.id === driverId)
    if (!d) return
    const effect = parcel.status === 'Arrivé en agence' || parcel.status === 'En cours de livraison'
      ? (d.depot ? 'Elle restera en gare (« Arrivé en agence »).' : `Elle passera « En cours de livraison » chez ${d.name}.`)
      : `Son statut « ${parcel.status} » est conservé.`
    if (!globalThis.confirm(`Changer le livreur de ${parcel.senderNic || parcel.sender?.nic || parcel.trackingId} : ${current || 'aucun'} → ${d.name} ?\n${effect}`)) return
    setBusy(true); setMsg(null)
    try {
      const name = auth.currentUser?.email || 'Admin'
      await reassignAnyStatus(parcel, { id: d.id, name: d.name }, d.depot, { name, uid: auth.currentUser?.uid || '' })
      const outNow = (parcel.status === 'Arrivé en agence' || parcel.status === 'En cours de livraison') && !d.depot
      onChanged({ deliveryDriverId: d.id, deliveryDriverName: d.name, ...(outNow ? { status: 'En cours de livraison' } : {}) })
      setMsg({ ok: true, text: `✅ Livreur changé : ${d.name}` })
      setDriverId('')
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2">
      <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">🚚 Livreur ({city || 'ville inconnue'})</p>
      <p className="text-sm text-gray-700">Actuel : <b>{current || '— aucun livreur'}</b></p>
      <div className="flex gap-2">
        <select value={driverId} onChange={e => setDriverId(e.target.value)}
          className="flex-1 border border-blue-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
          <option value="">Choisir un autre livreur de {city}…</option>
          {drivers.filter(d => d.id !== parcel.deliveryDriverId).map(d => <option key={d.id} value={d.id}>{d.depot ? '🚉 ' : '🚚 '}{d.name}</option>)}
        </select>
        <button type="button" onClick={run} disabled={!driverId || busy}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
          {busy ? '…' : 'Changer'}
        </button>
      </div>
      {drivers.length === 0 && <p className="text-xs text-gray-500">Aucun livreur enregistré à {city}.</p>}
      {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  )
}
