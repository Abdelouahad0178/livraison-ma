import { useState, useEffect, useRef } from 'react'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase/config'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  createReglement, updateReglement, deleteReglement,
  markReglementRejete, markReglementVerseBanque,
  subscribeReglements, subscribeMyRapports,
  createRapport, submitRapport,
  subscribeCodParcels,
  remitCod, markPortDuRemisPointeur,
  createRetourDocument, subscribeRetourDocuments,
  expedierRetourDocument, confirmRetourDocumentArrived, deleteRetourDocument,
  markReglementDocVerified,
  markCodRefundedToClient,
  createCaisseEntry,
  markCodSentToChef,  // ⭐ Pour envoyer COD au chef d'agence
} from '../firebase/firestore'
import { REGLEMENT_MODES, REGLEMENT_STATUSES, CITIES } from '../firebase/constants'
import {
  LogOut, Plus, X, Search, Filter, Printer, FileText,
  ChevronDown, Check, AlertTriangle, Banknote, Clock,
  CheckCircle2, TrendingUp, Calendar, Building2, User,
  Phone, Hash, CreditCard, Send, Eye, Trash2, Edit2,
  ChevronRight, BarChart3, RefreshCw, Truck, MapPin,
  ArrowRight, Package, ShieldCheck,
} from 'lucide-react'

const todayStr = () => new Date().toISOString().split('T')[0]

const fmtDate = (iso: any) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}
const fmtAmount = (n: any) => Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })

const MODE_INFO = {
  especes: { label: 'Espèces',       emoji: '💵', bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  badge: 'bg-green-100 text-green-700' },
  cheque:  { label: 'Contre-Chèque', emoji: '📋', bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
  traite:  { label: 'Traite',         emoji: '📝', bg: 'bg-purple-50', border: 'border-purple-200',text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
}
const RETOUR_FOND_VALUE_TYPES = ['cheque', 'traite', 'bon_livraison', 'retour_bl', 'cod_cheque', 'cod_traite']
const STATUS_INFO = {
  en_attente:   { label: 'En attente',    dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700' },
  encaisse:     { label: 'Encaissé',      dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  remis_chef:   { label: 'Remis au chef', dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  verse_banque: { label: 'Versé banque',  dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700' },
  rejete:       { label: 'Rejeté',        dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700' },
}
const DOC_CONTROL_STATUS = {
  correct: { label: 'Données correctes', badge: 'bg-green-100 text-green-700' },
  anomalie: { label: 'Anomalie écriture/données', badge: 'bg-amber-100 text-amber-700' },
  suspect: { label: 'Suspicion falsification', badge: 'bg-red-100 text-red-700' },
}
const RAPPORT_STATUS = {
  brouillon: { label: 'Brouillon', badge: 'bg-gray-100 text-gray-600' },
  soumis:    { label: 'Soumis',    badge: 'bg-amber-100 text-amber-700' },
  valide:    { label: 'Validé',    badge: 'bg-green-100 text-green-700' },
  rejete:    { label: 'Rejeté',    badge: 'bg-red-100 text-red-700' },
}

const EMPTY_FORM = {
  trackingNumber: '', parcelId: '',
  expediteur: '', expediteurTel: '', expediteurNic: '',
  destinataire: '', destinataireTel: '',
  villeExpedition: '',
  modeReglement: 'cheque', montant: '',
  banque: '', numeroPiece: '', dateEmission: todayStr(), dateEcheance: '',
  notes: '',
}

function filterByDateRange(list: any, preset: any, from: any, to: any, getDate: any) {
  if (preset === 'all') return list
  const now = new Date()
  let start: any = null, end: any = now
  if (preset === 'today') { start = new Date(); start.setHours(0, 0, 0, 0) }
  else if (preset === 'week') { start = new Date(); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0) }
  else if (preset === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'custom') { start = from ? new Date(from) : null; end = to ? new Date(to + 'T23:59:59') : now }
  return list.filter((r: any) => {
    const d = getDate(r)
    if (start && d < start) return false
    if (end && d > end) return false
    return true
  })
}

export default function PointeurPage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [tab, setTab] = useState('dashboard')
  const [reglements, setReglements] = useState<any[]>([])
  const [rapports, setRapports] = useState<any[]>([])
  const [loadingReglements, setLoadingReglements] = useState(true)

  // ── Filters
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [montantMin, setMontantMin] = useState('')
  const [montantMax, setMontantMax] = useState('')
  const [banqueFilter, setBanqueFilter] = useState('')
  const [villeFilter, setVilleFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // ── Form modal
  const [formModal, setFormModal] = useState<any>(null) // null | { mode:'new'|'edit', data, loading, error }

  // ── Refs pour navigation clavier
  const modeReglementChequeRef = useRef<HTMLButtonElement>(null)
  const modeReglementTraiteRef = useRef<HTMLButtonElement>(null)
  const trackingNumberRef = useRef<HTMLInputElement>(null)
  const montantRef = useRef<HTMLInputElement>(null)
  const expediteurRef = useRef<HTMLInputElement>(null)
  const expediteurTelRef = useRef<HTMLInputElement>(null)
  const destinataireRef = useRef<HTMLInputElement>(null)
  const destinataireTelRef = useRef<HTMLInputElement>(null)
  const villeExpeditionRef = useRef<HTMLSelectElement>(null)
  const banqueRef = useRef<HTMLInputElement>(null)
  const numeroPieceRef = useRef<HTMLInputElement>(null)
  const dateEmissionRef = useRef<HTMLInputElement>(null)
  const dateEcheanceRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  // ── Rapport modal
  const [rapportModal, setRapportModal] = useState<any>(null) // null | { loading, error, note, selected }
  const [viewRapportModal, setViewRapportModal] = useState<any>(null)

  // ── Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)

  // ── Reject modal
  const [rejectModal, setRejectModal] = useState<any>(null) // { id, reason }

  // ── Verse banque modal
  const [verseBanqueModal, setVerseBanqueModal] = useState<any>(null) // { id, ref }

  // ── RETOUR FOND parcels
  const [codParcels, setCodParcels] = useState<any[]>([])
  const [loadingCod, setLoadingCod] = useState(true)
  const [codSearch, setCodSearch] = useState('')
  const [codTypeFilter, setCodTypeFilter] = useState('all')
  const [codPointFilter, setCodPointFilter] = useState('all') // all | non_pointe | pointe
  const [codSending, setCodSending] = useState<any>(null) // ⭐ Pour envoyer COD à l'agence source

  // ── Retour documents
  const [retourDocs, setRetourDocs] = useState<any[]>([])
  const [retourModal, setRetourModal] = useState<any>(null) // { destAgency, selectedIds, notes, loading, error }
  const [retourViewModal, setRetourViewModal] = useState<any>(null)

  // ── Livreur versements
  const [livreurReceiving, setLivreurReceiving] = useState<any>({})

  // ── Document control (chèques / traites)
  const [docVerifying, setDocVerifying] = useState<any>({})
  const [docControlModal, setDocControlModal] = useState<any>(null)

  // ── Navigation clavier unifiée pour tout le formulaire
  const handleFormKeyDown = (e: React.KeyboardEvent, currentField: string) => {
    // Ordre complet de TOUS les champs et boutons
    const fieldOrder = [
      'trackingNumber', 'montant', 'expediteur', 'expediteurTel',
      'destinataire', 'destinataireTel', 'villeExpedition',
      'modeCheque', 'modeTraite',
      'banque', 'numeroPiece', 'dateEmission', 'dateEcheance', 'notes'
    ]

    const refMap: any = {
      trackingNumber: trackingNumberRef,
      montant: montantRef,
      expediteur: expediteurRef,
      expediteurTel: expediteurTelRef,
      destinataire: destinataireRef,
      destinataireTel: destinataireTelRef,
      villeExpedition: villeExpeditionRef,
      modeCheque: modeReglementChequeRef,
      modeTraite: modeReglementTraiteRef,
      banque: banqueRef,
      numeroPiece: numeroPieceRef,
      dateEmission: dateEmissionRef,
      dateEcheance: dateEcheanceRef,
      notes: notesRef,
    }

    // Espace = sélectionner un bouton de mode
    if (e.key === ' ' && (currentField === 'modeCheque' || currentField === 'modeTraite')) {
      e.preventDefault()
      const selectedMode = currentField === 'modeCheque' ? 'cheque' : 'traite'
      setFormModal((f: any) => ({ ...f, data: { ...f.data, modeReglement: selectedMode } }))
      return
    }

    // Entrée = champ suivant
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      const currentIndex = fieldOrder.indexOf(currentField)

      // Trouver le prochain champ visible
      for (let i = currentIndex + 1; i < fieldOrder.length; i++) {
        const nextField = fieldOrder[i]
        const nextRef = refMap[nextField]

        // Sauter les champs conditionnels non affichés
        if (nextField === 'banque' || nextField === 'numeroPiece' || nextField === 'dateEmission') {
          if (!['cheque', 'traite'].includes(formModal?.data?.modeReglement)) continue
        }
        if (nextField === 'dateEcheance') {
          if (formModal?.data?.modeReglement !== 'traite') continue
        }

        if (nextRef?.current) {
          nextRef.current.focus()
          return
        }
      }
    }

    // Ctrl+Entrée = champ précédent
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      const currentIndex = fieldOrder.indexOf(currentField)

      // Trouver le champ précédent visible
      for (let i = currentIndex - 1; i >= 0; i--) {
        const prevField = fieldOrder[i]
        const prevRef = refMap[prevField]

        // Sauter les champs conditionnels non affichés
        if (prevField === 'banque' || prevField === 'numeroPiece' || prevField === 'dateEmission') {
          if (!['cheque', 'traite'].includes(formModal?.data?.modeReglement)) continue
        }
        if (prevField === 'dateEcheance') {
          if (formModal?.data?.modeReglement !== 'traite') continue
        }

        if (prevRef?.current) {
          prevRef.current.focus()
          return
        }
      }
    }
  }

  // Focus automatique sur N° EXP quand le modal s'ouvre
  useEffect(() => {
    if (formModal && trackingNumberRef.current) {
      setTimeout(() => trackingNumberRef.current?.focus(), 100)
    }
  }, [formModal])

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      snap => {
        if (snap.exists()) {
          const data = snap.data()
          if (data.blocked) { signOut(auth).then(() => navigate('/login')); return }
          setProfile(data)
        }
      },
      err => console.warn('PointeurPage user profile listener error:', err.code)
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!profile?.city) return
    const uid = auth.currentUser?.uid
    setLoadingReglements(true)
    const unsub1 = subscribeReglements(profile.city, uid, (list: any) => {
      setReglements(list)
      setLoadingReglements(false)
    }, () => setLoadingReglements(false))
    const unsub2 = subscribeMyRapports(uid, profile.city, setRapports, () => {})
    return () => { unsub1(); unsub2() }
  }, [profile?.city])

  useEffect(() => {
    if (!profile?.city) return
    setLoadingCod(true)
    const unsub3 = subscribeCodParcels(profile.city, list => {
      setCodParcels(list); setLoadingCod(false)
    }, err => { console.error('subscribeCodParcels:', err); setLoadingCod(false) })
    const unsub4 = subscribeRetourDocuments(profile.city, setRetourDocs, err => console.error('subscribeRetourDocuments:', err))
    return () => { unsub3(); unsub4() }
  }, [profile?.city])

  // ── Computed stats
  const documentReglements = reglements.filter(r => ['cheque', 'traite'].includes(r.modeReglement))
  const myPending = documentReglements.filter(r => r.status === 'en_attente' || r.status === 'encaisse')
  const totalEspeces  = myPending.filter(r => r.modeReglement === 'especes').reduce((s, r) => s + (r.montant || 0), 0)
  const totalCheques  = myPending.filter(r => r.modeReglement === 'cheque').reduce((s, r) => s + (r.montant || 0), 0)
  const totalTraites  = myPending.filter(r => r.modeReglement === 'traite').reduce((s, r) => s + (r.montant || 0), 0)
  const totalAll      = myPending.reduce((s, r) => s + (r.montant || 0), 0)

  const todayEntries = reglements.filter(r => {
    const d = new Date(r.createdAt || 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return d >= today
  })
  const todayTotal = todayEntries.reduce((s, r) => s + (r.montant || 0), 0)

  // ── Unique banks for filter
  const allBanques = [...new Set(reglements.map(r => r.banque).filter(Boolean))].sort()

  // ── Filtered list
  const filtered = documentReglements.filter(r => {
    if (modeFilter !== 'all' && r.modeReglement !== modeFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (banqueFilter && r.banque !== banqueFilter) return false
    if (villeFilter && r.villeExpedition !== villeFilter) return false
    if (montantMin && (r.montant || 0) < parseFloat(montantMin)) return false
    if (montantMax && (r.montant || 0) > parseFloat(montantMax)) return false
    if (search) {
      const q = search.toLowerCase()
      const linkedParcel = r.parcelId ? codParcels.find(p => p.id === r.parcelId) : null
      if (![r.trackingNumber, r.expediteurNic, r.senderNic, r.nexp, linkedParcel?.sender?.nic, r.expediteur, r.destinataire, r.numeroPiece, r.banque]
        .some(v => (v || '').toLowerCase().includes(q))) return false
    }
    return true
  })

  const filteredByDate = filterByDateRange(filtered, datePreset, dateFrom, dateTo,
    (r: any) => r.createdAt ? new Date(r.createdAt) : new Date(0))

  // ── Rapport eligible entries (encaisse only, no rapport yet)
  const eligibleForRapport = documentReglements.filter(r =>
    (r.status === 'en_attente' || r.status === 'encaisse') &&
    r.docVerified === true &&
    !r.rapportId
  )

  // ── RETOUR FOND computed
  const pointedParcelIds = new Set(reglements.map(r => r.parcelId).filter(Boolean))
  const codTypeMap = { especes: 'especes', cheque: 'cheque', traite: 'traite', bon_livraison: 'cheque', retour_bl: 'cheque', cod_cheque: 'cheque', cod_traite: 'traite' }
  const isChequeOrTraiteParcel = (p: any) => ['cheque', 'traite', 'cod_cheque', 'cod_traite'].includes(p.codPaymentType || p.serviceType)
  const isRetourFondValue = (p: any) => {
    const type = p.codPaymentType || p.serviceType || 'especes'
    return (parseFloat(p.codAmount) || 0) > 0 || RETOUR_FOND_VALUE_TYPES.includes(type)
  }
  const codFiltered = codParcels.filter(p => {
    const t = (codTypeMap as any)[p.codPaymentType || p.serviceType] || 'especes'
    if (!isChequeOrTraiteParcel(p)) return false
    if (codTypeFilter !== 'all' && t !== codTypeFilter) return false
    const pointed = pointedParcelIds.has(p.id)
    if (codPointFilter === 'non_pointe' && pointed) return false
    if (codPointFilter === 'pointe' && !pointed) return false
    if (codSearch) {
      const q = codSearch.toLowerCase()
      if (![p.trackingId, p.sender?.nic, p.sender?.name, p.receiver?.name, p.receiver?.tel, p.originCity, p.deliveryDriverName]
        .some(v => (v || '').toLowerCase().includes(q))) return false
    }
    return true
  })
  const codNonPointed = codParcels.filter(p => isChequeOrTraiteParcel(p) && !pointedParcelIds.has(p.id))
  const codTotalNonPointe = codNonPointed.reduce((s, p) => s + (p.codAmount || 0), 0)

  // ⭐ COD réceptionnés à envoyer au chef d'agence (chèques/traites seulement)
  const isCash = (p: any) => ['especes', 'cod_especes'].includes(p.codPaymentType || p.serviceType)
  const dst_aEnvoyer = codParcels.filter(p =>
    isChequeOrTraiteParcel(p) &&
    p.codStatus === 'remis' &&
    !p.codSentToChef &&  // ⭐ Pas encore envoyé au chef
    !p.codSenderPaid &&
    !p.centralDeposited &&
    !isCash(p)
  )
  const totDstEnvoy = dst_aEnvoyer.reduce((s, p) => s + parseFloat(p.codAmount || 0), 0)

  // ⭐ COD envoyés au chef et traités (envoyés à l'agence source)
  const dst_envoyes = codParcels.filter(p =>
    isChequeOrTraiteParcel(p) &&
    p.codSentToChef &&  // Envoyé au chef
    p.codSentToSource &&  // Puis envoyé à l'agence source
    !isCash(p)
  )

  // ── Contrôle pointeur : uniquement après validation directe par le chef d'agence
  const codFromLivreur = codParcels.filter(p =>
    isRetourFondValue(p) &&
    isChequeOrTraiteParcel(p) &&
    (p.codChefReceivedAt || p.codStatus === 'remis') &&
    p.deliveryDriverId &&
    !pointedParcelIds.has(p.id)
  )
  // Les ports dus sont remis directement au chef d'agence par le livreur.
  const portDuFromLivreur: any[] = []
  // Colis retournés avec RETOUR FOND déjà collecté par le livreur — remboursement dû au client
  const codRetournesARemb = codParcels.filter(p =>
    p.status === 'Retourné' &&
    parseFloat(p.codAmount) > 0 &&
    p.codStatus === 'collected' &&
    !p.codRefunded
  )
  const livreurPendingCount = codFromLivreur.length + portDuFromLivreur.length + codRetournesARemb.length

  // ── Documents physiques à contrôler (chèques / traites non encore vérifiés)
  const docsToControl = reglements.filter(r =>
    ['cheque', 'traite'].includes(r.modeReglement) &&
    !r.docVerified &&
    r.status !== 'rejete'
  )

  // ── Retour computed — règlements cheque/traite liés à d'autres villes (à retourner)
  const retourEligible = reglements.filter(r =>
    ['cheque', 'traite'].includes(r.modeReglement) &&
    r.villeExpedition && r.villeExpedition !== profile?.city &&
    !['rejete'].includes(r.status)
  )
  const retourVilles = [...new Set(retourEligible.map(r => r.villeExpedition).filter(Boolean))].sort()

  const handleOpenFormFromCod = (parcel: any) => {
    const mode = (codTypeMap as any)[parcel.codPaymentType || parcel.serviceType] || 'cheque'
    setFormModal({
      mode: 'new',
      data: {
        ...EMPTY_FORM,
        parcelId:        parcel.id,
        trackingNumber:  parcel.trackingId        || '',
        expediteur:      parcel.sender?.name      || '',
        expediteurTel:   parcel.sender?.tel        || '',
        expediteurNic:   parcel.sender?.nic        || '',
        destinataire:    parcel.receiver?.name    || '',
        destinataireTel: parcel.receiver?.tel      || '',
        villeExpedition: parcel.originCity         || parcel.sender?.city || '',
        modeReglement:   mode,
        montant:         String(parcel.codAmount   || ''),
        notes:           parcel.deliveryDriverName ? `Livreur : ${parcel.deliveryDriverName}` : '',
      },
      loading: false, error: '',
    })
    setTab('reglements')
  }

  const handleCreateRetour = async () => {
    const m = retourModal
    if (!m.destAgency) { setRetourModal((p: any) => ({ ...p, error: 'Agence destinataire requise.' })); return }
    if (!m.selectedIds?.length) { setRetourModal((p: any) => ({ ...p, error: 'Sélectionnez au moins un document.' })); return }
    setRetourModal((p: any) => ({ ...p, loading: true, error: '' }))
    try {
      const selected = retourEligible.filter(r => m.selectedIds.includes(r.id))
      const documents = selected.map(r => ({
        reglementId:  r.id,
        type:         r.modeReglement,
        trackingId:   r.trackingNumber  || '',
        expediteur:   r.expediteur      || '',
        destinataire: r.destinataire    || '',
        montant:      r.montant         || 0,
        banque:       r.banque          || '',
        numeroPiece:  r.numeroPiece     || '',
        dateEmission: r.dateEmission    || '',
        dateEcheance: r.dateEcheance    || '',
      }))
      await createRetourDocument({
        agencyCity:        profile.city,
        destinationAgency: m.destAgency,
        pointeurId:        auth.currentUser?.uid,
        pointeurName:      profile.name,
        documents,
        notes:             m.notes || '',
      })
      setRetourModal(null)
    } catch { setRetourModal((p: any) => ({ ...p, loading: false, error: 'Erreur lors de la création.' })) }
  }

  const handleReceiveLivreurPortDu = async (parcel: any) => {
    const uid = auth.currentUser?.uid
    setLivreurReceiving((s: any) => ({ ...s, [parcel.id]: true }))
    try {
      await createReglement({
        parcelId:        parcel.id,
        trackingNumber:  parcel.trackingId || '',
        expediteur:      parcel.sender?.name || '',
        expediteurTel:   parcel.sender?.tel  || '',
        expediteurNic:   parcel.sender?.nic  || '',
        destinataire:    parcel.receiver?.name || '',
        destinataireTel: parcel.receiver?.tel  || '',
        villeExpedition: parcel.originCity || parcel.sender?.city || '',
        modeReglement:   'especes',
        montant:         parseFloat(parcel.price) || 0,
        agencyCity:      profile?.city || '',
        pointeurId:      uid,
        pointeurName:    profile?.name || '',
        notes:           `Port dû livreur : ${parcel.portCollectedBy || parcel.deliveryDriverName || '—'}`,
        banque: '', numeroPiece: '', dateEmission: todayStr(), dateEcheance: '',
      })
      await markPortDuRemisPointeur(parcel.id, profile?.name || '', uid)
    } catch (err: any) {
      console.error('handleReceiveLivreurPortDu:', err)
    } finally {
      setLivreurReceiving((s: any) => { const n = { ...s }; delete n[parcel.id]; return n })
    }
  }

  // ⭐ Envoyer COD au chef d'agence pour validation
  const handleSendToChef = async (parcel: any) => {
    if (isCash(parcel)) {
      alert("Les RETOUR FOND espèces se versent au compte société, pas à l'agence source.")
      return
    }
    const uid = auth.currentUser?.uid
    const name = profile?.name || 'Pointeur'
    setCodSending(parcel.id)
    try {
      await markCodSentToChef(parcel.id, name, uid || '')
      // Optimistic update
      setCodParcels(prev => prev.map(p =>
        p.id === parcel.id
          ? { ...p, codSentToChef: true, codSentToChefAt: new Date().toISOString(), codSentToChefBy: name }
          : p
      ))
    } catch (err: any) {
      console.error('handleSendToChef:', err)
      alert('Erreur lors de l\'envoi au chef : ' + (err?.message || 'Erreur inconnue'))
    } finally {
      setCodSending(null)
    }
  }

  const handlePrintRetour = (rd: any) => {
    const rows = (rd.documents || []).map((d: any, i: any) => `
      <tr>
        <td>${i + 1}</td>
        <td style="font-family:monospace">${d.trackingId || '—'}</td>
        <td>${d.expediteur || '—'}</td>
        <td>${d.destinataire || '—'}</td>
        <td>${d.type === 'cheque' ? 'Chèque' : 'Traite'}</td>
        <td>${d.numeroPiece || '—'}</td>
        <td>${d.banque || '—'}</td>
        <td>${d.dateEmission || '—'}</td>
        <td>${d.dateEcheance || '—'}</td>
        <td style="text-align:right;font-weight:bold">${Number(d.montant || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH</td>
      </tr>`).join('')
    const w: any = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Bordereau Retour ${rd.retourRef}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
      h2 { text-align: center; margin-bottom: 4px; }
      .meta { text-align: center; color: #555; margin-bottom: 16px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
      td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
      tr:nth-child(even) td { background: #f8fafc; }
      .total { text-align: right; font-weight: bold; font-size: 13px; margin-top: 10px; border-top: 2px solid #1e40af; padding-top: 8px; }
      .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 50px; }
      .sig { border-top: 1px solid #000; padding-top: 8px; text-align: center; font-size: 11px; }
      @media print { body { margin: 10px; } }
    </style></head><body>
    <h2>Bordereau de Retour de Documents</h2>
    <div class="meta">
      Réf : <strong>${rd.retourRef}</strong> &nbsp;|&nbsp;
      De : <strong>${rd.agencyCity}</strong> &nbsp;→&nbsp;
      Vers : <strong>${rd.destinationAgency}</strong><br/>
      Date : ${new Date(rd.createdAt).toLocaleDateString('fr-MA')} &nbsp;|&nbsp;
      Pointeur : ${rd.pointeurName} &nbsp;|&nbsp; ${rd.nbDocuments} document(s)
    </div>
    <table>
      <thead><tr>
        <th>N°</th><th>Réf Expédition</th><th>Expéditeur</th><th>Destinataire</th>
        <th>Type</th><th>N° Pièce</th><th>Banque</th>
        <th>Dt Émission</th><th>Dt Échéance</th><th>Montant</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">Total : ${Number(rd.totalMontant || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH</div>
    ${rd.notes ? `<p style="margin-top:12px;color:#555;font-style:italic">Notes : ${rd.notes}</p>` : ''}
    <div class="sigs">
      <div class="sig">Signature Pointeur-Encaisseur<br/><br/><br/>${rd.pointeurName}</div>
      <div class="sig">Signature Chef d'Agence<br/><br/><br/>&nbsp;</div>
      <div class="sig">Cachet Agence<br/><br/><br/>&nbsp;</div>
    </div>
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  const handleOpenForm = (existing: any = null) => {
    if (existing) {
      setFormModal({ mode: 'edit', id: existing.id, data: { ...EMPTY_FORM, ...existing }, loading: false, error: '' })
    } else {
      setFormModal({ mode: 'new', data: { ...EMPTY_FORM }, loading: false, error: '' })
    }
  }

  const handleSaveReglement = async (e: any) => {
    e.preventDefault()
    const m = formModal
    if (!m.data.expediteur.trim()) { setFormModal((f: any) => ({ ...f, error: 'Expéditeur requis.' })); return }
    if (!m.data.montant || parseFloat(m.data.montant) <= 0) { setFormModal((f: any) => ({ ...f, error: 'Montant invalide.' })); return }
    if (['cheque', 'traite'].includes(m.data.modeReglement) && !m.data.banque.trim()) {
      setFormModal((f: any) => ({ ...f, error: 'Banque requise pour chèque/traite.' })); return
    }
    setFormModal((f: any) => ({ ...f, loading: true, error: '' }))
    try {
      const uid  = auth.currentUser?.uid
      const payload = {
        ...m.data,
        agencyCity:   profile?.city || '',
        pointeurId:   uid,
        pointeurName: profile?.name || '',
      }
      if (m.mode === 'new') {
        await createReglement(payload)
        if (m.data.parcelId) {
          remitCod(m.data.parcelId, profile?.name || '').catch(() => {})
        }
      } else {
        await updateReglement(m.id, {
          trackingNumber:  m.data.trackingNumber,
          expediteur:      m.data.expediteur,
          expediteurTel:   m.data.expediteurTel,
          expediteurNic:   m.data.expediteurNic,
          destinataire:    m.data.destinataire,
          destinataireTel: m.data.destinataireTel,
          villeExpedition: m.data.villeExpedition,
          modeReglement:   m.data.modeReglement,
          montant:         parseFloat(m.data.montant) || 0,
          banque:          m.data.banque,
          numeroPiece:     m.data.numeroPiece,
          dateEmission:    m.data.dateEmission,
          dateEcheance:    m.data.dateEcheance,
          notes:           m.data.notes,
        })
      }
      setFormModal(null)
    } catch {
      setFormModal((f: any) => ({ ...f, loading: false, error: 'Erreur lors de la sauvegarde.' }))
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try { await deleteReglement(deleteConfirm.id) } catch {}
    setDeleteConfirm(null)
  }

  const handleMarkEncaisse = async (r: any) => {
    try { await updateReglement(r.id, { status: 'encaisse' }) } catch {}
  }

  const handleReject = async () => {
    if (!rejectModal) return
    try { await markReglementRejete(rejectModal.id, rejectModal.reason) } catch {}
    setRejectModal(null)
  }

  const handleVerseBanque = async () => {
    if (!verseBanqueModal) return
    try { await markReglementVerseBanque(verseBanqueModal.id, verseBanqueModal.ref, profile?.name) } catch {}
    setVerseBanqueModal(null)
  }

  const openDocControl = (reglement: any) => {
    setDocControlModal({
      reglement,
      status: reglement.docControlStatus || 'correct',
      checks: {
        dataCorrect: reglement.docControlChecks?.dataCorrect !== false,
        writingClean: reglement.docControlChecks?.writingClean !== false,
        noFalsification: reglement.docControlChecks?.noFalsification !== false,
      },
      notes: reglement.docControlNotes || '',
      loading: false,
      error: '',
    })
  }

  const handleDocVerify = async () => {
    const modal = docControlModal
    if (!modal?.reglement) return
    const uid = auth.currentUser?.uid
    const reglementId = modal.reglement.id
    setDocVerifying((s: any) => ({ ...s, [reglementId]: true }))
    setDocControlModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await markReglementDocVerified(reglementId, uid, profile?.name || 'Pointeur', {
        status: modal.status,
        checks: modal.checks,
        notes: modal.notes,
      })
      setDocControlModal(null)
    } catch (err: any) {
      console.error('handleDocVerify:', err)
      setDocControlModal((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors du contrôle.' }))
    } finally {
      setDocVerifying((s: any) => ({ ...s, [reglementId]: false }))
    }
  }

  const [refunding, setRefunding] = useState<any>({})
  const [refundError, setRefundError] = useState('')
  const handleRefundClient = async (parcel: any) => {
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Pointeur'
    setRefunding((s: any) => ({ ...s, [parcel.id]: true }))
    setRefundError('')
    try {
      await markCodRefundedToClient(parcel.id, name, uid)
      await createCaisseEntry({
        type: 'sortie', category: 'remboursement_cod',
        amount: parseFloat(parcel.codAmount) || 0,
        description: `Remboursement RETOUR FOND — colis retourné ${parcel.trackingId} (${parcel.sender?.name || ''})`,
        reference: parcel.trackingId,
        agentId: uid, agentName: name,
        city: profile?.city || '',
        cashierId: uid, cashierName: name,
      })
    } catch (err: any) {
      console.error('handleRefundClient:', err)
      setRefundError(err?.message || 'Erreur lors du remboursement.')
    } finally {
      setRefunding((s: any) => { const n = { ...s }; delete n[parcel.id]; return n })
    }
  }

  const handleCreateRapport = async () => {
    const m = rapportModal
    const uid = auth.currentUser?.uid
    const selected = eligibleForRapport.filter(r => m.selected.includes(r.id))
    if (!selected.length) { setRapportModal((r: any) => ({ ...r, error: 'Sélectionnez au moins un règlement.' })); return }
    setRapportModal((r: any) => ({ ...r, loading: true, error: '' }))
    try {
      const totals = selected.reduce((acc, r) => {
        acc.totalMontant += r.montant || 0
        if (r.modeReglement === 'especes') acc.totalEspeces += r.montant || 0
        if (r.modeReglement === 'cheque')  acc.totalCheques += r.montant || 0
        if (r.modeReglement === 'traite')  acc.totalTraites += r.montant || 0
        return acc
      }, { totalEspeces: 0, totalCheques: 0, totalTraites: 0, totalMontant: 0 })

      const rapportId = await createRapport({
        date:         todayStr(),
        agencyCity:   profile?.city || '',
        pointeurId:   uid,
        pointeurName: profile?.name || '',
        nbEntries:    selected.length,
        notes:        m.note,
        entryIds:     selected.map(r => r.id),
        ...totals,
      })
      await submitRapport(rapportId, selected.map(r => r.id))
      setRapportModal(null)
    } catch {
      setRapportModal((r: any) => ({ ...r, loading: false, error: 'Erreur lors de la création du rapport.' }))
    }
  }

  const handlePrintRapport = (rapport: any) => {
    const entries = reglements.filter(r => rapport.entryIds?.includes(r.id))
    const printDate = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const rows = entries.map(r => `
      <tr>
        <td>${r.trackingNumber || '—'}</td>
        <td>${r.expediteur || '—'}</td>
        <td>${r.villeExpedition || '—'}</td>
        <td>${(MODE_INFO as any)[r.modeReglement]?.label || r.modeReglement}</td>
        <td style="text-align:right;font-weight:bold">${fmtAmount(r.montant)} DH</td>
        <td>${r.banque || '—'}</td>
        <td>${r.numeroPiece || '—'}</td>
        <td>${fmtDate(r.dateEmission)}</td>
        <td>${r.modeReglement === 'traite' ? fmtDate(r.dateEcheance) : '—'}</td>
        <td>${(DOC_CONTROL_STATUS as any)[r.docControlStatus || 'correct']?.label || 'Contrôlé'}</td>
        <td>${r.docControlNotes || '—'}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><title>Rapport Règlements</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 9pt; margin: 0; padding: 16px; }
      h1 { font-size: 14pt; margin: 0 0 4px; color: #1e40af; }
      .meta { font-size: 8pt; color: #6b7280; margin-bottom: 12px; }
      table { border-collapse: collapse; width: 100%; margin-top: 8px; }
      th { background: #1e40af; color: white; padding: 5px 8px; text-align: left; font-size: 8pt; }
      td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; font-size: 8pt; }
      tr:nth-child(even) { background: #f9fafb; }
      .totals td { font-weight: bold; background: #dbeafe; border-top: 2px solid #1e40af; }
      .summary { display: flex; gap: 20px; margin: 12px 0; }
      .summary-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 16px; text-align: center; }
      .summary-box .lbl { font-size: 7pt; color: #6b7280; text-transform: uppercase; }
      .summary-box .val { font-size: 13pt; font-weight: bold; color: #1e40af; }
      .sigs { display: flex; gap: 60px; margin-top: 32px; }
      .sig { border-top: 1px solid #999; padding-top: 4px; min-width: 160px; font-size: 8pt; color: #6b7280; }
      @media print { body { padding: 8px; } }
    </style></head><body>
    <h1>Rapport de contrôle chèques / traites</h1>
    <div class="meta">
      Agence : <strong>${rapport.agencyCity}</strong> &nbsp;|&nbsp;
      Pointeur : <strong>${rapport.pointeurName}</strong> &nbsp;|&nbsp;
      Date : <strong>${fmtDate(rapport.date)}</strong> &nbsp;|&nbsp;
      Imprimé le : ${printDate}
    </div>
    <div class="summary">
      <div class="summary-box"><div class="lbl">📋 Chèques</div><div class="val">${fmtAmount(rapport.totalCheques)} DH</div></div>
      <div class="summary-box"><div class="lbl">📝 Traites</div><div class="val">${fmtAmount(rapport.totalTraites)} DH</div></div>
      <div class="summary-box"><div class="lbl">TOTAL GÉNÉRAL</div><div class="val" style="color:#ea580c">${fmtAmount(rapport.totalMontant)} DH</div></div>
    </div>
    <table>
      <thead><tr>
        <th>N° Expéd.</th><th>Expéditeur</th><th>Ville</th><th>Mode</th><th>Montant</th>
        <th>Banque</th><th>N° Pièce</th><th>Date émission</th><th>Échéance</th><th>État contrôle</th><th>Notes</th>
      </tr></thead>
      <tbody>${rows}<tr class="totals">
        <td colspan="4">TOTAL — ${entries.length} règlement(s)</td>
        <td style="text-align:right">${fmtAmount(rapport.totalMontant)} DH</td>
        <td colspan="6"></td>
      </tr></tbody>
    </table>
    ${rapport.notes ? `<p style="font-size:8pt;color:#6b7280;margin-top:8px">Note : ${rapport.notes}</p>` : ''}
    <div class="sigs">
      <div class="sig">Signature Pointeur<br/><strong>${rapport.pointeurName}</strong></div>
      <div class="sig">Signature Chef d'Agence<br/><span>&nbsp;</span></div>
    </div>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`

    const win = window.open('', '_blank', 'width=1200,height=900')
    if (win) { win.document.write(html); win.document.close() }
  }

  const hasActiveFilters = modeFilter !== 'all' || statusFilter !== 'all' || banqueFilter || villeFilter || montantMin || montantMax || datePreset !== 'all'

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* ── HEADER ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">PE</div>
            <div>
              <p className="font-bold text-gray-800 text-sm leading-none">Pointeur-Encaisseur</p>
              <p className="text-xs text-gray-400">{profile.name} · {profile.city}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth).then(() => navigate('/login'))}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 transition px-2 py-1.5 rounded-lg hover:bg-red-50">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>

        {/* NAV TABS */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          {[
            { key: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
            { key: 'livreurs', label: 'Livreurs', icon: Package, badge: livreurPendingCount || 0 },
            { key: 'reglements', label: 'Règlements', icon: Banknote },
            { key: 'rapports', label: 'Rapports', icon: FileText },
            { key: 'cods', label: 'RETOUR FONDs', icon: Truck },
            { key: 'retour', label: 'Retour Docs', icon: ArrowRight },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
              {(t as any).badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{t.badge}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Aujourd'hui</p>
                <p className="text-2xl font-black text-gray-800">{todayEntries.length}</p>
                <p className="text-xs text-gray-500">saisies</p>
                <p className="text-sm font-bold text-indigo-600 mt-1">{fmtAmount(todayTotal)} DH</p>
              </div>
              <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4 text-center">
                <p className="text-xs text-blue-600 mb-1">📋 Chèques</p>
                <p className="text-2xl font-black text-blue-700">{fmtAmount(totalCheques)}</p>
                <p className="text-xs text-blue-600">DH en attente</p>
              </div>
              <div className="bg-purple-50 rounded-2xl border border-purple-200 p-4 text-center">
                <p className="text-xs text-purple-600 mb-1">📝 Traites</p>
                <p className="text-2xl font-black text-purple-700">{fmtAmount(totalTraites)}</p>
                <p className="text-xs text-purple-600">DH en attente</p>
              </div>
            </div>

            {/* Total global */}
            <div className="bg-indigo-600 rounded-2xl p-5 text-white flex items-center justify-between">
              <div>
                <p className="text-indigo-200 text-sm">Total chèques/traites à suivre</p>
                <p className="text-3xl font-black">{fmtAmount(totalAll)} DH</p>
                <p className="text-indigo-300 text-xs mt-1">{myPending.length} document(s) non rapporté(s)</p>
              </div>
              {eligibleForRapport.length > 0 && (
                <button
                  onClick={() => setRapportModal({ loading: false, error: '', note: '', selected: eligibleForRapport.map(r => r.id) })}
                  className="flex items-center gap-2 bg-white text-indigo-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-indigo-50 transition shrink-0"
                >
                  <Send className="w-4 h-4" /> Créer rapport
                </button>
              )}
            </div>

            {/* Répartition par mode */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3">Répartition chèques / traites</h3>
              {documentReglements.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucun document saisi</p>
              ) : (
                <div className="space-y-3">
                  {REGLEMENT_MODES.filter(m => ['cheque', 'traite'].includes(m.key)).map(m => {
                    const items = documentReglements.filter(r => r.modeReglement === m.key)
                    const total = items.reduce((s, r) => s + (r.montant || 0), 0)
                    const pct = documentReglements.length ? Math.round(items.length / documentReglements.length * 100) : 0
                    return (
                      <div key={m.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700">{m.emoji} {m.label} ({items.length})</span>
                          <span className="font-bold text-gray-800">{fmtAmount(total)} DH</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            m.key === 'especes' ? 'bg-green-500' : m.key === 'cheque' ? 'bg-blue-500' : 'bg-purple-500'
                          }`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Alertes traites échues */}
            {(() => {
              const today = todayStr()
              const overdue = reglements.filter(r =>
                r.modeReglement === 'traite' && r.dateEcheance && r.dateEcheance <= today
                && !['verse_banque', 'rejete'].includes(r.status)
              )
              if (!overdue.length) return null
              return (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <h3 className="font-bold text-red-700 text-sm">Traites échues ({overdue.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {overdue.slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-center justify-between text-xs bg-white rounded-xl px-3 py-2 border border-red-100">
                        <span className="font-mono text-gray-600">{r.trackingNumber || '—'}</span>
                        <span className="text-gray-700">{r.expediteur}</span>
                        <span className="font-bold text-red-600">{fmtAmount(r.montant)} DH</span>
                        <span className="text-red-500">Éch. {fmtDate(r.dateEcheance)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Contrôle des documents — chèques / traites à vérifier */}
            {docsToControl.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-200 flex items-center justify-between">
                  <h3 className="font-bold text-blue-800 text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-600" /> Contrôle documents requis
                  </h3>
                  <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-semibold">{docsToControl.length}</span>
                </div>
                <p className="px-4 pt-2 pb-1 text-xs text-blue-700">Contrôlez les données, l'écriture et l'absence de falsification avant rapport au chef.</p>
                <div className="divide-y divide-blue-100">
                  {docsToControl.map(r => {
                    const mi = (MODE_INFO as any)[r.modeReglement] || {}
                    return (
                      <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 text-sm truncate">{r.expediteur || '—'}</p>
                          <p className="text-xs text-gray-500">{r.trackingNumber || '—'} · {mi.emoji} {mi.label}</p>
                          <p className="text-xs text-gray-400">{fmtAmount(r.montant)} DH · {r.banque || '—'} {r.numeroPiece ? `· N° ${r.numeroPiece}` : ''}</p>
                        </div>
                        <button
                          disabled={docVerifying[r.id]}
                          onClick={() => openDocControl(r)}
                          className="shrink-0 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                          {docVerifying[r.id] ? '…' : <><ShieldCheck className="w-3.5 h-3.5" /> Contrôler</>}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Dernières saisies */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800 text-sm">Dernières saisies</h3>
                <button onClick={() => setTab('reglements')} className="text-xs text-indigo-600 hover:underline">Voir tout →</button>
              </div>
              {documentReglements.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucun chèque/traite</p>
              ) : (
                <div className="space-y-2">
                  {documentReglements.slice(0, 5).map(r => {
                    const mi = (MODE_INFO as any)[r.modeReglement] || {}
                    const si = (STATUS_INFO as any)[r.status] || {}
                    return (
                      <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-lg">{mi.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{r.expediteur || '—'}</p>
                          <p className="text-xs text-gray-400">{r.trackingNumber || ''} · {fmtDate(r.createdAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-800">{fmtAmount(r.montant)} DH</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.badge}`}>{si.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RÈGLEMENTS ── */}
        {tab === 'reglements' && (
          <div className="space-y-3">
            {/* Actions bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher N° expéd., expéditeur, banque, pièce..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none bg-white"
                />
              </div>
              <button onClick={() => setShowFilters(f => !f)}
                className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${
                  hasActiveFilters ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                <Filter className="w-4 h-4" />
                {hasActiveFilters ? 'Filtres actifs' : 'Filtres'}
              </button>
              <button onClick={() => handleOpenForm()}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shrink-0">
                <Plus className="w-4 h-4" /> Nouveau
              </button>
            </div>

            {/* Filters panel */}
            {showFilters && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Date preset */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Période</label>
                    <select value={datePreset} onChange={e => setDatePreset(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="all">Toutes les dates</option>
                      <option value="today">Aujourd'hui</option>
                      <option value="week">7 derniers jours</option>
                      <option value="month">Ce mois</option>
                      <option value="custom">Personnalisé</option>
                    </select>
                  </div>
                  {/* Mode */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Mode de règlement</label>
                    <select value={modeFilter} onChange={e => setModeFilter(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="all">Tous les documents</option>
                      <option value="cheque">📋 Contre-Chèque</option>
                      <option value="traite">📝 Traite</option>
                    </select>
                  </div>
                  {/* Status */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Statut</label>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="all">Tous les statuts</option>
                      {REGLEMENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  {/* Banque */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Banque</label>
                    <select value={banqueFilter} onChange={e => setBanqueFilter(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="">Toutes les banques</option>
                      {allBanques.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  {/* Ville expédition */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Ville d'expédition</label>
                    <select value={villeFilter} onChange={e => setVilleFilter(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="">Toutes les villes</option>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {/* Montant range */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Montant (DH)</label>
                    <div className="flex gap-1 items-center">
                      <input type="number" placeholder="Min" value={montantMin} onChange={e => setMontantMin(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400" />
                      <span className="text-gray-400 text-xs shrink-0">–</span>
                      <input type="number" placeholder="Max" value={montantMax} onChange={e => setMontantMax(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                </div>
                {datePreset === 'custom' && (
                  <div className="flex gap-2 items-center">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400" />
                    <span className="text-gray-400 text-xs">au</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-indigo-400" />
                  </div>
                )}
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs text-gray-400">{filteredByDate.length} résultat(s)</span>
                  <button onClick={() => {
                    setModeFilter('all'); setStatusFilter('all'); setBanqueFilter(''); setVilleFilter('')
                    setMontantMin(''); setMontantMax(''); setDatePreset('all'); setDateFrom(''); setDateTo('')
                  }} className="text-xs text-indigo-600 hover:underline font-semibold">
                    Réinitialiser les filtres
                  </button>
                </div>
              </div>
            )}

            {/* Summary bar */}
            {filteredByDate.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {['cheque', 'traite'].map(mode => {
                  const items = filteredByDate.filter((r: any) => r.modeReglement === mode)
                  if (!items.length) return null
                  const mi = (MODE_INFO as any)[mode]
                  return (
                    <div key={mode} className={`shrink-0 ${mi.bg} ${mi.border} border rounded-xl px-3 py-2 flex items-center gap-2`}>
                      <span className="text-base">{mi.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">{items.length} {mi.label}</p>
                        <p className={`text-sm font-black ${mi.text}`}>{fmtAmount(items.reduce((s: any, r: any) => s + (r.montant || 0), 0))} DH</p>
                      </div>
                    </div>
                  )
                })}
                <div className="shrink-0 bg-gray-800 rounded-xl px-3 py-2 flex items-center gap-2">
                  <div>
                    <p className="text-xs text-gray-300">Total affiché</p>
                    <p className="text-sm font-black text-white">{fmtAmount(filteredByDate.reduce((s: any, r: any) => s + (r.montant || 0), 0))} DH</p>
                  </div>
                </div>
              </div>
            )}

            {/* List */}
            {loadingReglements ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredByDate.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Banknote className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Aucun chèque/traite trouvé</p>
                <button onClick={() => handleOpenForm()}
                  className="mt-4 text-sm text-indigo-600 font-semibold hover:underline">
                  + Ajouter un document
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredByDate.map((r: any) => {
                  const mi = (MODE_INFO as any)[r.modeReglement] || {}
                  const si = (STATUS_INFO as any)[r.status] || {}
                  const controlInfo = r.docVerified ? ((DOC_CONTROL_STATUS as any)[r.docControlStatus || 'correct'] || DOC_CONTROL_STATUS.correct) : null
                  const isEditable = r.status === 'en_attente'
                  return (
                    <div key={r.id} className={`bg-white rounded-2xl border ${mi.border || 'border-gray-200'} overflow-hidden`}>
                      {/* Top row */}
                      <div className={`flex items-center gap-3 px-4 py-3 ${mi.bg || ''}`}>
                        <span className="text-xl">{mi.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-800 text-sm truncate">{r.expediteur || '—'}</p>
                            {r.trackingNumber && <span className="text-xs font-mono text-gray-500 bg-white/60 px-1.5 py-0.5 rounded">{r.trackingNumber}</span>}
                          </div>
                          <p className="text-xs text-gray-500">{r.villeExpedition || '—'} · {fmtDate(r.createdAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-black ${mi.text}`}>{fmtAmount(r.montant)} DH</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.badge}`}>{si.label}</span>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="px-4 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 border-t border-gray-100">
                        {r.destinataire && <span><span className="text-gray-400">Destinataire :</span> {r.destinataire}</span>}
                        {r.destinataireTel && <span><span className="text-gray-400">Tél dest. :</span> {r.destinataireTel}</span>}
                        {r.banque && <span><span className="text-gray-400">Banque :</span> {r.banque}</span>}
                        {r.numeroPiece && <span><span className="text-gray-400">N° pièce :</span> {r.numeroPiece}</span>}
                        {r.dateEmission && <span><span className="text-gray-400">Date émission :</span> {fmtDate(r.dateEmission)}</span>}
                        {r.modeReglement === 'traite' && r.dateEcheance && (
                          <span className={r.dateEcheance <= todayStr() ? 'text-red-600 font-semibold' : ''}>
                            <span className="text-gray-400">Échéance :</span> {fmtDate(r.dateEcheance)}
                            {r.dateEcheance <= todayStr() && ' ⚠️'}
                          </span>
                        )}
                        {r.expediteurTel && <span><span className="text-gray-400">Tél expéd. :</span> {r.expediteurTel}</span>}
                        {r.notes && <span className="col-span-2"><span className="text-gray-400">Note :</span> {r.notes}</span>}
                        {controlInfo && (
                          <span className="col-span-2">
                            <span className="text-gray-400">Contrôle :</span>{' '}
                            <span className={`inline-flex px-2 py-0.5 rounded-full font-bold ${controlInfo.badge}`}>{controlInfo.label}</span>
                            {r.docControlNotes ? ` · ${r.docControlNotes}` : ''}
                          </span>
                        )}
                        {r.rejectionReason && (
                          <span className="col-span-2 text-red-600"><span className="font-semibold">Rejet :</span> {r.rejectionReason}</span>
                        )}
                        {!r.docVerified && ['cheque', 'traite'].includes(r.modeReglement) && (
                          <button onClick={() => openDocControl(r)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100 transition">
                            <ShieldCheck className="w-3 h-3" /> Contrôler
                          </button>
                        )}
                        {r.verseBanqueRef && (
                          <span><span className="text-gray-400">Réf. versement :</span> {r.verseBanqueRef}</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="px-4 py-2 flex gap-2 border-t border-gray-100 flex-wrap">
                        {r.status === 'en_attente' && (
                          <button onClick={() => handleMarkEncaisse(r)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100 transition">
                            <Check className="w-3 h-3" /> Marquer encaissé
                          </button>
                        )}
                        {!['remis_chef', 'verse_banque', 'rejete'].includes(r.status) && (
                          <button onClick={() => setRejectModal({ id: r.id, reason: '' })}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-500 font-semibold hover:bg-red-100 transition">
                            <X className="w-3 h-3" /> Rejeter
                          </button>
                        )}
                        {isEditable && (
                          <button onClick={() => handleOpenForm(r)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 text-gray-600 font-semibold hover:bg-gray-100 transition">
                            <Edit2 className="w-3 h-3" /> Modifier
                          </button>
                        )}
                        {isEditable && (
                          <button onClick={() => setDeleteConfirm(r)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 text-red-400 font-semibold hover:bg-red-50 transition">
                            <Trash2 className="w-3 h-3" /> Supprimer
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

        {/* ── RAPPORTS ── */}
        {tab === 'rapports' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">Mes rapports</h2>
                <p className="text-xs text-gray-400 mt-0.5">{eligibleForRapport.length} chèque(s)/traite(s) contrôlé(s) prêts à être soumis</p>
              </div>
              {eligibleForRapport.length > 0 && (
                <button
                  onClick={() => setRapportModal({ loading: false, error: '', note: '', selected: eligibleForRapport.map(r => r.id) })}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition">
                  <Send className="w-4 h-4" /> Nouveau rapport
                </button>
              )}
            </div>

            {rapports.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Aucun rapport soumis</p>
                <p className="text-xs mt-1">Soumettez vos règlements au chef d'agence</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rapports.map(rapport => {
                  const rs = (RAPPORT_STATUS as any)[rapport.status] || {}
                  return (
                    <div key={rapport.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-800 text-sm">Rapport du {fmtDate(rapport.date)}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rs.badge}`}>{rs.label}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{rapport.nbEntries} valeur(s) contrôlée(s) · soumis {fmtDate(rapport.submittedAt)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setViewRapportModal(rapport)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-semibold hover:bg-gray-200 transition">
                            <Eye className="w-3 h-3" /> Voir
                          </button>
                          <button onClick={() => handlePrintRapport(rapport)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 transition">
                            <Printer className="w-3 h-3" /> Imprimer
                          </button>
                        </div>
                      </div>
                      <div className="px-4 py-3 grid grid-cols-2 gap-3 text-center">
                        <div>
                          <p className="text-xs text-gray-400">📋 Chèques</p>
                          <p className="text-sm font-bold text-blue-700">{fmtAmount(rapport.totalCheques)} DH</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">📝 Traites</p>
                          <p className="text-sm font-bold text-purple-700">{fmtAmount(rapport.totalTraites)} DH</p>
                        </div>
                      </div>
                      <div className="px-4 pb-3 flex items-center justify-between">
                        <span className="text-xs text-gray-400">Total</span>
                        <span className="text-base font-black text-gray-800">{fmtAmount(rapport.totalMontant)} DH</span>
                      </div>
                      {rapport.chefNotes && (
                        <div className={`px-4 py-2 text-xs border-t ${rapport.status === 'rejete' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                          <span className="font-semibold">Chef : </span>{rapport.chefNotes}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── LIVREURS ── */}
        {tab === 'livreurs' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-gray-800">Contrôle retour de fond</h2>
              <p className="text-xs text-gray-400 mt-0.5">Chèques et traites déjà remis au chef d'agence, à contrôler pour le suivi fournisseur</p>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs text-amber-600 font-semibold">Chèques/traites validés par le chef</p>
                <p className="text-2xl font-black text-amber-700 mt-1">{codFromLivreur.length}</p>
                <p className="text-xs text-amber-500 mt-0.5">{fmtAmount(codFromLivreur.reduce((s, p) => s + (p.codAmount || 0), 0))} DH</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <p className="text-xs text-green-600 font-semibold">Port dû direct chef</p>
                <p className="text-2xl font-black text-green-700 mt-1">{portDuFromLivreur.length}</p>
                <p className="text-xs text-green-500 mt-0.5">Hors circuit pointeur</p>
              </div>
            </div>

            {/* RETOUR FOND validé par le chef, puis contrôlé par le pointeur */}
            {codFromLivreur.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2 bg-amber-50">
                  <span className="text-base">💰</span>
                  <h3 className="font-bold text-amber-700 text-sm">Chèques / traites validés par le chef — à contrôler</h3>
                  <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{codFromLivreur.length}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {codFromLivreur.map(p => {
                    const t = (codTypeMap as any)[p.codPaymentType || p.serviceType] || 'especes'
                    const mi = (MODE_INFO as any)[t] || MODE_INFO.especes
                    return (
                      <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-gray-800 font-mono">{p.trackingId}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${mi.badge}`}>{mi.emoji} {mi.label}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{p.sender?.name} → {p.receiver?.name}</p>
                          <p className="text-xs text-indigo-600 mt-0.5">🚴 {p.deliveryDriverName || p.codCollectedBy || '—'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-amber-700">{fmtAmount(p.codAmount)} DH</p>
                          <button
                            onClick={() => handleOpenFormFromCod(p)}
                            className="mt-1 flex items-center gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                          >
                            <Banknote className="w-3 h-3" /> Pointer
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Port dû from livreurs — ancien circuit masqué: remise directe au chef */}
            {portDuFromLivreur.length > 0 && (
              <div className="bg-white rounded-2xl border border-green-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-green-100 flex items-center gap-2 bg-green-50">
                  <span className="text-base">📮</span>
                  <h3 className="font-bold text-green-700 text-sm">Port dû collecté par livreurs</h3>
                  <span className="ml-auto bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{portDuFromLivreur.length}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {portDuFromLivreur.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-800 font-mono">{p.trackingId}</p>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">💵 Port dû espèces</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{p.sender?.name} → {p.receiver?.name}</p>
                        <p className="text-xs text-indigo-500 mt-0.5">🚴 {p.portCollectedBy || p.deliveryDriverName || '—'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-black text-green-700">{fmtAmount(p.price || 0)} DH</p>
                        <button
                          onClick={() => handleReceiveLivreurPortDu(p)}
                          disabled={livreurReceiving[p.id]}
                          className="mt-1 flex items-center gap-1 text-xs bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                        >
                          {livreurReceiving[p.id]
                            ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                            : <Banknote className="w-3 h-3" />
                          }
                          Pointer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Remboursements RETOUR FOND — colis retournés ── */}
            {codRetournesARemb.length > 0 && (
              <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
                  <span className="text-base">↩️</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-red-700 text-sm">Remboursements à effectuer</h3>
                    <p className="text-xs text-red-500 mt-0.5">Colis retournés — le livreur avait déjà collecté le RETOUR FOND</p>
                  </div>
                  <span className="ml-auto bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shrink-0">{codRetournesARemb.length}</span>
                </div>
                {refundError && (
                  <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                    <span>⚠️</span><span>{refundError}</span>
                    <button onClick={() => setRefundError('')} className="ml-auto font-bold">✕</button>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {codRetournesARemb.map(p => {
                    const modeEmoji = (({ especes: '💵', cheque: '📋', traite: '📝', bon_livraison: '📄' }) as Record<string, string>)[p.codPaymentType] || '💰'
                    return (
                      <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-gray-800 font-mono">{p.trackingId}</p>
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">Retourné</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{modeEmoji} {p.codPaymentType || 'collecté'}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="font-semibold">Expéditeur :</span> {p.sender?.name || '—'}
                          </p>
                          <p className="text-xs text-gray-500">
                            <span className="font-semibold">Destinataire :</span> {p.receiver?.name || '—'}
                          </p>
                          <p className="text-xs text-indigo-500 mt-0.5">
                            🚴 Collecté par : {p.codCollectedBy || p.deliveryDriverName || '—'}
                          </p>
                          <p className="text-xs text-orange-600 mt-1 bg-orange-50 rounded-lg px-2 py-1">
                            ⚠️ Le client peut récupérer sa valeur auprès du pointeur-encaisseur
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-red-700">{fmtAmount(p.codAmount)} DH</p>
                          <button
                            onClick={() => handleRefundClient(p)}
                            disabled={refunding[p.id]}
                            className="mt-2 flex items-center gap-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white px-2.5 py-1.5 rounded-lg font-semibold transition"
                          >
                            {refunding[p.id]
                              ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                              : '↩️'
                            }
                            Rembourser
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {codFromLivreur.length === 0 && portDuFromLivreur.length === 0 && codRetournesARemb.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-semibold">Aucune valeur à contrôler</p>
                <p className="text-xs mt-1 text-gray-300">Les chèques, traites, bons de livraison et espèces validés par le chef apparaissent ici</p>
              </div>
            )}
          </div>
        )}

        {/* ── RETOUR FONDs ── */}
        {tab === 'cods' && (
          <div className="space-y-3">
            {/* ⭐ COD RÉCEPTIONNÉS À ENVOYER À L'AGENCE SOURCE */}
            {dst_aEnvoyer.length > 0 && (
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border-2 border-orange-300 overflow-hidden">
                <div className="bg-white/80 backdrop-blur px-4 py-3 border-b border-orange-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center text-lg">📤</div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-800">Réceptionnés — à envoyer agence source</h3>
                        <p className="text-xs text-gray-500">Chèques et traites validés prêts pour l'envoi</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-orange-600 font-semibold">{dst_aEnvoyer.length} document{dst_aEnvoyer.length > 1 ? 's' : ''}</p>
                      <p className="text-lg font-black text-orange-600">{fmtAmount(totDstEnvoy)} DH</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-orange-100">
                  {dst_aEnvoyer.map(p => {
                    const isSending = codSending === p.id
                    const t = (codTypeMap as any)[p.codPaymentType || p.serviceType] || 'cheque'
                    const isTraite = t === 'traite'
                    return (
                      <div key={p.id} className="bg-white/60 hover:bg-white/80 transition px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{isTraite ? '📝' : '📋'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className="font-bold text-sm text-gray-800 font-mono">{p.trackingId || '—'}</p>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Réceptionné ✓</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isTraite ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {isTraite ? 'Traite' : 'Chèque'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-600">
                              {p.sender?.name && <span><span className="text-gray-400">Expéditeur :</span> {p.sender.name}</span>}
                              {p.receiver?.name && <span><span className="text-gray-400">Destinataire :</span> {p.receiver.name}</span>}
                              {p.originCity && <span><span className="text-gray-400">Agence source :</span> {p.originCity}</span>}
                              {p.codReceivedByChefAt && <span><span className="text-gray-400">Réceptionné le :</span> {fmtDate(p.codReceivedByChefAt)}</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-black text-orange-600">{fmtAmount(p.codAmount)} DH</p>
                            <button onClick={() => handleSendToChef(p)} disabled={isSending}
                              className="mt-2 flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl font-bold transition">
                              {isSending ? (
                                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi...</>
                              ) : (
                                <>📤 Envoyer au chef d'agence</>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ⭐ COD ENVOYÉS AU CHEF ET TRAITÉS */}
            {dst_envoyes.length > 0 && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-300 overflow-hidden">
                <div className="bg-white/80 backdrop-blur px-4 py-3 border-b border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center text-lg">✓</div>
                      <div>
                        <h3 className="text-sm font-bold text-gray-800">Envoyés à l'agence source</h3>
                        <p className="text-xs text-gray-500">Traités par le chef d'agence</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-blue-600 font-semibold">{dst_envoyes.length} document{dst_envoyes.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-blue-100">
                  {dst_envoyes.map(p => {
                    const t = (codTypeMap as any)[p.codPaymentType || p.serviceType] || 'cheque'
                    const isValidated = p.codValidatedByChef === true
                    return (
                      <div key={p.id} className="bg-white/60 hover:bg-white/80 transition px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs font-bold text-gray-700">{p.trackingId || p.id?.slice(0, 8)}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-blue-300 text-blue-700 font-semibold">
                                {t === 'cheque' ? '📋 Chèque' : '📝 Traite'}
                              </span>
                              {isValidated ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                                  ✅ Validé par chef
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">
                                  ⚠️ Sans validation
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 space-y-0.5">
                              <div><span className="text-gray-400">Montant :</span> <span className="font-bold text-blue-600">{fmtAmount(p.codAmount)} DH</span></div>
                              {p.codSentToSourceAt && <div><span className="text-gray-400">Envoyé le :</span> {fmtDate(p.codSentToSourceAt)}</div>}
                              {p.codSentToSourceBy && <div><span className="text-gray-400">Par :</span> {p.codSentToSourceBy}</div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* KPI bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Total RETOUR FONDs</p>
                <p className="text-2xl font-black text-gray-800">{codParcels.length}</p>
              </div>
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-3 text-center">
                <p className="text-xs text-amber-600 mb-1">Non pointés</p>
                <p className="text-2xl font-black text-amber-700">{codNonPointed.length}</p>
              </div>
              <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-3 text-center">
                <p className="text-xs text-indigo-600 mb-1">Montant non pointé</p>
                <p className="text-sm font-black text-indigo-700">{fmtAmount(codTotalNonPointe)} DH</p>
              </div>
            </div>

            {/* Search + filters */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={codSearch} onChange={e => setCodSearch(e.target.value)}
                  placeholder="N° expédition, expéditeur, destinataire, livreur..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-indigo-400 focus:outline-none" />
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-semibold self-center">Type :</span>
                {[['all','Tous'], ['cheque','📋 Chèque'], ['traite','📝 Traite']].map(([v, l]) => (
                  <button key={v} onClick={() => setCodTypeFilter(v)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold border transition ${codTypeFilter === v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-semibold self-center">Pointage :</span>
                {[['all','Tous'], ['non_pointe','Non pointés'], ['pointe','Pointés']].map(([v, l]) => (
                  <button key={v} onClick={() => setCodPointFilter(v)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold border transition ${codPointFilter === v ? 'bg-amber-500 border-amber-500 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {loadingCod ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : codFiltered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Aucun RETOUR FOND trouvé</p>
              </div>
            ) : (
              <div className="space-y-2">
                {codFiltered.map(p => {
                  const isPointed = pointedParcelIds.has(p.id)
                  const linkedReg = isPointed ? reglements.find(r => r.parcelId === p.id) : null
                  const t = (codTypeMap as any)[p.codPaymentType || p.serviceType] || 'especes'
                  const mi = (MODE_INFO as any)[t] || MODE_INFO.especes
                  return (
                    <div key={p.id} className={`bg-white rounded-2xl border ${isPointed ? 'border-green-200' : 'border-amber-200'} overflow-hidden`}>
                      <div className={`flex items-center gap-3 px-4 py-3 ${isPointed ? 'bg-green-50' : 'bg-amber-50'}`}>
                        <span className="text-xl">{mi.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-800 text-sm">{p.trackingId || '—'}</p>
                            {isPointed
                              ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Pointé</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Non pointé</span>
                            }
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                            <MapPin className="w-3 h-3" />{p.originCity || '—'} <ArrowRight className="w-3 h-3" /> {profile?.city}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-black ${mi.text}`}>{fmtAmount(p.codAmount)} DH</p>
                          <p className="text-xs text-gray-400">{mi.label}</p>
                        </div>
                      </div>

                      <div className="px-4 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 border-t border-gray-100">
                        {p.sender?.name && <span><span className="text-gray-400">Expéditeur :</span> {p.sender.name}</span>}
                        {p.receiver?.name && <span><span className="text-gray-400">Destinataire :</span> {p.receiver.name}</span>}
                        {p.sender?.tel && <span><span className="text-gray-400">Tél expéd. :</span> {p.sender.tel}</span>}
                        {p.receiver?.tel && <span><span className="text-gray-400">Tél dest. :</span> {p.receiver.tel}</span>}
                        {p.deliveryDriverName && <span><span className="text-gray-400">Livreur :</span> {p.deliveryDriverName}</span>}
                        {p.createdAt && <span><span className="text-gray-400">Date :</span> {fmtDate(p.createdAt)}</span>}
                        {linkedReg && <span className="col-span-2 text-green-700"><span className="font-semibold">Règlement :</span> {linkedReg.trackingNumber || linkedReg.id} · {fmtAmount(linkedReg.montant)} DH</span>}
                      </div>

                      {!isPointed && (
                        <div className="px-4 py-2 border-t border-gray-100">
                          <button onClick={() => handleOpenFormFromCod(p)}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition">
                            <Package className="w-4 h-4" /> Pointer ce RETOUR FOND → créer règlement
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── RETOUR DOCS ── */}
        {tab === 'retour' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">Bordereaux de retour</h2>
                <p className="text-xs text-gray-400 mt-0.5">{retourEligible.length} document(s) chèque/traite éligibles au retour</p>
              </div>
              {retourVilles.length > 0 && (
                <button
                  onClick={() => setRetourModal({ destAgency: '', selectedIds: [], notes: '', loading: false, error: '' })}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition shrink-0">
                  <Plus className="w-4 h-4" /> Créer bordereau
                </button>
              )}
            </div>

            {retourVilles.length === 0 && retourDocs.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <ArrowRight className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Aucun document à retourner</p>
                <p className="text-xs mt-1">Les chèques et traites d'autres agences apparaîtront ici</p>
              </div>
            )}

            {retourEligible.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                <p className="text-xs font-semibold text-amber-700 mb-2">Documents en attente de retour par ville :</p>
                <div className="flex flex-wrap gap-2">
                  {retourVilles.map(v => {
                    const docs = retourEligible.filter(r => r.villeExpedition === v)
                    return (
                      <div key={v} className="bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs">
                        <span className="font-semibold text-gray-700">{v}</span>
                        <span className="text-amber-600 ml-1">· {docs.length} doc(s) · {fmtAmount(docs.reduce((s,r)=>s+r.montant,0))} DH</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {retourDocs.length > 0 && (
              <div className="space-y-2">
                {retourDocs.map(rd => (
                  <div key={rd.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-800 text-sm font-mono">{rd.retourRef}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            rd.status === 'recu_expediteurs' ? 'bg-blue-100 text-blue-700' :
                            rd.status === 'expedie' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {rd.status === 'recu_expediteurs' ? 'Arrivé aux expéditeurs' : rd.status === 'expedie' ? 'Expédié' : 'Brouillon'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Vers : <span className="font-semibold text-gray-600">{rd.destinationAgency}</span> · {rd.nbDocuments} doc(s) · {fmtAmount(rd.totalMontant)} DH
                        </p>
                        <p className="text-xs text-gray-400">{fmtDate(rd.createdAt)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handlePrintRetour(rd)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 transition">
                          <Printer className="w-3 h-3" /> Imprimer
                        </button>
                        {rd.status === 'brouillon' && (
                          <>
                            <button onClick={async () => { try { await expedierRetourDocument(rd.id) } catch {} }}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-green-50 text-green-600 font-semibold hover:bg-green-100 transition">
                              <Send className="w-3 h-3" /> Expédier
                            </button>
                            <button onClick={async () => { try { await deleteRetourDocument(rd.id) } catch {} }}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-400 font-semibold hover:bg-red-100 transition">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        {rd.status === 'expedie' && (
                          <button onClick={async () => { try { await confirmRetourDocumentArrived(rd.id, profile?.name || '') } catch {} }}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 font-semibold hover:bg-blue-100 transition">
                            <CheckCircle2 className="w-3 h-3" /> Arrivé expéditeurs
                          </button>
                        )}
                      </div>
                    </div>
                    {rd.notes && (
                      <div className="px-4 py-2 text-xs text-gray-500 bg-white">
                        <span className="font-semibold">Notes : </span>{rd.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── MODAL SAISIE ── */}
      {formModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <h3 className="font-bold text-gray-800">{formModal.mode === 'new' ? 'Nouveau règlement' : 'Modifier le règlement'}</h3>
              <button onClick={() => setFormModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSaveReglement} className="flex-1 overflow-y-auto p-5 space-y-4">
              {formModal.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{formModal.error}</div>
              )}

              {/* Mode de règlement */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Mode de règlement * (Entrée pour naviguer, Espace pour sélectionner)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    ref={modeReglementChequeRef}
                    type="button"
                    onClick={() => setFormModal((f: any) => ({ ...f, data: { ...f.data, modeReglement: 'cheque' } }))}
                    onKeyDown={(e) => handleFormKeyDown(e, 'modeCheque')}
                    className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                      formModal.data.modeReglement === 'cheque'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                    }`}>
                    <span className="text-xl">📋</span>
                    <span className="text-xs">Contre-Chèque</span>
                  </button>
                  <button
                    ref={modeReglementTraiteRef}
                    type="button"
                    onClick={() => setFormModal((f: any) => ({ ...f, data: { ...f.data, modeReglement: 'traite' } }))}
                    onKeyDown={(e) => handleFormKeyDown(e, 'modeTraite')}
                    className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-sm font-semibold transition ${
                      formModal.data.modeReglement === 'traite'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                    }`}>
                    <span className="text-xl">📝</span>
                    <span className="text-xs">Traite</span>
                  </button>
                </div>
              </div>

              {/* N° expédition + montant */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">N° d'expédition</label>
                  <input
                    ref={trackingNumberRef}
                    type="text"
                    value={formModal.data.trackingNumber}
                    onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, trackingNumber: e.target.value } }))}
                    onKeyDown={e => handleFormKeyDown(e, 'trackingNumber')}
                    placeholder="Ex: BGE-2025-001234"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Montant (DH) *</label>
                  <input
                    ref={montantRef}
                    type="number"
                    step="0.01"
                    min="0"
                    value={formModal.data.montant}
                    onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, montant: e.target.value } }))}
                    onKeyDown={e => handleFormKeyDown(e, 'montant')}
                    placeholder="0.00"
                    required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Expéditeur */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Expéditeur *</label>
                  <input
                    ref={expediteurRef}
                    type="text"
                    value={formModal.data.expediteur}
                    onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, expediteur: e.target.value } }))}
                    onKeyDown={e => handleFormKeyDown(e, 'expediteur')}
                    placeholder="Nom de l'expéditeur"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Tél. expéditeur</label>
                  <input
                    ref={expediteurTelRef}
                    type="tel"
                    value={formModal.data.expediteurTel}
                    onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, expediteurTel: e.target.value } }))}
                    onKeyDown={e => handleFormKeyDown(e, 'expediteurTel')}
                    placeholder="06XXXXXXXX"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Destinataire */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Destinataire</label>
                  <input
                    ref={destinataireRef}
                    type="text"
                    value={formModal.data.destinataire}
                    onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, destinataire: e.target.value } }))}
                    onKeyDown={e => handleFormKeyDown(e, 'destinataire')}
                    placeholder="Nom du destinataire"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Tél. destinataire</label>
                  <input
                    ref={destinataireTelRef}
                    type="tel"
                    value={formModal.data.destinataireTel}
                    onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, destinataireTel: e.target.value } }))}
                    onKeyDown={e => handleFormKeyDown(e, 'destinataireTel')}
                    placeholder="06XXXXXXXX"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Ville expédition */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Ville d'expédition</label>
                <select
                  ref={villeExpeditionRef}
                  value={formModal.data.villeExpedition}
                  onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, villeExpedition: e.target.value } }))}
                  onKeyDown={e => handleFormKeyDown(e, 'villeExpedition')}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none">
                  <option value="">— Sélectionner une ville —</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Banque / pièce (chèque/traite) */}
              {['cheque', 'traite'].includes(formModal.data.modeReglement) && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Banque *</label>
                      <input
                        ref={banqueRef}
                        type="text"
                        value={formModal.data.banque}
                        onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, banque: e.target.value } }))}
                        onKeyDown={e => handleFormKeyDown(e, 'banque')}
                        placeholder="Ex: Attijariwafa, CIH..."
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">N° Pièce</label>
                      <input
                        ref={numeroPieceRef}
                        type="text"
                        value={formModal.data.numeroPiece}
                        onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, numeroPiece: e.target.value } }))}
                        onKeyDown={e => handleFormKeyDown(e, 'numeroPiece')}
                        placeholder="N° chèque ou traite"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date d'émission</label>
                      <input
                        ref={dateEmissionRef}
                        type="date"
                        value={formModal.data.dateEmission}
                        onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, dateEmission: e.target.value } }))}
                        onKeyDown={e => handleFormKeyDown(e, 'dateEmission')}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                    {formModal.data.modeReglement === 'traite' && (
                      <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Date d'échéance</label>
                        <input
                          ref={dateEcheanceRef}
                          type="date"
                          value={formModal.data.dateEcheance}
                          onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, dateEcheance: e.target.value } }))}
                          onKeyDown={e => handleFormKeyDown(e, 'dateEcheance')}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Notes</label>
                <textarea
                  ref={notesRef}
                  value={formModal.data.notes}
                  onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, notes: e.target.value } }))}
                  onKeyDown={e => handleFormKeyDown(e, 'notes')}
                  rows={2}
                  placeholder="Observations, remarques..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button type="button" onClick={() => setFormModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button type="submit" disabled={formModal.loading}
                  className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {formModal.loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  {formModal.mode === 'new' ? 'Enregistrer' : 'Modifier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL CONTRÔLE DOCUMENT ── */}
      {docControlModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h3 className="font-bold text-gray-800">Contrôle {(MODE_INFO as any)[docControlModal.reglement.modeReglement]?.label}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{docControlModal.reglement.trackingNumber || '—'} · {docControlModal.reglement.expediteur || '—'}</p>
              </div>
              <button onClick={() => setDocControlModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {docControlModal.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{docControlModal.error}</div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <span><span className="text-gray-400">Banque :</span> {docControlModal.reglement.banque || '—'}</span>
                <span><span className="text-gray-400">N° pièce :</span> {docControlModal.reglement.numeroPiece || '—'}</span>
                <span><span className="text-gray-400">Montant :</span> {fmtAmount(docControlModal.reglement.montant)} DH</span>
                <span><span className="text-gray-400">Échéance :</span> {docControlModal.reglement.modeReglement === 'traite' ? fmtDate(docControlModal.reglement.dateEcheance) : '—'}</span>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={docControlModal.checks.dataCorrect}
                    onChange={e => setDocControlModal((m: any) => ({ ...m, checks: { ...m.checks, dataCorrect: e.target.checked } }))}
                    className="w-4 h-4 accent-green-600" />
                  Données correctes (montant, banque, numéro, dates)
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={docControlModal.checks.writingClean}
                    onChange={e => setDocControlModal((m: any) => ({ ...m, checks: { ...m.checks, writingClean: e.target.checked } }))}
                    className="w-4 h-4 accent-green-600" />
                  Écriture lisible, sans faute importante
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={docControlModal.checks.noFalsification}
                    onChange={e => setDocControlModal((m: any) => ({ ...m, checks: { ...m.checks, noFalsification: e.target.checked } }))}
                    className="w-4 h-4 accent-green-600" />
                  Aucun signe de falsification
                </label>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">État du contrôle</label>
                <select value={docControlModal.status}
                  onChange={e => setDocControlModal((m: any) => ({ ...m, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none">
                  <option value="correct">Données correctes</option>
                  <option value="anomalie">Anomalie écriture/données</option>
                  <option value="suspect">Suspicion falsification</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Notes de contrôle</label>
                <textarea rows={3} value={docControlModal.notes}
                  onChange={e => setDocControlModal((m: any) => ({ ...m, notes: e.target.value }))}
                  placeholder="Ex: numéro vérifié, signature lisible, anomalie constatée..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setDocControlModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button onClick={handleDocVerify} disabled={docControlModal.loading}
                  className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2">
                  {docControlModal.loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Enregistrer contrôle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RAPPORT ── */}
      {rapportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <div>
                <h3 className="font-bold text-gray-800">Créer un rapport</h3>
                <p className="text-xs text-gray-400 mt-0.5">Sélectionnez les chèques/traites contrôlés à envoyer au chef</p>
              </div>
              <button onClick={() => setRapportModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {rapportModal.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{rapportModal.error}</div>
              )}

              {/* Select all */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">{rapportModal.selected.length} / {eligibleForRapport.length} sélectionné(s)</p>
                <button type="button" onClick={() => {
                  const selectable = eligibleForRapport.map(x => x.id)
                  setRapportModal((r: any) => ({
                    ...r,
                    selected: r.selected.length === selectable.length ? [] : selectable,
                  }))
                }}
                  className="text-xs text-indigo-600 font-semibold hover:underline">
                  {rapportModal.selected.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {eligibleForRapport.map(r => {
                  const mi = (MODE_INFO as any)[r.modeReglement] || {}
                  const selected = rapportModal.selected.includes(r.id)
                  const controlInfo = (DOC_CONTROL_STATUS as any)[r.docControlStatus || 'correct'] || DOC_CONTROL_STATUS.correct
                  return (
                    <div key={r.id}
                      onClick={() => setRapportModal((m: any) => ({
                        ...m,
                        selected: selected ? m.selected.filter((id: any) => id !== r.id) : [...m.selected, r.id]
                      }))}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition ${
                        selected
                            ? 'border-indigo-500 bg-indigo-50 cursor-pointer'
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300 cursor-pointer'
                      }`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                      }`}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-base">{mi.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{r.expediteur || '—'}</p>
                        <p className="text-xs text-gray-400">{r.trackingNumber || '—'}</p>
                        <span className={`inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${controlInfo.badge}`}>
                          {controlInfo.label}
                        </span>
                      </div>
                      <span className={`text-sm font-bold ${mi.text} shrink-0`}>{fmtAmount(r.montant)} DH</span>
                    </div>
                  )
                })}
              </div>

              {/* Total sélectionné */}
              {rapportModal.selected.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm text-indigo-700">Total contrôlé</span>
                  <span className="text-base font-black text-indigo-700">
                    {fmtAmount(eligibleForRapport.filter(r => rapportModal.selected.includes(r.id)).reduce((s, r) => s + (r.montant || 0), 0))} DH
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Note (optionnel)</label>
                <textarea rows={2} value={rapportModal.note}
                  onChange={e => setRapportModal((m: any) => ({ ...m, note: e.target.value }))}
                  placeholder="Remarque pour le chef d'agence..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setRapportModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button onClick={handleCreateRapport} disabled={rapportModal.loading || !rapportModal.selected.length}
                  className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2">
                  {rapportModal.loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                  Soumettre au chef
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VIEW RAPPORT ── */}
      {viewRapportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <h3 className="font-bold text-gray-800">Rapport du {fmtDate(viewRapportModal.date)}</h3>
              <div className="flex gap-2">
                <button onClick={() => handlePrintRapport(viewRapportModal)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-semibold">
                  <Printer className="w-3 h-3" /> Imprimer
                </button>
                <button onClick={() => setViewRapportModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-600">📋 Chèques</p>
                  <p className="font-black text-blue-700">{fmtAmount(viewRapportModal.totalCheques)} DH</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3">
                  <p className="text-xs text-purple-600">📝 Traites</p>
                  <p className="font-black text-purple-700">{fmtAmount(viewRapportModal.totalTraites)} DH</p>
                </div>
              </div>
              <div className="flex justify-between items-center px-1">
                <span className="text-sm text-gray-500">Total général</span>
                <span className="text-xl font-black text-gray-800">{fmtAmount(viewRapportModal.totalMontant)} DH</span>
              </div>
              <div className="space-y-2">
                {reglements.filter(r => viewRapportModal.entryIds?.includes(r.id)).map(r => {
                  const mi = (MODE_INFO as any)[r.modeReglement] || {}
                  const controlInfo = (DOC_CONTROL_STATUS as any)[r.docControlStatus || 'correct'] || DOC_CONTROL_STATUS.correct
                  return (
                    <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 ${mi.bg} rounded-xl border ${mi.border}`}>
                      <span className="text-base">{mi.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{r.expediteur}</p>
                        <p className="text-xs text-gray-500">{r.trackingNumber || '—'} · {r.banque || '—'}</p>
                        <span className={`inline-flex mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${controlInfo.badge}`}>
                          {controlInfo.label}
                        </span>
                        {r.docControlNotes && <p className="text-xs text-gray-500 mt-1">{r.docControlNotes}</p>}
                      </div>
                      <span className={`text-sm font-black ${mi.text}`}>{fmtAmount(r.montant)} DH</span>
                    </div>
                  )
                })}
              </div>
              {viewRapportModal.notes && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                  <span className="font-semibold">Note : </span>{viewRapportModal.notes}
                </p>
              )}
              {viewRapportModal.chefNotes && (
                <p className={`text-xs rounded-xl px-3 py-2 ${
                  viewRapportModal.status === 'rejete' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  <span className="font-semibold">Chef d'agence ({viewRapportModal.validatedBy}) : </span>{viewRapportModal.chefNotes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL REJET ── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800">Rejeter ce règlement</h3>
            <textarea rows={3} value={rejectModal.reason}
              onChange={e => setRejectModal((m: any) => ({ ...m, reason: e.target.value }))}
              placeholder="Motif du rejet (optionnel)..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setRejectModal(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={handleReject}
                className="py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition">
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VERSÉ BANQUE ── */}
      {verseBanqueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><Building2 className="w-5 h-5 text-green-600" /></div>
              <h3 className="font-bold text-gray-800">Marquer versé à la banque</h3>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Référence de versement</label>
              <input type="text" value={verseBanqueModal.ref}
                onChange={e => setVerseBanqueModal((m: any) => ({ ...m, ref: e.target.value }))}
                placeholder="N° reçu, virement, etc."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setVerseBanqueModal(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={handleVerseBanque}
                className="py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold transition">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RETOUR ── */}
      {retourModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <div>
                <h3 className="font-bold text-gray-800">Créer un bordereau de retour</h3>
                <p className="text-xs text-gray-400 mt-0.5">Sélectionnez les documents à retourner</p>
              </div>
              <button onClick={() => setRetourModal(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {retourModal.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">{retourModal.error}</div>
              )}

              {/* Destination agency */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Agence destinataire *</label>
                <select value={retourModal.destAgency}
                  onChange={e => setRetourModal((m: any) => ({ ...m, destAgency: e.target.value, selectedIds: [] }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none">
                  <option value="">— Sélectionner la ville d'origine —</option>
                  {retourVilles.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {/* Select documents for chosen destination */}
              {retourModal.destAgency && (() => {
                const eligible = retourEligible.filter(r => r.villeExpedition === retourModal.destAgency)
                return (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Documents ({retourModal.selectedIds?.length || 0}/{eligible.length})</label>
                      <button type="button" onClick={() => setRetourModal((m: any) => ({
                        ...m,
                        selectedIds: m.selectedIds?.length === eligible.length ? [] : eligible.map(r => r.id)
                      }))} className="text-xs text-indigo-600 font-semibold hover:underline">
                        {retourModal.selectedIds?.length === eligible.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </button>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {eligible.map(r => {
                        const mi = (MODE_INFO as any)[r.modeReglement] || {}
                        const sel = retourModal.selectedIds?.includes(r.id)
                        return (
                          <div key={r.id}
                            onClick={() => setRetourModal((m: any) => ({
                              ...m,
                              selectedIds: sel ? m.selectedIds.filter((id: any) => id !== r.id) : [...(m.selectedIds || []), r.id]
                            }))}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition ${sel ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}>
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                              {sel && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-base">{mi.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{r.expediteur || '—'}</p>
                              <p className="text-xs text-gray-400">{r.trackingNumber || '—'} · {r.banque || '—'} · {r.numeroPiece || '—'}</p>
                            </div>
                            <span className={`text-sm font-bold ${mi.text} shrink-0`}>{fmtAmount(r.montant)} DH</span>
                          </div>
                        )
                      })}
                    </div>
                    {retourModal.selectedIds?.length > 0 && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between mt-2">
                        <span className="text-sm text-indigo-700">Total sélectionné</span>
                        <span className="text-base font-black text-indigo-700">
                          {fmtAmount(retourEligible.filter(r => retourModal.selectedIds.includes(r.id)).reduce((s,r)=>s+(r.montant||0),0))} DH
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Notes (optionnel)</label>
                <textarea rows={2} value={retourModal.notes}
                  onChange={e => setRetourModal((m: any) => ({ ...m, notes: e.target.value }))}
                  placeholder="Observations, remarques..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setRetourModal(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                  Annuler
                </button>
                <button onClick={handleCreateRetour} disabled={retourModal.loading || !retourModal.selectedIds?.length}
                  className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold transition flex items-center justify-center gap-2">
                  {retourModal.loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Créer le bordereau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DELETE ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-800">Supprimer ce règlement ?</h3>
              <p className="text-sm text-gray-500 mt-1">{deleteConfirm.expediteur} · {fmtAmount(deleteConfirm.montant)} DH</p>
              <p className="text-xs text-red-400 mt-2">Cette action est irréversible.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={handleDelete}
                className="py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold transition">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
