import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { Calendar, Search, X, Plus, MapPin, ChevronDown, Check, MessageCircle, Printer } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { CITIES } from '../../../firebase/constants'
import type { Client } from '../../../firebase/clients'
// Autocomplétion et reconnaissance vocale désactivées pour optimiser performances
// import ClientAutocomplete from '../../../components/ClientAutocomplete'
// import { searchExpediteurs, searchDestinataires } from '../../../firebase/clients'
// import VoiceInputAI from '../../../components/VoiceInputAI'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { getWorkingDateStr } from '../../../utils/workingDate'

const Barcode = lazy(() => import('react-barcode'))
const QRCodeSVG = lazy(() => import('../../../components/QRCodeSvg'))

// Fonction pour normaliser les nombres avec virgule → point
const normalizeDecimal = (value: string) => {
  return value.replace(/,/g, '.')
}

// Utiliser la date de travail au lieu de la date système
const todayStr = () => getWorkingDateStr()

// Fonction pour obtenir un formulaire vide avec la date de travail ACTUELLE
const getEmptyForm = () => ({
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '', receiverClientId: '',
  weight: '', nbColis: '0', natureOfGoods: '', natureOfGoodsCustomPrice: '', codAmount: '',
  serviceType: 'simple', hasRetourBL: false, shipmentMode: 'personal',
  portType: 'port_paye', portPayeMethod: '', portPayeMontant: '',
  portPrice: '',
  clientId: '', clientName: '', autoDebit: false,
  deliverySectorId: '', deliveryDriverId: '',
  enGare: false,
  operationDate: todayStr(), // Date de travail ACTUELLE à chaque appel
})

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

  // Ref pour le champ N EXP et le conteneur du ticket
  const nexpInputRef = useRef<HTMLInputElement>(null)
  const ticketContainerRef = useRef<HTMLDivElement>(null)
  const validateButtonRef = useRef<HTMLButtonElement>(null)

  // Fonction pour créer un nouveau colis
  const handleNewParcel = () => {
    setCreatedParcel(null)
    setForm({ ...getEmptyForm(), senderCity: profile?.city || '' })
    // Focus sur N EXP après un court délai pour laisser le DOM se mettre à jour
    setTimeout(() => {
      nexpInputRef.current?.focus()
    }, 100)
  }

  // Navigation clavier pour le formulaire
  const handleKeyNav = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    const form = target.closest('form')
    if (!form) return

    // Récupérer TOUS les éléments focusables (inputs, selects, textareas ET boutons - y compris submit)
    const focusables = Array.from(
      form.querySelectorAll('input:not([type="hidden"]), select, textarea, button')
    ).filter((el: any) => !el.disabled && el.offsetParent !== null) // Visible et activé

    const currentIndex = focusables.indexOf(target)

    // Espace = cliquer sur le bouton (si c'est un bouton)
    if (e.key === ' ' && target.tagName === 'BUTTON') {
      e.preventDefault()
      target.click()
      return
    }

    // Entrée = élément suivant (sauf si on est sur le dernier élément ou un bouton submit)
    if (e.key === 'Enter' && !e.ctrlKey) {
      // Si c'est un bouton submit, laisser le comportement par défaut (soumettre le formulaire)
      if (target.tagName === 'BUTTON' && (target as HTMLButtonElement).type === 'submit') {
        return // Laisser le formulaire se soumettre normalement
      }

      e.preventDefault()
      if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
        const next = focusables[currentIndex + 1] as HTMLElement
        next.focus()
      }
    }

    // Ctrl+Entrée = élément précédent
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      if (currentIndex > 0) {
        const prev = focusables[currentIndex - 1] as HTMLElement
        prev.focus()
      }
    }

    // Flèche Bas ou Flèche Droite = élément suivant
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && currentIndex >= 0 && currentIndex < focusables.length - 1) {
      e.preventDefault()
      const next = focusables[currentIndex + 1] as HTMLElement
      next.focus()
    }

    // Flèche Haut ou Flèche Gauche = élément précédent
    if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && currentIndex > 0) {
      e.preventDefault()
      const prev = focusables[currentIndex - 1] as HTMLElement
      prev.focus()
    }
  }

  // Focus automatique sur N EXP à l'ouverture
  useEffect(() => {
    const timer = setTimeout(() => {
      const senderNicField = document.getElementById('senderNic')
      if (senderNicField) senderNicField.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Vérifier si le N° EXP existe déjà dans l'agence courante
  const checkDuplicateNic = async (nic: string) => {
    if (!nic || nic.trim() === '') return
    if (!profile?.city) return // Pas de vérification si pas de ville définie

    try {
      // Chercher uniquement dans les colis de la même agence (ville)
      const q = query(
        collection(db, 'parcels'),
        where('sender.nic', '==', nic.trim()),
        where('originCity', '==', profile.city),
        limit(1)
      )
      const snapshot = await getDocs(q)

      if (!snapshot.empty) {
        const existingParcel = snapshot.docs[0].data()
        alert(`⚠️ ATTENTION - N° EXP DÉJÀ EXISTANT!\n\nLe N° EXP "${nic}" existe déjà dans votre agence (${profile.city}).\n\nExpédition existante: ${existingParcel.trackingId}\nExpéditeur: ${existingParcel.sender?.name || '—'}\n\n❌ NE PAS DOUBLER L'EXPÉDITION!\n\nLe N° EXP sera effacé.`)

        // Effacer le N° EXP dupliqué
        setForm((prev: any) => ({ ...prev, senderNic: '' }))

        // Remettre le focus sur le champ pour resaisir
        setTimeout(() => {
          const nicField = document.getElementById('senderNic')
          if (nicField) nicField.focus()
        }, 100)

        return true
      }
      return false
    } catch (error) {
      console.error('Erreur vérification NIC:', error)
      return false
    }
  }

  // Pas de filtre - tous les clients sont disponibles

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

  // Focus automatique sur le conteneur du ticket pour activer Ctrl+Enter
  useEffect(() => {
    if (createdParcel && ticketContainerRef.current) {
      setTimeout(() => {
        ticketContainerRef.current?.focus()
      }, 100)
    }
  }, [createdParcel])

  // Focus automatique sur le bouton de validation de la modal
  useEffect(() => {
    if (showConfirmModal && validateButtonRef.current) {
      setTimeout(() => {
        validateButtonRef.current?.focus()
      }, 100)
    }
  }, [showConfirmModal])

  // Écouter les changements de date de travail
  useEffect(() => {
    const handleDateChange = () => {
      setForm((prev: any) => ({
        ...prev,
        operationDate: todayStr()
      }))
    }

    window.addEventListener('working-date-changed', handleDateChange)
    return () => window.removeEventListener('working-date-changed', handleDateChange)
  }, [])

  const handleVoiceResult = (field: string, value: string) => {
    setForm((prev: any) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleClientFound = (client: Client, isSender: boolean) => {

    if (isSender) {
      // Remplir les champs expéditeur
      setForm((prev: any) => ({
        ...prev,
        senderName: client.name,
        senderTel: client.tel,
        senderAddress: client.address || '',
        senderCity: client.city || profile?.city || '',
        // senderNic: NE PAS auto-remplir - chaque expédition a son propre N° EXP
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
                    type="text"
                    inputMode="decimal"
                    value={editableParcel.weight || ''}
                    onChange={(e) => setEditableParcel({ ...editableParcel, weight: normalizeDecimal(e.target.value) })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre de colis</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editableParcel.nbColis || 1}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '')
                      setEditableParcel({ ...editableParcel, nbColis: value })
                    }}
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
                    type="text"
                    inputMode="decimal"
                    value={editableParcel.price || ''}
                    onChange={(e) => {
                      const normalized = normalizeDecimal(e.target.value)
                      setEditableParcel({ ...editableParcel, price: parseFloat(normalized) || 0 })
                    }}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Retour fond (DH)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editableParcel.codAmount || 0}
                    onChange={(e) => {
                      const normalized = normalizeDecimal(e.target.value)
                      setEditableParcel({ ...editableParcel, codAmount: parseFloat(normalized) || 0 })
                    }}
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
              ref={validateButtonRef}
              onClick={handleConfirmPrint}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-xl transition flex items-center justify-center gap-2"
            >
              <Printer className="w-5 h-5" /> Valider et Imprimer (Entrée)
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (createdParcel) {
    return (
      <div
        ref={ticketContainerRef}
        className="space-y-4 mt-4"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleNewParcel()
          }
        }}
      >
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
            {ALL_SERVICE_TYPES.filter(t => t.key !== 'retour_bl').map(st => {
              const types = createdParcel.serviceType?.split(',').filter(Boolean) || []
              const isSelected = types.includes(st.key)
              return (
                <label key={st.key} className="flex items-center gap-1 text-[10px] font-semibold">
                  <span className={`w-3 h-3 border border-gray-400 rounded-sm flex items-center justify-center text-[8px] ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : ''}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                  {st.label}
                </label>
              )
            })}
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
        <button onClick={handleNewParcel}
          className="w-full flex items-center justify-center gap-2 border-2 border-blue-500 text-blue-600 py-4 rounded-xl font-semibold hover:bg-blue-50 transition"
        >
          <Plus className="w-4 h-4" /> Nouveau colis (Ctrl+Entrée)
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
      <form onSubmit={handleSubmit} autoComplete="off" className="p-4 space-y-2">
        {/* Date + Micro IA - Version compacte */}
        <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
          <span className="text-lg">📅</span>
          <input
            type="date"
            value={form.operationDate}
            max={todayStr()}
            onChange={f('operationDate')}
            className="flex-1 bg-transparent text-xs font-bold text-purple-700 outline-none"
          />
          {form.operationDate !== todayStr() && (
            <button type="button" onClick={() => setForm((p: any) => ({ ...p, operationDate: todayStr() }))}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium">Aujourd'hui</button>
          )}
          {/* VoiceInputAI désactivé temporairement pour optimiser les performances */}
          {/* <VoiceInputAI onResult={handleVoiceResult} onBulkFill={handleBulkFill} onClientFound={handleClientFound} /> */}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 p-2 rounded-lg text-xs">⚠️ {error}</div>}

        {/* GRID 2 COLONNES : Expéditeur + Destinataire */}
        <div className="grid grid-cols-2 gap-3">
          {/* COLONNE 1 : EXPÉDITEUR */}
          <section className="bg-pink-50 border border-pink-200 rounded-lg p-3">
            <h3 className="text-xs font-bold text-pink-700 mb-2 flex items-center gap-1.5">
              <span className="text-base">📤</span> Expéditeur
            </h3>
            <div className="space-y-2">
              <input
                ref={nexpInputRef}
                id="senderNic"
                placeholder="N EXP"
                value={form.senderNic}
                onChange={f('senderNic')}
                onBlur={(e) => checkDuplicateNic(e.target.value)}
                onKeyDown={handleKeyNav}
                className={inputCls}
              />
              <input
                id="senderName"
                placeholder="Nom complet…"
                value={form.senderName}
                onChange={f('senderName')}
                onKeyDown={handleKeyNav}
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="senderTel"
                  placeholder="Téléphone"
                  value={form.senderTel}
                  onChange={f('senderTel')}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700">
                  <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                  <span className="truncate">{form.senderCity || '—'}</span>
                </div>
              </div>
              <input
                id="senderAddress"
                placeholder="Adresse"
                value={form.senderAddress}
                onChange={f('senderAddress')}
                onKeyDown={handleKeyNav}
                className={inputCls}
              />
            </div>
          </section>

          {/* COLONNE 2 : DESTINATAIRE */}
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h3 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
              <span className="text-base">📥</span> Destinataire
            </h3>
            <div className="space-y-2">
              <div className="relative">
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
                  onKeyDown={handleKeyNav}
                  className={selectCls}
                >
                  <option value="">Ville de destination</option>
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-gray-400 pointer-events-none" />
              </div>
              <input
                id="receiverName"
                placeholder="Nom complet…"
                value={form.receiverName}
                onChange={f('receiverName')}
                onKeyDown={handleKeyNav}
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="receiverTel"
                  placeholder="Téléphone"
                  value={form.receiverTel}
                  onChange={f('receiverTel')}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
                <input
                  id="receiverAddress"
                  placeholder="Adresse"
                  value={form.receiverAddress}
                  onChange={f('receiverAddress')}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
              </div>

              {/* En gare - Version compacte */}
              <label className="flex items-center gap-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={form.enGare || false}
                  onChange={e => setForm((p: any) => ({
                    ...p,
                    enGare: e.target.checked,
                    deliverySectorId: e.target.checked ? '' : p.deliverySectorId,
                    deliveryDriverId: e.target.checked ? '' : p.deliveryDriverId,
                  }))}
                  onKeyDown={handleKeyNav}
                  className="w-3.5 h-3.5 text-orange-600 border border-amber-300 rounded"
                />
                <span className="text-base">🚉</span>
                <span className="font-bold text-amber-900 flex-1">En gare</span>
                {form.enGare && <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-bold">✓</span>}
              </label>

              {/* Secteur/Livreur - Version compacte */}
              {form.receiverCity && !form.enGare && (destinationSectors || []).length > 0 && (
                <div className="space-y-1.5">
                  <div className="relative">
                    <select
                      value={form.deliverySectorId}
                      onChange={e => setForm((p: any) => ({ ...p, deliverySectorId: e.target.value, deliveryDriverId: '' }))}
                      onKeyDown={handleKeyNav}
                      className={selectCls}
                    >
                      <option value="">Secteur</option>
                      {(destinationSectors || []).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.code}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      value={form.deliveryDriverId}
                      onChange={f('deliveryDriverId')}
                      onKeyDown={handleKeyNav}
                      className={selectCls}
                    >
                      <option value="">Livreur</option>
                      {(destinationDrivers || []).map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

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

        {/* Détails du colis */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <span className="text-base">📦</span> Détails du colis
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              id="weight"
              type="text"
              inputMode="decimal"
              placeholder="Poids (kg)"
              value={form.weight}
              onChange={(e) => {
                const normalized = normalizeDecimal(e.target.value)
                setForm({ ...form, weight: normalized })
              }}
              onKeyDown={handleKeyNav}
              className={inputCls}
            />
            <input
              id="nbColis"
              required
              type="text"
              inputMode="numeric"
              placeholder="Nb colis"
              value={form.nbColis}
              onChange={(e) => {
                // Accepter seulement les chiffres entiers
                const value = e.target.value.replace(/[^0-9]/g, '')
                setForm({ ...form, nbColis: value })
              }}
              onKeyDown={handleKeyNav}
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'Palette', emoji: '📦', label: 'Palette' },
              { key: 'Colis',   emoji: '📮', label: 'Colis' },
              { key: 'Bagages', emoji: '🧳', label: 'Bagages' },
              { key: 'Autres',  emoji: '✏️', label: 'Autres' },
            ].map(({ key, emoji, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm((p: any) => ({ ...p, natureOfGoods: key === p.natureOfGoods ? '' : key }))}
                onKeyDown={handleKeyNav}
                className={`flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-medium transition ${
                  form.natureOfGoods === key
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'
                }`}
              >
                <span className="text-lg">{emoji}</span>
                <span className="mt-0.5">{label}</span>
              </button>
            ))}
          </div>
          {form.natureOfGoods === 'Autres' && (
            <input
              placeholder="Précisez la nature…"
              value={form.natureOfGoodsCustom || ''}
              onChange={e => setForm((p: any) => ({ ...p, natureOfGoodsCustom: e.target.value }))}
              onKeyDown={handleKeyNav}
              className={`${inputCls} mt-2`}
            />
          )}
        </div>

        {/* Type de service */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <h3 className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
            <span className="text-base">🏷️</span> Type de service
          </h3>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {SERVICE_TYPES.map(st => {
              const types = form.serviceType?.split(',').filter(Boolean) || []
              const isSelected = types.includes(st.key)
              const canMultiSelect = st.key === 'cheque' || st.key === 'traite'

              return (
                <button
                  type="button"
                  key={st.key}
                  onClick={() => setForm((p: any) => {
                    const currentTypes = p.serviceType?.split(',').filter(Boolean) || []
                    let newTypes: string[]

                    if (st.key === 'simple' || st.key === 'especes') {
                      // Simple/Espèces: désélectionner tout et sélectionner uniquement celui-ci
                      newTypes = [st.key]
                    } else if (st.key === 'cheque' || st.key === 'traite') {
                      // Chèque/Traite: gestion multi-sélection
                      const hasSimpleOrEspeces = currentTypes.some((t: string) => t === 'simple' || t === 'especes')
                      if (hasSimpleOrEspeces) {
                        // Si simple/especes est sélectionné, le remplacer par cheque/traite
                        newTypes = [st.key]
                      } else if (isSelected) {
                        // Décocher
                        newTypes = currentTypes.filter((t: string) => t !== st.key)
                        if (newTypes.length === 0) newTypes = ['simple'] // Par défaut simple si tout décoché
                      } else {
                        // Cocher (ajouter à la liste)
                        newTypes = [...currentTypes.filter((t: string) => t === 'cheque' || t === 'traite'), st.key]
                      }
                    } else {
                      newTypes = [st.key]
                    }

                    const newServiceType = newTypes.join(',')
                    return {
                      ...p,
                      serviceType: newServiceType,
                      codAmount: newTypes.every(t => t === 'simple') ? '' : p.codAmount
                    }
                  })}
                  onKeyDown={handleKeyNav}
                  className={`flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-bold transition ${
                    isSelected
                      ? 'bg-green-600 border-green-500 text-white'
                      : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >
                  <span className="text-lg">{st.emoji}</span>
                  <span className="mt-0.5">{st.label}</span>
                  {canMultiSelect && isSelected && <span className="text-[10px] mt-0.5">✓</span>}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-gray-200 rounded-lg cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={form.hasRetourBL}
                onChange={e => setForm((p: any) => ({ ...p, hasRetourBL: e.target.checked }))}
                onKeyDown={handleKeyNav}
                className="w-3.5 h-3.5 text-green-600 border-gray-300 rounded"
              />
              <span className="font-medium text-gray-700">🧾 Retour BL</span>
            </label>
            {form.serviceType !== 'simple' && !form.serviceType?.includes('simple') && (
              <input
                id="codAmount"
                type="text"
                inputMode="decimal"
                placeholder="RETOUR FOND (DH)"
                value={form.codAmount}
                onChange={(e) => {
                  const normalized = normalizeDecimal(e.target.value)
                  setForm({ ...form, codAmount: normalized })
                }}
                onKeyDown={handleKeyNav}
                className={inputCls}
              />
            )}
          </div>
        </div>

        {/* Frais de port */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <h3 className="text-xs font-bold text-orange-700 mb-2 flex items-center gap-1.5">
            <span className="text-base">💰</span> Frais de port
          </h3>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              { key: 'port_paye', emoji: '💵', label: 'Port Payé', active: 'bg-blue-600 text-white' },
              { key: 'port_du',   emoji: '🧾', label: 'Port Dû', active: 'bg-orange-500 text-white' },
              { key: 'port_en_compte', emoji: '🏢', label: 'En Compte', active: 'bg-purple-600 text-white' },
            ].map(pt => (
              <button type="button" key={pt.key}
                onClick={() => {
                  setForm((p: any) => {
                    const updates: any = {
                      portType: pt.key,
                      shipmentMode: pt.key === 'port_en_compte' ? 'client' : (pt.key === 'port_du' && p.portType === 'port_en_compte' ? 'personal' : p.shipmentMode),
                      portPayeMethod: pt.key === 'port_paye' ? 'espece' : p.portPayeMethod,
                    }

                    // Si "En Compte" est sélectionné et qu'il y a un expéditeur
                    if (pt.key === 'port_en_compte' && p.senderName && p.senderName.trim() !== '') {
                      // Automatiquement définir l'expéditeur comme client en compte
                      updates.clientName = p.senderName
                      updates.clientId = p.clientId || '' // Garder l'ID si déjà présent
                    }

                    return { ...p, ...updates }
                  })
                }}
                onKeyDown={handleKeyNav}
                className={`flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-bold transition ${form.portType === pt.key ? pt.active : 'bg-white border-gray-200 text-gray-600'}`}>
                <span className="text-lg">{pt.emoji}</span>
                <span className="mt-0.5">{pt.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              type="text"
              inputMode="decimal"
              placeholder="Montant (DH)"
              value={form.portPrice}
              onChange={e => {
                const normalized = normalizeDecimal(e.target.value)
                setForm((p: any) => ({ ...p, portPrice: normalized, portPayeMontant: p.portType === 'port_paye' ? normalized : p.portPayeMontant }))
              }}
              onKeyDown={handleKeyNav}
              className={inputCls}
            />
            {form.portType === 'port_paye' && (
              <select
                value={form.portPayeMethod || 'espece'}
                onChange={e => setForm((p: any) => ({ ...p, portPayeMethod: e.target.value }))}
                onKeyDown={handleKeyNav}
                className={selectCls}
              >
                <option value="espece">💵 Espèce</option>
                <option value="cheque">📋 Chèque</option>
              </select>
            )}
          </div>
          {form.clientId && form.portType === 'port_paye' && price > 0 && (
            <label className={`flex items-center gap-1.5 cursor-pointer px-2 py-1.5 border rounded-lg text-xs mt-2 ${form.autoDebit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <input
                type="checkbox"
                checked={form.autoDebit}
                onChange={e => setForm((p: any) => ({ ...p, autoDebit: e.target.checked }))}
                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
              />
              <span className="text-gray-600 font-medium">Débiter {form.clientName} ({price} DH)</span>
            </label>
          )}
        </div>

        <button type="submit" disabled={loading}
          onKeyDown={handleKeyNav}
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
