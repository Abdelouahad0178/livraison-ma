import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  subscribeAllUsers
} from '../firebase/firestore'
import { subscribeVehicles, createVehicle, updateVehicle, deleteVehicle } from '../firebase/vehicles'
import CompanyContact from '../components/CompanyContact'
import LiveClock from '../components/LiveClock'
import {
  Car, Plus, Edit2, Trash2, X, ChevronDown,
  Search, AlertTriangle, ArrowLeft
} from 'lucide-react'

const VEHICLE_TYPES = [
  { key: 'camion',  label: 'Camion',  emoji: '🚛' },
  { key: 'fourgon', label: 'Fourgon', emoji: '🚐' },
  { key: 'voiture', label: 'Voiture', emoji: '🚗' },
  { key: 'moto',    label: 'Moto',    emoji: '🏍️' },
]

const VEHICLE_STATUSES = [
  { key: 'disponible',   label: 'Disponible',   bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  { key: 'en_service',   label: 'En service',   bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  { key: 'maintenance',  label: 'Maintenance',  bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  { key: 'hors_service', label: 'Hors service', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
]

const EMPTY_FORM: any = {
  matricule: '', type: 'camion', marque: '', modele: '',
  annee: new Date().getFullYear().toString(),
  couleur: '', kilometrage: '', statut: 'disponible',
  chauffeurId: '', chauffeurName: '',
  assurance: '', visiteTechnique: '', vignette: '',
  notes: '',
}

const docStatus = (dateStr: any) => {
  if (!dateStr) return { color: 'text-gray-400', label: '—', level: 'none' }
  const d    = new Date(dateStr)
  const now  = new Date()
  const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0)   return { color: 'text-red-600',    label: `Expiré (${-days}j)`,    level: 'expired' }
  if (days <= 30) return { color: 'text-orange-500', label: `Expire dans ${days}j`,  level: 'warning' }
  return               { color: 'text-green-600',  label: `Valide (${days}j)`,      level: 'ok'      }
}

export default function FleetPage() {
  const navigate = useNavigate()

  const [vehicles,      setVehicles]      = useState<any[]>([])
  const [allUsers,      setAllUsers]      = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState('')
  const [saveError,     setSaveError]     = useState('')

  const [typeFilter,    setTypeFilter]    = useState('all')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [search,        setSearch]        = useState('')

  const [modalMode,     setModalMode]     = useState<any>(null)   // 'add' | 'edit'
  const [form,          setForm]          = useState(EMPTY_FORM)
  const [saving,        setSaving]        = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null)

  const drivers = useMemo(() => allUsers.filter(u => u.role === 'chauffeur'), [allUsers])

  useEffect(() => {
    const handleError = (err: any) => {
      console.error('Erreur parc vehicules:', err)
      setLoadError(err?.code === 'permission-denied'
        ? "Acces refuse. Verifiez que votre compte est admin/directeur et que les regles Firestore sont deployees."
        : (err?.message || 'Erreur lors du chargement.'))
      setLoading(false)
    }
    const unsubV = subscribeVehicles(data => { setVehicles(data); setLoading(false); setLoadError('') }, handleError)
    const unsubU = subscribeAllUsers(setAllUsers, handleError)
    return () => { unsubV(); unsubU() }
  }, [])

  const filtered = useMemo(() =>
    vehicles.filter(v => {
      const typeOk   = typeFilter   === 'all' || v.type   === typeFilter
      const statusOk = statusFilter === 'all' || v.statut === statusFilter
      const q        = search.toLowerCase()
      const searchOk = !q || [v.matricule, v.marque, v.modele, v.chauffeurName]
        .some(f => f?.toLowerCase().includes(q))
      return typeOk && statusOk && searchOk
    })
  , [vehicles, typeFilter, statusFilter, search])

  const alerts = useMemo(() =>
    vehicles.flatMap(v =>
      [
        { field: 'assurance',        label: 'Assurance'        },
        { field: 'visiteTechnique',  label: 'Visite technique' },
        { field: 'vignette',         label: 'Vignette'         },
      ].flatMap(({ field, label }) => {
        const s = docStatus(v[field])
        return (s.level === 'expired' || s.level === 'warning')
          ? [{ vehicle: v, field: label, status: s }]
          : []
      })
    )
  , [vehicles])

  const stats = useMemo(() => ({
    total:        vehicles.length,
    disponible:   vehicles.filter(v => v.statut === 'disponible').length,
    en_service:   vehicles.filter(v => v.statut === 'en_service').length,
    maintenance:  vehicles.filter(v => v.statut === 'maintenance').length,
    hors_service: vehicles.filter(v => v.statut === 'hors_service').length,
  }), [vehicles])

  const openAdd  = () => { setForm({ ...EMPTY_FORM }); setModalMode('add') }
  const openEdit = (v: any) => {
    setForm({
      matricule:       v.matricule        || '',
      type:            v.type             || 'camion',
      marque:          v.marque           || '',
      modele:          v.modele           || '',
      annee:           v.annee?.toString()|| '',
      couleur:         v.couleur          || '',
      kilometrage:     v.kilometrage?.toString() || '',
      statut:          v.statut           || 'disponible',
      chauffeurId:     v.chauffeurId      || '',
      chauffeurName:   v.chauffeurName    || '',
      assurance:       v.assurance        || '',
      visiteTechnique: v.visiteTechnique  || '',
      vignette:        v.vignette         || '',
      notes:           v.notes            || '',
      _id:             v.id,
    })
    setModalMode('edit')
  }

  const handleSave = async (e: any) => {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const driver  = drivers.find(d => d.id === form.chauffeurId)
      const payload = {
        matricule:       form.matricule.trim().toUpperCase(),
        type:            form.type,
        marque:          form.marque.trim(),
        modele:          form.modele.trim(),
        annee:           parseInt(form.annee)        || null,
        couleur:         form.couleur.trim(),
        kilometrage:     parseInt(form.kilometrage)  || 0,
        statut:          form.statut,
        chauffeurId:     form.chauffeurId  || null,
        chauffeurName:   driver?.name      || form.chauffeurName || null,
        assurance:       form.assurance        || null,
        visiteTechnique: form.visiteTechnique  || null,
        vignette:        form.vignette         || null,
        notes:           form.notes.trim(),
      }
      if (modalMode === 'add') await createVehicle(payload)
      else                     await updateVehicle(form._id, payload)
      setModalMode(null)
    } catch (err: any) {
      console.error('Erreur enregistrement vehicule:', err)
      setSaveError(err?.code === 'permission-denied'
        ? "Acces refuse. Seuls les admins et directeurs peuvent enregistrer les vehicules."
        : (err?.message || "Erreur lors de l'enregistrement."))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteVehicle(deleteConfirm)
      setDeleteConfirm(null)
      setSaveError('')
    } catch (err: any) {
      console.error('Erreur suppression vehicule:', err)
      setSaveError(err?.code === 'permission-denied'
        ? "Acces refuse. Seuls les admins et directeurs peuvent supprimer les vehicules."
        : (err?.message || 'Erreur lors de la suppression.'))
    }
  }

  const inputCls  = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-blue-500 focus:outline-none transition"
  const selectCls = inputCls + " appearance-none"

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanyContact />

      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain shrink-0" />
            <div className="flex items-center gap-2 border-l border-gray-200 pl-2 sm:pl-3 min-w-0">
              <Car className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold text-gray-800 truncate">Parc de Véhicules</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <LiveClock className="text-gray-400 hidden sm:inline" />
            <button onClick={openAdd}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Ajouter un véhicule</span>
              <span className="sm:hidden">Ajouter</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 pb-16">
        {(loadError || saveError) && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 mb-4 text-sm font-semibold">
            {loadError || saveError}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5 mt-2">
          {[
            { label: 'Total',        value: stats.total,        bg: 'bg-gray-800',    text: 'text-white'          },
            { label: 'Disponibles',  value: stats.disponible,   bg: 'bg-green-100',   text: 'text-green-700'      },
            { label: 'En service',   value: stats.en_service,   bg: 'bg-blue-100',    text: 'text-blue-700'       },
            { label: 'Maintenance',  value: stats.maintenance,  bg: 'bg-orange-100',  text: 'text-orange-700'     },
            { label: 'Hors service', value: stats.hors_service, bg: 'bg-red-100',     text: 'text-red-700'        },
          ].map(({ label, value, bg, text }) => (
            <div key={label} className={`${bg} rounded-2xl px-3 py-3 text-center min-w-0`}>
              <p className={`text-2xl font-black ${text}`}>{value}</p>
              <p className={`text-xs font-medium ${text} opacity-80 mt-0.5 truncate`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Alertes documents */}
        {alerts.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-sm font-bold text-red-700">{alerts.length} alerte(s) — documents à renouveler</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-center justify-between bg-white rounded-xl px-3 py-2 border ${a.status.level === 'expired' ? 'border-red-200' : 'border-orange-200'}`}>
                  <div>
                    <span className="text-xs font-bold text-gray-700">{a.vehicle.matricule}</span>
                    <span className="text-xs text-gray-500"> — {a.field}</span>
                  </div>
                  <span className={`text-xs font-semibold ${a.status.color}`}>{a.status.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Matricule, marque, chauffeur..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none bg-gray-50 focus:bg-white transition"
              />
            </div>
            <div className="flex gap-1.5 responsive-scroll pb-1 -mx-1 px-1">
              <button onClick={() => setTypeFilter('all')}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition ${typeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >Tous types</button>
              {VEHICLE_TYPES.map(t => (
                <button key={t.key} onClick={() => setTypeFilter(t.key)}
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold transition ${typeFilter === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >{t.emoji} {t.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 responsive-scroll border-t border-gray-50 pt-3 pb-1">
            <button onClick={() => setStatusFilter('all')}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${statusFilter === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            >Tous statuts</button>
            {VEHICLE_STATUSES.map(s => (
              <button key={s.key} onClick={() => setStatusFilter(s.key)}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${statusFilter === s.key ? `${s.bg} ${s.text} border-current` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot} mr-1`} />
                {s.label}
              </button>
            ))}
            <span className="shrink-0 text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1 self-center">
              {filtered.length} véhicule(s)
            </span>
          </div>
        </div>

        {/* Grille */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
            <p className="text-5xl mb-4">🚗</p>
            <p className="text-gray-500 font-semibold text-lg">Aucun véhicule trouvé</p>
            <button onClick={openAdd} className="mt-4 text-sm text-blue-600 hover:underline font-medium">
              + Ajouter le premier véhicule
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(v => {
              const vType   = VEHICLE_TYPES.find(t  => t.key === v.type)   || VEHICLE_TYPES[0]
              const vStatus = VEHICLE_STATUSES.find(s => s.key === v.statut)|| VEHICLE_STATUSES[0]
              const docA = docStatus(v.assurance)
              const docV = docStatus(v.visiteTechnique)
              const docVig = docStatus(v.vignette)
              const hasAlert = [docA, docV, docVig].some(d => d.level === 'expired' || d.level === 'warning')

              return (
                <div key={v.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition border ${hasAlert ? 'border-orange-200' : 'border-gray-100'}`}>

                  {/* Top */}
                  <div className={`px-5 py-4 flex items-start justify-between gap-3 border-b ${hasAlert ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 bg-white rounded-2xl border border-gray-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
                        {vType.emoji}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-gray-800 text-xl tracking-wider truncate">{v.matricule}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {[v.marque, v.modele, v.annee].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${vStatus.bg} ${vStatus.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${vStatus.dot}`} />
                      {vStatus.label}
                    </span>
                  </div>

                  {/* Infos */}
                  <div className="px-5 py-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{vType.emoji} {vType.label}{v.couleur ? ` · ${v.couleur}` : ''}</span>
                      {v.kilometrage > 0 && (
                        <span className="font-mono font-semibold text-gray-700">
                          {v.kilometrage.toLocaleString('fr-MA')} km
                        </span>
                      )}
                    </div>
                    {v.chauffeurName ? (
                      <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
                        <span>🧑‍💼</span>
                        <span className="font-semibold text-blue-800">{v.chauffeurName}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic px-1">Aucun chauffeur assigné</div>
                    )}
                  </div>

                  {/* Documents */}
                  <div className="mx-5 mb-3 bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Documents</p>
                    {[
                      { label: 'Assurance',        status: docA   },
                      { label: 'Visite technique',  status: docV   },
                      { label: 'Vignette',          status: docVig },
                    ].map(({ label, status }) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">{label}</span>
                        <span className={`font-semibold ${status.color}`}>{status.label}</span>
                      </div>
                    ))}
                  </div>

                  {v.notes && (
                    <p className="px-5 pb-3 text-xs text-gray-400 italic line-clamp-2">{v.notes}</p>
                  )}

                  {/* Actions */}
                  <div className="px-5 pb-4 flex gap-2">
                    <button onClick={() => openEdit(v)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Modifier
                    </button>
                    <button onClick={() => setDeleteConfirm(v.id)}
                      className="py-2.5 px-3.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ─── MODAL AJOUT / MODIFICATION ─── */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Car className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">
                    {modalMode === 'add' ? 'Ajouter un véhicule' : 'Modifier le véhicule'}
                  </h3>
                  {modalMode === 'edit' && (
                    <p className="text-xs text-blue-600 font-mono mt-0.5">{form.matricule}</p>
                  )}
                </div>
              </div>
              <button onClick={() => setModalMode(null)} className="p-2 hover:bg-gray-100 rounded-xl transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSave} className="overflow-y-auto flex-1 p-5 space-y-4">
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm font-semibold">
                  {saveError}
                </div>
              )}

              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Type *</label>
                <div className="grid grid-cols-4 gap-2">
                  {VEHICLE_TYPES.map(t => (
                    <button type="button" key={t.key} onClick={() => setForm((f: any) => ({ ...f, type: t.key }))}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition ${
                        form.type === t.key
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{t.emoji}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Matricule + Marque */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Matricule *</label>
                  <input required value={form.matricule}
                    onChange={e => setForm((f: any) => ({ ...f, matricule: e.target.value }))}
                    placeholder="Ex : 12345-A-1" className={inputCls}
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Marque</label>
                  <input value={form.marque}
                    onChange={e => setForm((f: any) => ({ ...f, marque: e.target.value }))}
                    placeholder="Mercedes, Renault..." className={inputCls}
                  />
                </div>
              </div>

              {/* Modèle + Année */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Modèle</label>
                  <input value={form.modele}
                    onChange={e => setForm((f: any) => ({ ...f, modele: e.target.value }))}
                    placeholder="Actros, Sprinter..." className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Année</label>
                  <input type="number" min="1990" max="2030" value={form.annee}
                    onChange={e => setForm((f: any) => ({ ...f, annee: e.target.value }))}
                    placeholder="2021" className={inputCls}
                  />
                </div>
              </div>

              {/* Couleur + Kilométrage */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Couleur</label>
                  <input value={form.couleur}
                    onChange={e => setForm((f: any) => ({ ...f, couleur: e.target.value }))}
                    placeholder="Blanc, Gris..." className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Kilométrage</label>
                  <input type="number" min="0" value={form.kilometrage}
                    onChange={e => setForm((f: any) => ({ ...f, kilometrage: e.target.value }))}
                    placeholder="0" className={inputCls}
                  />
                </div>
              </div>

              {/* Statut */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Statut *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {VEHICLE_STATUSES.map(s => (
                    <button type="button" key={s.key} onClick={() => setForm((f: any) => ({ ...f, statut: s.key }))}
                      className={`py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition text-center ${
                        form.statut === s.key
                          ? `${s.bg} ${s.text} border-current`
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >{s.label}</button>
                  ))}
                </div>
              </div>

              {/* Chauffeur */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Chauffeur assigné</label>
                <div className="relative">
                  <select value={form.chauffeurId}
                    onChange={e => {
                      const d = drivers.find(d => d.id === e.target.value)
                      setForm((f: any) => ({ ...f, chauffeurId: e.target.value, chauffeurName: d?.name || '' }))
                    }}
                    className={selectCls}
                  >
                    <option value="">— Non assigné —</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name}{d.city ? ` (${d.city})` : ''}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Documents */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
                  Documents — dates d'expiration
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'assurance',        label: 'Assurance'        },
                    { key: 'visiteTechnique',  label: 'Visite technique' },
                    { key: 'vignette',         label: 'Vignette'         },
                  ].map(({ key, label }) => {
                    const ds = docStatus(form[key])
                    return (
                      <div key={key}>
                        <label className="text-xs text-gray-500 block mb-1">{label}</label>
                        <input type="date" value={form[key] || ''}
                          onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                          className={inputCls}
                        />
                        {form[key] && (
                          <p className={`text-xs mt-1 font-medium ${ds.color}`}>{ds.label}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Notes</label>
                <textarea value={form.notes}
                  onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Observations, réparations en attente..."
                  className={inputCls + ' resize-none'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button type="button" onClick={() => setModalMode(null)}
                  className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
                >Annuler</button>
                <button type="submit" disabled={saving}
                  className="py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold transition flex items-center justify-center gap-2"
                >
                  {saving
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
                    : modalMode === 'add' ? '+ Ajouter' : 'Sauvegarder'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL SUPPRESSION ─── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="font-bold text-gray-800 text-lg mb-1">Supprimer ce véhicule ?</h3>
            <p className="text-sm text-gray-500 mb-6">Cette action est irréversible.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition"
              >Annuler</button>
              <button onClick={handleDelete}
                className="py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition"
              >Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
