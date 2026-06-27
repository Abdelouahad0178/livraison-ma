import { lazy, Suspense, useState, useEffect } from 'react'
import { Calendar, Search, X, Plus, MapPin, ChevronDown, Check, MessageCircle, Printer } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { CITIES } from '../../../firebase/constants'
import ClientAutocomplete from '../../../components/ClientAutocomplete'
import { searchExpediteurs, searchDestinataires, Client } from '../../../firebase/clients'
import VoiceInputAI from '../../../components/VoiceInputAI'

const Barcode = lazy(() => import('react-barcode'))
const QRCodeSVG = lazy(() => import('../../../components/QRCodeSvg'))

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const EMPTY_FORM = {
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '', receiverClientId: '',
  weight: '', nbColis: '1', natureOfGoods: '', natureOfGoodsCustomPrice: '', codAmount: '',
  serviceType: 'simple', hasRetourBL: false, shipmentMode: 'personal',
  portType: 'port_paye', portPayeMethod: '', portPayeMontant: '',
  portPrice: '',
  clientId: '', clientName: '', autoDebit: false,
  deliverySectorId: '', deliveryDriverId: '',
  operationDate: todayStr(),
}

// Tous les types pour affichage (compatibilité anciens colis)
const ALL_SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

// Types disponibles pour création (sans retour_bl)
const SERVICE_TYPES = ALL_SERVICE_TYPES.filter(t => t.key !== 'retour_bl')

export default function NewTab() {
  const {
    profile, ticketRef,
    form, setForm, f, loading, error, handleSubmit,
    clients, clientSearch, setClientSearch,
    showClientDropdown, setShowClientDropdown,
    showSenderDropdown, setShowSenderDropdown,
    filteredClientSearch, selectExistingClient,
    inlineNewClient, setInlineNewClient,
    destinationSectors, destinationDrivers,
    price, inputCls, selectCls,
    createdParcel, setCreatedParcel,
    whatsappLink, whatsappMsg,
    handleCreateInlineClient,
  } = useAgentCtx()

  // État pour la modal de confirmation/édition avant impression
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingParcel, setPendingParcel] = useState<any>(null)
  const [editableParcel, setEditableParcel] = useState<any>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)

  // Navigation clavier pour le formulaire
  const handleKeyNav = (e: React.KeyboardEvent, currentId: string, nextId: string) => {
    if (e.key === 'Enter' && !e.ctrlKey) {
      e.preventDefault()
      const nextField = document.getElementById(nextId) || document.querySelector(`[data-field="${nextId}"]`)
      if (nextField) (nextField as HTMLElement).focus()
    }
  }

  // Intercepter la création du colis pour afficher la modal de confirmation
  useEffect(() => {
    if (createdParcel && !showConfirmModal && !pendingParcel && !isConfirmed) {
      // Un nouveau colis vient d'être créé
      setPendingParcel(createdParcel)
      setEditableParcel({ ...createdParcel })
      setShowConfirmModal(true)
      setIsConfirmed(false)
      // Réinitialiser createdParcel pour éviter de réafficher le bon directement
      setCreatedParcel(null)
    }
  }, [createdParcel, showConfirmModal, pendingParcel, isConfirmed, setCreatedParcel])

  const handleVoiceResult = (field: string, value: string) => {
    setForm((prev: any) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleClientFound = (client: Client, isSender: boolean) => {
    console.log('🎉 Remplissage automatique du client:', client.name, isSender ? 'Expéditeur' : 'Destinataire')

    if (isSender) {
      // Remplir les champs expéditeur
      setForm((prev: any) => ({
        ...prev,
        senderName: client.name,
        senderTel: client.tel,
        senderAddress: client.address || '',
        senderCity: client.city || profile?.city || '',
        senderNic: client.nic || '',
      }))
    } else {
      // Remplir les champs destinataire
      setForm((prev: any) => ({
        ...prev,
        receiverName: client.name,
        receiverTel: client.tel,
        receiverAddress: client.address || '',
        receiverCity: client.city || '',
        receiverClientId: client.id || '',
        deliverySectorId: client.secteurId || '',
        deliveryDriverId: client.livreurIds?.[0] || '',
      }))
    }
  }

  // 🤖 Remplissage en masse via IA
  const handleBulkFill = (data: Record<string, any>) => {
    console.log('🤖 Remplissage IA en masse:', data)

    setForm((prev: any) => {
      const updated = { ...prev }

      // Mapper les données extraites par l'IA vers le formulaire
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          // Conversion des types si nécessaire
          if (key === 'weight' || key === 'nbColis' || key === 'portPrice' || key === 'codAmount') {
            updated[key] = String(value)
          } else {
            updated[key] = value
          }
        }
      })

      return updated
    })
  }

  const handlePrint = () => {
    const previousTitle = document.title
    const style = document.createElement('style')
    style.textContent = `
      @page { size: A5 portrait; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #ticket-print { width: 148mm !important; max-width: 148mm !important; margin: 0 auto !important; }
      }
    `
    document.head.appendChild(style)
    document.title = createdParcel ? `Bon-Ramassage-${createdParcel.trackingId}` : 'Bon-Ramassage'
    window.print()
    setTimeout(() => {
      document.title = previousTitle
      style.remove()
    }, 500)
  }

  // Valider et passer à l'impression
  const handleConfirmPrint = () => {
    if (editableParcel) {
      // Marquer comme confirmé pour éviter que le modal se rouvre
      setIsConfirmed(true)
      // Afficher le bon avec les données éditées
      setCreatedParcel(editableParcel)
      setShowConfirmModal(false)
      setPendingParcel(null)
      setEditableParcel(null)
    }
  }

  // Annuler et revenir au formulaire
  const handleCancelConfirm = () => {
    setShowConfirmModal(false)
    setPendingParcel(null)
    setEditableParcel(null)
    setIsConfirmed(false)
  }

  // Modal de confirmation/édition avant impression
  if (showConfirmModal && editableParcel) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* En-tête */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 sticky top-0 z-10">
            <h2 className="text-2xl font-bold">✅ Colis créé avec succès !</h2>
            <p className="text-blue-100 text-sm mt-1">
              Vérifiez et modifiez les informations avant d'imprimer le bon de ramassage
            </p>
            <p className="text-white font-mono text-lg mt-2 font-bold">{editableParcel.trackingId}</p>
          </div>

          {/* Contenu éditable */}
          <div className="p-6 space-y-6">
            {/* Message d'info */}
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-bold text-yellow-900 mb-1">Dernière vérification avant impression</p>
                  <p className="text-sm text-yellow-800">
                    Modifiez les champs ci-dessous si nécessaire, puis cliquez sur "Valider et Imprimer"
                  </p>
                </div>
              </div>
            </div>

            {/* Expéditeur */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
                <span>📤</span> Expéditeur
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={editableParcel.sender.name || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, name: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">N° Expéditeur (NIC)</label>
                  <input
                    type="text"
                    value={editableParcel.sender.nic || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, nic: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={editableParcel.sender.tel || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, tel: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={editableParcel.sender.city || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, city: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Adresse</label>
                  <input
                    type="text"
                    value={editableParcel.sender.address || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, address: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Destinataire */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-green-900 mb-3 flex items-center gap-2">
                <span>📥</span> Destinataire
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.name || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, name: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.tel || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, tel: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.city || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, city: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Adresse</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.address || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, address: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Détails du colis */}
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
                <span>📦</span> Détails du colis
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Poids (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editableParcel.weight || ''}
                    onChange={(e) => setEditableParcel({ ...editableParcel, weight: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre de colis</label>
                  <input
                    type="number"
                    value={editableParcel.nbColis || 1}
                    onChange={(e) => setEditableParcel({ ...editableParcel, nbColis: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nature de marchandise</label>
                  <input
                    type="text"
                    value={editableParcel.natureOfGoods || ''}
                    onChange={(e) => setEditableParcel({ ...editableParcel, natureOfGoods: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Prix (DH)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editableParcel.price || ''}
                    onChange={(e) => setEditableParcel({ ...editableParcel, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Retour fond (DH)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editableParcel.codAmount || 0}
                    onChange={(e) => setEditableParcel({ ...editableParcel, codAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="bg-gray-50 px-6 py-4 flex gap-3 sticky bottom-0">
            <button
              onClick={handleCancelConfirm}
              className="flex-1 py-3 px-6 border-2 border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-100 transition flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" /> Annuler
            </button>
            <button
              onClick={handleConfirmPrint}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-xl transition flex items-center justify-center gap-2"
            >
              <Printer className="w-5 h-5" /> Valider et Imprimer
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (createdParcel) {
    return (
      <div className="space-y-4 mt-4">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
          <p className="text-2xl mb-1">✅</p>
          <p className="text-green-700 font-bold text-lg">Colis enregistré avec succès !</p>
          <p className="text-green-600 font-mono text-sm mt-1">{createdParcel.trackingId}</p>
        </div>

        <div id="ticket-print" ref={ticketRef} className="bg-white border border-gray-300 text-[11px]" style={{ maxWidth: '148mm', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-300 px-3 py-2">
            <img src="/LOGO.jpg" alt="BG Express" style={{ height: '36px', objectFit: 'contain' }} />
            <div className="text-right">
              <div className="text-[10px] text-gray-500">Bon de Ramassage</div>
              {createdParcel.sender?.nic && (
                <div className="font-bold text-blue-600 text-xs font-mono tracking-widest">N EXP : {createdParcel.sender.nic}</div>
              )}
              <div className="font-bold text-blue-700 text-sm tracking-widest">{createdParcel.trackingId}</div>
              <div className="text-[9px] text-gray-400">{
                createdParcel.createdAt?.toDate
                  ? createdParcel.createdAt.toDate().toLocaleDateString('fr-MA')
                  : new Date().toLocaleDateString('fr-MA')
              }</div>
            </div>
          </div>

          {/* Type de service */}
          <div className="flex gap-4 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
            {ALL_SERVICE_TYPES.filter(t => t.key !== 'retour_bl').map(st => (
              <label key={st.key} className="flex items-center gap-1 text-[10px] font-semibold">
                <span className={`w-3 h-3 border border-gray-400 rounded-sm flex items-center justify-center text-[8px] ${createdParcel.serviceType === st.key ? 'bg-blue-600 border-blue-600 text-white' : ''}`}>
                  {createdParcel.serviceType === st.key ? '✓' : ''}
                </span>
                {st.label}
              </label>
            ))}
            <label className="flex items-center gap-1 text-[10px] font-semibold">
              <span className={`w-3 h-3 border border-gray-400 rounded-sm flex items-center justify-center text-[8px] ${createdParcel.hasRetourBL ? 'bg-blue-600 border-blue-600 text-white' : ''}`}>
                {createdParcel.hasRetourBL ? '✓' : ''}
              </span>
              Retour BL
            </label>
          </div>

          {/* Expéditeur / Destinataire */}
          <div className="grid grid-cols-2 border-b border-gray-300">
            <div className="border-r border-gray-300 px-3 py-2 space-y-1">
              <div className="font-bold text-[10px] uppercase tracking-wider text-blue-700 mb-1.5">Expéditeur</div>
              <div><span className="text-gray-500">Nom : </span><span className="font-semibold">{createdParcel.sender.name}</span></div>
              <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 mt-0.5">
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">N EXP :</span>
                <span className="font-bold text-blue-800 font-mono text-[11px]">{createdParcel.sender.nic || '—'}</span>
              </div>
              {createdParcel.sender.address && <div><span className="text-gray-500">Adresse : </span>{createdParcel.sender.address}</div>}
              <div><span className="text-gray-500">Ville : </span><span className="font-semibold">{createdParcel.sender.city}</span></div>
              <div><span className="text-gray-500">Tél : </span>{createdParcel.sender.tel}</div>
            </div>
            <div className="px-3 py-2 space-y-1">
              <div className="font-bold text-[10px] uppercase tracking-wider text-blue-700 mb-1.5">Destinataire</div>
              <div><span className="text-gray-500">Nom : </span><span className="font-semibold">{createdParcel.receiver.name}</span></div>
              {createdParcel.receiver.address && <div><span className="text-gray-500">Adresse : </span>{createdParcel.receiver.address}</div>}
              <div><span className="text-gray-500">Ville : </span><span className="font-bold text-blue-700">{createdParcel.receiver.city}</span></div>
              <div><span className="text-gray-500">Tél : </span>{createdParcel.receiver.tel}</div>
            </div>
          </div>

          {/* Nature + Nb colis */}
          <div className="grid grid-cols-2 border-b border-gray-300 bg-blue-50">
            <div className="border-r border-gray-300 px-3 py-2 flex items-center gap-2">
              <span className="text-lg">📦</span>
              <div>
                <div className="text-[9px] text-gray-500 uppercase">Nature de marchandise</div>
                <div className="font-bold text-[13px] text-blue-800">{createdParcel.natureOfGoods || '—'}</div>
              </div>
            </div>
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="text-lg">🔢</span>
              <div>
                <div className="text-[9px] text-gray-500 uppercase">Nombre de colis</div>
                <div className="font-bold text-[13px] text-blue-800">{createdParcel.nbColis || 1}</div>
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid grid-cols-3 border-b border-gray-300 text-center">
            <div className="border-r border-gray-200 px-2 py-1.5">
              <div className="text-gray-400 text-[9px] uppercase">Poids</div>
              <div className="font-bold text-sm">{createdParcel.weight} kg</div>
            </div>
            <div className="border-r border-gray-200 px-2 py-1.5">
              <div className="text-gray-400 text-[9px] uppercase">Prix</div>
              <div className="font-bold text-sm text-blue-700">{createdParcel.price} DH</div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-gray-400 text-[9px] uppercase">RETOUR FOND</div>
              <div className={`font-bold text-sm ${createdParcel.codAmount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                {createdParcel.codAmount > 0 ? `${createdParcel.codAmount} DH` : '—'}
              </div>
            </div>
          </div>

          {/* Barcode + QR */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <Suspense fallback={<div className="w-40 h-12 bg-gray-100 rounded" />}>
              <Barcode value={createdParcel.trackingId} width={1.3} height={48} fontSize={10} margin={0} />
            </Suspense>
            <div className="flex flex-col items-center gap-0.5 ml-2">
              <Suspense fallback={<div className="w-16 h-16 bg-gray-100 rounded" />}>
                <QRCodeSVG
                  value={`https://arelanc.web.app/track?id=${createdParcel.trackingId}`}
                  size={64}
                  level="M"
                  includeMargin={false}
                />
              </Suspense>
              <div className="text-[8px] text-gray-400">Suivi en ligne</div>
            </div>
          </div>

          {/* Signature */}
          <div className="grid grid-cols-2 border-t border-gray-300 text-[9px] text-gray-400">
            <div className="border-r border-gray-200 px-3 py-2">Cachet et Signature expéditeur</div>
            <div className="px-3 py-2">Cachet et Signature destinataire</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={handlePrint} className="flex items-center justify-center gap-2 bg-gray-800 text-white py-4 rounded-xl font-semibold hover:bg-gray-900 transition">
            <Printer className="w-4 h-4" /> Imprimer
          </button>
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-green-500 text-white py-4 rounded-xl font-semibold hover:bg-green-600 transition">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        </div>
        <button onClick={() => { setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '', operationDate: todayStr() }) }}
          className="w-full flex items-center justify-center gap-2 border-2 border-blue-500 text-blue-600 py-4 rounded-xl font-semibold hover:bg-blue-50 transition"
        >
          <Plus className="w-4 h-4" /> Nouveau colis
        </button>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 rounded-3xl shadow-2xl overflow-hidden mt-4 border border-purple-200">
      <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-300 rounded-full blur-2xl transform -translate-x-1/2 translate-y-1/2"></div>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 backdrop-blur-sm p-2 rounded-xl">
              <span className="text-3xl">✨</span>
            </div>
            <div>
              <h2 className="text-white font-bold text-2xl">Nouvelle Expédition</h2>
              <p className="text-pink-100 text-sm">Créez votre colis avec élégance</p>
            </div>
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Date d'opération + Micro - MODERNE */}
        <section className="transform transition-all hover:scale-[1.02]">
          <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl px-4 py-3 shadow-sm hover:shadow-md transition-all">
            <div className="bg-white p-2 rounded-xl shadow-sm">
              <span className="text-2xl" title="Date d'opération">📅</span>
            </div>
            <input
              type="date"
              value={form.operationDate}
              max={todayStr()}
              onChange={f('operationDate')}
              className="flex-1 bg-transparent text-sm font-bold text-purple-700 outline-none"
            />
            {form.operationDate !== todayStr() && (
              <button type="button" onClick={() => setForm((p: any) => ({ ...p, operationDate: todayStr() }))}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium transition">
                Aujourd'hui
              </button>
            )}
            {/* 🤖 Micro IA - Mode vocal intelligent */}
            <VoiceInputAI
              onResult={handleVoiceResult}
              onBulkFill={handleBulkFill}
              onClientFound={handleClientFound}
            />
          </div>
        </section>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {error}</div>}

        {/* Client lié - CACHÉ pour gagner de l'espace */}
        <section className="hidden">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Client expéditeur <span className="text-red-500 font-bold">*</span> <span className="text-green-600 font-normal normal-case">(compte portail créé automatiquement)</span>
          </h3>
          {form.clientId ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
              <div>
                <span className="text-sm font-semibold text-blue-800">👤 {form.clientName}</span>
                {clients.find((c: any) => c.id === form.clientId)?.remise > 0 && (
                  <span className="ml-2 text-xs text-green-600 font-medium">
                    Remise {clients.find((c: any) => c.id === form.clientId)?.remise}%
                  </span>
                )}
              </div>
              <button type="button"
                onClick={() => setForm((p: any) => ({ ...p, clientId: '', clientName: '', autoDebit: false }))}
                className="text-blue-400 hover:text-blue-700 transition p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text" value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                onFocus={() => setShowClientDropdown(true)}
                onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                placeholder="Rechercher un client (nom, tél, nexp)…"
                className={`${inputCls} pl-10`}
              />
              {showClientDropdown && filteredClientSearch.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {(filteredClientSearch as any[]).slice(0, 5).map((c: any) => (
                    <button type="button" key={c.id}
                      onMouseDown={e => { e.preventDefault(); selectExistingClient(c) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0 transition">
                      <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                        {c.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.city}{c.tel && ` · ${c.tel}`}</p>
                      </div>
                      {c.accountType === 'compte' && (
                        <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">En compte</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="border-t border-dashed border-gray-200" />

        <section className="bg-white rounded-2xl p-5 shadow-lg border-2 border-pink-100 transform transition-all hover:shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gradient-to-br from-pink-400 to-rose-500 p-3 rounded-xl shadow-md">
              <span className="text-2xl">📤</span>
            </div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">Expéditeur</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="N EXP" value={form.senderNic} onChange={f('senderNic')} className={`${inputCls} col-span-2`} />

            {/* Autocomplétion expéditeur */}
            <div className="col-span-2">
              <ClientAutocomplete
                type="expediteur"
                searchFunction={searchExpediteurs}
                filterCity={profile?.city}
                value={form.senderName}
                onChange={(value) => setForm((p: any) => ({ ...p, senderName: value }))}
                onSelect={(client: Client | null) => {
                  if (client) {
                    setForm((p: any) => ({
                      ...p,
                      senderName: client.name,
                      senderTel: client.tel,
                      senderAddress: client.address,
                      senderCity: client.city,
                      deliverySectorId: client.secteurId || '',
                    }))
                  }
                }}
                placeholder="Nom complet (ou chercher un expéditeur…)"
                className={inputCls}
              />
            </div>

            <input
              id="senderTel"
              required
              placeholder="Téléphone"
              value={form.senderTel}
              onChange={f('senderTel')}
              onKeyDown={(e) => handleKeyNav(e, 'senderTel', 'senderAddress')}
              className={inputCls}
            />
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-700">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              {form.senderCity || '—'}
            </div>
            <input
              id="senderAddress"
              placeholder="Adresse"
              value={form.senderAddress}
              onChange={f('senderAddress')}
              onKeyDown={(e) => handleKeyNav(e, 'sender Address', 'receiverCity')}
              className={`${inputCls} col-span-2`}
            />
          </div>
        </section>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t-2 border-dashed border-purple-200"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-gradient-to-r from-pink-50 via-purple-50 to-blue-50 px-4 text-2xl">💝</span>
          </div>
        </div>

        <section className="bg-white rounded-2xl p-5 shadow-lg border-2 border-blue-100 transform transition-all hover:shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-gradient-to-br from-blue-400 to-indigo-500 p-3 rounded-xl shadow-md">
              <span className="text-2xl">📥</span>
            </div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Destinataire</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Ville de destination - PREMIER CHAMP */}
            <div className="relative col-span-2">
              <select
                id="receiverCity"
                required
                value={form.receiverCity}
                onChange={e => setForm((p: any) => ({
                  ...p,
                  receiverCity: e.target.value,
                  receiverClientId: '',
                  receiverName: '',
                  receiverTel: '',
                  receiverAddress: '',
                  deliverySectorId: '',
                  deliveryDriverId: '',
                }))}
                onKeyDown={(e) => handleKeyNav(e, 'receiverCity', 'receiverTel')}
                className={selectCls}
              >
                <option value="">Ville de destination</option>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {/* Autocomplétion destinataire */}
            <div className="col-span-2">
              <ClientAutocomplete
                type="destinataire"
                searchFunction={searchDestinataires}
                filterCity={form.receiverCity || undefined}
                value={form.receiverName}
                onChange={(value) => setForm((p: any) => ({ ...p, receiverName: value, receiverClientId: '' }))}
                onSelect={(client: Client | null) => {
                  if (client) {
                    setForm((p: any) => ({
                      ...p,
                      receiverName: client.name,
                      receiverTel: client.tel,
                      receiverAddress: client.address,
                      receiverCity: client.city,
                      receiverClientId: client.id, // Lien vers le client destinataire
                      deliverySectorId: client.secteurId || '',
                      deliveryDriverId: client.livreurIds?.[0] || '',
                    }))
                  }
                }}
                placeholder="Nom complet (ou chercher un destinataire…)"
                className={inputCls}
              />
            </div>
            <input
              id="receiverTel"
              required
              placeholder="Téléphone"
              value={form.receiverTel}
              onChange={f('receiverTel')}
              onKeyDown={(e) => handleKeyNav(e, 'receiverTel', 'receiverAddress')}
              className={inputCls}
            />
            <input
              id="receiverAddress"
              required={!form.deliveryDriverId && !form.deliverySectorId}
              placeholder={form.deliveryDriverId || form.deliverySectorId ? "Adresse (optionnel)" : "Adresse"}
              value={form.receiverAddress}
              onChange={f('receiverAddress')}
              onKeyDown={(e) => handleKeyNav(e, 'receiverAddress', 'weight')}
              className={inputCls}
            />
            {form.receiverCity && (
              <div className="col-span-2 bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-3">
                <div>
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">Secteur de livraison destination</p>
                  <p className="text-xs text-purple-500 mt-0.5">Choisissez selon l'adresse du client à {form.receiverCity}.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <select
                      value={form.deliverySectorId}
                      onChange={e => setForm((p: any) => ({
                        ...p,
                        deliverySectorId: e.target.value,
                        deliveryDriverId: '',
                      }))}
                      className={selectCls}
                    >
                      <option value="">Secteur à choisir par destination</option>
                      {(destinationSectors as any[]).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      value={form.deliveryDriverId}
                      onChange={f('deliveryDriverId')}
                      className={selectCls}
                    >
                      <option value="">Livreur de destination</option>
                      {(destinationDrivers as any[]).map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}{d.tel ? ` - ${d.tel}` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                {destinationSectors.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Aucun secteur enregistré pour cette ville. L'agence destination pourra assigner le livreur après réception.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="border-t border-dashed border-gray-200" />

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Détails</h3>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="0.1" min="0.1" placeholder="Poids (kg) — optionnel" value={form.weight} onChange={f('weight')} className={inputCls} />
            <input required type="number" min="1" step="1" placeholder="Nb de colis" value={form.nbColis} onChange={f('nbColis')} className={inputCls} />
            <div className="col-span-2">
              <p className="text-xs text-gray-500 mb-1.5">Nature de marchandise</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'Palette', label: 'Palette', emoji: '📦' },
                  { key: 'Colis',   label: 'Colis',   emoji: '📮' },
                  { key: 'Bagages', label: 'Bagages', emoji: '🧳' },
                  { key: 'Autres',  label: 'Autres',  emoji: '✏️' },
                ].map(({ key, label, emoji }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((p: any) => ({ ...p, natureOfGoods: key === p.natureOfGoods ? '' : key }))}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all
                      ${form.natureOfGoods === key
                        ? 'bg-blue-600 border-blue-600 text-white shadow'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'}`}
                  >
                    <span className="text-lg">{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>
              {form.natureOfGoods === 'Autres' && (
                <input
                  placeholder="Précisez la nature…"
                  value={form.natureOfGoodsCustom || ''}
                  onChange={e => setForm((p: any) => ({ ...p, natureOfGoodsCustom: e.target.value }))}
                  className={`${inputCls} mt-2`}
                />
              )}
            </div>
          </div>
        </section>

        <div className="border-t border-dashed border-gray-200" />

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Type de port</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SERVICE_TYPES.map(st => (
              <button
                type="button"
                key={st.key}
                onClick={() => setForm((p: any) => ({ ...p, serviceType: st.key, codAmount: st.key === 'simple' ? '' : p.codAmount }))}
                className={`py-2.5 rounded-xl border-2 text-xs font-bold transition ${
                  form.serviceType === st.key
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Checkbox Retour BL */}
          <label className="mt-3 flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.hasRetourBL}
              onChange={e => setForm((p: any) => ({ ...p, hasRetourBL: e.target.checked }))}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span>🧾 Retour BL (bon de livraison)</span>
          </label>

          {form.serviceType !== 'simple' ? (
            <div className="mt-3">
              <input
                type="number" min="0"
                placeholder="RETOUR FOND (DH)"
                value={form.codAmount}
                onChange={f('codAmount')}
                className={inputCls}
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
              Simple : aucun RETOUR FOND à encaisser.
            </p>
          )}
        </section>

        <div className="border-t border-dashed border-gray-200" />

        {/* Frais de port */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Frais de port</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'port_paye', label: 'Port Payé', desc: 'Expéditeur paie',   active: 'bg-blue-600 border-blue-500 text-white',    activeDesc: 'text-blue-100'   },
              { key: 'port_du',   label: 'Port Dû',   desc: 'Destinataire paie', active: 'bg-orange-500 border-orange-400 text-white', activeDesc: 'text-orange-100' },
            ].map(pt => {
              const isActive = pt.key === 'port_paye'
                ? (form.portType === 'port_paye' || form.portType === 'port_en_compte')
                : form.portType === pt.key
              return (
                <button type="button" key={pt.key}
                  onClick={() => setForm((p: any) => ({
                    ...p,
                    portType: pt.key,
                    shipmentMode: pt.key === 'port_du' && p.portType === 'port_en_compte' ? 'personal' : p.shipmentMode,
                  }))}
                  className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition text-left ${isActive ? pt.active : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {pt.label}
                  <p className={`text-xs font-normal mt-0.5 ${isActive ? pt.activeDesc : 'text-gray-400'}`}>{pt.desc}</p>
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Montant du port manuel
            </label>
            <input
              required
              type="number"
              min="0"
              step="0.5"
              placeholder={form.portType === 'port_du' ? 'Montant à payer par le destinataire (DH)' : 'Montant du port payé (DH)'}
              value={form.portPrice}
              onChange={e => setForm((p: any) => ({ ...p, portPrice: e.target.value, portPayeMontant: p.portType === 'port_paye' ? e.target.value : p.portPayeMontant }))}
              className={inputCls}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Le tarif automatique est désactivé : ce montant sera utilisé comme prix du port.
            </p>
          </div>
          {/* Sous-menu Port Payé */}
          {(form.portType === 'port_paye' || form.portType === 'port_en_compte') && (
            <div className="mt-2 space-y-2 pl-1">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'espece',  label: '💵 Espèce',    ptype: 'port_paye' },
                  { key: 'cheque',  label: '📋 Chèque',    ptype: 'port_paye' },
                  { key: 'compte',  label: '🏢 En Compte', ptype: 'port_en_compte' },
                ].map(m => {
                  const isSelected = m.key === 'compte'
                    ? form.portType === 'port_en_compte'
                    : form.portType === 'port_paye' && form.portPayeMethod === m.key
                  return (
                    <button type="button" key={m.key}
                      onClick={() => setForm((p: any) => ({
                        ...p,
                        portType: m.ptype,
                        portPayeMethod: m.key !== 'compte' ? m.key : p.portPayeMethod,
                        portPayeMontant: m.key === 'compte' ? '' : p.portPayeMontant,
                        shipmentMode: m.key === 'compte' ? 'client' : (p.portType === 'port_en_compte' ? 'personal' : p.shipmentMode),
                      }))}
                      className={`py-2 px-1 rounded-xl border text-xs font-semibold transition text-center ${isSelected ? (m.key === 'compte' ? 'bg-purple-100 border-purple-500 text-purple-700' : 'bg-blue-100 border-blue-500 text-blue-700') : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-300'}`}>
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {form.clientId && form.portType === 'port_paye' && price > 0 && (
            <div
              className={`mt-2 flex items-center gap-2 cursor-pointer rounded-xl px-3 py-2 border transition ${
                form.autoDebit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
              }`}
              onClick={() => setForm((p: any) => ({ ...p, autoDebit: !p.autoDebit }))}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
                form.autoDebit ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
                {form.autoDebit && <Check className="w-3 h-3 text-white" />}
              </div>
              <p className="text-sm text-gray-600">
                Débiter <strong>{form.clientName}</strong> de <strong>{price} DH</strong> automatiquement
              </p>
            </div>
          )}

          {/* Compte client */}
          {form.portType === 'port_en_compte' && (
            <div className="mt-3 border border-purple-200 rounded-xl p-3 bg-purple-50">
              <p className="text-xs font-semibold text-purple-700 mb-2">Compte client <span className="text-red-500">*</span></p>
              {form.clientId ? (
                <div className="flex items-center justify-between bg-white border border-purple-200 rounded-lg px-3 py-2.5">
                  <div>
                    <span className="text-sm font-semibold text-purple-800">👤 {form.clientName}</span>
                    {(() => {
                      const cl = clients.find((c: any) => c.id === form.clientId)
                      return cl ? (
                        <span className="ml-2 text-xs text-gray-500">
                          Solde : <span className={cl.balance > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{(cl.balance || 0).toFixed(2)} DH</span>
                        </span>
                      ) : null
                    })()}
                  </div>
                  <button type="button"
                    onClick={() => { setForm((p: any) => ({ ...p, clientId: '', clientName: '' })); setInlineNewClient(null) }}
                    className="text-purple-400 hover:text-purple-700 transition p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : !inlineNewClient ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text" value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      placeholder="Rechercher un client…"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-purple-400 focus:outline-none"
                    />
                  </div>
                  {(() => {
                    const list = clientSearch.trim()
                      ? (clients as any[]).filter((c: any) => {
                          const s = clientSearch.toLowerCase()
                          return c.name?.toLowerCase().includes(s) || c.tel?.includes(s)
                        })
                      : (clients as any[]).filter((c: any) => c.accountType === 'compte')
                    return (
                      <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-white">
                        {(list as any[]).slice(0, 6).map((c: any) => (
                          <button type="button" key={c.id}
                            onMouseDown={e => { e.preventDefault(); selectExistingClient(c) }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-50 text-left border-b border-gray-50 last:border-0 transition">
                            <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold text-xs shrink-0">
                              {c.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                              <p className="text-xs text-gray-400">{c.city}{c.tel && ` · ${c.tel}`}</p>
                            </div>
                            <span className={`text-xs font-medium shrink-0 ${(c.balance || 0) > 0 ? 'text-orange-500' : 'text-gray-400'}`}>{(c.balance || 0).toFixed(0)} DH</span>
                          </button>
                        ))}
                        {list.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-3">Aucun client trouvé</p>
                        )}
                      </div>
                    )
                  })()}
                  <button type="button"
                    onClick={() => setInlineNewClient({ name: '', tel: '', city: '', loading: false, error: '' })}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-purple-600 font-semibold hover:bg-purple-100 py-2 rounded-lg border border-dashed border-purple-300 transition">
                    <Plus className="w-3.5 h-3.5" /> Nouveau client en compte
                  </button>
                </>
              ) : (
                <div className="bg-white border border-purple-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-purple-700">Nouveau client en compte</p>
                  {inlineNewClient.error && <p className="text-xs text-red-500">{inlineNewClient.error}</p>}
                  <input
                    type="text" placeholder="Nom complet *"
                    value={inlineNewClient.name}
                    onChange={e => setInlineNewClient((m: any) => ({ ...m, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" placeholder="Téléphone"
                      value={inlineNewClient.tel}
                      onChange={e => setInlineNewClient((m: any) => ({ ...m, tel: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                    />
                    <div className="relative">
                      <select
                        value={inlineNewClient.city}
                        onChange={e => setInlineNewClient((m: any) => ({ ...m, city: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none appearance-none bg-white">
                        <option value="">Ville *</option>
                        {CITIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={() => setInlineNewClient(null)}
                      className="py-2 text-xs border border-gray-200 rounded-lg text-gray-500 font-semibold hover:bg-gray-50 transition">
                      Annuler
                    </button>
                    <button type="button"
                      onClick={handleCreateInlineClient}
                      disabled={inlineNewClient.loading}
                      className="py-2 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-semibold transition flex items-center justify-center gap-1.5">
                      {inlineNewClient.loading
                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><Check className="w-3.5 h-3.5" /> Créer & sélectionner</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <button type="submit" disabled={loading}
          className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 disabled:opacity-60 text-white py-5 rounded-2xl font-bold text-lg transition-all transform hover:scale-[1.02] hover:shadow-2xl flex items-center justify-center gap-3 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <span className="relative z-10 flex items-center gap-3">
            {loading
              ? <><div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" /> <span className="text-lg">Création en cours...</span></>
              : <><span className="text-2xl">✨</span> <span className="text-lg">Créer l'Expédition</span> <span className="text-2xl">📦</span></>
            }
          </span>
        </button>
      </form>
    </div>
  )
}
