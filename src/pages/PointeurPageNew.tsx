import { useState, useEffect, useRef } from 'react'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase/config'
import { doc, onSnapshot } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  createReglement, updateReglement, deleteReglement,
  subscribeReglements, subscribeCodParcels,
} from '../firebase/firestore'
import { CITIES } from '../firebase/constants'
import {
  LogOut, Plus, X, Search, Banknote, Clock,
  CheckCircle2, Calendar, Building2, User,
  Phone, Hash, CreditCard, Eye, Trash2, Edit2,
  FileText, AlertCircle, CheckCircle, Filter,
} from 'lucide-react'
import { getWorkingDateStr } from '../utils/workingDate'

const todayStr = () => getWorkingDateStr()

const fmtDate = (iso: any) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return iso }
}
const fmtAmount = (n: any) => Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })

// Types de documents
const DOC_TYPES = [
  { key: 'cheque', label: 'Contre-Chèque', emoji: '📋', color: 'blue' },
  { key: 'traite', label: 'Traite', emoji: '📝', color: 'purple' },
]

// Statuts
const STATUSES = [
  { key: 'en_attente', label: 'En attente', color: 'amber', dot: 'bg-amber-400' },
  { key: 'encaisse', label: 'Encaissé', color: 'blue', dot: 'bg-blue-500' },
  { key: 'remis_chef', label: 'Remis au chef', color: 'indigo', dot: 'bg-indigo-500' },
  { key: 'verse_banque', label: 'Versé banque', color: 'green', dot: 'bg-green-500' },
  { key: 'rejete', label: 'Rejeté', color: 'red', dot: 'bg-red-500' },
]

const EMPTY_FORM = {
  // Colis
  trackingNumber: '',
  parcelId: '',
  villeExpedition: '',

  // Type de document
  modeReglement: 'cheque',
  montant: '',

  // Expéditeur du colis (bénéficiaire du chèque = celui qui reçoit l'argent)
  expediteur: '',
  expediteurTel: '',
  expediteurNic: '',

  // Destinataire du colis (émetteur du chèque = celui qui paie)
  destinataire: '',
  destinataireTel: '',

  // Document
  banque: '',
  numeroPiece: '',
  dateEmission: todayStr(),
  dateEcheance: '',
  notes: '',
}

export default function PointeurPageNew() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<any>(null)
  const [reglements, setReglements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<any>(null)
  const previousCountRef = useRef<number>(0)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [montantMin, setMontantMin] = useState('')
  const [montantMax, setMontantMax] = useState('')
  const [banqueFilter, setBanqueFilter] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Modal
  const [formModal, setFormModal] = useState<any>(null)
  const [viewModal, setViewModal] = useState<any>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)

  // Auth
  useEffect(() => {
    const user = auth.currentUser
    if (!user) { navigate('/login'); return }

    const unsub = onSnapshot(doc(db, 'users', user.uid), snap => {
      if (!snap.exists()) { navigate('/login'); return }
      const data = snap.data()
      if (data.role !== 'pointeur_encaisseur') {
        alert('Accès réservé au Pointeur-Encaisseur')
        signOut(auth).then(() => navigate('/login'))
        return
      }
      setProfile({ id: snap.id, ...data })
    })
    return () => unsub()
  }, [navigate])

  // Subscribe reglements + colis RETOUR FOND
  useEffect(() => {
    if (!profile?.city) return
    setLoading(true)

    let reglementsList: any[] = []
    let colisList: any[] = []

    // 1. Charger règlements manuels
    const unsubReglements = subscribeReglements(profile.city, null, (data: any) => {
      reglementsList = data.filter((r: any) => ['cheque', 'traite'].includes(r.modeReglement))
      combineAndUpdate()
    })

    // 2. Charger colis avec RETOUR FOND en chèque/traite
    const unsubColis = subscribeCodParcels(profile.city, (codData: any) => {
      if (!codData || !Array.isArray(codData)) {
        console.log('⚠️ Aucune donnée COD reçue')
        colisList = []
        combineAndUpdate()
        return
      }

      console.log('🔍 Total colis COD chargés:', codData.length)
      console.log('🔍 Exemples de codPaymentType:', codData.slice(0, 5).map((p: any) => ({ id: p.trackingId, type: p.codPaymentType, amount: p.codAmount })))

      colisList = codData
        .filter((p: any) =>
          p.codAmount > 0 &&
          (p.codPaymentType === 'cod_cheque' || p.codPaymentType === 'cod_traite')
        )
        .map((p: any) => ({
          id: p.id,
          trackingNumber: p.trackingId,
          modeReglement: p.codPaymentType === 'cod_cheque' ? 'cheque' : 'traite',
          montant: p.codAmount || 0,
          destinataire: p.receiver?.name || '',
          destinataireTel: p.receiver?.tel || '',
          expediteur: p.sender?.name || '',
          expediteurTel: p.sender?.tel || '',
          expediteurNic: p.sender?.nic || '',
          banque: p.codBankName || 'Non spécifié',
          numeroPiece: p.codCheckNumber || 'N/A',
          status: p.codCollected ? 'encaisse' : 'en_attente',
          createdAt: p.createdAt,
          villeExpedition: p.originCity || '',
          notes: `RETOUR FOND - Colis ${p.trackingId}`,
          fromParcel: true,
        }))

      console.log('✅ Colis avec chèque/traite filtrés:', colisList.length)
      combineAndUpdate()
    })

    function combineAndUpdate() {
      // Combiner les deux sources
      const documents = [...reglementsList, ...colisList]

      // Trier par date
      documents.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })

      // Détecter nouveaux documents
      if (!loading && documents.length > previousCountRef.current) {
        const newCount = documents.length - previousCountRef.current
        const lastDoc = documents[0] // Le plus récent (tri desc par createdAt)
        const docType = DOC_TYPES.find(t => t.key === lastDoc?.modeReglement)

        // Afficher notification
        setNotification({
          message: `${newCount} nouveau(x) document(s): ${docType?.emoji} ${docType?.label}`,
          amount: lastDoc?.montant,
          tracking: lastDoc?.trackingNumber,
        })

        // Son de notification (optionnel)
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKzn77dhGwU7k9n0yHgsBS+Dz/LVijgIF2a58eyaSwsPT63o8bJlHQU+ldz0xXYpBSyBzvLaiTYIGmq97+OZTAwMTa3o8bJlHQU/ldz0xXYpBS2Bz/LUijgIGGm87+KaTQwMTK3o8bJlHQU+ldz0xXYpBSyBzvLZiTYIG2m98eObTAwMTa7n8LFkHgU+lN30xHYqBSuBzvLaiTcIGmu88eGaTAwNTa3o8bJmHAU+lN31w3YqBSuBzvLaiTcIGmu88OCaTQwNTK3o8bNkHgU/ldz0xHYqBSyBz/LTijkIFmm78OGbTAwNTKzo8bNkHgU/lNz1w3YqBSyCz/LTijkIFmq78OGbTAwNTKzo8bJmHgU/lNz1w3YpBSyCz/LTijkIFmq78OGbTAwOTKzo8bJmHgU+lNz1wnUpBSuCz/LTizkIFmu78OCbTQwOTKzo8bJmHgU+lNz1wnYpBSuCz/LTizkIFmu78OCbTQwOTKzo8bJlHgU/lNz1w3YpBSyCz/LTijkIFmq78OCbTQwNTKzo8bJlHgVAldz1w3YpBSuBz/LTizkIFmq78OCbTQwNTKzo8bJlHgU/lNz1w3YpBSyCz/LTizkIF2q77+CbTQwNTKzo8bJkHgU/ldz1w3YpBSyCz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/ldz1w3YpBSyBz/LTizkIF2u68OCaTQwOTKzo8bJkHgU/')
          audio.volume = 0.3
          audio.play()
        } catch (e) {
          console.log('Audio non supporté')
        }

        // Masquer après 5 secondes
        setTimeout(() => setNotification(null), 5000)
      }

      previousCountRef.current = documents.length
      setReglements(documents)
      setLoading(false)
    }

    return () => {
      unsubReglements()
      unsubColis()
    }
  }, [profile?.city])

  // Filtrage
  const filtered = reglements.filter(r => {
    // Type
    if (typeFilter !== 'all' && r.modeReglement !== typeFilter) return false

    // Statut
    if (statusFilter !== 'all' && r.status !== statusFilter) return false

    // Recherche texte
    if (search) {
      const s = search.toLowerCase()
      const match = (
        r.trackingNumber?.toLowerCase().includes(s) ||
        r.destinataire?.toLowerCase().includes(s) ||
        r.expediteur?.toLowerCase().includes(s) ||
        r.numeroPiece?.toLowerCase().includes(s) ||
        r.banque?.toLowerCase().includes(s)
      )
      if (!match) return false
    }

    // Date
    if (datePreset !== 'all') {
      const createdAt = r.createdAt ? new Date(r.createdAt) : null
      if (!createdAt) return false

      const now = new Date()
      if (datePreset === 'today') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (createdAt < today) return false
      } else if (datePreset === 'week') {
        const weekAgo = new Date()
        weekAgo.setDate(now.getDate() - 7)
        if (createdAt < weekAgo) return false
      } else if (datePreset === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        if (createdAt < monthStart) return false
      } else if (datePreset === 'custom') {
        if (dateFrom) {
          const from = new Date(dateFrom)
          if (createdAt < from) return false
        }
        if (dateTo) {
          const to = new Date(dateTo + 'T23:59:59')
          if (createdAt > to) return false
        }
      }
    }

    // Montant
    if (montantMin && r.montant < parseFloat(montantMin)) return false
    if (montantMax && r.montant > parseFloat(montantMax)) return false

    // Banque
    if (banqueFilter && !r.banque?.toLowerCase().includes(banqueFilter.toLowerCase())) return false

    return true
  })

  // KPIs
  const kpis = {
    total: filtered.length,
    enAttente: filtered.filter(r => r.status === 'en_attente').length,
    encaisse: filtered.filter(r => r.status === 'encaisse').length,
    montantTotal: filtered.reduce((sum, r) => sum + (r.montant || 0), 0),
  }

  // Handlers
  const openNew = () => {
    setFormModal({
      mode: 'new',
      data: { ...EMPTY_FORM },
      loading: false,
      error: '',
    })
  }

  const openEdit = (reglement: any) => {
    setFormModal({
      mode: 'edit',
      id: reglement.id,
      data: { ...reglement },
      loading: false,
      error: '',
    })
  }

  const handleSubmit = async () => {
    const { mode, id, data } = formModal

    // Validation
    if (!data.trackingNumber?.trim()) {
      setFormModal((f: any) => ({ ...f, error: 'N° tracking requis' }))
      return
    }
    if (!data.montant || parseFloat(data.montant) <= 0) {
      setFormModal((f: any) => ({ ...f, error: 'Montant invalide' }))
      return
    }
    if (!data.destinataire?.trim()) {
      setFormModal((f: any) => ({ ...f, error: 'Nom destinataire requis (émetteur du chèque)' }))
      return
    }
    if (!data.expediteur?.trim()) {
      setFormModal((f: any) => ({ ...f, error: 'Nom expéditeur requis (bénéficiaire du chèque)' }))
      return
    }
    if (!data.banque?.trim()) {
      setFormModal((f: any) => ({ ...f, error: 'Banque requise' }))
      return
    }
    if (!data.numeroPiece?.trim()) {
      setFormModal((f: any) => ({ ...f, error: 'N° pièce requis' }))
      return
    }

    setFormModal((f: any) => ({ ...f, loading: true, error: '' }))

    try {
      const uid = auth.currentUser?.uid
      const payload = {
        ...data,
        montant: parseFloat(data.montant),
        agencyCity: profile.city,
        pointeurId: uid,
        pointeurName: profile.name || profile.email,
        status: mode === 'new' ? 'en_attente' : data.status,
      }

      if (mode === 'new') {
        await createReglement(payload)
      } else {
        await updateReglement(id, payload)
      }

      setFormModal(null)
    } catch (err: any) {
      setFormModal((f: any) => ({ ...f, loading: false, error: err.message }))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteReglement(id)
      setDeleteConfirm(null)
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (!profile) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-500">Chargement...</div></div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Pointeur-Encaisseur</h1>
                <p className="text-xs text-gray-500">Gestion des chèques et traites</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{profile.name || profile.email}</span>
              <button
                onClick={() => signOut(auth).then(() => navigate('/login'))}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notification popup */}
      {notification && (
        <div className="fixed top-20 right-4 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl shadow-2xl p-4 min-w-[320px] border-2 border-white">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
                🔔
              </div>
              <div className="flex-1">
                <div className="font-bold text-lg mb-1">Nouveau document!</div>
                <div className="text-sm text-white/90">{notification.message}</div>
                {notification.amount && (
                  <div className="mt-2 text-lg font-black">{fmtAmount(notification.amount)} DH</div>
                )}
                {notification.tracking && (
                  <div className="text-xs text-white/70 font-mono mt-1">{notification.tracking}</div>
                )}
              </div>
              <button
                onClick={() => setNotification(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: kpis.total, icon: FileText, color: 'blue' },
            { label: 'En attente', value: kpis.enAttente, icon: Clock, color: 'amber' },
            { label: 'Encaissés', value: kpis.encaisse, icon: CheckCircle2, color: 'green' },
            { label: 'Montant total', value: `${fmtAmount(kpis.montantTotal)} DH`, icon: Banknote, color: 'purple' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className={`w-10 h-10 bg-${color}-50 text-${color}-600 rounded-xl flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
            </div>
          ))}
        </div>

        {/* Actions & Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:shadow-lg transition font-semibold"
            >
              <Plus className="w-5 h-5" />
              Nouveau document
            </button>

            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous les types</option>
              {DOC_TYPES.map(t => (
                <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tous les statuts</option>
              {STATUSES.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>

            <select
              value={datePreset}
              onChange={e => setDatePreset(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Toutes les dates</option>
              <option value="today">Aujourd'hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="custom">Période personnalisée</option>
            </select>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              {showAdvancedFilters ? 'Masquer filtres' : 'Plus de filtres'}
            </button>

            {(typeFilter !== 'all' || statusFilter !== 'all' || datePreset !== 'all' || montantMin || montantMax || banqueFilter) && (
              <button
                onClick={() => {
                  setTypeFilter('all')
                  setStatusFilter('all')
                  setDatePreset('all')
                  setDateFrom('')
                  setDateTo('')
                  setMontantMin('')
                  setMontantMax('')
                  setBanqueFilter('')
                }}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                ✕ Réinitialiser
              </button>
            )}
          </div>

          {/* Filtres avancés */}
          {showAdvancedFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
              {/* Dates personnalisées */}
              {datePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Du</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Au</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Montant */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Montant min (DH)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={montantMin}
                    onChange={e => setMontantMin(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Montant max (DH)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={montantMax}
                    onChange={e => setMontantMax(e.target.value)}
                    placeholder="99999.99"
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Banque */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Banque</label>
                <input
                  type="text"
                  value={banqueFilter}
                  onChange={e => setBanqueFilter(e.target.value)}
                  placeholder="Ex: Attijariwafa, BMCE, CIH..."
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>


        {/* Liste */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucun document trouvé</p>
              <p className="text-xs text-gray-400 mt-2">
                {reglements.length > 0
                  ? `${reglements.length} document(s) masqué(s) par les filtres`
                  : 'Aucun document enregistré pour ce compte'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">N° Tracking</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Émetteur (Destinataire)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Bénéficiaire (Expéditeur)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Banque / N°</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Montant</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Statut</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r: any) => {
                    const docType = DOC_TYPES.find(t => t.key === r.modeReglement)
                    const status = STATUSES.find(s => s.key === r.status)
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 bg-${docType?.color}-50 text-${docType?.color}-700 rounded-lg text-xs font-semibold`}>
                            <span>{docType?.emoji}</span>
                            {docType?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-800">{r.trackingNumber}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-gray-800">{r.destinataire}</div>
                          <div className="text-xs text-gray-500">{r.destinataireTel}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-gray-800">{r.expediteur}</div>
                          <div className="text-xs text-gray-500">{r.expediteurTel}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-800">{r.banque}</div>
                          <div className="text-xs font-mono text-gray-500">{r.numeroPiece}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-gray-800">{fmtAmount(r.montant)} DH</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 bg-${status?.color}-100 text-${status?.color}-700 rounded-lg text-xs font-semibold`}>
                            <span className={`w-2 h-2 ${status?.dot} rounded-full`}></span>
                            {status?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewModal(r)}
                              className="p-1.5 hover:bg-blue-50 text-blue-600 rounded transition"
                              title="Voir"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEdit(r)}
                              className="p-1.5 hover:bg-green-50 text-green-600 rounded transition"
                              title="Modifier"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(r)}
                              className="p-1.5 hover:bg-red-50 text-red-600 rounded transition"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal formulaire */}
      {formModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{formModal.mode === 'new' ? 'Nouveau document' : 'Modifier le document'}</h2>
                  <p className="text-sm text-white/80">Chèque ou traite client</p>
                </div>
              </div>
              <button
                onClick={() => setFormModal(null)}
                className="p-2 hover:bg-white/20 rounded-lg transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {formModal.error && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-xl text-red-800">
                  <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  <span className="text-sm font-semibold">{formModal.error}</span>
                </div>
              )}

              {/* Type de document */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <label className="block text-sm font-bold text-gray-700 mb-3">Type de document</label>
                <div className="grid grid-cols-2 gap-3">
                  {DOC_TYPES.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setFormModal((f: any) => ({ ...f, data: { ...f.data, modeReglement: t.key } }))}
                      className={`p-4 rounded-xl border-2 transition ${
                        formModal.data.modeReglement === t.key
                          ? `border-${t.color}-500 bg-${t.color}-50`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-3xl mb-2">{t.emoji}</div>
                      <div className="font-semibold text-gray-800">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Colis */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Colis concerné
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">N° Tracking</label>
                    <input
                      type="text"
                      value={formModal.data.trackingNumber}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, trackingNumber: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="LMA-XXX-XXXX"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Ville d'expédition</label>
                    <select
                      value={formModal.data.villeExpedition}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, villeExpedition: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sélectionner...</option>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Émetteur (destinataire du colis) */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Émetteur du document (Destinataire du colis - celui qui paie)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Nom complet *</label>
                    <input
                      type="text"
                      value={formModal.data.destinataire}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, destinataire: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Téléphone</label>
                    <input
                      type="text"
                      value={formModal.data.destinataireTel}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, destinataireTel: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bénéficiaire (expéditeur du colis) */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-green-700 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Bénéficiaire du document (Expéditeur du colis - celui qui reçoit)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Nom complet *</label>
                    <input
                      type="text"
                      value={formModal.data.expediteur}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, expediteur: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Téléphone</label>
                    <input
                      type="text"
                      value={formModal.data.expediteurTel}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, expediteurTel: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">N° EXP</label>
                    <input
                      type="text"
                      value={formModal.data.expediteurNic}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, expediteurNic: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>

              {/* Détails du document */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Détails du document
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Banque *</label>
                    <input
                      type="text"
                      value={formModal.data.banque}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, banque: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: Attijariwafa Bank"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">N° de pièce *</label>
                    <input
                      type="text"
                      value={formModal.data.numeroPiece}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, numeroPiece: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="N° du chèque/traite"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Montant (DH) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formModal.data.montant}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, montant: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Date d'émission</label>
                    <input
                      type="date"
                      value={formModal.data.dateEmission}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, dateEmission: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Date d'échéance</label>
                    <input
                      type="date"
                      value={formModal.data.dateEcheance}
                      onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, dateEcheance: e.target.value } }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes / Observations</label>
                <textarea
                  value={formModal.data.notes}
                  onChange={e => setFormModal((f: any) => ({ ...f, data: { ...f.data, notes: e.target.value } }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Informations complémentaires..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setFormModal(null)}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition"
                  disabled={formModal.loading}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={formModal.loading}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50"
                >
                  {formModal.loading ? 'Enregistrement...' : formModal.mode === 'new' ? 'Enregistrer' : 'Mettre à jour'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal view */}
      {viewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-6 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-xl font-bold">Détails du document</h2>
              <button
                onClick={() => setViewModal(null)}
                className="p-2 hover:bg-white/20 rounded-lg transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Type:</span>
                  <p className="font-semibold">{DOC_TYPES.find(t => t.key === viewModal.modeReglement)?.label}</p>
                </div>
                <div>
                  <span className="text-gray-500">N° Tracking:</span>
                  <p className="font-semibold font-mono">{viewModal.trackingNumber}</p>
                </div>
                <div>
                  <span className="text-gray-500">Émetteur (Destinataire):</span>
                  <p className="font-semibold">{viewModal.destinataire}</p>
                  <p className="text-xs text-gray-600">{viewModal.destinataireTel}</p>
                </div>
                <div>
                  <span className="text-gray-500">Bénéficiaire (Expéditeur):</span>
                  <p className="font-semibold">{viewModal.expediteur}</p>
                  <p className="text-xs text-gray-600">{viewModal.expediteurTel}</p>
                </div>
                <div>
                  <span className="text-gray-500">Banque:</span>
                  <p className="font-semibold">{viewModal.banque}</p>
                </div>
                <div>
                  <span className="text-gray-500">N° pièce:</span>
                  <p className="font-semibold font-mono">{viewModal.numeroPiece}</p>
                </div>
                <div>
                  <span className="text-gray-500">Montant:</span>
                  <p className="font-semibold text-lg">{fmtAmount(viewModal.montant)} DH</p>
                </div>
                <div>
                  <span className="text-gray-500">Statut:</span>
                  <p className="font-semibold">{STATUSES.find(s => s.key === viewModal.status)?.label}</p>
                </div>
              </div>
              {viewModal.notes && (
                <div className="pt-4 border-t border-gray-200">
                  <span className="text-gray-500 text-sm">Notes:</span>
                  <p className="mt-1">{viewModal.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Confirmer la suppression</h3>
              <p className="text-gray-600 mb-6">
                Voulez-vous vraiment supprimer ce document?<br />
                <span className="font-semibold">{deleteConfirm.trackingNumber}</span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 border-2 border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm.id)}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
