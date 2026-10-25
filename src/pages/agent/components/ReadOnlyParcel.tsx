import { Lock } from 'lucide-react'
import { parcelDate } from '../../../utils/dateFilter'
import { ALL_SERVICE_TYPES, STATUS_COLORS } from '../../../firebase/constants'

const date = (value: any) => {
  if (!value) return '—'
  const d = value?.toDate ? value.toDate() : new Date(value)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR') : '—'
}
const amount = (value: any) => `${(Number(value) || 0).toLocaleString('fr-MA')} DH`
export function ReadOnlyBadge() {
  return <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 rounded-lg px-2 py-1 whitespace-nowrap"><Lock className="w-3 h-3" /> Lecture seule</span>
}

export function ReadOnlyParcelRow({ parcel: p, columns }: { parcel: any; columns: Record<string, boolean> }) {
  const sc = STATUS_COLORS[p.status] || STATUS_COLORS['Initialisé']
  const cell = (key: string, value: any) => columns[key] ? <td key={key} className="px-4 py-3 border-r border-gray-100">{value || '—'}</td> : null
  return <tr data-read-only-parcel={p.id} className="border-b border-gray-100 bg-gray-50/50 text-gray-700">
    <td className="px-3 py-3 text-center"><Lock className="w-4 h-4 mx-auto text-gray-400" /></td>
    {cell('nexp', <span className="font-mono font-bold text-blue-700">{p.senderNic || p.sender?.nic || p.trackingId || '—'}</span>)}
    {cell('date', date(parcelDate(p)))}
    {cell('dateLivraison', date(p.deliveredAt))}
    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg whitespace-nowrap ${sc.bg} ${sc.text}`}>{p.status}</span></td>
    {cell('expediteur', p.sender?.name)}{cell('telExp', p.sender?.tel)}{cell('villeExp', p.originCity || p.sender?.city)}
    {cell('destinataire', p.receiver?.name)}{cell('telDest', p.receiver?.tel)}{cell('villeDest', p.destinationCity || p.receiver?.city)}
    {cell('adresse', p.receiver?.address)}{cell('service', ALL_SERVICE_TYPES.find(type => type.key === p.serviceType)?.label || p.serviceType)}
    {cell('nbColis', String(p.nbColis || 1))}{cell('poids', p.weight ? `${p.weight} kg` : '—')}
    {cell('port', amount(p.price))}{cell('typePort', p.portType)}{cell('cod', amount(p.codAmount))}
    {cell('livreur', p.deliveryDriverName || p.chauffeurName || `En gare - ${p.destinationCity || '—'}`)}
    <td className="px-4 py-3"><ReadOnlyBadge /></td>
  </tr>
}

export function ReadOnlyParcelCard({ parcel: p }: { parcel: any }) {
  return <article data-read-only-parcel={p.id} className="bg-white border border-gray-200 border-l-4 border-l-gray-400 rounded-xl p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><strong className="font-mono text-blue-700">{p.senderNic || p.sender?.nic || p.trackingId}</strong><ReadOnlyBadge /></div>
    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span>{p.originCity || p.sender?.city}</span><span>→</span><span>{p.destinationCity || p.receiver?.city}</span><span className="text-xs bg-gray-100 px-2 py-1 rounded-lg">{p.status}</span></div>
    <div className="grid sm:grid-cols-2 gap-3 text-sm">
      <div><div className="text-xs text-gray-500">Expéditeur</div><strong>{p.sender?.name || '—'}</strong><div>{p.sender?.tel}</div></div>
      <div><div className="text-xs text-gray-500">Destinataire</div><strong>{p.receiver?.name || '—'}</strong><div>{p.receiver?.tel}</div><div>{p.receiver?.address}</div></div>
    </div>
    <div className="flex flex-wrap gap-3 text-xs text-gray-600"><span>Création : {date(parcelDate(p))}</span><span>Livraison : {date(p.deliveredAt)}</span><span>Port : {amount(p.price)}</span><span>RETOUR FOND : {amount(p.codAmount)}</span><span>Livreur : {p.deliveryDriverName || p.chauffeurName || '—'}</span></div>
    <div className="flex flex-wrap gap-3 text-xs text-gray-600"><span>Suivi : {p.trackingId || '—'}</span><span>Colis : {p.nbColis || 1}</span><span>Poids : {p.weight || 0} kg</span><span>Service : {ALL_SERVICE_TYPES.find(type => type.key === p.serviceType)?.label || p.serviceType || '—'}</span></div>
    {(p.natureOfGoods || p.notes) && <p className="text-xs text-gray-600 whitespace-pre-wrap">{[p.natureOfGoods, p.notes].filter(Boolean).join(' · ')}</p>}
    <p className="text-xs text-gray-500">Bon géré par l’agence de création ; livraison et livreur gérés par l’agence de destination.</p>
  </article>
}
