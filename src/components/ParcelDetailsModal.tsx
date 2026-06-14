import { X, Package, User, MapPin, Phone, Mail, Calendar, Truck, Wallet, FileText, Clock } from 'lucide-react'
import { fmt } from '../utils/formatNumber'

const asDate = (value: any) => value?.toDate ? value.toDate() : new Date(value || 0)
const fmtDate = (v: any) => v ? asDate(v).toLocaleString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-'
const fmtDateShort = (v: any) => v ? asDate(v).toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '-'

interface ParcelDetailsModalProps {
  parcel: any
  onClose: () => void
}

export default function ParcelDetailsModal({ parcel, onClose }: ParcelDetailsModalProps) {
  const getStatusColor = (status: string) => {
    const colors: any = {
      'Initialisé': 'bg-gray-100 text-gray-700',
      'Arrivé': 'bg-blue-100 text-blue-700',
      'En cours': 'bg-orange-100 text-orange-700',
      'Livré': 'bg-green-100 text-green-700',
      'Retourné': 'bg-red-100 text-red-700',
      'Annulé': 'bg-gray-100 text-gray-500'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  const getServiceLabel = (type: string) => {
    const types: any = {
      'simple': 'Simple',
      'especes': 'Contre remboursement espèces',
      'cheque': 'Contre chèque',
      'traite': 'Contre traite',
      'retour_bl': 'Retour bon livraison'
    }
    return types[type] || type
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-xl">Détails de l'expédition</h3>
              <p className="text-blue-200 text-sm font-mono">{parcel.trackingId}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Statut */}
          <div className="flex items-center justify-between">
            <span className={`px-4 py-2 rounded-xl font-bold text-sm ${getStatusColor(parcel.status)}`}>
              {parcel.status || 'Initialisé'}
            </span>
            <div className="text-right">
              <p className="text-2xl font-black text-gray-900">{fmt(parcel.price || 0)} DH</p>
              <p className="text-xs text-gray-400">Prix total</p>
            </div>
          </div>

          {/* Expéditeur et Destinataire */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Expéditeur */}
            <div className="bg-blue-50 rounded-2xl p-5 border-2 border-blue-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <h4 className="font-black text-gray-900">Expéditeur</h4>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-gray-900">{parcel.sender?.name || parcel.senderName || '-'}</p>
                    {parcel.sender?.nic && <p className="text-xs text-gray-500">NIC: {parcel.sender.nic}</p>}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-700">{parcel.sender?.tel || parcel.senderTel || '-'}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{parcel.sender?.city || parcel.senderCity || '-'}</p>
                    {parcel.sender?.address && <p className="text-xs text-gray-600 mt-0.5">{parcel.sender.address}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Destinataire */}
            <div className="bg-green-50 rounded-2xl p-5 border-2 border-green-100">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-green-600 text-white flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <h4 className="font-black text-gray-900">Destinataire</h4>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm font-bold text-gray-900">{parcel.receiver?.name || parcel.receiverName || '-'}</p>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-700">{parcel.receiver?.tel || parcel.receiverTel || '-'}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{parcel.receiver?.city || parcel.receiverCity || '-'}</p>
                    {(parcel.receiver?.address || parcel.receiverAddress) && (
                      <p className="text-xs text-gray-600 mt-0.5">{parcel.receiver?.address || parcel.receiverAddress}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Détails colis */}
          <div className="bg-gray-50 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-5 h-5 text-gray-700" />
              <h4 className="font-black text-gray-900">Détails du colis</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 font-semibold mb-1">Poids</p>
                <p className="text-sm font-black text-gray-900">{parcel.weight || 0} kg</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold mb-1">Nb colis</p>
                <p className="text-sm font-black text-gray-900">{parcel.nbColis || 1}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold mb-1">Service</p>
                <p className="text-sm font-bold text-gray-900">{getServiceLabel(parcel.serviceType || 'simple')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold mb-1">Nature</p>
                <p className="text-sm font-bold text-gray-900">{parcel.natureOfGoods || '-'}</p>
              </div>
            </div>

            {parcel.codAmount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-amber-600" />
                    <span className="font-bold text-gray-900">Retour Fond</span>
                  </div>
                  <span className="text-xl font-black text-amber-600">{fmt(parcel.codAmount)} DH</span>
                </div>
                {parcel.codSenderPaid && (
                  <p className="text-xs text-green-600 font-bold mt-2">✓ Réglé le {fmtDateShort(parcel.codSenderPaidAt)}</p>
                )}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="bg-white border-2 border-gray-100 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-gray-700" />
              <h4 className="font-black text-gray-900">Dates importantes</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500 font-semibold mb-1">Création</p>
                <p className="text-sm font-bold text-gray-900">{fmtDate(parcel.createdAt)}</p>
              </div>
              {parcel.validatedByChef && parcel.validatedAt && (
                <div>
                  <p className="text-xs text-gray-500 font-semibold mb-1">Validé</p>
                  <p className="text-sm font-bold text-gray-900">{fmtDate(parcel.validatedAt)}</p>
                </div>
              )}
              {parcel.deliveredAt && (
                <div>
                  <p className="text-xs text-gray-500 font-semibold mb-1">Livré</p>
                  <p className="text-sm font-bold text-green-600">{fmtDate(parcel.deliveredAt)}</p>
                </div>
              )}
              {parcel.returnedAt && (
                <div>
                  <p className="text-xs text-gray-500 font-semibold mb-1">Retourné</p>
                  <p className="text-sm font-bold text-red-600">{fmtDate(parcel.returnedAt)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Historique */}
          {parcel.history && parcel.history.length > 0 && (
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-gray-700" />
                <h4 className="font-black text-gray-900">Historique</h4>
              </div>
              <div className="space-y-3">
                {parcel.history.slice(0, 5).map((h: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                      h.status === 'Livré' ? 'bg-green-500' :
                      h.status === 'Retourné' ? 'bg-red-500' :
                      'bg-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{h.status}</p>
                      {h.note && <p className="text-xs text-gray-600 mt-0.5">{h.note}</p>}
                      <p className="text-xs text-gray-400 mt-1">{fmtDate(h.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {(parcel.notes || parcel.cancelReason) && (
            <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-amber-600" />
                <h4 className="font-black text-gray-900">Notes</h4>
              </div>
              <p className="text-sm text-gray-700">{parcel.notes || parcel.cancelReason}</p>
            </div>
          )}

          {/* Agent créateur */}
          {parcel.agentName && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">Créé par</span>
              </div>
              <span className="text-sm font-bold text-gray-900">{parcel.agentName}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-2xl border-t border-gray-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 py-3 font-bold transition flex items-center justify-center gap-2"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
