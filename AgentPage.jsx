import { useState, useRef, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase/config'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import Barcode from 'react-barcode'
import { useReactToPrint } from 'react-to-print'
import {
  createParcel, subscribeAgentParcels, subscribeAgencyInbox,
  updateParcel, deleteParcel, getAgentCode,
  updateParcelStatus, subscribeDrivers, claimParcel, assignDriver,
  assignDeliveryDriver, remitCod, collectCod, collectCodAtSource, collectCodAtDestination, collectPortDu,
  subscribeClients, createClient, updateClient, addPayment, createCaisseEntry, deleteCaisseEntries, deleteAgentCashierHistory, subscribeCaisseByCity,
  createCaissierTransaction, subscribeAgencyCash, updateAgencyCash,
  createAgentCashRecoveryRequest, subscribeAgentCashRecoveryRequests,
  settleCodToSender, batchSettleCods, fetchAllAgentCodParcels,
  markCodSentToSource, confirmCodReceivedBySource,
  subscribeAllUsers,
  subscribeAgentCodRequests, markAgentCodRequestRead, addAgentCodRequestReply, resolveAgentCodRequest,
  isParcelVisibleInDestinationAgency,
  CITIES, DEFAULT_TARIFF_CONFIG, calculateTariff, subscribeTariffConfig, STATUS_COLORS, STATUSES, COD_PAYMENT_TYPES, COD_STATUS,
  CAISSE_CATEGORIES,
} from '../firebase/firestore'
import CompanyContact from '../components/CompanyContact'
import {
  Package, LogOut, Printer, MessageCircle, Plus, ChevronDown,
  Edit2, X, Check, Lock, Search, Trash2, User, Calendar, MapPin, Inbox,
  Truck, Banknote, Menu, Wallet, TrendingUp, ArrowRight, Send, Users, Phone,
} from 'lucide-react'

const parcelDate = (p) => {
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}
const entryDate = (e) => {
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  if (e.createdAt) return new Date(e.createdAt)
  return new Date(0)
}
const filterByDate = (list, preset, from, to, getDate = parcelDate) => {
  if (preset === 'all') return list
  const now = new Date()
  let start = null, end = now
  if      (preset === 'today')  { start = new Date(); start.setHours(0,0,0,0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate()-6); start.setHours(0,0,0,0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'custom') { start = from ? new Date(from) : null; end = to ? new Date(to+'T23:59:59') : now }
  return list.filter(p => {
    const d = getDate(p)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}
const dateFilterLabel = preset => ({
  all: 'Solde total',
  today: "Solde aujourd'hui",
  week: 'Solde 7 jours',
  month: 'Solde ce mois',
  custom: 'Solde filtre',
}[preset] || 'Solde filtre')
const DateFilter = ({ value, onChange, from, onFromChange, to, onToChange, tone = 'blue' }) => {
  const activeCls = tone === 'green' ? 'bg-green-600 text-white' : tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
  const focusCls  = tone === 'green' ? 'focus:border-green-500' : tone === 'amber' ? 'focus:border-amber-500' : 'focus:border-blue-500'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        {[
          { key: 'all',    label: 'Tout' },
          { key: 'today',  label: "Aujourd'hui" },
          { key: 'week',   label: '7 jours' },
          { key: 'month',  label: 'Ce mois' },
          { key: 'custom', label: 'Personnalise' },
        ].map(({ key, label }) => (
          <button key={key}
            onClick={() => onChange(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              value === key ? activeCls : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex items-center gap-2 pl-6">
          <input type="date" value={from} onChange={e => onFromChange(e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
          <span className="text-gray-400 text-xs shrink-0">a</span>
          <input type="date" value={to} onChange={e => onToChange(e.target.value)}
            className={`border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none ${focusCls} flex-1`}
          />
        </div>
      )}
    </div>
  )
}

const SERVICE_TYPES = [
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

// Mappe le type de service convenu à la création → clé COD_PAYMENT_TYPES
const serviceToPaymentType = (st) =>
  st === 'retour_bl' ? 'bon_livraison' : (st || 'especes')

const EMPTY_FORM = {
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '',
  weight: '', nbColis: '1', natureOfGoods: '', codAmount: '',
  serviceType: 'especes', chauffeurId: '', shipmentMode: 'personal',
  portType: 'port_paye', clientId: '', clientName: '', autoDebit: false,
}

export default function AgentPage() {
  const navigate  = useNavigate()
  const ticketRef = useRef()

  const [profile, setProfile]           = useState(null)
  const [drivers, setDrivers]           = useState([])
  const [tariffConfig, setTariffConfig] = useState(DEFAULT_TARIFF_CONFIG)
  const [tab, setTab]                   = useState('home')
  const [subTab, setSubTab]             = useState('mine')

  const [form, setForm]                 = useState(EMPTY_FORM)
  const [createdParcel, setCreatedParcel] = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  const [parcels, setParcels]           = useState([])
  const [loadingParcels, setLoadingParcels] = useState(false)
  const [inboxParcels, setInboxParcels] = useState([])
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [search, setSearch]             = useState('')
  const [datePreset, setDatePreset]     = useState('all')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [parcelDirection, setParcelDirection] = useState('all')
  const [caisseDatePreset, setCaisseDatePreset] = useState('all')
  const [caisseDateFrom, setCaisseDateFrom]     = useState('')
  const [caisseDateTo, setCaisseDateTo]         = useState('')
  const [caisseSearch, setCaisseSearch]         = useState('')
  const [codDatePreset, setCodDatePreset]       = useState('all')
  const [codDateFrom, setCodDateFrom]           = useState('')
  const [codDateTo, setCodDateTo]               = useState('')
  const [codSearch, setCodSearch]               = useState('')

  const [editingParcel, setEditingParcel] = useState(null)
  const [editForm, setEditForm]         = useState(null)
  const [editLoading, setEditLoading]   = useState(false)
  const [editError, setEditError]       = useState('')

  const [clients,         setClients]         = useState([])
  const [clientSearch,    setClientSearch]    = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [showSenderDropdown, setShowSenderDropdown] = useState(false)
  const [inlineNewClient, setInlineNewClient] = useState(null)
  const [menuOpen, setMenuOpen]         = useState(false)

  // action: 'edit' | 'delete'
  const [codeModal, setCodeModal]       = useState({ open: false, parcel: null, action: 'edit', code: '', error: '' })
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [transportModal, setTransportModal] = useState({ open: false, parcel: null, driverId: '', loading: false, error: '' })
  const [deliveryModal, setDeliveryModal] = useState({ open: false, parcel: null, driverId: '', loading: false, error: '' })
  const [codCollectModal, setCodCollectModal] = useState({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })
  const [portCollectModal, setPortCollectModal] = useState({ open: false, parcel: null, paymentType: '', loading: false })
  const collectedCodIds = useRef(new Set())
  const [agentEntries, setAgentEntries] = useState([])
  const [agencyCashiers, setAgencyCashiers] = useState([])
  const [agencyCash, setAgencyCash] = useState(null)
  const [directTransfer, setDirectTransfer] = useState({ cashierId: '', amount: '', description: '', loading: false, error: '', success: '' })
  const [recoveryRequest, setRecoveryRequest] = useState({ cashierId: '', amount: '', description: '', loading: false, error: '', success: '' })
  const [cashRecoveryRequests, setCashRecoveryRequests] = useState([])
  const [agentOpsDelete, setAgentOpsDelete] = useState({ loading: false, message: '', error: '' })
  const [cashierHistoryDelete, setCashierHistoryDelete] = useState({ loading: false, message: '', error: '' })
  const [clientsSearch, setClientsSearch] = useState('')
  const [agentNewClient, setAgentNewClient] = useState(null)
  const [agentClientSaving, setAgentClientSaving] = useState(false)
  const [codSettling, setCodSettling]       = useState(null) // parcelId being settled
  const [allCodParcels, setAllCodParcels]   = useState(null) // null = not loaded yet
  const [codLoadingAll, setCodLoadingAll]   = useState(false)
  const [batchSettling, setBatchSettling]   = useState(false)
  const [claimingParcelId, setClaimingParcelId] = useState(null)
  const [claimError, setClaimError] = useState('')
  const [agentCodRequests, setAgentCodRequests] = useState([])
  const [codRequestDrafts, setCodRequestDrafts] = useState({})
  const [codRequestBusy, setCodRequestBusy] = useState('')

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    const unsubProfile = onSnapshot(doc(db, 'users', uid), snap => {
      if (snap.exists()) setProfile(snap.data())
    })
    const unsubDrivers = subscribeDrivers(setDrivers)
    const unsubUsers = subscribeAllUsers(data => {
      setAgencyCashiers(data.filter(u => u.role === 'caissier'))
    })
    const unsubTariffs = subscribeTariffConfig(setTariffConfig)
    setLoadingParcels(true)
    // Requêtes ciblées : seuls les colis de cet agent sont reçus (pas toute la collection)
    const unsub = subscribeAgentParcels(uid, data => {
      setParcels(data)
      setLoadingParcels(false)
    })
    const unsubClients = subscribeClients(setClients)
    const unsubCodRequests = subscribeAgentCodRequests(uid, setAgentCodRequests)
    return () => { unsubProfile(); unsubDrivers(); unsubUsers(); unsubTariffs(); unsub(); unsubClients(); unsubCodRequests() }
  }, [])

  useEffect(() => {
    if (profile?.city) setForm(p => ({ ...p, senderCity: profile.city }))
  }, [profile?.city])

  useEffect(() => {
    agentCodRequests.slice(0, 10).forEach(req => {
      if (!req.readByAgentAt) markAgentCodRequestRead(req.id).catch(() => {})
    })
  }, [agentCodRequests])

  useEffect(() => {
    if (!profile?.city) return
    setLoadingInbox(true)
    const unsub = subscribeAgencyInbox(profile.city, data => {
      setInboxParcels(data)
      setLoadingInbox(false)
    })
    const unsubCaisse = subscribeCaisseByCity(profile.city, data => setAgentEntries(data))
    const unsubCash = subscribeAgencyCash(profile.city, setAgencyCash)
    const unsubRecovery = subscribeAgentCashRecoveryRequests(profile.city, setCashRecoveryRequests)
    return () => { unsub(); unsubCaisse(); unsubCash(); unsubRecovery() }
  }, [profile?.city])

  const handleClaim = async (parcel) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    if (!uid || claimingParcelId) return
    setClaimingParcelId(parcel.id)
    setClaimError('')
    try {
      await claimParcel(parcel.id, uid, name)
    } catch (err) {
      setClaimError(err?.message || 'Erreur lors de la réception du colis.')
    } finally {
      setClaimingParcelId(null)
    }
  }

  const handleAssignTransport = async () => {
    const { parcel, driverId } = transportModal
    if (!driverId) { setTransportModal(m => ({ ...m, error: 'Sélectionnez un chauffeur de transport.' })); return }
    setTransportModal(m => ({ ...m, loading: true, error: '' }))
    try {
      const driver = drivers.find(d => d.id === driverId)
      await assignDriver(parcel.id, driverId, driver?.name || '')
      setTransportModal({ open: false, parcel: null, driverId: '', loading: false, error: '' })
    } catch {
      setTransportModal(m => ({ ...m, loading: false, error: 'Erreur lors du chargement camion.' }))
    }
  }

  const handleAssignDelivery = async () => {
    const { parcel, driverId } = deliveryModal
    if (!driverId) { setDeliveryModal(m => ({ ...m, error: 'Sélectionnez un chauffeur.' })); return }
    setDeliveryModal(m => ({ ...m, loading: true, error: '' }))
    try {
      const driver = drivers.find(d => d.id === driverId)
      await assignDeliveryDriver(parcel.id, driverId, driver?.name || '')
      await updateParcelStatus(parcel.id, 'En cours de livraison', {
        note: `Livraison assignée à ${driver?.name || 'chauffeur'}`
      })
      setDeliveryModal({ open: false, parcel: null, driverId: '', loading: false, error: '' })
    } catch {
      setDeliveryModal(m => ({ ...m, loading: false, error: "Erreur lors de l'assignation." }))
    }
  }

  const handleClientPickup = async (parcel) => {
    const codPending = parcel.codAmount > 0 && !['collected', 'remis'].includes(parcel.codStatus || 'pending')
    const portPending = parcel.portType === 'port_du' && parcel.portStatus !== 'collected'
    if (codPending) {
      setCodCollectModal({ open: true, parcel, paymentType: serviceToPaymentType(parcel.serviceType), loading: false, withDelivery: true })
      return
    }
    if (portPending) {
      setPortCollectModal({ open: true, parcel, paymentType: '', loading: false })
      return
    }
    await updateParcelStatus(parcel.id, 'Livré', { note: 'Retrait en agence par le client' })
  }

  const handleAgentCollectCod = async () => {
    const { parcel, paymentType, withDelivery } = codCollectModal
    if (!paymentType) return
    // Prevent duplicate collection (race condition or double-tap)
    if (collectedCodIds.current.has(parcel.id) || ['collected', 'remis'].includes(parcel.codStatus)) {
      setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })
      return
    }
    collectedCodIds.current.add(parcel.id)
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodCollectModal(m => ({ ...m, loading: true }))
    try {
      // If parcel was contracted as non-cash, enforce that type regardless of modal selection
      const NON_CASH = ['cheque', 'traite', 'bon_livraison', 'retour_bl']
      const contractedType = serviceToPaymentType(parcel.serviceType)
      const effectivePaymentType = NON_CASH.includes(contractedType) ? contractedType : paymentType
      const isSourceAgent = uid === parcel.agentId
      if (isSourceAgent) {
        await collectCodAtSource(parcel.id, effectivePaymentType, name)
      } else {
        // Destination agent collecting directly → skip to 'remis' so no second entry via "Réceptionner"
        await collectCodAtDestination(parcel.id, effectivePaymentType, name)
      }
      // Caisse uniquement pour espèces — chèques/traites suivis hors caisse (onglet COD)
      const isEspeces = !NON_CASH.includes(effectivePaymentType)
      if (isEspeces) {
        await createCaisseEntry({
          type: 'entree', category: 'cod_agence',
          amount: parcel.codAmount,
          description: `COD espèces collecté — ${parcel.trackingId} (${parcel.receiver?.name})`,
          reference: parcel.trackingId,
          agentId: uid,
          agentName: name,
          city: profile?.city || parcel.receiver?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      if (withDelivery) {
        const portPending = parcel.portType === 'port_du' && parcel.portStatus !== 'collected'
        if (portPending) {
          setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })
          setPortCollectModal({ open: true, parcel, paymentType: '', loading: false })
          return
        }
        await updateParcelStatus(parcel.id, 'Livré', { note: 'Retrait en agence par le client' })
      }
      setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })
    } catch {
      setCodCollectModal(m => ({ ...m, loading: false }))
    }
  }

  const handleAgentCollectPort = async () => {
    const { parcel, paymentType } = portCollectModal
    if (!paymentType) return
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setPortCollectModal(m => ({ ...m, loading: true }))
    try {
      await collectPortDu(parcel.id, name, uid)
      await createCaisseEntry({
        type: 'entree', category: 'port_du',
        amount: parcel.price || 0,
        description: `Port dû — ${parcel.trackingId} (${parcel.receiver?.name})`,
        reference: parcel.trackingId,
        agentId: uid,
        agentName: name,
        city: profile?.city || parcel.receiver?.city || '',
        cashierId: uid, cashierName: name,
      })
      await updateParcelStatus(parcel.id, 'Livré', { note: 'Retrait en agence — port dû encaissé' })
      setPortCollectModal({ open: false, parcel: null, paymentType: '', loading: false })
    } catch {
      setPortCollectModal(m => ({ ...m, loading: false }))
    }
  }

  const handleDirectCashierTransfer = async () => {
    const uid = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const amount = parseFloat(directTransfer.amount || 0)
    const selectedCashier = agencyCashiers.find(c => c.id === directTransfer.cashierId)
    const myEntries = agentEntries.filter(e => e.cashierId === uid || e.agentId === uid)
    const currentBalance = myEntries.reduce((sum, e) => sum + (e.type === 'entree' ? 1 : -1) * (parseFloat(e.amount) || 0), 0)

    if (!selectedCashier || !profile?.city || selectedCashier.city !== profile.city) {
      setDirectTransfer(m => ({ ...m, error: 'Selectionnez un caissier de votre agence.', success: '' }))
      return
    }
    if (!amount || amount <= 0) {
      setDirectTransfer(m => ({ ...m, error: 'Entrez un montant valide.', success: '' }))
      return
    }
    if (amount > currentBalance) {
      setDirectTransfer(m => ({ ...m, error: 'Montant superieur au solde de votre caisse.', success: '' }))
      return
    }

    setDirectTransfer(m => ({ ...m, loading: true, error: '', success: '' }))
    try {
      const transId = await createCaissierTransaction({
        city: profile.city,
        agentId: uid,
        agentName: name,
        caisserId: selectedCashier.id,
        cashierName: selectedCashier.name || 'Caissier',
        amountEspeces: amount,
        amountCheques: 0,
        amountVirement: 0,
        amount,
        description: directTransfer.description || 'Transfert direct agent vers caissier',
      })
      await createCaisseEntry({
        type: 'sortie',
        category: 'remise_caissier',
        amount,
        description: `Transfert direct au caissier - ${selectedCashier.name || 'Caissier'}`,
        reference: transId,
        agentId: uid,
        agentName: name,
        city: profile.city,
        cashierId: selectedCashier.id,
        cashierName: selectedCashier.name || 'Caissier',
        note: directTransfer.description || '',
      })
      await createCaisseEntry({
        type: 'entree',
        category: 'depot_agent',
        amount,
        description: `Transfert direct recu - ${name}`,
        reference: transId,
        sourceAgentId: uid,
        sourceAgentName: name,
        city: profile.city,
        cashierId: selectedCashier.id,
        cashierName: selectedCashier.name || 'Caissier',
        note: directTransfer.description || 'Especes',
      })
      await updateAgencyCash(profile.city, {
        solde: (agencyCash?.solde || 0) + amount,
        soldeEspeces: (agencyCash?.soldeEspeces || 0) + amount,
        soldeCheques: agencyCash?.soldeCheques || 0,
        soldeVirement: agencyCash?.soldeVirement || 0,
        lastUpdatedBy: name,
      })
      setDirectTransfer({ cashierId: '', amount: '', description: '', loading: false, error: '', success: 'Transfert effectue.' })
    } catch (err) {
      console.error('Erreur transfert caissier:', err)
      setDirectTransfer(m => ({ ...m, loading: false, error: err?.message || 'Erreur lors du transfert.', success: '' }))
    }
  }

  const handleRequestCashRecovery = async () => {
    const uid = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const amount = parseFloat(recoveryRequest.amount || 0)
    const selectedCashier = agencyCashiers.find(c => c.id === recoveryRequest.cashierId)

    if (!selectedCashier || !profile?.city || selectedCashier.city !== profile.city) {
      setRecoveryRequest(m => ({ ...m, error: 'Selectionnez un caissier de votre agence.', success: '' }))
      return
    }
    if (!amount || amount <= 0) {
      setRecoveryRequest(m => ({ ...m, error: 'Entrez un montant valide.', success: '' }))
      return
    }
    if (amount > (agencyCash?.soldeEspeces || agencyCash?.solde || 0)) {
      setRecoveryRequest(m => ({ ...m, error: 'Montant superieur a la caisse gardee par le caissier.', success: '' }))
      return
    }

    setRecoveryRequest(m => ({ ...m, loading: true, error: '', success: '' }))
    try {
      await createAgentCashRecoveryRequest({
        city: profile.city,
        agentId: uid,
        agentName: name,
        cashierId: selectedCashier.id,
        cashierName: selectedCashier.name || 'Caissier',
        amount,
        description: recoveryRequest.description || 'Recuperation demandee par l agent',
      })
      setRecoveryRequest({ cashierId: '', amount: '', description: '', loading: false, error: '', success: 'Demande envoyee au caissier.' })
    } catch (err) {
      console.error('Erreur demande recuperation:', err)
      setRecoveryRequest(m => ({ ...m, loading: false, error: 'Erreur lors de la demande.', success: '' }))
    }
  }

  const handleDeleteAgentOperations = async (entries) => {
    const uid = auth.currentUser?.uid
    if (!uid || agentOpsDelete.loading) return

    const agentOperations = entries.filter(e =>
      e.agentId === uid ||
      e.sourceAgentId === uid ||
      e.cashierId === uid
    )
    if (agentOperations.length === 0) {
      setAgentOpsDelete({ loading: false, message: '', error: 'Aucune operation liee a cet agent a supprimer.' })
      return
    }

    const ok = window.confirm(`Supprimer ${agentOperations.length} operation(s) de caisse liee(s) a cet agent ? Cette action ne supprime ni les expediteurs ni les autres agents.`)
    if (!ok) return

    setAgentOpsDelete({ loading: true, message: '', error: '' })
    try {
      const agencyCashDelta = agentOperations.reduce((sum, e) => {
        const amount = parseFloat(e.amount) || 0
        if (e.category === 'depot_agent' && e.sourceAgentId === uid && e.type === 'entree') return sum - amount
        if (e.category === 'restitution_agent' && e.sourceAgentId === uid && e.type === 'sortie') return sum + amount
        return sum
      }, 0)

      await deleteCaisseEntries(agentOperations.map(e => e.id))

      if (agencyCashDelta !== 0 && profile?.city) {
        const nextSolde = Math.max(0, (agencyCash?.solde || 0) + agencyCashDelta)
        const nextEspeces = Math.max(0, (agencyCash?.soldeEspeces || 0) + agencyCashDelta)
        await updateAgencyCash(profile.city, {
          solde: nextSolde,
          soldeEspeces: nextEspeces,
          soldeCheques: agencyCash?.soldeCheques || 0,
          soldeVirement: agencyCash?.soldeVirement || 0,
          lastUpdatedBy: profile?.name || 'Agent',
        })
      }

      setAgentOpsDelete({ loading: false, message: `${agentOperations.length} operation(s) supprimee(s) pour cet agent.`, error: '' })
    } catch (err) {
      console.error('Erreur suppression operations agent:', err)
      setAgentOpsDelete({ loading: false, message: '', error: 'Erreur lors de la suppression des operations.' })
    }
  }

  const handleDeleteCashierHistory = async () => {
    const uid = auth.currentUser?.uid
    if (!uid || cashierHistoryDelete.loading) return

    const ok = window.confirm("Supprimer les messages et historiques entre cet agent et le caissier ? Les mouvements de caisse restent geres par le bouton de suppression des operations.")
    if (!ok) return

    setCashierHistoryDelete({ loading: true, message: '', error: '' })
    try {
      const deletedCount = await deleteAgentCashierHistory(uid)
      setCashierHistoryDelete({
        loading: false,
        message: deletedCount > 0
          ? `${deletedCount} message(s) / historique(s) supprime(s).`
          : 'Aucun historique agent-caissier trouve pour cet agent.',
        error: '',
      })
    } catch (err) {
      console.error('Erreur suppression historique caissier:', err)
      setCashierHistoryDelete({ loading: false, message: '', error: "Erreur lors de la suppression de l'historique caissier." })
    }
  }

  const handleRemitCod = async (parcel) => {
    const name = profile?.name || 'Agent'
    await remitCod(parcel.id, name)
  }

  const handleSettleCod = async (parcel) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodSettling(parcel.id)
    try {
      await settleCodToSender(parcel.id, name, uid)
      // Sortie caisse uniquement pour espèces — le chèque/traite est remis directement à l'expéditeur
      if (isCash(parcel)) {
        await createCaisseEntry({
          type: 'sortie', category: 'cod_regle_expediteur',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `COD espèces réglé expéditeur — ${parcel.trackingId} (${parcel.sender?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      patchAllCod(parcel.id, { codSenderPaid: true, codSenderPaidAt: new Date().toISOString() })
    } finally {
      setCodSettling(null)
    }
  }

  const handleLoadAllCod = async () => {
    const uid = auth.currentUser?.uid
    setCodLoadingAll(true)
    try {
      const all = await fetchAllAgentCodParcels(uid)
      setAllCodParcels(all)
    } finally {
      setCodLoadingAll(false)
    }
  }

  const handleReplyCodRequest = async (req) => {
    const text = (codRequestDrafts[req.id] || '').trim()
    if (!text) return
    setCodRequestBusy(req.id)
    try {
      await addAgentCodRequestReply(req.id, {
        message: text,
        authorName: profile?.name || 'Agent',
        authorRole: 'agent',
      })
      setCodRequestDrafts(d => ({ ...d, [req.id]: '' }))
    } finally {
      setCodRequestBusy('')
    }
  }

  const handleSettleCodFromRequest = async (req, parcel) => {
    if (!parcel) return
    setCodRequestBusy(req.id)
    try {
      await handleSettleCod(parcel)
      await addAgentCodRequestReply(req.id, {
        message: 'COD regle avec l expediteur.',
        authorName: profile?.name || 'Agent',
        authorRole: 'agent',
      })
      await resolveAgentCodRequest(req.id, profile?.name || 'Agent')
    } finally {
      setCodRequestBusy('')
    }
  }

  const handleBatchSettle = async (parcels) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const ids  = parcels.map(p => p.id)
    setBatchSettling(true)
    try {
      await batchSettleCods(ids, name, uid)
      // Sortie caisse uniquement pour les COD espèces
      const espacesParcels = parcels.filter(p => isCash(p))
      if (espacesParcels.length > 0) {
        await Promise.all(espacesParcels.map(parcel =>
          createCaisseEntry({
            type: 'sortie', category: 'cod_regle_expediteur',
            amount: parseFloat(parcel.codAmount) || 0,
            description: `COD espèces réglé expéditeur — ${parcel.trackingId} (${parcel.sender?.name || ''})`,
            reference: parcel.trackingId,
            agentId: uid, agentName: name, city: profile?.city || '',
            cashierId: uid, cashierName: name,
          })
        ))
      }
      setAllCodParcels(prev => prev
        ? prev.map(p => ids.includes(p.id) ? { ...p, codSenderPaid: true, codSenderPaidAt: new Date().toISOString() } : p)
        : prev
      )
    } finally {
      setBatchSettling(false)
    }
  }

  const patchAllCod = (id, fields) => {
    setAllCodParcels(prev => prev ? prev.map(p => p.id === id ? { ...p, ...fields } : p) : prev)
    setParcels(prev => prev.map(p => p.id === id ? { ...p, ...fields } : p))
  }

  const [codSending,    setCodSending]    = useState(null) // parcelId
  const [codConfirming, setCodConfirming] = useState(null) // parcelId
  const [codReceptioning, setCodReceptioning] = useState(null) // parcelId

  // Résout la catégorie caisse COD selon le type de paiement (codPaymentType en priorité, serviceType en fallback)
  const codCaisseCategory = (parcel) => {
    const pt = parcel.codPaymentType || parcel.serviceType || 'especes'
    if (pt === 'cheque')                         return 'cod_cheque'
    if (pt === 'traite')                         return 'cod_traite'
    if (pt === 'bon_livraison' || pt === 'retour_bl') return 'doc_agent'
    return 'cod_agent'
  }
  const isCash = (parcel) => {
    const pt = parcel.codPaymentType || parcel.serviceType || 'especes'
    return !['cheque', 'traite', 'bon_livraison', 'retour_bl'].includes(pt)
  }

  // Étape 2b : agent destination réceptionne les valeurs du chauffeur
  const handleReceptionCod = async (parcel) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodReceptioning(parcel.id)
    try {
      let codCaisseEntryId = parcel.codCaisseEntryId || null
      // Caisse uniquement pour espèces — chèques/traites suivis hors caisse (onglet COD)
      if (isCash(parcel) && !parcel.codCaisseEntryId) {
        codCaisseEntryId = await createCaisseEntry({
          type: 'entree', category: 'cod_agent',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `COD espèces réceptionné du chauffeur — ${parcel.trackingId} (${parcel.receiver?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      await remitCod(parcel.id, name, codCaisseEntryId ? { codCaisseEntryId } : {})
      patchAllCod(parcel.id, { codStatus: 'remis', codRemisAt: new Date().toISOString(), codRemisBy: name, ...(codCaisseEntryId ? { codCaisseEntryId } : {}) })
    } finally {
      setCodReceptioning(null)
    }
  }

  const handleMarkSentToSource = async (parcel) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodSending(parcel.id)
    try {
      await markCodSentToSource(parcel.id, name, uid)
      // Sortie caisse uniquement pour espèces — chèques/traites sortent sans impacter la caisse
      if (isCash(parcel)) {
        await createCaisseEntry({
          type: 'sortie', category: 'cod_sortie_source',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `COD espèces envoyé agence source — ${parcel.trackingId} (${parcel.sender?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      patchAllCod(parcel.id, { codSentToSource: true, codSentToSourceAt: new Date().toISOString(), codSentToSourceBy: name })
    } finally {
      setCodSending(null)
    }
  }

  const handleConfirmReceived = async (parcel) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodConfirming(parcel.id)
    try {
      await confirmCodReceivedBySource(parcel.id, name, uid)
      // Caisse uniquement pour espèces — chèques/traites ne sont pas de la liquidité
      if (isCash(parcel)) {
        await createCaisseEntry({
          type: 'entree', category: 'cod_agent',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `COD espèces reçu de l'agence dest. — ${parcel.trackingId} (${parcel.receiver?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      patchAllCod(parcel.id, { codReceivedBySource: true, codReceivedBySourceAt: new Date().toISOString() })
    } finally {
      setCodConfirming(null)
    }
  }

  const handleCreateInlineClient = async () => {
    if (!inlineNewClient.name.trim() || !inlineNewClient.city.trim()) {
      setInlineNewClient(m => ({ ...m, error: 'Nom et ville requis.' }))
      return
    }
    setInlineNewClient(m => ({ ...m, loading: true, error: '' }))
    try {
      const id = await createClient({
        name:        inlineNewClient.name.trim(),
        tel:         inlineNewClient.tel.trim(),
        city:        inlineNewClient.city.trim(),
        accountType: 'compte',
        createdBy:   auth.currentUser?.uid,
      })
      setForm(p => ({ ...p, shipmentMode: 'client', clientId: id, clientName: inlineNewClient.name.trim() }))
      setInlineNewClient(null)
    } catch {
      setInlineNewClient(m => ({ ...m, loading: false, error: 'Erreur lors de la création.' }))
    }
  }

  const handleAgentCreateClient = async () => {
    if (!agentNewClient?.name?.trim()) return
    setAgentClientSaving(true)
    try {
      if (agentNewClient.id) {
        // Modification d'un client existant
        await updateClient(agentNewClient.id, {
          name:        agentNewClient.name.trim(),
          tel:         agentNewClient.tel?.trim() || '',
          address:     agentNewClient.address?.trim() || '',
          accountType: agentNewClient.accountType || 'cash',
          remise:      parseFloat(agentNewClient.remise) || 0,
        })
      } else {
        // Création d'un nouveau client
        await createClient({
          name:          agentNewClient.name.trim(),
          tel:           agentNewClient.tel?.trim() || '',
          city:          profile?.city || '',
          address:       agentNewClient.address?.trim() || '',
          accountType:   agentNewClient.accountType || 'cash',
          remise:        parseFloat(agentNewClient.remise) || 0,
          createdBy:     auth.currentUser?.uid,
          createdByName: profile?.name || '',
          createdByRole: 'agent',
        })
      }
      setAgentNewClient(null)
    } catch { /* silent */ }
    setAgentClientSaving(false)
  }

  const handlePrint = useReactToPrint({
    content: () => ticketRef.current,
    documentTitle: createdParcel ? `Bon-Ramassage-${createdParcel.trackingId}` : 'Bon-Ramassage',
    pageStyle: `
      @page { size: A5 portrait; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #ticket-print { width: 148mm !important; max-width: 148mm !important; margin: 0 auto !important; }
      }
    `,
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.portType === 'port_en_compte' && !form.clientId) {
      setError('Sélectionnez ou créez un client en compte avant de valider.')
      return
    }
    if (form.shipmentMode === 'client' && !form.clientId) {
      setError('Selectionnez un client existant ou passez en envoi personnel.')
      return
    }
    setLoading(true)
    try {
      const selectedDriver = drivers.find(d => d.id === form.chauffeurId)
      const parcel = await createParcel({
        sender:        { name: form.senderName, nic: form.senderNic, address: form.senderAddress, tel: form.senderTel, city: form.senderCity },
        receiver:      { name: form.receiverName, address: form.receiverAddress, tel: form.receiverTel, city: form.receiverCity },
        weight:        form.weight,
        nbColis:       form.nbColis,
        natureOfGoods: form.natureOfGoods,
        serviceType:   form.serviceType,
        codAmount:     form.codAmount,
        price,
        tariffConfig,
        portType:      form.portType,
        customerMode:  form.shipmentMode,
        clientId:      form.clientId   || null,
        clientName:    form.clientName || null,
        agentId:       auth.currentUser?.uid,
        agentName:     profile?.name || '',
        chauffeurId:   form.chauffeurId || null,
        chauffeurName: selectedDriver?.name || null
      })
      if (form.autoDebit && form.clientId && parcel.price > 0) {
        try {
          await addPayment({
            clientId:    form.clientId,
            parcelId:    parcel.trackingId,
            amount:      parcel.price,
            type:        'debit',
            invoiced:    true,
            description: `Livraison ${parcel.trackingId} → ${form.receiverCity}`,
            createdBy:   auth.currentUser?.uid,
          })
        } catch (err) { console.error('addPayment:', err) }
      }
      if (form.portType === 'port_en_compte' && form.clientId && parcel.price > 0) {
        try {
          await addPayment({
            clientId:    form.clientId,
            parcelId:    parcel.trackingId,
            amount:      parcel.price,
            type:        'debit',
            invoiced:    true,
            description: `Port en compte — ${parcel.trackingId} → ${form.receiverCity}`,
            createdBy:   auth.currentUser?.uid,
          })
        } catch (err) { console.error('addPayment port_en_compte:', err) }
      }
      if (parcel.portType === 'port_paye' && parcel.price > 0) {
        const agentName = profile?.name || 'Agent'
        try {
          await createCaisseEntry({
            type: 'entree', category: 'port_paye',
            amount: parcel.price,
            description: `Port payé — ${parcel.trackingId} → ${form.receiverCity}`,
            reference: parcel.trackingId,
            agentId: auth.currentUser?.uid,
            agentName,
            city: profile?.city || form.senderCity || '',
            cashierId: auth.currentUser?.uid, cashierName: agentName,
          })
        } catch (err) { console.error('createCaisseEntry port_paye:', err) }
      }
      // Auto-enregistrement / mise à jour de l'expéditeur comme client
      if (form.senderName.trim()) {
        const tel        = form.senderTel.trim()
        const city       = form.senderCity || profile?.city || ''
        const name       = form.senderName.trim()
        const address    = form.senderAddress?.trim() || ''
        const nic        = form.senderNic?.trim() || ''
        if (form.clientId) {
          // Client déjà sélectionné → mettre à jour ses infos
          updateClient(form.clientId, { name, tel, address, nic }).catch(() => {})
        } else {
          // Vérifier si un client identique existe déjà (par tél+ville ou nom+ville)
          const exists = tel
            ? clients.some(c => c.tel === tel && c.city === city)
            : clients.some(c => c.name?.toLowerCase() === name.toLowerCase() && c.city === city)
          if (!exists) {
            createClient({
              name, tel, city, address, nic,
              accountType:   'cash',
              createdBy:     auth.currentUser?.uid,
              createdByName: profile?.name || '',
              createdByRole: 'agent',
            }).catch(() => {})
          } else {
            // Client existant trouvé par tél/nom → mettre à jour ses infos
            const existing = clients.find(c =>
              tel ? (c.tel === tel && c.city === city)
                  : (c.name?.toLowerCase() === name.toLowerCase() && c.city === city)
            )
            if (existing) updateClient(existing.id, { name, tel, address, nic }).catch(() => {})
          }
        }
      }
      setCreatedParcel(parcel)
    } catch {
      setError("Erreur lors de l'enregistrement. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = (parcel) => {
    const uid   = auth.currentUser?.uid
    const isOwn = !parcel.agentId || parcel.agentId === uid
    if (isOwn) {
      openEditModal(parcel)
    } else {
      setCodeModal({ open: true, parcel, action: 'edit', code: '', error: '' })
    }
  }

  const handleDeleteClick = (parcel) => {
    const uid   = auth.currentUser?.uid
    const isOwn = !parcel.agentId || parcel.agentId === uid
    if (isOwn) {
      setDeleteConfirm(parcel)
    } else {
      setCodeModal({ open: true, parcel, action: 'delete', code: '', error: '' })
    }
  }

  const confirmDelete = async (parcel) => {
    await deleteParcel(parcel.id)
    setDeleteConfirm(null)
  }

  const openEditModal = (parcel) => {
    setEditingParcel(parcel)
    setEditForm({
      senderName:    parcel.sender?.name    || '',
      senderNic:     parcel.sender?.nic     || '',
      senderAddress: parcel.sender?.address || '',
      senderTel:     parcel.sender?.tel     || '',
      senderCity:    parcel.sender?.city    || '',
      receiverName:    parcel.receiver?.name    || '',
      receiverAddress: parcel.receiver?.address || '',
      receiverTel:     parcel.receiver?.tel     || '',
      receiverCity:    parcel.receiver?.city    || '',
      weight:          parcel.weight            || '',
      nbColis:         parcel.nbColis           || 1,
      natureOfGoods:   parcel.natureOfGoods     || '',
      codAmount:       parcel.codAmount         || 0,
      serviceType:     parcel.serviceType       || 'oc',
      status:          parcel.status            || 'Initialisé',
      note:         ''
    })
    setEditError('')
  }

  const handleCodeVerify = async () => {
    const { parcel, action, code } = codeModal
    if (!code.trim()) { setCodeModal(m => ({ ...m, error: 'Entrez le code.' })); return }
    const agentCode = await getAgentCode(parcel.agentId)
    if (agentCode === null || code.trim() === String(agentCode)) {
      setCodeModal({ open: false, parcel: null, action: 'edit', code: '', error: '' })
      if (action === 'edit')   openEditModal(parcel)
      if (action === 'delete') setDeleteConfirm(parcel)
    } else {
      setCodeModal(m => ({ ...m, error: 'Code incorrect.' }))
    }
  }

  const handleEditSave = async () => {
    setEditLoading(true)
    setEditError('')
    try {
      const updated = {
        sender:        { name: editForm.senderName, nic: editForm.senderNic || '', address: editForm.senderAddress || '', tel: editForm.senderTel, city: editForm.senderCity },
        receiver:      { name: editForm.receiverName, address: editForm.receiverAddress || '', tel: editForm.receiverTel, city: editForm.receiverCity },
        weight:        parseFloat(editForm.weight),
        nbColis:       parseInt(editForm.nbColis) || 1,
        natureOfGoods: editForm.natureOfGoods || '',
        serviceType:   editForm.serviceType || 'oc',
        codAmount:     parseFloat(editForm.codAmount) || 0,
        price:         calculateTariff(editForm.receiverCity, editForm.weight, editForm.nbColis, tariffConfig) || editingParcel.price,
        destinationCity: editForm.receiverCity || editingParcel.destinationCity,
      }
      await updateParcel(editingParcel.id, updated)
      if (editForm.status !== editingParcel.status && canManageStatus(editingParcel)) {
        await updateParcelStatus(
          editingParcel.id,
          editForm.status,
          editForm.note ? { note: editForm.note } : {}
        )
      }
      setEditingParcel(null)
    } catch {
      setEditError('Erreur lors de la sauvegarde.')
    } finally {
      setEditLoading(false)
    }
  }

  const uid             = auth.currentUser?.uid

  // Seule l'agence de destination peut modifier le statut
  const canManageStatus = (parcel) => {
    if (!profile?.city) return true
    const dest = parcel.destinationCity || parcel.receiver?.city
    return !dest || profile.city === dest
  }

  const price           = calculateTariff(form.receiverCity, form.weight, form.nbColis, tariffConfig)
  const editPrice       = editForm ? calculateTariff(editForm.receiverCity, editForm.weight, editForm.nbColis, tariffConfig) : 0
  const f  = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))
  const selectExistingClient = (client) => {
    if (!client?.id) return
    setForm(p => ({
      ...p,
      shipmentMode:  'client',
      clientId:      client.id,
      clientName:    client.name || '',
      senderName:    client.name || p.senderName,
      senderTel:     client.tel     || p.senderTel,
      senderAddress: client.address || p.senderAddress,
      senderCity:    client.city    || p.senderCity,
      senderNic:     client.nic     || p.senderNic,
    }))
    setClientSearch('')
    setShowClientDropdown(false)
    setShowSenderDropdown(false)
  }

  const filteredClientSearch = (() => {
    const cityClients = clients.filter(c => !profile?.city || c.city === profile.city)
    if (!clientSearch.trim()) return cityClients
    const s = clientSearch.toLowerCase()
    return cityClients.filter(c =>
      c.name?.toLowerCase().includes(s) || c.tel?.includes(s) || c.nic?.toLowerCase().includes(s)
    )
  })()
  const ef = (field) => (e) => setEditForm(p => ({ ...p, [field]: e.target.value }))

  const filteredParcels = filterByDate(parcels, datePreset, dateFrom, dateTo).filter(p => {
    // Isolation par ville : chaque agent ne voit que les colis de sa ville
    if (profile?.city) {
      const destinationVisible = (p.destinationCity === profile.city || p.receiver?.city === profile.city)
        && isParcelVisibleInDestinationAgency(p)
      const cityMatch = p.sender?.city === profile.city ||
                        destinationVisible
      if (!cityMatch) return false
    }
    if (subTab === 'mine' && p.agentId !== uid && p.destinationAgentId !== uid) return false
    if (parcelDirection === 'sent' && profile?.city && p.sender?.city !== profile.city) return false
    if (parcelDirection === 'received' && profile?.city) {
      const destinationVisible = (p.destinationCity === profile.city || p.receiver?.city === profile.city)
        && isParcelVisibleInDestinationAgency(p)
      if (!destinationVisible) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        p.trackingId?.toLowerCase().includes(q) ||
        p.sender?.name?.toLowerCase().includes(q) ||
        p.receiver?.name?.toLowerCase().includes(q) ||
        p.receiver?.city?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const whatsappMsg  = createdParcel
    ? encodeURIComponent(`🚚 *LivraisonMA* — Votre colis a été enregistré !\n\n📦 Numéro de suivi : *${createdParcel.trackingId}*\n🏙️ Destination : ${createdParcel.receiver.city}\n\n🔗 Suivez votre colis :\nhttps://arelanc.web.app/track?id=${createdParcel.trackingId}`)
    : ''
  const whatsappLink = createdParcel
    ? `https://wa.me/${createdParcel.receiver.tel.replace(/\D/g, '')}?text=${whatsappMsg}`
    : ''

  const inputCls  = "w-full border border-gray-200 rounded-xl p-3 text-sm focus:border-blue-500 focus:outline-none transition bg-gray-50 focus:bg-white"
  const selectCls = inputCls + " appearance-none cursor-pointer"

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyContact />
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          {/* Top bar */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain" />
              <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-gray-800 hidden sm:inline">Interface Agent</span>
              </div>
              {profile?.name && <span className="text-gray-400 text-sm hidden md:inline">— {profile.name}</span>}
              {profile?.city && (
                <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-medium hidden sm:inline-flex">
                  <MapPin className="w-3 h-3" /> {profile.city}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {profile?.code && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg font-mono border border-blue-200 hidden sm:inline">
                  Code : <strong>{profile.code}</strong>
                </span>
              )}
              <button
                onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="hidden md:flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
          {/* Desktop nav tabs */}
          <div className="hidden md:flex items-center gap-1 border-t border-gray-100 pt-1 pb-1">
            {[
              { key: 'home',    label: '🏠 Accueil',         onClick: () => { setTab('home'); setCreatedParcel(null) } },
              { key: 'new',     label: '+ Nouveau colis',    onClick: () => { setTab('new'); setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '' }) } },
              { key: 'parcels', label: '📦 Expéditions',     onClick: () => setTab('parcels') },
              { key: 'caisse',  label: '💼 Ma Caisse',       onClick: () => setTab('caisse') },
              { key: 'cod',     label: '💰 COD Clients',     onClick: () => setTab('cod') },
              { key: 'clients', label: '👥 Mes clients',     onClick: () => setTab('clients') },
            ].map(t => (
              <button key={t.key} onClick={t.onClick}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t.key ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Mobile breadcrumb when inside a section */}
          {tab !== 'home' && (
            <div className="md:hidden border-t border-gray-50 flex items-center gap-2 py-2">
              <button
                onClick={() => { setTab('home'); setCreatedParcel(null) }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition px-1 py-1 rounded-lg hover:bg-blue-50"
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
                <span>Accueil</span>
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-sm font-semibold text-blue-600">
                {tab === 'new' ? '+ Nouveau colis' : tab === 'caisse' ? 'Ma Caisse' : tab === 'cod' ? 'COD Clients' : tab === 'clients' ? 'Mes clients' : 'Expéditions'}
              </span>
            </div>
          )}
          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden border-t border-gray-100 py-2 space-y-1">
              <button
                onClick={() => { setTab('home'); setCreatedParcel(null); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
              >
                🏠 Accueil
              </button>
              <button
                onClick={() => { setTab('new'); setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '' }); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'new' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Plus className="w-4 h-4" /> Nouveau colis
              </button>
              <button
                onClick={() => { setTab('parcels'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'parcels' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Package className="w-4 h-4" /> Expéditions
              </button>
              <button
                onClick={() => { setTab('caisse'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'caisse' ? 'bg-green-50 text-green-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Wallet className="w-4 h-4" /> Ma Caisse
              </button>
              <button
                onClick={() => { setTab('cod'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'cod' ? 'bg-yellow-50 text-yellow-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                💰 COD Clients
              </button>
              <button
                onClick={() => { setTab('clients'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'clients' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Users className="w-4 h-4" /> Mes clients
              </button>
              <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between px-4 py-2">
                <button
                  onClick={() => signOut(auth).then(() => navigate('/login'))}
                  className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition"
                >
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
                {profile?.code && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-mono border border-blue-200">
                    Code : <strong>{profile.code}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 pb-16">

        {/* ── ACCUEIL : deux boutons magnifiques ── */}
        {tab === 'home' && (() => {
          const myParcels   = parcels.filter(p => p.agentId === uid || p.destinationAgentId === uid)
          const enCours     = myParcels.filter(p => !['Livré','Retourné'].includes(p.status)).length
          const livres      = myParcels.filter(p => p.status === 'Livré').length
          const today       = new Date(); today.setHours(0,0,0,0)
          const todayCount  = myParcels.filter(p => {
            const d = parcelDate(p); return d >= today
          }).length
          const statusRows  = STATUSES.map(s => ({
            status: s,
            count:  myParcels.filter(p => p.status === s).length,
            colors: STATUS_COLORS[s] || STATUS_COLORS['Initialisé'],
          })).filter(r => r.count > 0)
          return (
            <div className="mt-6 space-y-5">
              {/* Bonjour */}
              <div className="text-center mb-2">
                <p className="text-gray-400 text-sm">Bonjour,</p>
                <h1 className="font-black text-gray-800 text-2xl">{profile?.name || 'Agent'}</h1>
                {profile?.city && (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1 rounded-full font-medium">
                    <MapPin className="w-3 h-3" /> Agence de {profile.city}
                  </span>
                )}
              </div>

              {/* Stats rapides */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Aujourd'hui", value: todayCount, color: 'text-blue-600',  bg: 'bg-blue-50'  },
                  { label: 'En cours',    value: enCours,    color: 'text-orange-600', bg: 'bg-orange-50' },
                  { label: 'Livrés',      value: livres,     color: 'text-green-600',  bg: 'bg-green-50' },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center border border-white shadow-sm`}>
                    <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-500 font-medium mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Deux grands boutons + caisse */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">

                {/* Nouveau colis */}
                <button
                  onClick={() => { setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '' }); setTab('new') }}
                  className="group relative overflow-hidden rounded-3xl shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98]"
                  style={{ minHeight: 200 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700" />
                  <div className="absolute inset-0 opacity-20"
                    style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 50%)' }} />
                  <div className="relative p-8 flex flex-col items-start h-full justify-between">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-300">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                    <div className="mt-6 text-left">
                      <p className="text-white font-black text-2xl leading-tight">Nouveau colis</p>
                      <p className="text-blue-200 text-sm mt-1">Enregistrer une nouvelle expédition</p>
                      <div className="mt-4 inline-flex items-center gap-2 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                        Créer maintenant →
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expéditions */}
                <button
                  onClick={() => setTab('parcels')}
                  className="group relative overflow-hidden rounded-3xl shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98]"
                  style={{ minHeight: 200 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-green-600 to-teal-700" />
                  <div className="absolute inset-0 opacity-20"
                    style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 0%, transparent 50%)' }} />
                  <div className="relative p-8 flex flex-col items-start h-full justify-between">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-300">
                      <Package className="w-8 h-8 text-white" />
                    </div>
                    <div className="mt-6 text-left">
                      <p className="text-white font-black text-2xl leading-tight">Expéditions</p>
                      <p className="text-green-200 text-sm mt-1">Consulter et gérer les colis</p>
                      <div className="mt-4 inline-flex items-center gap-2 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                        {enCours > 0 ? `${enCours} en cours →` : 'Voir les colis →'}
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              {/* ── Raccourci Ma Caisse ── */}
              {(() => {
                const uid       = auth.currentUser?.uid
                const myE       = agentEntries.filter(e => e.cashierId === uid || e.agentId === uid)
                const filteredE = filterByDate(myE, caisseDatePreset, caisseDateFrom, caisseDateTo, entryDate)
                const filteredEntrees = filteredE
                  .filter(e => e.type === 'entree')
                  .reduce((s, e) => s + (parseFloat(e.amount || 0) || 0), 0)
                const filteredSorties = filteredE
                  .filter(e => e.type === 'sortie')
                  .reduce((s, e) => s + (parseFloat(e.amount || 0) || 0), 0)
                const filteredSolde = filteredEntrees - filteredSorties
                const pendingPort = parcels.filter(p =>
                  p.destinationAgentId === uid && p.portType === 'port_du' &&
                  p.portStatus !== 'collected' && p.status === 'Arrivé en agence'
                ).length
                return (
                  <button onClick={() => setTab('caisse')}
                    className="w-full flex items-center justify-between bg-white border border-gray-100 shadow-sm hover:shadow-md rounded-2xl px-4 py-3.5 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-800">Ma Caisse</p>
                        <p className="text-xs text-gray-400">
                          {dateFilterLabel(caisseDatePreset)} : <span className={`font-semibold ${filteredSolde >= 0 ? 'text-green-600' : 'text-red-600'}`}>{filteredSolde >= 0 ? '' : '−'}{Math.abs(filteredSolde).toLocaleString('fr-MA')} DH</span>
                          {pendingPort > 0 && <span className="ml-2 text-orange-500 font-semibold">· {pendingPort} port dû en attente</span>}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </button>
                )
              })()}

              {/* ── Raccourci COD Clients ── */}
              {(() => {
                const uid = auth.currentUser?.uid
                const myCodParcels = parcels.filter(p => p.agentId === uid && p.codAmount > 0)
                const aRegler = myCodParcels.filter(p => p.codStatus === 'remis' && !p.codSenderPaid)
                const totalARegler = aRegler.reduce((s, p) => s + (p.codAmount || 0), 0)
                return (
                  <button onClick={() => setTab('cod')}
                    className={`w-full flex items-center justify-between border shadow-sm hover:shadow-md rounded-2xl px-4 py-3.5 transition ${aRegler.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${aRegler.length > 0 ? 'bg-yellow-100' : 'bg-gray-100'}`}>
                        💰
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-bold ${aRegler.length > 0 ? 'text-yellow-800' : 'text-gray-800'}`}>COD Clients</p>
                        <p className="text-xs text-gray-400">
                          {aRegler.length > 0
                            ? <span className="font-semibold text-yellow-700">{aRegler.length} à régler · {totalARegler.toLocaleString('fr-MA')} DH</span>
                            : 'Tous les COD sont réglés'}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className={`w-4 h-4 ${aRegler.length > 0 ? 'text-yellow-500' : 'text-gray-400'}`} />
                  </button>
                )
              })()}

              {/* ── Tableau état des colis ── */}
              {myParcels.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-500" /> État de mes colis
                    </h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{myParcels.length} total</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
                          <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Colis</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {statusRows.map(({ status, count, colors }) => (
                          <tr key={status} className="hover:bg-gray-50 transition cursor-pointer"
                            onClick={() => setTab('parcels')}>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                                <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                                {status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-black text-gray-800 text-base">{count}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${colors.dot}`}
                                    style={{ width: `${Math.round(count / myParcels.length * 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-400 w-8 text-right">
                                  {Math.round(count / myParcels.length * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── NOUVEAU COLIS ── */}
        {tab === 'new' && !createdParcel && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-4">
            <div className="bg-blue-600 p-5">
              <h2 className="text-white font-bold text-xl">Nouveau colis</h2>
              <p className="text-blue-200 text-sm mt-0.5">Remplissez les informations d'expédition</p>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Mode d'envoi</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => {
                      setForm(p => ({
                        ...p,
                        shipmentMode: 'personal',
                        clientId: '',
                        clientName: '',
                        autoDebit: false,
                        portType: p.portType === 'port_en_compte' ? 'port_paye' : p.portType,
                      }))
                      setClientSearch('')
                      setInlineNewClient(null)
                    }}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                      form.shipmentMode === 'personal'
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <span className="block text-sm font-black">Personnel</span>
                    <span className={`block text-xs mt-0.5 ${form.shipmentMode === 'personal' ? 'text-gray-200' : 'text-gray-400'}`}>Sans fiche client</span>
                  </button>
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, shipmentMode: 'client' }))}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                      form.shipmentMode === 'client'
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    <span className="block text-sm font-black">Client existant</span>
                    <span className={`block text-xs mt-0.5 ${form.shipmentMode === 'client' ? 'text-blue-100' : 'text-gray-400'}`}>Choisir dans la liste</span>
                  </button>
                </div>
              </section>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {error}</div>}

              {/* ── Client lié ── */}
              <section className={form.shipmentMode === 'client' ? '' : 'hidden'}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Client lie <span className="text-gray-300 font-normal normal-case">(obligatoire)</span>
                </h3>
                {form.clientId ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                    <div>
                      <span className="text-sm font-semibold text-blue-800">👤 {form.clientName}</span>
                      {clients.find(c => c.id === form.clientId)?.remise > 0 && (
                        <span className="ml-2 text-xs text-green-600 font-medium">
                          Remise {clients.find(c => c.id === form.clientId)?.remise}%
                        </span>
                      )}
                    </div>
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, clientId: '', clientName: '', autoDebit: false }))}
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
                      placeholder="Rechercher un client (nom, tél, NIC)…"
                      className={`${inputCls} pl-10`}
                    />
                    {showClientDropdown && filteredClientSearch.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                        {filteredClientSearch.slice(0, 5).map(c => (
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

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Expéditeur</h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Nom avec recherche client */}
                  <div className="relative col-span-2">
                    <input
                      required
                      placeholder="Nom complet (ou chercher un client…)"
                      value={form.senderName}
                      onChange={e => { f('senderName')(e); setShowSenderDropdown(true) }}
                      onFocus={() => setShowSenderDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSenderDropdown(false), 150)}
                      className={inputCls}
                    />
                    {showSenderDropdown && (() => {
                      const q = form.senderName.trim().toLowerCase()
                      const list = (profile?.city
                        ? clients.filter(c => c.city === profile.city)
                        : clients
                      ).filter(c => !q || c.name?.toLowerCase().includes(q) || c.tel?.includes(q))
                      return list.length > 0 ? (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                          {list.slice(0, 6).map(c => (
                            <button type="button" key={c.id}
                              onMouseDown={e => { e.preventDefault(); selectExistingClient(c) }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0 transition">
                              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                                {c.name?.charAt(0)?.toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                                <p className="text-xs text-gray-400">{c.city}{c.tel && ` · ${c.tel}`}{c.address && ` · ${c.address}`}</p>
                              </div>
                              {c.accountType === 'compte' && (
                                <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">En compte</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : null
                    })()}
                  </div>
                  <input placeholder="NIC / N°" value={form.senderNic} onChange={f('senderNic')} className={inputCls} />
                  <input required placeholder="Téléphone" value={form.senderTel} onChange={f('senderTel')} className={inputCls} />
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-700">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    {form.senderCity || '—'}
                  </div>
                  <input placeholder="Adresse" value={form.senderAddress} onChange={f('senderAddress')} className={`${inputCls} col-span-2`} />
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Destinataire</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input required placeholder="Nom complet" value={form.receiverName} onChange={f('receiverName')} className={inputCls} />
                  <input required placeholder="Téléphone" value={form.receiverTel} onChange={f('receiverTel')} className={inputCls} />
                  <div className="relative col-span-2">
                    <select required value={form.receiverCity} onChange={f('receiverCity')} className={selectCls}>
                      <option value="">Ville de destination</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <input placeholder="Adresse" value={form.receiverAddress} onChange={f('receiverAddress')} className={`${inputCls} col-span-2`} />
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Détails</h3>
                <div className="grid grid-cols-2 gap-3">
                  <input required type="number" step="0.1" min="0.1" placeholder="Poids (kg)" value={form.weight} onChange={f('weight')} className={inputCls} />
                  <input required type="number" min="1" step="1" placeholder="Nb de colis" value={form.nbColis} onChange={f('nbColis')} className={inputCls} />
                  <input placeholder="Nature de marchandise" value={form.natureOfGoods} onChange={f('natureOfGoods')} className={`${inputCls} col-span-2`} />
                  <input type="number" min="0" placeholder="Valeur déclarée / COD (DH)" value={form.codAmount} onChange={f('codAmount')} className={`${inputCls} col-span-2`} />
                </div>
                {price > 0 && (
                  <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 flex justify-between items-center">
                    <span className="text-blue-600 text-sm">💰 Prix de livraison estimé</span>
                    <span className="text-blue-700 font-bold text-lg">{price} DH</span>
                  </div>
                )}
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Type de service</h3>
                <div className="grid grid-cols-4 gap-2">
                  {SERVICE_TYPES.map(st => (
                    <button type="button" key={st.key} onClick={() => setForm(p => ({ ...p, serviceType: st.key }))}
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
              </section>

              <div className="border-t border-dashed border-gray-200" />

              {/* ── Port Payé / Port Dû / En Compte ── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Frais de port</h3>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'port_paye',      label: 'Port Payé',  desc: "Expéditeur paie",    active: 'bg-blue-600 border-blue-500 text-white',   inactiveDesc: 'text-gray-400', activeDesc: 'text-blue-100'   },
                    { key: 'port_du',        label: 'Port Dû',    desc: 'Destinataire paie',  active: 'bg-orange-500 border-orange-400 text-white', inactiveDesc: 'text-gray-400', activeDesc: 'text-orange-100' },
                    { key: 'port_en_compte', label: 'En Compte',  desc: 'Facturé au compte',  active: 'bg-purple-600 border-purple-500 text-white', inactiveDesc: 'text-gray-400', activeDesc: 'text-purple-100' },
                  ].map(pt => (
                    <button type="button" key={pt.key}
                      onClick={() => setForm(p => ({
                        ...p,
                        portType: pt.key,
                        shipmentMode: pt.key === 'port_en_compte' ? 'client' : p.shipmentMode,
                      }))}
                      className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition text-left ${
                        form.portType === pt.key ? pt.active : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {pt.label}
                      <p className={`text-xs font-normal mt-0.5 ${form.portType === pt.key ? pt.activeDesc : pt.inactiveDesc}`}>{pt.desc}</p>
                    </button>
                  ))}
                </div>
                {form.clientId && form.portType === 'port_paye' && price > 0 && (
                  <div
                    className={`mt-2 flex items-center gap-2 cursor-pointer rounded-xl px-3 py-2 border transition ${
                      form.autoDebit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
                    }`}
                    onClick={() => setForm(p => ({ ...p, autoDebit: !p.autoDebit }))}>
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

                {/* ── Compte client (obligatoire pour port en compte) ── */}
                {form.portType === 'port_en_compte' && (
                  <div className="mt-3 border border-purple-200 rounded-xl p-3 bg-purple-50">
                    <p className="text-xs font-semibold text-purple-700 mb-2">Compte client <span className="text-red-500">*</span></p>
                    {form.clientId ? (
                      <div className="flex items-center justify-between bg-white border border-purple-200 rounded-lg px-3 py-2.5">
                        <div>
                          <span className="text-sm font-semibold text-purple-800">👤 {form.clientName}</span>
                          {(() => {
                            const cl = clients.find(c => c.id === form.clientId)
                            return cl ? (
                              <span className="ml-2 text-xs text-gray-500">
                                Solde : <span className={cl.balance > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{(cl.balance || 0).toFixed(2)} DH</span>
                              </span>
                            ) : null
                          })()}
                        </div>
                        <button type="button"
                          onClick={() => { setForm(p => ({ ...p, clientId: '', clientName: '' })); setInlineNewClient(null) }}
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
                            ? clients.filter(c => {
                                const s = clientSearch.toLowerCase()
                                return c.name?.toLowerCase().includes(s) || c.tel?.includes(s)
                              })
                            : clients.filter(c => c.accountType === 'compte')
                          return (
                            <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-white">
                              {list.slice(0, 6).map(c => (
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
                          onChange={e => setInlineNewClient(m => ({ ...m, name: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text" placeholder="Téléphone"
                            value={inlineNewClient.tel}
                            onChange={e => setInlineNewClient(m => ({ ...m, tel: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                          />
                          <div className="relative">
                            <select
                              value={inlineNewClient.city}
                              onChange={e => setInlineNewClient(m => ({ ...m, city: e.target.value }))}
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

              <div className="border-t border-dashed border-gray-200" />

              {/* Chauffeur de transport */}
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Chauffeur de transport <span className="text-gray-300 font-normal normal-case">(inter-ville · optionnel)</span>
                </h3>
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5 mb-3">
                  Si assigné, le colis passera directement en statut <strong>En transit</strong>
                </p>
                {(() => {
                  const cityDrivers = profile?.city ? drivers.filter(d => d.city === profile.city) : drivers
                  return cityDrivers.length === 0 ? (
                  <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3">Aucun chauffeur disponible pour {profile?.city || 'cette ville'}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, chauffeurId: '' }))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition ${
                        !form.chauffeurId
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <User className="w-4 h-4 opacity-50" /> Non assigné
                    </button>
                    {cityDrivers.map(d => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => setForm(p => ({ ...p, chauffeurId: d.id }))}
                        className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition ${
                          form.chauffeurId === d.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> {d.name}</span>
                        {d.tel && <span className={`text-xs ${form.chauffeurId === d.id ? 'text-blue-100' : 'text-gray-400'}`}>{d.tel}</span>}
                      </button>
                    ))}
                  </div>
                )})()}
              </section>

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-4 rounded-xl font-bold text-base transition flex items-center justify-center gap-2"
              >
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
                  : '📦 Enregistrer le colis'
                }
              </button>
            </form>
          </div>
        )}

        {/* ── TICKET ── */}
        {tab === 'new' && createdParcel && (
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
                  <div className="font-bold text-blue-700 text-sm tracking-widest">{createdParcel.trackingId}</div>
                  <div className="text-[9px] text-gray-400">{new Date().toLocaleDateString('fr-MA')}</div>
                </div>
              </div>

              {/* Type de service */}
              <div className="flex gap-4 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
                {SERVICE_TYPES.map(st => (
                  <label key={st.key} className="flex items-center gap-1 text-[10px] font-semibold">
                    <span className={`w-3 h-3 border border-gray-400 rounded-sm flex items-center justify-center text-[8px] ${createdParcel.serviceType === st.key ? 'bg-blue-600 border-blue-600 text-white' : ''}`}>
                      {createdParcel.serviceType === st.key ? '✓' : ''}
                    </span>
                    {st.label}
                  </label>
                ))}
              </div>

              {/* Expéditeur / Destinataire */}
              <div className="grid grid-cols-2 border-b border-gray-300">
                <div className="border-r border-gray-300 px-3 py-2 space-y-1">
                  <div className="font-bold text-[10px] uppercase tracking-wider text-blue-700 mb-1.5">Expéditeur</div>
                  <div><span className="text-gray-500">Nom : </span><span className="font-semibold">{createdParcel.sender.name}</span></div>
                  {createdParcel.sender.nic && <div><span className="text-gray-500">NIC : </span>{createdParcel.sender.nic}</div>}
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

              {/* Détails */}
              <div className="grid grid-cols-4 border-b border-gray-300 text-center">
                <div className="border-r border-gray-200 px-2 py-1.5">
                  <div className="text-gray-400 text-[9px] uppercase">Nb colis</div>
                  <div className="font-bold text-sm">{createdParcel.nbColis || 1}</div>
                </div>
                <div className="border-r border-gray-200 px-2 py-1.5">
                  <div className="text-gray-400 text-[9px] uppercase">Poids</div>
                  <div className="font-bold text-sm">{createdParcel.weight} kg</div>
                </div>
                <div className="border-r border-gray-200 px-2 py-1.5">
                  <div className="text-gray-400 text-[9px] uppercase">Prix</div>
                  <div className="font-bold text-sm text-blue-700">{createdParcel.price} DH</div>
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-gray-400 text-[9px] uppercase">COD</div>
                  <div className={`font-bold text-sm ${createdParcel.codAmount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                    {createdParcel.codAmount > 0 ? `${createdParcel.codAmount} DH` : '—'}
                  </div>
                </div>
              </div>

              {/* Nature */}
              {createdParcel.natureOfGoods && (
                <div className="px-3 py-1.5 border-b border-gray-200">
                  <span className="text-gray-500">Nature de marchandise : </span>
                  <span className="font-semibold">{createdParcel.natureOfGoods}</span>
                </div>
              )}

              {/* Barcode */}
              <div className="flex justify-center py-2">
                <Barcode value={createdParcel.trackingId} width={1.3} height={45} fontSize={10} margin={0} />
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
            <button onClick={() => { setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '' }) }}
              className="w-full flex items-center justify-center gap-2 border-2 border-blue-500 text-blue-600 py-4 rounded-xl font-semibold hover:bg-blue-50 transition"
            >
              <Plus className="w-4 h-4" /> Nouveau colis
            </button>
          </div>
        )}

        {/* ── EXPÉDITIONS ── */}
        {tab === 'parcels' && (
          <div className="mt-4 space-y-3">
            {/* Sub-tabs */}
            <div className="flex items-center gap-2">
              <div className="flex bg-white border border-gray-200 rounded-xl p-1 flex-1">
                <button onClick={() => setSubTab('mine')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${subTab === 'mine' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Mes colis
                </button>
                <button onClick={() => setSubTab('all')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${subTab === 'all' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Tous les colis
                </button>
                {profile?.city && (
                  <button onClick={() => setSubTab('inbox')}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition relative ${subTab === 'inbox' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Arrivées
                    {inboxParcels.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {inboxParcels.length > 9 ? '9+' : inboxParcels.length}
                      </span>
                    )}
                  </button>
                )}
              </div>
              <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-2.5 py-2 bg-white border border-gray-200 rounded-xl">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live
              </span>
            </div>

            {/* ── INBOX TAB ── */}
            {subTab === 'inbox' && (
              <>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-purple-500 shrink-0" />
                  <p className="text-purple-700 text-sm font-medium">
                    Colis destinés à <span className="font-bold">l'Agence de {profile?.city}</span> — réception colis par colis
                  </p>
                </div>
                {claimError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-3 py-2 text-sm font-medium">
                    {claimError}
                  </div>
                )}

                {loadingInbox ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : inboxParcels.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Aucun colis en attente pour cette agence</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {inboxParcels.map(parcel => {
                      const sc = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
                      return (
                        <div key={parcel.id}
                          className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-l-purple-500 border border-purple-100"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-gray-700">{parcel.trackingId}</span>
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                                  {parcel.status}
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
                                <span className="truncate">{parcel.sender?.city}</span>
                                <span className="text-gray-400 shrink-0">→</span>
                                <span className="truncate font-bold text-purple-700">{parcel.receiver?.city}</span>
                              </div>
                              <div className="mt-0.5 text-xs text-gray-400">
                                {parcel.receiver?.name} · {parcel.weight} kg · <span className="font-semibold text-gray-500">{parcel.price} DH</span>
                                {parcel.codAmount > 0 && <span className="text-orange-500 font-medium"> · COD {parcel.codAmount} DH</span>}
                              </div>
                              {parcel.agentName && (
                                <div className="mt-1 text-xs text-gray-400">Envoyé par <span className="font-medium text-gray-600">{parcel.agentName}</span></div>
                              )}
                            </div>
                            <button
                              onClick={() => handleClaim(parcel)}
                              disabled={!!claimingParcelId}
                              className="shrink-0 flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg font-semibold transition"
                            >
                              {claimingParcelId === parcel.id
                                ? <span className="w-3.5 h-3.5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                                : <Check className="w-3.5 h-3.5" />}
                              {claimingParcelId === parcel.id ? 'Réception...' : 'Recevoir ce colis'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {/* Search — hidden when inbox tab active */}
            {subTab !== 'inbox' && <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                placeholder="Rechercher (ID, nom, ville…)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>}

            {/* Filtre envoyes / recus */}
            {subTab !== 'inbox' && <div className="bg-white border border-gray-200 rounded-xl p-2 flex flex-wrap gap-2">
              {[
                { key: 'all', label: 'Tous les colis' },
                { key: 'sent', label: 'Colis envoyes' },
                { key: 'received', label: 'Colis recus' },
              ].map(({ key, label }) => (
                <button key={key}
                  onClick={() => setParcelDirection(key)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                    parcelDirection === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>}

            {/* Filtre date */}
            {subTab !== 'inbox' && <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                {[
                  { key: 'all',    label: 'Tout' },
                  { key: 'today',  label: "Aujourd'hui" },
                  { key: 'week',   label: '7 jours' },
                  { key: 'month',  label: 'Ce mois' },
                  { key: 'custom', label: 'Personnalisé' },
                ].map(({ key, label }) => (
                  <button key={key}
                    onClick={() => setDatePreset(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      datePreset === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2 pl-6">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                  />
                  <span className="text-gray-400 text-xs shrink-0">→</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 flex-1"
                  />
                </div>
              )}
            </div>}

            {subTab !== 'inbox' && <p className="text-xs text-gray-400 px-1">{filteredParcels.length} expédition(s)</p>}

            {subTab !== 'inbox' && (loadingParcels ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredParcels.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucune expédition trouvée</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredParcels.map(parcel => {
                  const isOwn = !parcel.agentId || parcel.agentId === uid
                  const sc    = STATUS_COLORS[parcel.status] || STATUS_COLORS['Initialisé']
                  const canLoadTransport = isOwn
                    && !parcel.chauffeurId
                    && parcel.status === 'Initialisé'
                    && (!profile?.city || parcel.sender?.city === profile.city)
                    && (parcel.destinationCity || parcel.receiver?.city) !== profile?.city
                  return (
                    <div key={parcel.id}
                      className={`bg-white rounded-xl p-4 shadow-sm border-l-4 ${isOwn ? 'border-l-blue-500 border border-blue-100' : 'border-l-orange-400 border border-orange-100'}`}
                    >
                      {/* Agent badge */}
                      <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium mb-2 ${isOwn ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                        <User className="w-3 h-3" />
                        {isOwn ? `Moi (${profile?.name || 'vous'})` : (parcel.agentName || 'Autre agent')}
                        {!isOwn && <Lock className="w-3 h-3 ml-0.5 opacity-60" />}
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-gray-700">{parcel.trackingId}</span>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                              {parcel.status}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
                            <span className="truncate">{parcel.sender?.city}</span>
                            <span className="text-gray-400 shrink-0">→</span>
                            <span className="truncate">{parcel.receiver?.city}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-gray-400">
                            {parcel.receiver?.name} · {parcel.weight} kg · <span className="font-semibold text-gray-500">{parcel.price} DH</span>
                            {parcel.codAmount > 0 && <span className="text-orange-500 font-medium"> · COD {parcel.codAmount} DH</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                            {parcel.sender?.tel && <span>📤 {parcel.sender.tel}</span>}
                            {parcel.receiver?.tel && <span>📥 {parcel.receiver.tel}</span>}
                          </div>
                          {parcel.chauffeurName && (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-200">
                              <Truck className="w-3 h-3" /> {parcel.chauffeurName}
                            </div>
                          )}
                          {parcel.deliveryDriverName && (
                            <div className="mt-1 inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200">
                              <User className="w-3 h-3" /> Livraison : {parcel.deliveryDriverName}
                            </div>
                          )}
                          {parcel.codAmount > 0 && (() => {
                            const cs  = parcel.codSenderPaid
                              ? { label: 'Réglé ✓', bg: 'bg-green-100', text: 'text-green-700' }
                              : parcel.codReceivedBySource && !parcel.codSenderPaid
                              ? { label: 'Reçu — à régler', bg: 'bg-purple-100', text: 'text-purple-700' }
                              : parcel.codSentToSource && !parcel.codReceivedBySource
                              ? { label: 'En transit source', bg: 'bg-blue-100', text: 'text-blue-700' }
                              : COD_STATUS[parcel.codStatus || 'pending']
                            const cpt = COD_PAYMENT_TYPES.find(t => t.key === (parcel.codPaymentType || parcel.serviceType))
                            const st  = SERVICE_TYPES.find(t => t.key === parcel.serviceType)
                            const emoji = cpt?.emoji || st?.emoji || '💵'
                            const typeLabel = cpt?.label || st?.label || ''
                            return (
                              <div className={`mt-1.5 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${cs.bg} ${cs.text} border border-current/20`}>
                                {emoji} COD {parcel.codAmount} DH
                                {typeLabel && <span className="font-normal opacity-80">· {typeLabel}</span>}
                                <span>— {cs.label}</span>
                              </div>
                            )
                          })()}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => handleEditClick(parcel)}
                            className={`flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg transition ${isOwn ? 'bg-blue-50 hover:bg-blue-100 text-blue-600' : 'bg-orange-50 hover:bg-orange-100 text-orange-600'}`}
                          >
                            {isOwn ? <Edit2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDeleteClick(parcel)}
                            className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-500 px-2.5 py-2 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Lock indicator — origin agent can't manage status */}
                      {!canManageStatus(parcel) && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          <Lock className="w-3 h-3 shrink-0" />
                          Statut géré par <span className="font-semibold ml-0.5">l'Agence de {parcel.destinationCity}</span>
                        </div>
                      )}

                      {/* Port dû — badge */}
                      {parcel.portType === 'port_du' && (
                        <div className={`mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                          parcel.portStatus === 'collected'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-orange-50 text-orange-700 border-orange-200'
                        }`}>
                          📮 Port dû {parcel.price > 0 ? `${parcel.price} DH` : ''}
                          {parcel.portStatus === 'collected'
                            ? ' — Encaissé ✓'
                            : ' — À encaisser'}
                        </div>
                      )}

                      {/* En compte — badge */}
                      {parcel.portType === 'port_en_compte' && (
                        <div className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border bg-purple-50 text-purple-700 border-purple-200">
                          🗂️ En compte {parcel.price > 0 ? `${parcel.price} DH` : ''}
                        </div>
                      )}

                      {/* Port dû pending — bouton de collecte pour l'agent destinataire */}
                      {parcel.destinationAgentId === uid
                       && parcel.portType === 'port_du'
                       && parcel.portStatus !== 'collected'
                       && parcel.status === 'Arrivé en agence' && (
                        <div className="mt-3 pt-3 border-t border-orange-200 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-orange-700">📮 Port dû à encaisser</p>
                            <p className="text-xs text-orange-500 mt-0.5">{parcel.price || 0} DH à collecter du destinataire</p>
                          </div>
                          <button
                            onClick={() => setPortCollectModal({ open: true, parcel, paymentType: '', loading: false })}
                            className="shrink-0 flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-semibold transition"
                          >
                            <Banknote className="w-3.5 h-3.5" /> Encaisser port
                          </button>
                        </div>
                      )}

                      {/* COD collect — destination agent collects COD when client picks up at agency */}
                      {canLoadTransport && (
                        <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-blue-700">Colis au depot source</p>
                            <p className="text-xs text-blue-500 mt-0.5">Choisir un chauffeur pour charger vers {parcel.destinationCity || parcel.receiver?.city}</p>
                          </div>
                          <button
                            onClick={() => setTransportModal({ open: true, parcel, driverId: '', loading: false, error: '' })}
                            className="shrink-0 flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-semibold transition"
                          >
                            <Truck className="w-3.5 h-3.5" /> Charger camion
                          </button>
                        </div>
                      )}

                      {parcel.destinationAgentId === uid
                       && parcel.codAmount > 0
                       && !['collected', 'remis'].includes(parcel.codStatus || 'pending') && (
                        <div className="mt-3 pt-3 border-t border-orange-200 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-orange-700">💰 COD en attente de collecte</p>
                            <p className="text-xs text-orange-500 mt-0.5">{parcel.codAmount} DH à encaisser</p>
                          </div>
                          <button
                            onClick={() => setCodCollectModal({ open: true, parcel, paymentType: serviceToPaymentType(parcel.serviceType), loading: false, withDelivery: false })}
                            className="shrink-0 flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-semibold transition"
                          >
                            <Banknote className="w-3.5 h-3.5" /> Collecter COD
                          </button>
                        </div>
                      )}

                      {/* COD remit — for claimed parcels where driver already collected */}
                      {parcel.destinationAgentId === uid
                       && parcel.codAmount > 0
                       && parcel.codStatus === 'collected' && (
                        <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-blue-700">💰 COD collecté par le chauffeur</p>
                            <p className="text-xs text-blue-500 mt-0.5">
                              {parcel.codAmount} DH
                              {(() => { const cpt = COD_PAYMENT_TYPES.find(t => t.key === parcel.codPaymentType); return cpt ? ` · ${cpt.emoji} ${cpt.label}` : '' })()}
                              {parcel.codCollectedBy ? ` · par ${parcel.codCollectedBy}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRemitCod(parcel)}
                            className="shrink-0 flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-semibold transition"
                          >
                            <Truck className="w-3.5 h-3.5" /> Marquer remis
                          </button>
                        </div>
                      )}

                      {/* Delivery assignment — for claimed parcels awaiting dispatch */}
                      {parcel.destinationAgentId === uid && parcel.status === 'Arrivé en agence' && (
                        <div className="mt-3 pt-3 border-t border-purple-200">
                          <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5" /> Choisir le mode de livraison :
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setDeliveryModal({ open: true, parcel, driverId: '', loading: false, error: '' })}
                              className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition"
                            >
                              <Truck className="w-3.5 h-3.5" /> Chauffeur livraison
                            </button>
                            <button
                              onClick={() => handleClientPickup(parcel)}
                              className="flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 rounded-lg transition"
                            >
                              <Package className="w-3.5 h-3.5" /> Retrait client
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── MODAL MODIFICATION ── */}
      {editingParcel && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-800">Modifier l'expédition</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{editingParcel.trackingId}</p>
              </div>
              <button onClick={() => setEditingParcel(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {editError && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {editError}</div>}

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Expéditeur</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nom" value={editForm.senderName} onChange={ef('senderName')} className={inputCls} />
                  <input placeholder="NIC / N°" value={editForm.senderNic || ''} onChange={ef('senderNic')} className={inputCls} />
                  <input placeholder="Téléphone" value={editForm.senderTel} onChange={ef('senderTel')} className={inputCls} />
                  <div className="relative">
                    <select value={editForm.senderCity} onChange={ef('senderCity')} className={selectCls}>
                      <option value="">Ville</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <input placeholder="Adresse" value={editForm.senderAddress || ''} onChange={ef('senderAddress')} className={`${inputCls} col-span-2`} />
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Destinataire</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nom" value={editForm.receiverName} onChange={ef('receiverName')} className={inputCls} />
                  <input placeholder="Téléphone" value={editForm.receiverTel} onChange={ef('receiverTel')} className={inputCls} />
                  <div className="col-span-2 relative">
                    <select value={editForm.receiverCity} onChange={ef('receiverCity')} className={selectCls}>
                      <option value="">Ville</option>
                      {CITIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <input placeholder="Adresse" value={editForm.receiverAddress || ''} onChange={ef('receiverAddress')} className={`${inputCls} col-span-2`} />
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Détails</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.1" min="0.1" placeholder="Poids (kg)" value={editForm.weight} onChange={ef('weight')} className={inputCls} />
                  <input type="number" min="1" step="1" placeholder="Nb de colis" value={editForm.nbColis || 1} onChange={ef('nbColis')} className={inputCls} />
                  <input placeholder="Nature de marchandise" value={editForm.natureOfGoods || ''} onChange={ef('natureOfGoods')} className={`${inputCls} col-span-2`} />
                  <input type="number" min="0" placeholder="COD (DH)" value={editForm.codAmount} onChange={ef('codAmount')} className={`${inputCls} col-span-2`} />
                </div>
                {editPrice > 0 && (
                  <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex justify-between items-center">
                    <span className="text-blue-600 text-xs">Prix livraison</span>
                    <span className="text-blue-700 font-bold">{editPrice} DH</span>
                  </div>
                )}
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Type de service</h4>
                <div className="grid grid-cols-4 gap-2">
                  {SERVICE_TYPES.map(st => (
                    <button type="button" key={st.key} onClick={() => setEditForm(p => ({ ...p, serviceType: st.key }))}
                      className={`py-2 rounded-xl border-2 text-xs font-bold transition ${
                        (editForm?.serviceType || 'oc') === st.key
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </section>

              <div className="border-t border-dashed border-gray-200" />

              <section>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Statut</h4>
                {canManageStatus(editingParcel) ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUSES.map(s => {
                        const sc = STATUS_COLORS[s] || STATUS_COLORS['Initialisé']
                        const selected = editForm?.status === s
                        return (
                          <button key={s}
                            onClick={() => setEditForm(p => ({ ...p, status: s }))}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition border ${
                              selected
                                ? `${sc.bg} ${sc.text} border-current ring-2 ring-offset-1 ring-current`
                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                            {s}
                          </button>
                        )
                      })}
                    </div>
                    {editForm?.status !== editingParcel?.status && (
                      <input
                        placeholder="Note sur le changement de statut (optionnel)"
                        value={editForm?.note || ''}
                        onChange={ef('note')}
                        className={`${inputCls} mt-2 text-xs`}
                      />
                    )}
                  </>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2.5">
                    <Lock className="w-5 h-5 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">{editForm?.status}</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Modification réservée à <span className="font-semibold">l'Agence de {editingParcel?.destinationCity}</span>
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <button onClick={handleEditSave} disabled={editLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
              >
                {editLoading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sauvegarde...</>
                  : <><Check className="w-4 h-4" /> Sauvegarder</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CODE ── */}
      {codeModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-bold text-gray-800">Code requis</h3>
              <p className="text-sm text-gray-500 mt-1">
                Entrez le code de <span className="font-semibold text-gray-700">{codeModal.parcel?.agentName || "l'agent"}</span> pour {codeModal.action === 'delete' ? 'supprimer' : 'modifier'} cette expédition
              </p>
            </div>
            {codeModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">⚠️ {codeModal.error}</div>
            )}
            <input
              type="text"
              placeholder="Code de l'agent"
              value={codeModal.code}
              onChange={e => setCodeModal(m => ({ ...m, code: e.target.value, error: '' }))}
              onKeyDown={e => e.key === 'Enter' && handleCodeVerify()}
              className="w-full border border-gray-200 rounded-xl p-3 text-center text-lg font-mono tracking-widest focus:border-blue-500 focus:outline-none mb-4"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setCodeModal({ open: false, parcel: null, action: 'edit', code: '', error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleCodeVerify}
                className="py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL LIVRAISON ── */}
      {/* MODAL CHARGEMENT TRANSPORT */}
      {transportModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Charger dans un camion</h3>
                <p className="text-xs font-mono text-blue-600 mt-0.5">{transportModal.parcel?.trackingId}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {transportModal.parcel?.sender?.city} vers {transportModal.parcel?.destinationCity || transportModal.parcel?.receiver?.city}
                </p>
              </div>
              <button onClick={() => setTransportModal({ open: false, parcel: null, driverId: '', loading: false, error: '' })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {transportModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">Attention : {transportModal.error}</div>
            )}
            {(() => {
              const cityDrivers = profile?.city ? drivers.filter(d => d.city === profile.city) : drivers
              return cityDrivers.length === 0 ? (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3 mb-4">Aucun chauffeur disponible pour {profile?.city || 'cette ville'}</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 mb-4">
                  {cityDrivers.map(d => (
                    <button key={d.id}
                      onClick={() => setTransportModal(m => ({ ...m, driverId: d.id }))}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border transition ${
                        transportModal.driverId === d.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                      <span className="flex-1">{d.name}</span>
                      {d.tel && <span className="text-xs opacity-70">{d.tel}</span>}
                    </button>
                  ))}
                </div>
              )
            })()}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setTransportModal({ open: false, parcel: null, driverId: '', loading: false, error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleAssignTransport} disabled={transportModal.loading}
                className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {transportModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</>
                  : <><Truck className="w-4 h-4" /> Charger</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {deliveryModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Assigner un chauffeur de livraison</h3>
                <p className="text-xs font-mono text-purple-600 mt-0.5">{deliveryModal.parcel?.trackingId}</p>
              </div>
              <button onClick={() => setDeliveryModal({ open: false, parcel: null, driverId: '', loading: false, error: '' })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {deliveryModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4">⚠️ {deliveryModal.error}</div>
            )}
            {(() => {
              const cityDrivers = profile?.city ? drivers.filter(d => d.city === profile.city) : drivers
              return cityDrivers.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-3 mb-4">Aucun chauffeur disponible pour {profile?.city || 'cette ville'}</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 mb-4">
                {cityDrivers.map(d => (
                  <button key={d.id}
                    onClick={() => setDeliveryModal(m => ({ ...m, driverId: d.id }))}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border transition ${
                      deliveryModal.driverId === d.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span className="flex-1">{d.name}</span>
                    {d.tel && <span className="text-xs opacity-70">{d.tel}</span>}
                  </button>
                ))}
              </div>
            )})()}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeliveryModal({ open: false, parcel: null, driverId: '', loading: false, error: '' })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={handleAssignDelivery} disabled={deliveryModal.loading}
                className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {deliveryModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Assignation...</>
                  : <><Truck className="w-4 h-4" /> Assigner</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

        {/* ══ TAB CAISSE ══ */}
        {tab === 'caisse' && (() => {
          const uid        = auth.currentUser?.uid
          const myEntries  = agentEntries.filter(e => e.cashierId === uid || e.agentId === uid)
          const dateFilteredEntries = filterByDate(myEntries, caisseDatePreset, caisseDateFrom, caisseDateTo, entryDate)
          const caisseQuery = caisseSearch.trim().toLowerCase()
          const filteredEntries = !caisseQuery ? dateFilteredEntries : dateFilteredEntries.filter(e => {
            const cat = CAISSE_CATEGORIES.find(c => c.key === e.category)
            return [
              e.description,
              e.reference,
              e.staffName,
              e.agentName,
              e.cashierName,
              e.note,
              e.type,
              e.category,
              cat?.label,
              e.amount,
            ].some(v => String(v ?? '').toLowerCase().includes(caisseQuery))
          })
          const today      = new Date(); today.setHours(0,0,0,0)
          const todayE     = myEntries.filter(e => {
            const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
            return d >= today
          })
          const todayEntrees  = todayE.filter(e => e.type === 'entree').reduce((s, e) => s + (e.amount || 0), 0)
          const todaySorties  = todayE.filter(e => e.type === 'sortie').reduce((s, e) => s + (e.amount || 0), 0)
          const totalToday    = todayEntrees - todaySorties
          // Solde de la periode filtree.
          const periodEntrees = filteredEntries.filter(e => e.type === 'entree').reduce((s, e) => s + (e.amount || 0), 0)
          const periodSorties = filteredEntries.filter(e => e.type === 'sortie').reduce((s, e) => s + (e.amount || 0), 0)
          const soldeCaisse   = periodEntrees - periodSorties
          const cashiers = agencyCashiers
            .filter(c => profile?.city && c.city === profile.city)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          const remiseAmount = Math.max(0, soldeCaisse)
          const myRecoveryRequests = cashRecoveryRequests.filter(r => r.agentId === uid)
          const portDuPending = parcels.filter(p =>
            p.destinationAgentId === uid &&
            p.portType === 'port_du' &&
            p.portStatus !== 'collected' &&
            p.status === 'Arrivé en agence'
          )
          const fmt = n => n.toLocaleString('fr-MA', { minimumFractionDigits: 0 })
          const fmtCat = key => CAISSE_CATEGORIES.find(c => c.key === key) || { emoji: '💱', label: key }
          return (
            <div className="mt-4 space-y-4">

              {/* Résumé du jour */}
              <div className="relative overflow-hidden bg-gradient-to-br from-green-600 via-green-700 to-emerald-800 rounded-3xl p-5 text-white shadow-xl">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 50%)' }} />
                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-green-200 text-xs font-medium uppercase tracking-wider">Periode filtree</p>
                      <h2 className="font-black text-xl mt-0.5">💼 Ma Caisse</h2>
                      <p className="text-green-300 text-xs mt-1">{profile?.name} · Agence {profile?.city}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-200 text-xs">Solde filtré</p>
                      <p className={`text-2xl font-black ${soldeCaisse >= 0 ? 'text-white' : 'text-red-300'}`}>{soldeCaisse >= 0 ? '' : '−'}{fmt(Math.abs(soldeCaisse))} DH</p>
                      <p className="text-green-300 text-xs mt-0.5">Aujourd'hui : {totalToday >= 0 ? '+' : '−'}{fmt(Math.abs(totalToday))} DH</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Port payé', val: filteredEntries.filter(e => e.type==='entree' && e.category === 'port_paye').reduce((s,e)=>s+e.amount,0) },
                      { label: 'Port dû',   val: filteredEntries.filter(e => e.type==='entree' && e.category === 'port_du').reduce((s,e)=>s+e.amount,0)   },
                      { label: 'COD',       val: filteredEntries.filter(e => e.type==='entree' && ['cod_agence','cod_agent','cod_cheque','cod_traite'].includes(e.category)).reduce((s,e)=>s+e.amount,0) },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-white/15 backdrop-blur-sm rounded-xl p-2.5 text-center">
                        <p className="text-green-200 text-xs">{label}</p>
                        <p className="font-black text-sm text-white">{fmt(val)} DH</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Transfert direct vers le caissier */}
              <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-emerald-50 flex items-center gap-2">
                  <Send className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-gray-700 text-sm">Transfert direct au caissier de l'agence</h3>
                  <span className="ml-auto text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Disponible {fmt(remiseAmount)} DH
                  </span>
                </div>
                {cashiers.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-400">
                    Aucun caissier trouve pour {profile?.city || 'cette agence'}.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {(directTransfer.error || directTransfer.success) && (
                      <div className={`px-4 py-3 text-xs font-semibold ${directTransfer.error ? 'text-red-600 bg-red-50' : 'text-emerald-700 bg-emerald-50'}`}>
                        {directTransfer.error || directTransfer.success}
                      </div>
                    )}
                    {cashiers.map(cashier => {
                      return (
                        <div key={cashier.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate">{cashier.name || 'Caissier'}</p>
                            <p className="text-xs text-gray-400">{cashier.city || profile?.city || 'Agence'}{cashier.tel ? ` · ${cashier.tel}` : ''}</p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2">
                            <input
                              type="number"
                              min="0"
                              max={remiseAmount}
                              value={directTransfer.cashierId === cashier.id ? directTransfer.amount : ''}
                              onChange={e => setDirectTransfer(m => ({ ...m, cashierId: cashier.id, amount: e.target.value, error: '', success: '' }))}
                              placeholder="Montant"
                              className="border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              onClick={handleDirectCashierTransfer}
                              disabled={directTransfer.loading || directTransfer.cashierId !== cashier.id || remiseAmount <= 0}
                              className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                            >
                              {directTransfer.loading && directTransfer.cashierId === cashier.id
                                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Transfert...</>
                                : <><Send className="w-3.5 h-3.5" /> Transferer</>
                              }
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Port dû en attente */}
              <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-50 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-blue-600" />
                  <h3 className="font-bold text-gray-700 text-sm">Recuperer de l'argent du caissier</h3>
                  <span className="ml-auto text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">Accord caissier</span>
                </div>
                {cashiers.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-400">
                    Aucun caissier trouve pour {profile?.city || 'cette agence'}.
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={recoveryRequest.cashierId}
                        onChange={e => setRecoveryRequest(m => ({ ...m, cashierId: e.target.value, error: '', success: '' }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Selectionner un caissier</option>
                        {cashiers.map(cashier => (
                          <option key={cashier.id} value={cashier.id}>{cashier.name || 'Caissier'} - {cashier.city}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={recoveryRequest.amount}
                        onChange={e => setRecoveryRequest(m => ({ ...m, amount: e.target.value, error: '', success: '' }))}
                        placeholder="Montant"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <input
                      value={recoveryRequest.description}
                      onChange={e => setRecoveryRequest(m => ({ ...m, description: e.target.value, error: '', success: '' }))}
                      placeholder="Motif optionnel"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                    {(recoveryRequest.error || recoveryRequest.success) && (
                      <div className={`text-xs font-semibold rounded-xl px-3 py-2 ${recoveryRequest.error ? 'text-red-600 bg-red-50 border border-red-100' : 'text-blue-700 bg-blue-50 border border-blue-100'}`}>
                        {recoveryRequest.error || recoveryRequest.success}
                      </div>
                    )}
                    <button
                      onClick={handleRequestCashRecovery}
                      disabled={recoveryRequest.loading}
                      className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold px-4 py-3 rounded-xl transition"
                    >
                      {recoveryRequest.loading
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Demande...</>
                        : <><Send className="w-4 h-4" /> Demander recuperation</>
                      }
                    </button>
                    {myRecoveryRequests.length > 0 && (
                      <div className="pt-2 space-y-2">
                        {myRecoveryRequests.slice(0, 3).map(req => (
                          <div key={req.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-700 truncate">{req.cashierName || 'Caissier'} - {fmt(req.amount)} DH</p>
                              <p className="text-[11px] text-gray-400">{req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Acceptee' : 'Refusee'}</p>
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                              req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              req.status === 'approved' ? 'bg-green-100 text-green-700' :
                              'bg-red-100 text-red-700'
                            }`}>{req.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {portDuPending.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-orange-200 flex items-center gap-2">
                    <span className="text-base">📮</span>
                    <h3 className="font-bold text-orange-700 text-sm">Port dû à encaisser</h3>
                    <span className="ml-auto bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{portDuPending.length}</span>
                  </div>
                  <div className="divide-y divide-orange-100">
                    {portDuPending.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{p.receiver?.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.trackingId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-orange-600">{p.price || 0} DH</span>
                          <button
                            onClick={() => setPortCollectModal({ open: true, parcel: p, paymentType: '', loading: false })}
                            className="flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                          >
                            <Banknote className="w-3 h-3" /> Encaisser
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entrées récentes */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Wallet className="w-4 h-4 text-green-500" />
                  <h3 className="font-bold text-gray-700 text-sm">Mouvements de caisse</h3>
                  <div className="sm:ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filteredEntries.length}</span>
                    <button
                      onClick={handleDeleteCashierHistory}
                      disabled={cashierHistoryDelete.loading}
                      className="inline-flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-xl transition"
                    >
                      {cashierHistoryDelete.loading
                        ? <><div className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" /> Suppression...</>
                        : <><MessageCircle className="w-3.5 h-3.5" /> Supprimer historique caissier</>
                      }
                    </button>
                    <button
                      onClick={() => handleDeleteAgentOperations(agentEntries)}
                      disabled={agentOpsDelete.loading || myEntries.length === 0}
                      className="inline-flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 text-xs font-bold px-3 py-1.5 rounded-xl transition"
                    >
                      {agentOpsDelete.loading
                        ? <><div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> Suppression...</>
                        : <><Trash2 className="w-3.5 h-3.5" /> Supprimer operations agent</>
                      }
                    </button>
                  </div>
                </div>
                {(agentOpsDelete.error || agentOpsDelete.message) && (
                  <div className={`px-4 py-2 text-xs font-semibold border-b ${
                    agentOpsDelete.error
                      ? 'bg-red-50 text-red-600 border-red-100'
                      : 'bg-green-50 text-green-700 border-green-100'
                  }`}>
                    {agentOpsDelete.error || agentOpsDelete.message}
                  </div>
                )}
                {(cashierHistoryDelete.error || cashierHistoryDelete.message) && (
                  <div className={`px-4 py-2 text-xs font-semibold border-b ${
                    cashierHistoryDelete.error
                      ? 'bg-red-50 text-red-600 border-red-100'
                      : 'bg-amber-50 text-amber-700 border-amber-100'
                  }`}>
                    {cashierHistoryDelete.error || cashierHistoryDelete.message}
                  </div>
                )}
                <div className="p-3 border-b border-gray-50">
                  <DateFilter
                    value={caisseDatePreset}
                    onChange={setCaisseDatePreset}
                    from={caisseDateFrom}
                    onFromChange={setCaisseDateFrom}
                    to={caisseDateTo}
                    onToChange={setCaisseDateTo}
                    tone="green"
                  />
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      value={caisseSearch}
                      onChange={e => setCaisseSearch(e.target.value)}
                      placeholder="Rechercher mouvement, catégorie, référence, agent, montant..."
                      className="w-full bg-white border border-gray-200 pl-9 pr-10 py-2.5 rounded-xl text-sm focus:border-green-500 focus:outline-none"
                    />
                    {caisseSearch && (
                      <button
                        onClick={() => setCaisseSearch('')}
                        className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"
                        aria-label="Effacer la recherche caisse"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 px-1 mt-2">
                    {filteredEntries.length} mouvement(s)
                    {caisseSearch && ` trouvé(s) sur ${dateFilteredEntries.length}`}
                  </p>
                </div>
                {filteredEntries.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Aucune entrée enregistrée</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {filteredEntries.slice(0, 20).map(e => {
                      const cat = fmtCat(e.category)
                      const d   = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt || 0)
                      return (
                        <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${e.type === 'entree' ? 'bg-green-50' : 'bg-red-50'}`}>
                            {cat.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{e.description}</p>
                            <p className="text-xs text-gray-400">{cat.label} · {d.toLocaleDateString('fr-MA')}</p>
                          </div>
                          <p className={`text-sm font-black shrink-0 ${e.type === 'entree' ? 'text-green-600' : 'text-red-600'}`}>
                            {e.type === 'entree' ? '+' : '−'}{fmt(e.amount || 0)} DH
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ══ TAB COD CLIENTS — PIPELINE COMPLET ══ */}
        {tab === 'cod' && (() => {
          const uid     = auth.currentUser?.uid
          const fmt     = n => (n || 0).toLocaleString('fr-MA')
          const fmtAmt  = n => (parseFloat(n) || 0).toLocaleString('fr-MA')
          const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit' }) : '—'
          const stMap   = Object.fromEntries(SERVICE_TYPES.map(s => [s.key, s]))
          const cptMap  = Object.fromEntries(COD_PAYMENT_TYPES.map(c => [c.key, c]))

          // Fusion données temps réel + historique
          const liveParcels = parcels.filter(p =>
            (p.agentId === uid || p.destinationAgentId === uid) && parseFloat(p.codAmount) > 0
          )
          const merged = allCodParcels
            ? (() => {
                const liveIds = new Set(liveParcels.map(p => p.id))
                return [...liveParcels, ...allCodParcels.filter(p => !liveIds.has(p.id))]
              })()
            : liveParcels
          const dateFilteredCodParcels = filterByDate(merged, codDatePreset, codDateFrom, codDateTo)
          const codQuery = codSearch.trim().toLowerCase()
          const filteredCodParcels = !codQuery ? dateFilteredCodParcels : dateFilteredCodParcels.filter(p => {
            const st = stMap[p.serviceType]
            const cpt = cptMap[p.codPaymentType]
            const cs = COD_STATUS[p.codStatus || 'pending']
            const values = [
              p.trackingId,
              p.sender?.name,
              p.sender?.tel,
              p.sender?.city,
              p.receiver?.name,
              p.receiver?.tel,
              p.receiver?.city,
              p.destinationCity,
              p.agentName,
              p.destinationAgentName,
              p.codAmount,
              st?.label,
              cpt?.label,
              cs?.label,
              p.codStatus,
            ]
            return values.some(v => String(v ?? '').toLowerCase().includes(codQuery))
          })

          // ── Perspective AGENT SOURCE (j'ai créé le colis) ──
          const src = filteredCodParcels.filter(p => p.agentId === uid)
          const src_enCours    = src.filter(p => ['pending','collected'].includes(p.codStatus || 'pending'))
          const src_remisAgent = src.filter(p => p.codStatus === 'remis' && !p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)
          const src_enRoute    = src.filter(p => p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)
          const src_aConfirmer = src.filter(p => p.codReceivedBySource && !p.codSenderPaid)
          const src_regle      = src.filter(p => p.codSenderPaid)

          // ── Perspective AGENT DESTINATION (j'ai livré le colis) ──
          const dst = filteredCodParcels.filter(p => p.destinationAgentId === uid)
          // Étape 2b : chauffeur a collecté → agent dest. doit réceptionner
          const dst_collected  = dst.filter(p => p.codStatus === 'collected' && !p.codSenderPaid)
          // Étape 3 → 4 : réceptionné, doit envoyer à agence source
          const dst_aEnvoyer   = dst.filter(p => p.codStatus === 'remis' && !p.codSentToSource && !p.codSenderPaid)
          // Étape 4 : envoyé, en attente de confirmation source
          const dst_envoye     = dst.filter(p => p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)

          const dstHasData = dst_collected.length > 0 || dst_aEnvoyer.length > 0 || dst_envoye.length > 0

          // Totaux résumé
          const totSrcPending  = src_enCours.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
          const totSrcRemis    = src_remisAgent.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
          const totSrcEnRoute  = src_enRoute.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
          const totSrcAConf    = src_aConfirmer.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
          const totDstCollect  = dst_collected.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
          const totDstEnvoy    = dst_aEnvoyer.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)

          const spinner = <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />

          // Composant carte colis réutilisable
          const PRow = ({ p, badge, action }) => {
            const st  = stMap[p.serviceType]
            const cpt = cptMap[p.codPaymentType]
            return (
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{p.trackingId}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-yellow-100 text-yellow-700">
                      {cpt?.emoji || st?.emoji || '💵'} {cpt?.label || st?.label || 'Espèces'}
                    </span>
                    {badge}
                  </div>
                  <p className="text-sm font-bold text-gray-800">{p.sender?.name || '—'}</p>
                  <p className="text-xs text-gray-500">{p.sender?.tel || ''}{p.receiver?.city ? ` · → ${p.receiver.city}` : ''}</p>
                  {p.agentName && p.destinationAgentName && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.agentName} → {p.destinationAgentName}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-amber-600">{fmtAmt(p.codAmount)} DH</p>
                  {action}
                </div>
              </div>
            )
          }

          const SectionCard = ({ icon, title, count, total, colorClass, children }) => count === 0 ? null : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className={`px-4 py-3 border-b flex items-center gap-2 ${colorClass || 'border-gray-100'}`}>
                <span className="text-base">{icon}</span>
                <h3 className="font-bold text-sm text-gray-800">{title}</h3>
                <span className="ml-auto bg-gray-200 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
                {total > 0 && <span className="text-xs font-bold text-amber-600">{fmt(total)} DH</span>}
              </div>
              <div className="divide-y divide-gray-50">{children}</div>
            </div>
          )

          return (
            <div className="mt-4 space-y-4">

              {/* ── Pipeline visuel ── */}
              <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-3xl p-4 text-white shadow-xl overflow-x-auto">
                <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">Pipeline COD</p>
                <div className="flex items-center gap-1 min-w-max">
                  {[
                    ...(dstHasData ? [
                      { label: 'À réceptionner', count: dst_collected.length, color: 'bg-red-500'    },
                      { label: 'À envoyer',       count: dst_aEnvoyer.length,  color: 'bg-orange-400' },
                      { label: 'Envoyé',          count: dst_envoye.length,    color: 'bg-cyan-500'   },
                    ] : []),
                    ...(src.length > 0 ? [
                      { label: 'Collecte',    count: src_enCours.length,   color: 'bg-yellow-500' },
                      { label: 'Chez dest.', count: src_remisAgent.length, color: 'bg-orange-500' },
                      { label: 'En route',   count: src_enRoute.length,    color: 'bg-blue-500'   },
                      { label: 'À confirmer',count: src_aConfirmer.length, color: 'bg-purple-500' },
                      { label: 'Réglé',      count: src_regle.length,      color: 'bg-green-500'  },
                    ] : []),
                  ].map((s, i) => (
                    <div key={s.label} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-500 text-xs">→</span>}
                      <div className={`${s.color} rounded-xl px-3 py-1.5 text-center min-w-[70px]`}>
                        <p className="text-white font-black text-lg leading-none">{s.count}</p>
                        <p className="text-white/80 text-[10px] font-medium mt-0.5">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Charger historique ── */}
              <div>
                <DateFilter
                  value={codDatePreset}
                  onChange={setCodDatePreset}
                  from={codDateFrom}
                  onFromChange={setCodDateFrom}
                  to={codDateTo}
                  onToChange={setCodDateTo}
                  tone="amber"
                />
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    value={codSearch}
                    onChange={e => setCodSearch(e.target.value)}
                    placeholder="Rechercher COD: code colis, client, téléphone, ville, statut..."
                    className="w-full bg-white border border-gray-200 pl-9 pr-10 py-2.5 rounded-xl text-sm focus:border-amber-500 focus:outline-none"
                  />
                  {codSearch && (
                    <button
                      onClick={() => setCodSearch('')}
                      className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition"
                      aria-label="Effacer la recherche COD"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 px-1 mt-2">
                  {filteredCodParcels.length} colis COD
                  {codSearch && ` trouvé(s) sur ${dateFilteredCodParcels.length}`}
                </p>
              </div>

              {!allCodParcels && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-blue-800">📂 Historique</p>
                    <p className="text-xs text-blue-600 mt-0.5">Inclure tous les colis COD existants</p>
                  </div>
                  <button onClick={handleLoadAllCod} disabled={codLoadingAll}
                    className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                    {codLoadingAll ? <>{spinner} Chargement…</> : '🔄 Charger tout'}
                  </button>
                </div>
              )}

              {/* ════ RÔLE : AGENT DESTINATAIRE ════ */}
              {(() => {
                const openRequests = agentCodRequests.filter(r => r.status !== 'resolved')
                if (openRequests.length === 0) return null
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-amber-100 border-b border-amber-200 flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-amber-700" />
                      <h3 className="font-black text-amber-900 text-sm">Demandes Admin - Reglement COD</h3>
                      <span className="ml-auto bg-amber-200 text-amber-800 text-xs font-black px-2 py-0.5 rounded-full">
                        {openRequests.length}
                      </span>
                    </div>
                    <div className="divide-y divide-amber-100">
                      {openRequests.map(req => {
                        const parcel = merged.find(p => p.id === req.parcelId || p.trackingId === req.trackingId)
                        const isBusy = codRequestBusy === req.id
                        return (
                          <div key={req.id} className="p-4 bg-white">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{req.trackingId}</span>
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{fmtAmt(req.codAmount)} DH</span>
                                </div>
                                <p className="text-sm font-bold text-gray-800 mt-2">{req.message}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  Expediteur: {req.senderName || '-'} - Destinataire: {req.receiverName || '-'}
                                </p>
                                {(req.replies || []).map((rep, idx) => (
                                  <p key={idx} className="text-xs mt-2 bg-gray-50 rounded-lg px-2 py-1 text-gray-700">
                                    <b>{rep.authorRole === 'admin' ? 'Admin' : 'Moi'}:</b> {rep.message}
                                  </p>
                                ))}
                              </div>
                              <div className="shrink-0 text-right">
                                {parcel?.codSenderPaid ? (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">Regle</span>
                                ) : parcel ? (
                                  <button onClick={() => handleSettleCodFromRequest(req, parcel)} disabled={isBusy}
                                    className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl">
                                    {isBusy ? 'Traitement...' : 'Regler COD'}
                                  </button>
                                ) : (
                                  <button onClick={handleLoadAllCod} disabled={codLoadingAll}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl">
                                    Charger colis
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <input
                                value={codRequestDrafts[req.id] || ''}
                                onChange={e => setCodRequestDrafts(d => ({ ...d, [req.id]: e.target.value }))}
                                placeholder="Repondre a l'Admin..."
                                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                              />
                              <button onClick={() => handleReplyCodRequest(req)} disabled={isBusy}
                                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl">
                                Envoyer
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {dstHasData && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">En tant qu'agence destinataire</span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>

                  {/* Étape 2b : COD collecté par chauffeur — agent dest. doit réceptionner */}
                  <SectionCard icon="🤝" title="Collectés par le chauffeur — à réceptionner" count={dst_collected.length} total={totDstCollect} colorClass="border-red-100 bg-red-50">
                    {dst_collected.map(p => {
                      const isReceptioning = codReceptioning === p.id
                      return (
                        <PRow key={p.id} p={p}
                          badge={<span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Collecté par chauffeur</span>}
                          action={
                            <button onClick={() => handleReceptionCod(p)} disabled={isReceptioning}
                              className="mt-1 flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                              {isReceptioning ? <>{spinner} …</> : <>🤝 Réceptionner</>}
                            </button>
                          }
                        />
                      )
                    })}
                  </SectionCard>

                  {/* Étape 3→4 : Réceptionnés — à envoyer à l'agence expéditeur */}
                  <SectionCard icon="📤" title="Réceptionnés — à envoyer à l'agence expéditeur" count={dst_aEnvoyer.length} total={totDstEnvoy} colorClass="border-orange-100 bg-orange-50">
                    {dst_aEnvoyer.map(p => {
                      const isSending = codSending === p.id
                      return (
                        <PRow key={p.id} p={p}
                          badge={<span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Réceptionné ✓</span>}
                          action={
                            <button onClick={() => handleMarkSentToSource(p)} disabled={isSending}
                              className="mt-1 flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                              {isSending ? <>{spinner} …</> : <>📤 Envoyé à l'agence source</>}
                            </button>
                          }
                        />
                      )
                    })}
                  </SectionCard>

                  {/* Étape 4 : Envoyés — en attente de confirmation source */}
                  <SectionCard icon="🔄" title="Envoyés — en attente de confirmation" count={dst_envoye.length} total={0} colorClass="border-blue-100 bg-blue-50">
                    {dst_envoye.map(p => (
                      <PRow key={p.id} p={p}
                        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Envoyé le {fmtDate(p.codSentToSourceAt)}</span>}
                        action={null}
                      />
                    ))}
                  </SectionCard>
                </div>
              )}

              {/* ════ RÔLE : AGENT EXPÉDITEUR ════ */}
              {src.length > 0 && (
              <div className="space-y-3">
                {dstHasData && (
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">En tant qu'agence expéditeur</span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                )}

                {/* Étape 1–3 : Collecte en cours */}
                <SectionCard icon="🚚" title="En cours de collecte" count={src_enCours.length} total={totSrcPending} colorClass="border-yellow-100 bg-yellow-50">
                  {src_enCours.map(p => {
                    const cs = COD_STATUS[p.codStatus || 'pending']
                    return (
                      <PRow key={p.id} p={p}
                        badge={<span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cs.bg} ${cs.text}`}>{cs.label}</span>}
                        action={null}
                      />
                    )
                  })}
                </SectionCard>

                {/* Étape 3→4 : Remis agence dest., agent dest. doit envoyer */}
                <SectionCard icon="⏳" title="Chez l'agence destinataire — en attente d'envoi" count={src_remisAgent.length} total={totSrcRemis} colorClass="border-orange-100 bg-orange-50">
                  {src_remisAgent.map(p => (
                    <PRow key={p.id} p={p}
                      badge={<span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Remis agence dest.</span>}
                      action={null}
                    />
                  ))}
                </SectionCard>

                {/* Étape 5 : En route — à confirmer réception */}
                <SectionCard icon="📥" title="Valeurs en route — confirmer réception" count={src_enRoute.length} total={totSrcEnRoute} colorClass="border-blue-100 bg-blue-50">
                  {src_enRoute.map(p => {
                    const isConfirming = codConfirming === p.id
                    return (
                      <PRow key={p.id} p={p}
                        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">Envoyé le {fmtDate(p.codSentToSourceAt)}</span>}
                        action={
                          <button onClick={() => handleConfirmReceived(p)} disabled={isConfirming}
                            className="mt-1 flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                            {isConfirming ? <>{spinner} …</> : <>📥 Reçu</>}
                          </button>
                        }
                      />
                    )
                  })}
                </SectionCard>

                {/* Étape 6 : Valeurs reçues — régler avec l'expéditeur */}
                <SectionCard icon="💵" title="Reçu — à régler avec l'expéditeur" count={src_aConfirmer.length} total={totSrcAConf} colorClass="border-green-100 bg-green-50">
                  {src_aConfirmer.length > 1 && (
                    <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex items-center justify-between">
                      <span className="text-xs text-green-700 font-semibold">{src_aConfirmer.length} COD · {fmt(totSrcAConf)} DH</span>
                      <button onClick={() => handleBatchSettle(src_aConfirmer)} disabled={batchSettling}
                        className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-lg font-bold transition">
                        {batchSettling ? <>{spinner} …</> : '✅ Tout régler'}
                      </button>
                    </div>
                  )}
                  {src_aConfirmer.map(p => {
                    const isSettling = codSettling === p.id
                    return (
                      <PRow key={p.id} p={p}
                        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Valeurs reçues ✓</span>}
                        action={
                          <button onClick={() => handleSettleCod(p)} disabled={isSettling}
                            className="mt-1 flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                            {isSettling ? <>{spinner} …</> : <><Check className="w-3 h-3" /> Régler</>}
                          </button>
                        }
                      />
                    )
                  })}
                </SectionCard>

                {/* Régularisation données existantes */}
                {(() => {
                  const oldRemis = src.filter(p => p.codStatus === 'remis' && !p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)
                  if (oldRemis.length <= 1) return null
                  const total = oldRemis.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-amber-800">🗂️ Données existantes</p>
                        <p className="text-xs text-amber-700 mt-0.5">{oldRemis.length} COD anciens · {fmt(total)} DH — déjà réglés avant ce système ?</p>
                      </div>
                      <button onClick={() => handleBatchSettle(oldRemis)} disabled={batchSettling}
                        className="shrink-0 flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                        {batchSettling ? <>{spinner} …</> : '✅ Tout marquer réglé'}
                      </button>
                    </div>
                  )
                })()}

                {/* Historique réglés */}
                {src_regle.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span className="text-base">✅</span>
                      <h3 className="font-bold text-gray-700 text-sm">Réglés avec expéditeur</h3>
                      <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{src_regle.length}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {src_regle.slice(0, 20).map(p => {
                        const st = stMap[p.serviceType]
                        return (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono text-gray-400">{p.trackingId}</p>
                              <p className="text-sm font-semibold text-gray-700">{p.sender?.name || '—'}</p>
                              <p className="text-xs text-gray-400">{st?.emoji || '💵'} {st?.label || ''} · réglé le {fmtDate(p.codSenderPaidAt)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-black text-green-600">{fmtAmt(p.codAmount)} DH</p>
                              <span className="text-[10px] text-green-500 font-semibold">✓ Réglé</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

              </div>
              )}

              {filteredCodParcels.length === 0 && !codLoadingAll && (
                <div className="text-center py-16 text-gray-400">
                  <span className="text-4xl">📦</span>
                  <p className="text-sm mt-3 font-medium">Aucun colis COD</p>
                  <p className="text-xs mt-1">Chargez l'historique pour les anciens colis.</p>
                </div>
              )}
            </div>
          )
        })()}

        {/* ══ TAB MES CLIENTS ══ */}
        {tab === 'clients' && (() => {
          const fmt = n => (n || 0).toLocaleString('fr-MA')
          // Tous les clients de la ville de l'agent (isolés par ville)
          const cityClients = profile?.city ? clients.filter(c => c.city === profile.city) : clients
          const q = clientsSearch.toLowerCase().trim()
          const filtered = q
            ? cityClients.filter(c =>
                c.name?.toLowerCase().includes(q) ||
                c.tel?.includes(q) ||
                c.address?.toLowerCase().includes(q)
              )
            : cityClients
          return (
            <div className="mt-4 space-y-4">
              {/* Header */}
              <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-5 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-200 text-xs font-medium uppercase tracking-wider">Base de données</p>
                    <h2 className="font-black text-xl mt-0.5">👥 Clients</h2>
                    <p className="text-green-300 text-xs mt-1">Agence {profile?.city}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-green-200 text-xs">Total</p>
                    <p className="text-2xl font-black">{cityClients.length}</p>
                  </div>
                </div>
              </div>

              {/* Recherche + Ajouter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    placeholder="Rechercher (nom, tél, adresse…)"
                    value={clientsSearch}
                    onChange={e => setClientsSearch(e.target.value)}
                    className="w-full bg-white border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => setAgentNewClient({ name: '', tel: '', address: '', accountType: 'cash', remise: '' })}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition shrink-0"
                >
                  <Plus className="w-4 h-4" /> Nouveau
                </button>
              </div>

              {/* Tableau */}
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{cityClients.length === 0 ? 'Aucun client enregistré' : 'Aucun résultat'}</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Client', 'Téléphone', 'Type', 'Remise', 'Solde', ''].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(c => {
                        const d = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt || 0)
                        return (
                          <tr key={c.id} className="border-b border-gray-50 hover:bg-green-50/40 transition">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-gray-800">{c.name}</p>
                              {c.address && <p className="text-xs text-gray-400">{c.address}</p>}
                              <p className="text-xs text-gray-300">{d.toLocaleDateString('fr-MA')}</p>
                            </td>
                            <td className="px-4 py-3">
                              {c.tel
                                ? <a href={`tel:${c.tel}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                                    <Phone className="w-3 h-3" />{c.tel}
                                  </a>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.accountType === 'compte' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {c.accountType === 'compte' ? 'En compte' : 'Comptant'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {(c.remise || 0) > 0
                                ? <span className="text-green-600 font-semibold">{c.remise}%</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-bold text-sm ${(c.balance || 0) > 0 ? 'text-orange-600' : (c.balance || 0) < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                {(c.balance || 0) === 0 ? '—' : `${(c.balance || 0) > 0 ? '+' : ''}${fmt(c.balance)} DH`}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => setAgentNewClient({
                                  id:          c.id,
                                  name:        c.name || '',
                                  tel:         c.tel  || '',
                                  address:     c.address || '',
                                  accountType: c.accountType || 'cash',
                                  remise:      c.remise || '',
                                })}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── MODAL NOUVEAU CLIENT (AGENT) ── */}
        {agentNewClient && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  {agentNewClient?.id ? 'Modifier le client' : 'Nouveau client'}
                </h3>
                <button onClick={() => setAgentNewClient(null)} className="p-1.5 hover:bg-gray-100 rounded-xl transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Nom *</label>
                  <input
                    placeholder="Nom complet"
                    value={agentNewClient.name}
                    onChange={e => setAgentNewClient(m => ({ ...m, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Téléphone</label>
                  <input
                    placeholder="06XXXXXXXX"
                    value={agentNewClient.tel}
                    onChange={e => setAgentNewClient(m => ({ ...m, tel: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Adresse</label>
                  <input
                    placeholder="Adresse"
                    value={agentNewClient.address}
                    onChange={e => setAgentNewClient(m => ({ ...m, address: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Type</label>
                    <select value={agentNewClient.accountType} onChange={e => setAgentNewClient(m => ({ ...m, accountType: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none bg-white">
                      <option value="cash">Comptant</option>
                      <option value="compte">En compte</option>
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Remise %</label>
                    <input type="number" min="0" max="100" step="0.5"
                      placeholder="0"
                      value={agentNewClient.remise}
                      onChange={e => setAgentNewClient(m => ({ ...m, remise: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-500 focus:outline-none"
                    />
                  </div>
                </div>
                {!agentNewClient?.id && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-sm text-gray-500">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    Ville : <span className="font-semibold text-gray-700">{profile?.city}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button onClick={() => setAgentNewClient(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition text-sm">
                  Annuler
                </button>
                <button
                  onClick={handleAgentCreateClient}
                  disabled={!agentNewClient.name?.trim() || agentClientSaving}
                  className="py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold transition text-sm flex items-center justify-center gap-2"
                >
                  {agentClientSaving
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><Check className="w-4 h-4" /> Enregistrer</>}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ── MODAL COLLECTE COD ── */}
      {codCollectModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">
                  {codCollectModal.withDelivery ? 'Retrait agence — Encaisser COD' : 'Collecter le COD'}
                </h3>
                <p className="text-xs font-mono text-orange-600 mt-0.5">{codCollectModal.parcel?.trackingId}</p>
              </div>
              <button
                onClick={() => setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })}
                className="p-2 hover:bg-gray-100 rounded-xl transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-orange-700 font-medium">Montant COD</span>
              <span className="text-xl font-black text-orange-600">{codCollectModal.parcel?.codAmount} DH</span>
            </div>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Mode de paiement</p>
            {(() => {
              const NON_CASH = ['cheque', 'traite', 'bon_livraison', 'retour_bl']
              const lockedType = serviceToPaymentType(codCollectModal.parcel?.serviceType)
              const isLocked = NON_CASH.includes(lockedType)
              const lockedDef = COD_PAYMENT_TYPES.find(t => t.key === lockedType)
              if (isLocked) {
                return (
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 mb-5`}>
                    <span className="text-xl">{lockedDef?.emoji}</span>
                    <span className="font-bold text-blue-700">{lockedDef?.label}</span>
                    <span className="ml-auto text-xs text-blue-400 font-medium">Défini à la création</span>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {COD_PAYMENT_TYPES.map(pt => (
                    <button key={pt.key}
                      onClick={() => setCodCollectModal(m => ({ ...m, paymentType: pt.key }))}
                      className={`flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                        codCollectModal.paymentType === pt.key
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-base">{pt.emoji}</span> {pt.label}
                    </button>
                  ))}
                </div>
              )
            })()}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleAgentCollectCod}
                disabled={!codCollectModal.paymentType || codCollectModal.loading}
                className="py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold transition flex items-center justify-center gap-2"
              >
                {codCollectModal.loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> En cours...</>
                  : <><Banknote className="w-4 h-4" /> {codCollectModal.withDelivery ? 'Encaisser & Livrer' : 'Confirmer'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL COLLECTE PORT DÛ ── */}
      {portCollectModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <div>
                <h3 className="font-bold text-gray-800">Encaisser le port dû</h3>
                <p className="text-xs font-mono text-orange-600 mt-0.5">{portCollectModal.parcel?.trackingId}</p>
              </div>
              <button onClick={() => setPortCollectModal({ open: false, parcel: null, paymentType: '', loading: false })}
                className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-600">Destinataire</p>
                  <p className="text-sm font-bold text-orange-800">{portCollectModal.parcel?.receiver?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-orange-600">Frais de port</p>
                  <p className="text-xl font-black text-orange-600">{portCollectModal.parcel?.price || 0} DH</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode de paiement</p>
              <div className="grid grid-cols-2 gap-2">
                {COD_PAYMENT_TYPES.map(pt => (
                  <button key={pt.key}
                    onClick={() => setPortCollectModal(m => ({ ...m, paymentType: pt.key }))}
                    className={`flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold border-2 transition ${
                      portCollectModal.paymentType === pt.key
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-base">{pt.emoji}</span> {pt.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => setPortCollectModal({ open: false, parcel: null, paymentType: '', loading: false })}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAgentCollectPort}
                  disabled={!portCollectModal.paymentType || portCollectModal.loading}
                  className="py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold transition flex items-center justify-center gap-2"
                >
                  {portCollectModal.loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> En cours...</>
                    : <><Banknote className="w-4 h-4" /> Encaisser & Livrer</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIRMATION SUPPRESSION ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-800">Supprimer ce colis ?</h3>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-mono font-semibold text-gray-700">{deleteConfirm.trackingId}</span>
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {deleteConfirm.sender?.city} → {deleteConfirm.receiver?.city} · {deleteConfirm.receiver?.name}
              </p>
              <p className="text-xs text-red-400 mt-2">Cette action est irréversible.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button onClick={() => confirmDelete(deleteConfirm)}
                className="py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
