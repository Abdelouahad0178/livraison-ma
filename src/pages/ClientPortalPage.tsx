import { useEffect, useMemo, useRef, useState } from 'react'
import { signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore'
import { useParams } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import {
  createModificationRequest, subscribeClientModificationRequests, deleteModificationRequest,
  subscribeClientParcels, subscribeClientPayments, subscribeDestinataireDeliveries,
} from '../firebase/clients'
import { createClientPortalParcel } from '../firebase/firestore'
import {
  updatePortalParcel, cancelPortalParcel, updateModificationRequest,
  replyToModificationRequest, confirmDeliveryReceipt, reportDeliveryIssue,
  requestPreDeliveryChange
} from '../firebase/clientPortalActions'
import {
  approveModificationRequest, rejectModificationRequest
} from '../firebase/applyModification'
import {
  CITIES, COD_PAYMENT_TYPES, COD_STATUS, STATUS_COLORS, calculateTariff,
  MOD_TYPES, COD_TYPE_OPTIONS,
} from '../firebase/constants'
import CompanyContact from '../components/CompanyContact'
import SignatureViewerModal from '../components/SignatureViewerModal'
import ParcelDetailsModal from '../components/ParcelDetailsModal'
import {
  EditParcelModal, CancelParcelModal, EditModRequestModal,
  ConfirmDeliveryModal, ReportIssueModal
} from '../components/ClientPortalModals'
import {
  ArrowRight, CheckCircle2, ClipboardList, FileText, Home, KeyRound, Lock,
  LogOut, Mail, MessageCircle, Package, PackagePlus, PenLine, Phone, Search,
  Send, ShieldCheck, Truck, Wallet, X, Edit3, Trash2, AlertTriangle, Star,
  ThumbsUp, MessageSquare, Clock, Eye,
} from 'lucide-react'
import { fmt } from '../utils/formatNumber'


const asDate = (value: any) => value?.toDate ? value.toDate() : new Date(value || 0)
const fmtDate = (v: any) => v ? asDate(v).toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-'

const MOD_STATUS = {
  pending:  { label: 'En attente', bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { label: 'Approuvée',  bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { label: 'Refusée',    bg: 'bg-red-100',   text: 'text-red-700'   },
}

const codPaymentLabel = (parcel: any) => {
  const type = COD_PAYMENT_TYPES.find(t => t.key === (parcel.codPaymentType || parcel.serviceType))
  return type ? type.label : '-'
}

const clientCodStatus = (parcel: any) => {
  if (parcel.codSenderPaid) return { label: 'Regle expediteur', color: 'bg-green-100 text-green-700' }
  if (parcel.codReceivedBySource) return { label: 'Recu agence source', color: 'bg-emerald-100 text-emerald-700' }
  if (parcel.codSentToSource) return { label: 'Envoye agence source', color: 'bg-blue-100 text-blue-700' }
  if (parcel.codStatus === 'remis') return { label: 'Remis agence', color: 'bg-teal-100 text-teal-700' }
  if (parcel.codStatus === 'collected') return { label: 'Collecte', color: 'bg-sky-100 text-sky-700' }
  const base = COD_STATUS[parcel.codStatus || 'pending'] || { label: 'En attente', bg: 'bg-orange-100', text: 'text-orange-700' }
  return { label: base.label, color: `${base.bg} ${base.text}` }
}

export default function ClientPortalPage() {
  const { clientId: routeClientId } = useParams()
  const [profile, setProfile] = useState<any>(null)
  const [client, setClient] = useState<any>(null)
  const [parcels, setParcels] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [modRequests, setModRequests] = useState<any[]>([])
  const [receivedRequests, setReceivedRequests] = useState<any[]>([])
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [modForm, setModForm] = useState({ parcelId: '', modificationType: '', newValue: '', note: '' })
  const [parcelForm, setParcelForm] = useState({
    receiverName: '',
    receiverTel: '',
    receiverAddress: '',
    receiverCity: '',
    weight: '',
    nbColis: '1',
    natureOfGoods: '',
    serviceType: 'simple',
    codAmount: '',
    portType: 'port_en_compte_expediteur',
  })
  const [parcelSending, setParcelSending] = useState(false)
  const [parcelError, setParcelError] = useState('')
  const [parcelSuccess, setParcelSuccess] = useState('')
  const [modSending, setModSending] = useState(false)
  const [modError, setModError] = useState('')
  const [modSuccess, setModSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewSig, setViewSig] = useState<any>(null)

  // Nouveaux états CRUD
  const [viewingParcel, setViewingParcel] = useState<any>(null)
  const [editingParcel, setEditingParcel] = useState<any>(null)
  const [deletingParcel, setDeletingParcel] = useState<any>(null)
  const [editingModRequest, setEditingModRequest] = useState<any>(null)
  const [replyingToRequest, setReplyingToRequest] = useState<any>(null)
  const [confirmingDelivery, setConfirmingDelivery] = useState<any>(null)
  const [reportingIssue, setReportingIssue] = useState<any>(null)
  const [requestingChange, setRequestingChange] = useState<any>(null)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!routeClientId) return
    if (!uid) {
      setLoading(false)
      return
    }

    let unsubClient: any = null

    // Charger l'utilisateur
    getDoc(doc(db, 'users', uid)).then(async (snap) => {
      const data = snap.exists() ? snap.data() : null

      // Redirection automatique si l'URL ne correspond pas
      if (data?.clientId && data.clientId !== routeClientId) {
        window.location.href = `/clients/${data.clientId}`
        return
      }

      // Définir le profil
      setProfile({ ...(data || {}), clientId: routeClientId })

      // Essayer de charger le client avec getDoc (au lieu de onSnapshot)
      try {
        const clientSnap = await getDoc(doc(db, 'clients', routeClientId))

        if (clientSnap.exists()) {
          const clientData: any = { id: clientSnap.id, ...clientSnap.data() }
          const allowedByUser = data?.clientId === routeClientId
          const allowedByClient = clientData.portalUid === uid

          if (allowedByUser || allowedByClient) {
            setClient(clientData)
          } else {
            console.warn('⚠️ Accès refusé au client')
          }
        }
      } catch (error: any) {
        // Pas grave, on continuera avec les données du user
      }

      setLoading(false)
    }).catch(() => setLoading(false))

    return () => { if (unsubClient) unsubClient() }
  }, [routeClientId])

  useEffect(() => {
    if (!profile?.clientId || profile.clientId !== routeClientId) return

    // Handler d'erreur silencieux pour les destinataires qui n'ont pas de colis en tant qu'expéditeur
    const handleError = (err?: any) => {
      if (err?.code && err.code !== 'permission-denied') {
        console.warn('Erreur chargement données client:', err.code)
      }
    }

    // Si client pas chargé, considérer comme expéditeur par défaut
    const isDestinataire = client?.isDestinataire === true
    const isExpediteur = !client || client.isExpediteur !== false
    const unsubs: Array<() => void> = []

    if (isExpediteur) {
      unsubs.push(subscribeClientParcels(profile.clientId, (parcels) => {
        setParcels(parcels)
      }, handleError))
      unsubs.push(subscribeClientPayments(profile.clientId, setPayments, handleError))
    } else {
      setPayments([])
    }

    unsubs.push(subscribeClientModificationRequests(profile.clientId, setModRequests, handleError))

    // Si client chargé ET destinataire, charger AUSSI les livraisons
    if (isDestinataire && client) {
      unsubs.push(subscribeDestinataireDeliveries(client, (deliveries) => {
        // Fusionner avec les colis existants (éviter doublons)
        setParcels(prev => {
          const allParcels = [...prev, ...deliveries]
          const uniqueMap = new Map()
          allParcels.forEach(p => uniqueMap.set(p.id, p))
          return Array.from(uniqueMap.values())
        })
      }, handleError))
    }

    return () => unsubs.forEach(unsub => unsub())
  }, [profile?.clientId, routeClientId, client])

  // Charger les demandes reçues (pour expéditeurs)
  useEffect(() => {
    if (!client?.id) return

    // Si ce n'est pas un expéditeur, pas besoin de charger les demandes reçues
    const isExpediteur = !client || client.isExpediteur !== false
    if (!isExpediteur) return

    // Charger les demandes où requestedBy = "destinataire" ET targetClientId = client.id
    const q = query(
      collection(db, 'modificationRequests'),
      where('targetClientId', '==', client.id),
      where('requestedBy', '==', 'destinataire'),
      orderBy('createdAt', 'desc')
    )

    return onSnapshot(q, (snap) => {
      setReceivedRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.warn('Erreur chargement demandes reçues:', error)
      }
    })
  }, [client?.id])

  const filteredParcels = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return parcels
    return parcels.filter(p =>
      p.trackingId?.toLowerCase().includes(q) ||
      p.receiver?.name?.toLowerCase().includes(q) ||
      p.receiver?.city?.toLowerCase().includes(q) ||
      p.receiver?.tel?.includes(q)
    )
  }, [parcels, search])

  const stats = useMemo(() => {
    const debit = payments.filter(p => p.type === 'debit').reduce((s, p) => s + (p.amount || 0), 0)
    const credit = payments.filter(p => p.type === 'credit').reduce((s, p) => s + (p.amount || 0), 0)
    const codParcels = parcels.filter(p => parseFloat(p.codAmount) > 0)
    return {
      parcels: parcels.length,
      active: parcels.filter(p => !['Livré', 'Retourné'].includes(p.status)).length,
      balance: debit - credit,
      pendingMods: modRequests.filter(m => m.status === 'pending').length,
      codCount: codParcels.length,
      codTotal: codParcels.reduce((s, p) => s + (parseFloat(p.codAmount) || 0), 0),
      codCollected: codParcels.filter(p => ['collected', 'remis'].includes(p.codStatus) || p.codSentToSource || p.codReceivedBySource || p.codSenderPaid).reduce((s, p) => s + (parseFloat(p.codAmount) || 0), 0),
      codPaid: codParcels.filter(p => p.codSenderPaid).reduce((s, p) => s + (parseFloat(p.codAmount) || 0), 0),
    }
  }, [parcels, payments, modRequests])

  const codParcels = useMemo(() => parcels.filter(p => parseFloat(p.codAmount) > 0), [parcels])

  const selectedModParcel = parcels.find(p => p.id === modForm.parcelId)
  const portalPrice = useMemo(
    () => calculateTariff(parcelForm.receiverCity, parseFloat(parcelForm.weight) || 0, parseInt(parcelForm.nbColis) || 1),
    [parcelForm.receiverCity, parcelForm.weight, parcelForm.nbColis]
  )
  const pf = (field: any) => (e: any) => setParcelForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleCreateParcelRequest = async (e: any) => {
    e.preventDefault()
    setParcelError('')
    setParcelSuccess('')
    const clientCity = client?.city || profile?.city || ''
    if (!clientCity) {
      setParcelError("Votre fiche client n'a pas de ville. Contactez l'admin.")
      return
    }
    if (!parcelForm.receiverName.trim() || !parcelForm.receiverTel.trim() || !parcelForm.receiverAddress.trim() || !parcelForm.receiverCity) {
      setParcelError('Destinataire, telephone, adresse et ville sont obligatoires.')
      return
    }
    setParcelSending(true)
    try {
      const parcel = await createClientPortalParcel({
        clientId: client.id,
        clientUid: auth.currentUser?.uid || '',
        clientName: client.name || profile?.name || '',
        sender: {
          name: client.name || profile?.name || '',
          nic: client.nic || '',
          address: client.address || '',
          tel: client.tel || profile?.tel || '',
          city: clientCity,
        },
        receiver: {
          name: parcelForm.receiverName.trim(),
          address: parcelForm.receiverAddress.trim(),
          tel: parcelForm.receiverTel.trim(),
          city: parcelForm.receiverCity,
        },
        weight: parseFloat(parcelForm.weight) || 0,
        nbColis: parseInt(parcelForm.nbColis) || 1,
        natureOfGoods: parcelForm.natureOfGoods.trim(),
        serviceType: parcelForm.serviceType,
        codAmount: parcelForm.serviceType === 'simple' || parcelForm.serviceType === 'retour_bl' ? 0 : (parseFloat(parcelForm.codAmount) || 0),
        portType: parcelForm.portType,
        price: portalPrice,
      })
      setParcelForm({
        receiverName: '',
        receiverTel: '',
        receiverAddress: '',
        receiverCity: '',
        weight: '',
        nbColis: '1',
        natureOfGoods: '',
        serviceType: 'simple',
        codAmount: '',
        portType: 'port_en_compte_expediteur',
      })
      setParcelSuccess(`Demande envoyee a l'agence de ${clientCity}. Reference: ${parcel.trackingId}`)
    } catch (err: any) {
      setParcelError(err?.message || "Impossible d'envoyer la demande de colis.")
    } finally {
      setParcelSending(false)
    }
  }

  const handleSubmitModification = async (e: any) => {
    e.preventDefault()
    setModError('')
    setModSuccess('')
    if (!modForm.parcelId) { setModError('Choisissez le colis concerne.'); return }
    if (!modForm.modificationType) { setModError('Choisissez le type de modification.'); return }
    if (!modForm.newValue.trim()) { setModError('Indiquez la nouvelle valeur demandee.'); return }
    const parcel = parcels.find(p => p.id === modForm.parcelId)
    if (!parcel) return
    if (parcel.status === 'Livré' && modForm.modificationType === 'annulation') {
      setModError('Ce colis est deja livre : son statut Livré ne peut pas etre modifie.')
      return
    }
    const modType = MOD_TYPES.find(t => t.key === modForm.modificationType)
    let currentValue = ''
    switch (modForm.modificationType) {
      case 'type_paiement': currentValue = parcel.serviceType || ''; break
      case 'adresse':       currentValue = parcel.receiver?.address || ''; break
      case 'telephone':     currentValue = parcel.receiver?.tel || ''; break
      case 'nom':           currentValue = parcel.receiver?.name || ''; break
      case 'montant_cod':   currentValue = String(parcel.codAmount || 0); break
      case 'annulation':    currentValue = parcel.status || ''; break
    }
    setModSending(true)
    try {
      // Vérifier que client existe
      if (!client || !client.id) {
        setModError('Erreur: Informations client manquantes')
        setModSending(false)
        return
      }

      // Pour les destinataires, utiliser le clientId de l'expéditeur (parcel.clientId)
      // Pour les expéditeurs, utiliser leur propre clientId (client.id)
      const targetClientId = isDestinataire && !client.isExpediteur
        ? parcel.clientId  // Demande envoyée au client expéditeur
        : client.id        // Demande du client expéditeur lui-même

      // Déterminer le type de workflow
      const workflowType = isDestinataire && !client.isExpediteur
        ? 'destinataire_to_expediteur'
        : 'expediteur_to_transporteur'

      await createModificationRequest({
        parcelId:         parcel.id,
        trackingId:       parcel.trackingId || '',
        clientId:         targetClientId,
        clientUid:        auth.currentUser?.uid || '',
        clientName:       client.name || profile?.name || '',
        clientEmail:      auth.currentUser?.email || '',
        agencyCity:       parcel.originCity || parcel.sender?.city || client.city || '',
        parcelStatus:     parcel.status || '',
        modificationType: modForm.modificationType,
        typeLabel:        modType?.label || modForm.modificationType,
        currentValue,
        newValue:         modForm.newValue.trim(),
        note:             modForm.note.trim(),
        // Type de workflow
        type:             workflowType,
        // Indiquer qui a fait la demande
        requestedBy:      isDestinataire && !client.isExpediteur ? 'destinataire' : 'expediteur',
        requestedByName:  client.name || profile?.name || '',
        requestedByClientId: client.id,
        // Pour les demandes destinataire → expéditeur
        targetClientId:   workflowType === 'destinataire_to_expediteur' ? targetClientId : undefined,
      })
      setModForm({ parcelId: '', modificationType: '', newValue: '', note: '' })
      setModSuccess('Votre demande a ete envoyee au chef d\'agence.')
      setTab('modifications')
    } catch (err: any) {
      setModError(err?.message || 'Impossible d\'envoyer la demande.')
    } finally {
      setModSending(false)
    }
  }

  const handleDeleteModRequest = async (id: any) => {
    if (!window.confirm('Annuler cette demande ?')) return
    try { await deleteModificationRequest(id) } catch (e: any) { alert(e?.message || 'Erreur') }
  }

  // Approuver une demande reçue
  const handleApproveRequest = async (requestId: string, requestType: string) => {
    const note = prompt('Note (optionnel) :')
    if (note === null) return // Annulé

    try {
      await approveModificationRequest(requestId, {
        role: 'expediteur',
        name: client.name || profile?.name || '',
        note: note || undefined
      })
      alert('✅ Demande acceptée et appliquée automatiquement !')
    } catch (error: any) {
      alert('❌ Erreur : ' + (error.message || 'Impossible d\'approuver'))
    }
  }

  // Refuser une demande reçue
  const handleRejectRequest = async (requestId: string) => {
    const reason = prompt('Raison du refus * :')
    if (!reason || !reason.trim()) {
      alert('Vous devez indiquer une raison')
      return
    }

    try {
      await rejectModificationRequest(requestId, {
        role: 'expediteur',
        name: client.name || profile?.name || '',
        reason: reason.trim()
      })
      alert('✅ Demande refusée')
    } catch (error: any) {
      alert('❌ Erreur : ' + (error.message || 'Impossible de refuser'))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-9 h-9 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!profile?.clientId || profile.clientId !== routeClientId || !client) {
    const wrongPortalLink = profile?.clientId && profile.clientId !== routeClientId
    return (
      <div className="min-h-screen bg-gray-50 overflow-x-hidden">
        <CompanyContact />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <img src="/LOGO.jpg" alt="BG Express" className="h-16 object-contain mx-auto mb-6" />
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
            <ShieldCheck className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h1 className="text-xl font-black text-gray-900">
              {wrongPortalLink ? 'Lien client non autorise' : "Portail en attente d'activation"}
            </h1>
            <p className="text-gray-500 mt-3 text-sm">
              {wrongPortalLink
                ? "Ce lien ne correspond pas a votre compte client. Demandez votre lien personnel a l'Admin."
                : "Votre compte client doit etre lie a une fiche client par l'Admin avant d'afficher vos donnees."}
            </p>
            <button onClick={() => signOut(auth)} className="mt-6 bg-red-50 text-red-600 px-4 py-2 rounded-xl font-semibold text-sm">
              Deconnexion
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Navigation différente pour destinataires vs expéditeurs
  const isDestinataire = client?.isDestinataire && !client?.isExpediteur

  const NAV_ITEMS = isDestinataire
    ? [
        // Vue simplifiée pour destinataires
        { key: 'overview',         label: 'Accueil',              Icon: Home },
        { key: 'parcels',          label: 'Mes livraisons',       Icon: Truck },
        { key: 'nouvelle-demande', label: 'Demande modif.',       Icon: PenLine },
        { key: 'modifications',    label: 'Mes demandes',         Icon: ClipboardList, badge: stats.pendingMods },
      ]
    : [
        // Vue complète pour expéditeurs
        { key: 'overview',          label: 'Accueil',         Icon: Home },
        { key: 'new',               label: 'Nouveau colis',   Icon: PackagePlus },
        { key: 'parcels',           label: 'Expéditions',     Icon: Truck },
        { key: 'cod',               label: 'Retour Fond',     Icon: Wallet },
        { key: 'invoices',          label: 'Factures',        Icon: FileText },
        { key: 'nouvelle-demande',  label: 'Demande modif.',  Icon: PenLine },
        { key: 'modifications',     label: 'Mes demandes',    Icon: ClipboardList, badge: stats.pendingMods },
        { key: 'received-requests', label: 'Demandes reçues', Icon: MessageCircle, badge: receivedRequests.filter(r => r.status === 'pending').length },
      ]

  const inputCls = "w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-50 bg-white transition"
  const selectCls = inputCls

  return (
    <div className="min-h-screen bg-slate-50">
      <CompanyContact />

      {/* HEADER */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-10 xl:px-16 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/LOGO.jpg" alt="logo" className="h-9 object-contain rounded-lg" />
            <div>
              <p className="font-black text-gray-900 text-sm leading-tight">{client.name}</p>
              <p className="text-[10px] text-gray-400 leading-tight">Portail client - {client.city || ''}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-xl font-semibold transition">
            <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-10 xl:px-16 py-5 pb-16">

        {/* HERO */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest">Bienvenue</p>
              <h2 className="text-2xl sm:text-3xl font-black mt-0.5">{client.name}</h2>
              <p className="text-blue-300 text-xs mt-1">{client.city}{client.address ? ` - ${client.address}` : ''}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {(isDestinataire
                ? [
                    // Stats pour destinataires
                    { label: 'Livraisons', value: stats.parcels,              sub: `${stats.active} en cours` },
                    { label: 'Demandes',   value: stats.pendingMods,          sub: 'en attente' },
                  ]
                : [
                    // Stats pour expéditeurs
                    { label: 'Total colis', value: stats.parcels,              sub: `${stats.active} en cours` },
                    { label: 'Solde',       value: `${fmt(Math.abs(stats.balance))} DH`, sub: stats.balance > 0 ? 'à régler' : 'OK', subColor: stats.balance > 0 ? 'text-red-200' : 'text-green-200' },
                    { label: 'Retour Fond', value: `${fmt(stats.codTotal)} DH`, sub: `${stats.codCount} colis` },
                    { label: 'Demandes',    value: stats.pendingMods,           sub: 'en attente' },
                  ]
              ).map(k => (
                <div key={k.label} className="bg-white/15 backdrop-blur-sm rounded-2xl px-3 py-2.5 min-w-[90px]">
                  <p className="text-blue-200 text-[9px] font-bold uppercase tracking-widest">{k.label}</p>
                  <p className="text-white font-black text-lg sm:text-xl leading-tight mt-0.5">{k.value}</p>
                  <p className={`text-[10px] mt-0.5 ${k.subColor || 'text-blue-300'}`}>{k.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LAYOUT : sidebar (desktop) + content */}
        <div className="flex gap-5 items-start">

          {/* Sidebar desktop */}
          <aside className="hidden lg:block w-52 xl:w-56 shrink-0 sticky top-[68px]">
            <nav className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-50">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Navigation</p>
              </div>
              {NAV_ITEMS.map(({ key, label, Icon, badge }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition text-left ${
                    tab === key
                      ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {(badge ?? 0) > 0 && (
                    <span className="w-5 h-5 bg-amber-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shrink-0">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Contact card dans sidebar */}
            <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contact</p>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-xs text-gray-700 font-semibold">Votre agence</span>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span className="text-xs text-gray-500 break-all">{auth.currentUser?.email || '-'}</span>
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Nav mobile/tablette */}
            <nav className="lg:hidden bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
              <div className="flex items-stretch min-w-max">
                {NAV_ITEMS.map(({ key, label, Icon, badge }) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`relative flex flex-col items-center gap-0.5 px-4 py-3 text-[11px] font-semibold transition whitespace-nowrap border-b-2 ${
                      tab === key
                        ? 'border-blue-600 text-blue-600 bg-blue-50/60'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}>
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                    {(badge ?? 0) > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </nav>

            {/* ACCUEIL */}
            {tab === 'overview' && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(isDestinataire
                    ? [
                        // Infos pour destinataires
                        { Icon: Truck, title: 'Mes livraisons',    text: 'Suivez en temps réel les colis qui vous sont destinés.' },
                        { Icon: KeyRound, title: 'Confidentialité', text: 'Vos identifiants sont personnels. Ne les partagez jamais.' },
                        { Icon: PenLine, title: 'Demande modif.',   text: "Pour toute correction (adresse, téléphone...), utilisez l'onglet Demande modif." },
                      ]
                    : [
                        // Infos pour expéditeurs
                        { Icon: Lock, title: 'Accès limité',    text: 'Vous voyez uniquement les données liées à votre fiche client.' },
                        { Icon: KeyRound, title: 'Confidentialité', text: 'Vos identifiants sont personnels. Ne les partagez jamais.' },
                        { Icon: PenLine, title: 'Demande modif.',  text: "Pour toute correction (adresse, téléphone...), utilisez l'onglet Demande modif." },
                      ]
                  ).map(({ Icon, title, text }) => (
                    <div key={title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <Icon className="w-6 h-6 mb-3 text-blue-600" />
                      <p className="font-bold text-gray-900">{title}</p>
                      <p className="text-sm text-gray-500 mt-2 leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
                <div className="lg:hidden bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-[180px]">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">Téléphone agence</p>
                      <p className="text-sm font-bold text-gray-900">Contactez votre agence</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-1 min-w-[180px]">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-400">Email</p>
                      <p className="text-sm font-bold text-gray-900 truncate">{auth.currentUser?.email || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NOUVEAU COLIS */}
            {tab === 'new' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-white px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <PackagePlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900">Nouveau colis</h3>
                    <p className="text-xs text-gray-400">Demande envoyée à l'agence de {client.city || '-'} pour validation</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  {parcelError && (
                    <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold flex gap-2 items-start">
                      <X className="w-4 h-4 shrink-0 mt-0.5" />{parcelError}
                    </div>
                  )}
                  {parcelSuccess && (
                    <div className="bg-green-50 border border-green-100 text-green-700 rounded-xl px-4 py-3 text-sm font-semibold flex gap-2 items-start">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{parcelSuccess}
                    </div>
                  )}
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-black shrink-0">
                      {client.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-xs text-blue-500 font-semibold">Expéditeur</p>
                      <p className="font-black text-gray-900 text-sm">{client.name}</p>
                      <p className="text-[11px] text-gray-500">{[client.tel, client.city].filter(Boolean).join(' - ')}</p>
                    </div>
                  </div>
                  <form onSubmit={handleCreateParcelRequest} autoComplete="off" className="space-y-4">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Destinataire</p>
                      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <input required value={parcelForm.receiverName} onChange={pf('receiverName')} placeholder="Nom *" className={inputCls} />
                        <input required value={parcelForm.receiverTel} onChange={pf('receiverTel')} placeholder="Téléphone *" className={inputCls} />
                        <select required value={parcelForm.receiverCity} onChange={pf('receiverCity')} className={selectCls}>
                          <option value="">Ville destination *</option>
                          {CITIES.map(city => <option key={city} value={city}>{city}</option>)}
                        </select>
                        <input value={parcelForm.natureOfGoods} onChange={pf('natureOfGoods')} placeholder="Nature marchandise" className={inputCls} />
                      </div>
                      <textarea required value={parcelForm.receiverAddress} onChange={pf('receiverAddress')} placeholder="Adresse complète *" rows={2} className={inputCls + " resize-none mt-3"} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Colis</p>
                      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <input required type="number" min="0" step="0.1" value={parcelForm.weight} onChange={pf('weight')} placeholder="Poids (kg) *" className={inputCls} />
                        <input required type="number" min="1" value={parcelForm.nbColis} onChange={pf('nbColis')} placeholder="Nb colis *" className={inputCls} />
                        <select value={parcelForm.serviceType} onChange={pf('serviceType')} className={selectCls}>
                          <option value="simple">Simple</option>
                          <option value="especes">Contre remboursement espèces</option>
                          <option value="cheque">Contre chèque</option>
                          <option value="traite">Contre traite</option>
                          <option value="retour_bl">Retour bon livraison</option>
                        </select>
                        {parcelForm.serviceType !== 'simple' && parcelForm.serviceType !== 'retour_bl' ? (
                          <input type="number" min="0" value={parcelForm.codAmount} onChange={pf('codAmount')} placeholder="Montant Retour Fond (DH)" className={inputCls} />
                        ) : (
                          <div className="rounded-xl bg-blue-50 border border-blue-100 px-3.5 py-3 text-sm font-bold text-blue-700 flex items-center">
                            Port : {fmt(portalPrice)} DH
                          </div>
                        )}
                      </div>
                      {parcelForm.serviceType !== 'simple' && parcelForm.serviceType !== 'retour_bl' && (
                        <div className="mt-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm font-bold text-blue-700">
                          Prix port estimé : {fmt(portalPrice)} DH
                        </div>
                      )}
                    </div>
                    <button disabled={parcelSending}
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl px-8 py-3 font-bold inline-flex items-center justify-center gap-2 transition">
                      <PackagePlus className="w-4 h-4" />
                      {parcelSending ? 'Envoi en cours...' : 'Envoyer pour validation'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* MES EXPEDITIONS */}
            {tab === 'parcels' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Rechercher : tracking, destinataire, ville..."
                      className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:border-blue-400 focus:outline-none shadow-sm" />
                    {search && (
                      <button onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 font-semibold">{filteredParcels.length} colis</span>
                </div>
                {filteredParcels.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold text-sm">Aucune expédition trouvée</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredParcels.map(p => {
                      const colors = STATUS_COLORS[p.status] || { bg: 'bg-gray-100', text: 'text-gray-700' }
                      const codState = clientCodStatus(p)
                      return (
                        <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-mono text-sm font-black text-blue-600 block">{p.trackingId}</span>
                              <p className="text-sm font-bold text-gray-800 mt-0.5 truncate">{p.sender?.name || '-'}</p>
                              <p className="text-[11px] text-gray-400 truncate">{p.sender?.city || ''}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-base font-black text-gray-800">{fmt(p.price)} DH</p>
                              <p className="text-[10px] text-gray-400">{asDate(p.createdAt || p.history?.[0]?.timestamp).toLocaleDateString('fr-MA')}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{p.status}</span>
                            {p.agentRole === 'client_portal' && p.validatedByChef === false && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">En attente</span>
                            )}
                            {p.codAmount > 0 && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${codState.color}`}>RF {fmt(p.codAmount)} DH - {codState.label}</span>
                            )}
                            {p.hasRetourBL && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🧾 Retour BL</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-50 flex-wrap">
                            {/* Bouton Voir détails (toujours visible) */}
                            <button onClick={() => setViewingParcel(p)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition">
                              <Eye className="w-3 h-3" /> Voir
                            </button>

                            {/* Boutons Edit/Delete pour colis portail non validés */}
                            {p.agentRole === 'client_portal' && p.validatedByChef !== true && !['Livré','Retourné','Annulé'].includes(p.status) && (
                              <>
                                <button onClick={() => setEditingParcel(p)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-xl transition">
                                  <Edit3 className="w-3 h-3" /> Modifier
                                </button>
                                <button onClick={() => setDeletingParcel(p)}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-xl transition">
                                  <Trash2 className="w-3 h-3" /> Annuler
                                </button>
                              </>
                            )}

                            {/* Bouton demande modif pour colis validés */}
                            {p.agentRole !== 'client_portal' || p.validatedByChef === true ? (
                              <button onClick={() => { setModForm(f => ({ ...f, parcelId: p.id })); setTab('nouvelle-demande') }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition">
                                <PenLine className="w-3 h-3" /> Demande modif
                              </button>
                            ) : null}

                            {/* Boutons destinataire */}
                            {isDestinataire && p.status === 'Livré' && !p.receiverConfirmedAt && (
                              <button onClick={() => setConfirmingDelivery(p)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-xl transition">
                                <ThumbsUp className="w-3 h-3" /> Confirmer réception
                              </button>
                            )}
                            {isDestinataire && p.status === 'Livré' && !p.hasDeliveryIssue && (
                              <button onClick={() => setReportingIssue(p)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-xl transition">
                                <AlertTriangle className="w-3 h-3" /> Signaler problème
                              </button>
                            )}

                            {/* Signature */}
                            {p.signatureConfirmedAt && (
                              <button onClick={() => setViewSig(p)}
                                className="flex items-center gap-1 text-xs font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-xl transition">
                                <PenLine className="w-3 h-3" /> Signature
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* RETOUR FOND */}
            {tab === 'cod' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-amber-500 to-yellow-600 rounded-3xl p-5 text-white shadow-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-amber-100 text-xs font-semibold uppercase tracking-widest">Suivi</p>
                      <h2 className="text-xl font-black mt-0.5">Mon Retour Fond</h2>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Total',    value: `${fmt(stats.codTotal)} DH` },
                        { label: 'Collecté', value: `${fmt(stats.codCollected)} DH` },
                        { label: 'Réglé',    value: `${fmt(stats.codPaid)} DH` },
                      ].map(k => (
                        <div key={k.label} className="bg-white/15 rounded-2xl px-3 py-2 text-center min-w-[80px]">
                          <p className="text-amber-100 text-[9px] font-bold uppercase tracking-widest">{k.label}</p>
                          <p className="text-white font-black text-sm leading-tight mt-0.5">{k.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {codParcels.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center text-gray-400">
                    <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold text-sm">Aucun colis Retour Fond</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {codParcels.map(p => {
                      const codState = clientCodStatus(p)
                      return (
                        <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-mono text-xs font-black text-blue-600">{p.trackingId}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${codState.color}`}>{codState.label}</span>
                              </div>
                              <p className="text-sm font-bold text-gray-800 truncate">{p.receiver?.name || '-'}</p>
                              <p className="text-[11px] text-gray-400">{p.receiver?.city || ''} - {codPaymentLabel(p)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-lg font-black text-amber-600">{fmt(p.codAmount)} DH</p>
                              {p.codSenderPaid && <span className="text-[10px] font-bold text-green-600">Réglé</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-50">
                            <div>
                              <p className="text-[10px] text-gray-400 font-semibold uppercase">Collecte</p>
                              <p className="text-xs text-gray-700 mt-0.5">{p.codCollectedAt ? fmtDate(p.codCollectedAt) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-400 font-semibold uppercase">Règlement</p>
                              <p className={`text-xs mt-0.5 ${p.codSenderPaid ? 'text-green-600 font-bold' : 'text-gray-500'}`}>
                                {p.codSenderPaid ? `Réglé ${fmtDate(p.codSenderPaidAt)}` : 'En attente'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* FACTURES */}
            {tab === 'invoices' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-gray-900 text-lg">Factures & paiements</h3>
                  <div className={`text-sm font-black px-3 py-1.5 rounded-xl ${stats.balance > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    Solde : {stats.balance > 0 ? '+' : ''}{fmt(stats.balance)} DH
                  </div>
                </div>
                {payments.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center text-gray-400">
                    <FileText className="w-9 h-9 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-semibold">Aucune facture</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.type === 'debit' ? 'bg-red-50' : 'bg-green-50'}`}>
                          {p.type === 'debit' ? <FileText className="w-4 h-4 text-red-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{p.description || (p.type === 'debit' ? 'Facture' : 'Paiement')}</p>
                          <p className="text-[11px] text-gray-400">
                            {asDate(p.createdAt).toLocaleDateString('fr-MA')}
                            {p.parcelId && ` - ${p.parcelId}`}
                          </p>
                        </div>
                        <p className={`text-sm font-black shrink-0 ${p.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                          {p.type === 'debit' ? '+' : '-'}{fmt(p.amount)} DH
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DEMANDE MODIFICATION */}
            {tab === 'nouvelle-demande' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-white px-5 py-4 border-b border-gray-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900">Demande de modification</h3>
                    <p className="text-xs text-gray-400">Le chef d'agence traitera votre demande dans les meilleurs délais</p>
                  </div>
                </div>
                <div className="p-5 space-y-3 max-w-2xl">
                  {modError && (
                    <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold flex gap-2 items-start">
                      <X className="w-4 h-4 shrink-0 mt-0.5" />{modError}
                    </div>
                  )}
                  {modSuccess && (
                    <div className="bg-green-50 border border-green-100 text-green-700 rounded-xl px-4 py-3 text-sm font-semibold flex gap-2 items-start">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{modSuccess}
                    </div>
                  )}
                  <form onSubmit={handleSubmitModification} autoComplete="off" className="space-y-3">
                    <select required value={modForm.parcelId}
                      onChange={e => setModForm(f => ({ ...f, parcelId: e.target.value, newValue: '' }))}
                      className={selectCls}>
                      <option value="">Choisir le colis concerné *</option>
                      {parcels.filter(p => !['Retourné','Annulé'].includes(p.status)).map(p => (
                        <option key={p.id} value={p.id}>{p.trackingId} - {p.receiver?.name || ''} - {p.receiver?.city || ''}</option>
                      ))}
                    </select>
                    <select required value={modForm.modificationType}
                      onChange={e => setModForm(f => ({ ...f, modificationType: e.target.value, newValue: '' }))}
                      className={selectCls}>
                      <option value="">Type de modification *</option>
                      {MOD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    {selectedModParcel && modForm.modificationType && (
                      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Valeur actuelle</p>
                        <p className="font-semibold text-gray-800 text-sm">
                          {modForm.modificationType === 'type_paiement' && (COD_TYPE_OPTIONS.find(o => o.key === selectedModParcel.serviceType)?.label || selectedModParcel.serviceType || '-')}
                          {modForm.modificationType === 'adresse'     && (selectedModParcel.receiver?.address || '-')}
                          {modForm.modificationType === 'telephone'   && (selectedModParcel.receiver?.tel || '-')}
                          {modForm.modificationType === 'nom'         && (selectedModParcel.receiver?.name || '-')}
                          {modForm.modificationType === 'montant_cod' && (`${selectedModParcel.codAmount || 0} DH`)}
                          {modForm.modificationType === 'annulation'  && (selectedModParcel.status || '-')}
                        </p>
                      </div>
                    )}
                    {modForm.modificationType === 'type_paiement' ? (
                      <select required value={modForm.newValue}
                        onChange={e => setModForm(f => ({ ...f, newValue: e.target.value }))}
                        className={selectCls}>
                        <option value="">Nouveau type de paiement *</option>
                        {COD_TYPE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    ) : modForm.modificationType === 'annulation' ? (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-semibold">
                        Attention : cette demande entraînera l'annulation et le retour du colis.
                        <input type="hidden" value="annulation" onChange={() => {}} />
                        {!modForm.newValue && (setModForm(f => f.newValue === 'annulation' ? f : { ...f, newValue: 'annulation' }), null)}
                      </div>
                    ) : modForm.modificationType ? (
                      <input required value={modForm.newValue}
                        onChange={e => setModForm(f => ({ ...f, newValue: e.target.value }))}
                        placeholder={
                          modForm.modificationType === 'adresse'     ? 'Nouvelle adresse complète *' :
                          modForm.modificationType === 'telephone'   ? 'Nouveau numéro de téléphone *' :
                          modForm.modificationType === 'nom'         ? 'Nouveau nom destinataire *' :
                          modForm.modificationType === 'montant_cod' ? 'Nouveau montant Retour Fond (DH) *' : 'Nouvelle valeur *'
                        }
                        className={inputCls}
                      />
                    ) : null}
                    <textarea value={modForm.note} onChange={e => setModForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="Note ou justification (optionnel)" rows={2}
                      className={inputCls + " resize-none"} />
                    <button disabled={modSending}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl py-3 font-bold flex items-center justify-center gap-2 transition">
                      <Send className="w-4 h-4" />
                      {modSending ? 'Envoi...' : 'Envoyer la demande'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* MES DEMANDES */}
            {tab === 'modifications' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-gray-900 text-lg">Mes demandes</h3>
                  {stats.pendingMods > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold">
                      {stats.pendingMods} en attente
                    </span>
                  )}
                </div>
                {modRequests.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center text-gray-400">
                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold text-sm">Aucune demande envoyée</p>
                    <p className="text-xs mt-1">Utilisez l'onglet "Demande modif." pour soumettre.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {modRequests.map(req => {
                      const st = (MOD_STATUS as any)[req.status] || MOD_STATUS.pending
                      const modType = MOD_TYPES.find(t => t.key === req.modificationType)
                      return (
                        <div key={req.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 border-l-4 ${req.status === 'approved' ? 'border-l-green-500' : req.status === 'rejected' ? 'border-l-red-400' : 'border-l-amber-400'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <span className="font-mono text-xs font-black text-blue-600">{req.trackingId || '-'}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                              </div>
                              <p className="text-xs font-bold text-gray-600 mb-1">{req.typeLabel || modType?.label || req.modificationType}</p>
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <span className="line-through text-gray-400 truncate max-w-[80px]">{req.currentValue || '-'}</span>
                                <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                                <span className="font-semibold text-gray-800 truncate">{req.newValue}</span>
                              </div>
                              {req.note && <p className="text-[10px] text-gray-400 mt-1 italic">"{req.note}"</p>}
                              {req.agentNote && (
                                <div className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${st.bg} ${st.text}`}>
                                  <MessageCircle className="w-3 h-3 inline mr-1" /> {req.agentNote}
                                </div>
                              )}
                              <p className="text-[10px] text-gray-400 mt-1.5">{fmtDate(req.createdAt)}</p>
                            </div>
                            <div className="flex gap-1">
                              {req.status === 'pending' && (
                                <button onClick={() => setEditingModRequest(req)}
                                  className="text-gray-300 hover:text-blue-500 shrink-0 p-1.5 rounded-lg hover:bg-blue-50 transition">
                                  <Edit3 className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => handleDeleteModRequest(req.id)}
                                className="text-gray-300 hover:text-red-400 shrink-0 p-1.5 rounded-lg hover:bg-red-50 transition"
                                title="Supprimer">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* DEMANDES REÇUES (Pour expéditeurs) */}
            {tab === 'received-requests' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-gray-900 text-lg">Demandes reçues de destinataires</h3>
                  {receivedRequests.filter(r => r.status === 'pending').length > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-bold">
                      {receivedRequests.filter(r => r.status === 'pending').length} en attente
                    </span>
                  )}
                </div>

                {receivedRequests.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center text-gray-400">
                    <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold text-sm">Aucune demande reçue</p>
                    <p className="text-xs mt-1">Les demandes de vos destinataires apparaîtront ici.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {receivedRequests.map(req => {
                      const st = req.status === 'approved' || req.status === 'completed'
                        ? { label: 'Acceptée', bg: 'bg-green-100', text: 'text-green-700' }
                        : req.status === 'rejected'
                        ? { label: 'Refusée', bg: 'bg-red-100', text: 'text-red-700' }
                        : { label: 'En attente', bg: 'bg-amber-100', text: 'text-amber-700' }

                      const modType = MOD_TYPES.find(t => t.key === req.modificationType)

                      return (
                        <div key={req.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 border-l-4 ${
                          req.status === 'approved' || req.status === 'completed' ? 'border-l-green-500'
                          : req.status === 'rejected' ? 'border-l-red-400'
                          : 'border-l-amber-400'
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {/* Header */}
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className="font-mono text-xs font-black text-blue-600">{req.trackingId || '-'}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                                  {st.label}
                                </span>
                              </div>

                            {/* Qui demande */}
                            <div className="bg-blue-50 rounded-lg px-2 py-1.5 mb-2">
                              <p className="text-[10px] text-blue-600 font-semibold">
                                📥 De: {req.requestedByName}
                              </p>
                            </div>

                            {/* Type de modification */}
                            <p className="text-xs font-bold text-gray-600 mb-1">
                              {req.typeLabel || modType?.label || req.modificationType}
                            </p>

                            {/* Valeurs */}
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                              <span className="line-through text-gray-400 truncate max-w-[80px]">
                                {req.currentValue || '-'}
                              </span>
                              <ArrowRight className="w-3 h-3 text-blue-500 shrink-0" />
                              <span className="font-semibold text-gray-800 truncate">
                                {req.newValue}
                              </span>
                            </div>

                            {/* Note */}
                            {req.note && (
                              <p className="text-[10px] text-gray-600 mt-1 italic bg-gray-50 rounded px-2 py-1">
                                "{req.note}"
                              </p>
                            )}

                            {/* Réponse expéditeur */}
                            {req.expediteurNote && (
                              <div className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${st.bg} ${st.text}`}>
                                <MessageCircle className="w-3 h-3 inline mr-1" /> {req.expediteurNote}
                              </div>
                            )}

                            {/* Date */}
                            <p className="text-[10px] text-gray-400 mt-1.5">
                              {fmtDate(req.createdAt)}
                            </p>

                            {/* Boutons Accepter/Refuser */}
                            {req.status === 'pending' && (
                              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                                <button
                                  onClick={() => handleApproveRequest(req.id, req.modificationType)}
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Accepter
                                </button>
                                <button
                                  onClick={() => handleRejectRequest(req.id)}
                                  className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Refuser
                                </button>
                              </div>
                            )}

                            {/* Si appliqué */}
                            {req.autoApplied && (
                              <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-2 py-1.5">
                                <p className="text-[10px] text-green-700 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Appliqué automatiquement
                                </p>
                              </div>
                            )}
                            </div>
                            {/* Bouton suppression */}
                            <button
                              onClick={() => handleDeleteModRequest(req.id)}
                              className="text-gray-300 hover:text-red-400 shrink-0 p-1.5 rounded-lg hover:bg-red-50 transition"
                              title="Supprimer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

          </div>{/* end content */}
        </div>{/* end layout */}
      </div>{/* end max-w container */}

      {viewSig && (
        <SignatureViewerModal
          parcelId={viewSig.id}
          trackingId={viewSig.trackingId}
          recipientName={viewSig.receiver?.name}
          onClose={() => setViewSig(null)}
          canEdit={false}
        />
      )}

      {/* Modal Voir détails */}
      {viewingParcel && (
        <ParcelDetailsModal
          parcel={viewingParcel}
          onClose={() => setViewingParcel(null)}
        />
      )}

      {/* Modals CRUD */}
      {editingParcel && (
        <EditParcelModal
          parcel={editingParcel}
          onClose={() => setEditingParcel(null)}
          onSuccess={() => {
            setEditingParcel(null)
            // Les données seront automatiquement mises à jour via les souscriptions
          }}
        />
      )}

      {deletingParcel && (
        <CancelParcelModal
          parcel={deletingParcel}
          onClose={() => setDeletingParcel(null)}
          onSuccess={() => {
            setDeletingParcel(null)
            // Les données seront automatiquement mises à jour via les souscriptions
          }}
        />
      )}

      {editingModRequest && (
        <EditModRequestModal
          request={editingModRequest}
          onClose={() => setEditingModRequest(null)}
          onSuccess={() => {
            setEditingModRequest(null)
            // Les données seront automatiquement mises à jour via les souscriptions
          }}
        />
      )}

      {confirmingDelivery && (
        <ConfirmDeliveryModal
          parcel={confirmingDelivery}
          onClose={() => setConfirmingDelivery(null)}
          onSuccess={() => {
            setConfirmingDelivery(null)
            // Les données seront automatiquement mises à jour via les souscriptions
          }}
        />
      )}

      {reportingIssue && (
        <ReportIssueModal
          parcel={reportingIssue}
          onClose={() => setReportingIssue(null)}
          onSuccess={() => {
            setReportingIssue(null)
            // Les données seront automatiquement mises à jour via les souscriptions
          }}
        />
      )}
    </div>
  )
}
