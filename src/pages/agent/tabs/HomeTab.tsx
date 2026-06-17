import { useMemo } from 'react'
import { Plus, Package, MapPin, Wallet, MessageCircle, Printer, LayoutGrid, Truck, ArrowRight, TrendingUp, Clock, CheckCircle } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { STATUSES, STATUS_COLORS } from '../../../firebase/constants'
import { todayStr, parcelDate, entryDate, filterByDate } from '../../../utils/dateFilter'
import { HERO_STAT_CARD, HERO_CARD, HERO_BUTTON } from '../../../styles/heroTheme'

const EMPTY_FORM = {
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '',
  weight: '', nbColis: '1', natureOfGoods: '', natureOfGoodsCustomPrice: '', codAmount: '',
  serviceType: 'simple', shipmentMode: 'personal',
  portType: 'port_paye', portPayeMethod: '', portPayeMontant: '',
  portPrice: '',
  clientId: '', clientName: '', autoDebit: false,
  deliverySectorId: '', deliveryDriverId: '',
  operationDate: todayStr(),
}

const dateFilterLabel = (preset: string) => ({
  all: 'Tout', today: "Aujourd'hui", week: '7 derniers jours', month: 'Ce mois',
}[preset] || 'Personnalisé')

export default function HomeTab() {
  const {
    profile, setTab, setCreatedParcel, setForm,
    drivers, sectors, parcels, modRequests,
    agentEntries, caisseDatePreset, caisseDateFrom, caisseDateTo,
    datePreset, dateFrom, dateTo,
    accurateStats, uid,
  } = useAgentCtx()

  const homeChefStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
    const filtered = filterByDate(parcels, datePreset, dateFrom, dateTo)
    let todayCount = 0, enCours = 0, livres = 0, totalRetourFond = 0
    const statusMap: Record<string, number> = {}

    // Pour "En cours", on compte TOUS les colis en cours de l'agence, pas seulement ceux filtrés par date
    parcels.forEach((p: any) => {
      if (!['Livré', 'Retourné'].includes(p.status)) enCours++
      if (p.codAmount > 0 && p.codStatus === 'pending') totalRetourFond += p.codAmount || 0
    })

    // Pour les autres stats, on utilise les colis filtrés
    filtered.forEach((p: any) => {
      const pDate = parcelDate(p)
      if (pDate >= today && pDate <= endOfToday) todayCount++
      if (p.status === 'Livré') livres++
      statusMap[p.status] = (statusMap[p.status] || 0) + 1
    })
    const statusRows = STATUSES.map(s => ({
      status: s, count: statusMap[s] || 0, colors: STATUS_COLORS[s] || STATUS_COLORS['Initialisé'],
    })).filter(r => r.count > 0)
    return { todayCount, enCours, livres, totalRetourFond, statusRows }
  }, [parcels, datePreset, dateFrom, dateTo])

  const homeAgentStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
    const filtered = filterByDate(parcels, datePreset, dateFrom, dateTo)
    const myParcels = filtered.filter((p: any) => p.agentId === uid || p.destinationAgentId === uid)

    // Pour "En cours", on compte TOUS les colis en cours de l'agent, pas seulement ceux filtrés par date
    const allMyParcels = parcels.filter((p: any) => p.agentId === uid || p.destinationAgentId === uid)
    let enCours = 0
    allMyParcels.forEach((p: any) => {
      if (!['Livré', 'Retourné'].includes(p.status)) enCours++
    })

    let livres = 0, todayCount = 0
    const statusMap: Record<string, number> = {}
    myParcels.forEach((p: any) => {
      if (p.status === 'Livré') livres++
      const pDate = parcelDate(p)
      if (pDate >= today && pDate <= endOfToday) todayCount++
      statusMap[p.status] = (statusMap[p.status] || 0) + 1
    })
    const statusRows = STATUSES.map(s => ({
      status: s, count: statusMap[s] || 0, colors: STATUS_COLORS[s] || STATUS_COLORS['Initialisé'],
    })).filter(r => r.count > 0)
    return { myParcels, enCours, livres, todayCount, statusRows }
  }, [parcels, datePreset, dateFrom, dateTo, uid])

  const isChef = profile?.role === 'chef_agence'

  if (isChef) {
    const { todayCount, enCours, livres, totalRetourFond, statusRows } = homeChefStats
    const agencyDrivers  = drivers.filter((d: any) => d.city === profile?.city && d.role === 'chauffeur')
    const agencyLivreurs = drivers.filter((d: any) => d.city === profile?.city && (d.role === 'livreur' || (d.role === 'chauffeur' && d.chauffeurType !== 'transport')))
    const totalDrivers   = agencyDrivers.length + agencyLivreurs.length
    return (
      <div className="mt-6 space-y-5">
        {/* En-tête */}
        <div className="text-center mb-2">
          <span className="inline-flex items-center gap-1 mb-2 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full font-semibold">
            🏢 Chef d'agence
          </span>
          <h1 className="font-black text-gray-800 text-2xl">{profile?.name}</h1>
          {profile?.city && (
            <span className="inline-flex items-center gap-1 mt-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 px-3 py-1 rounded-full font-medium">
              <MapPin className="w-3 h-3" /> Agence de {profile.city}
            </span>
          )}
        </div>

        {/* Stats agence - HERO AI STYLE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Aujourd'hui", value: todayCount, icon: Clock, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
            { label: 'En cours',    value: enCours,   icon: TrendingUp, iconBg: 'bg-orange-100', iconColor: 'text-orange-600' },
            { label: 'Livrés',      value: livres,    icon: CheckCircle, iconBg: 'bg-green-100', iconColor: 'text-green-600' },
            { label: 'RETOUR FOND (DH)', value: totalRetourFond.toLocaleString('fr-MA'), icon: Wallet, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-700', small: true },
          ].map(s => (
            <div key={s.label} className={HERO_STAT_CARD.container}>
              <div className={`${HERO_STAT_CARD.icon} ${s.iconBg}`}>
                <s.icon className={`w-6 h-6 ${s.iconColor}`} />
              </div>
              <div className={s.small ? 'text-2xl font-bold text-gray-900 mb-1' : HERO_STAT_CARD.value}>{s.value}</div>
              <div className={HERO_STAT_CARD.label}>{s.label}</div>
            </div>
          ))}
        </div>
        {accurateStats && (
          <p className="text-center text-[10px] text-gray-400">
            Total agence (tous statuts) : <span className="font-bold text-gray-500">{accurateStats.total.toLocaleString('fr-MA')}</span> colis
          </p>
        )}

        {/* Actions rapides - HERO AI STYLE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <button onClick={() => { setCreatedParcel(null); setForm({...EMPTY_FORM, senderCity: profile?.city||'', operationDate: todayStr()}); setTab('new') }}
            className="group bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden"
            style={{ minHeight: 160 }}>
            <div className="p-6 flex flex-col items-start h-full justify-between">
              <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                <Plus className="w-7 h-7 text-white" />
              </div>
              <div className="mt-4">
                <p className="text-gray-900 font-bold text-xl mb-1">Nouveau colis</p>
                <p className="text-gray-500 text-sm">Enregistrer une expédition</p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-blue-600 text-sm font-semibold">
                Créer <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button onClick={() => setTab('parcels')}
            className="group bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden"
            style={{ minHeight: 160 }}>
            <div className="p-6 flex flex-col items-start h-full justify-between">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Package className="w-7 h-7 text-white" />
              </div>
              <div className="mt-4">
                <p className="text-white font-bold text-xl mb-1">Expéditions agence</p>
                <p className="text-blue-100 text-sm">{parcels.length} colis au total</p>
              </div>
              <div className="mt-2 flex items-center gap-2 text-white text-sm font-semibold">
                Voir tout <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        </div>

        {/* Équipe - HERO AI STYLE */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <button onClick={() => setTab('secteurs')} className={`${HERO_STAT_CARD.container} text-center hover:scale-105 transition-transform`}>
            <div className="flex justify-center">
              <div className={`${HERO_STAT_CARD.icon} bg-indigo-100`}>
                <LayoutGrid className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{sectors.length}</p>
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Secteurs</p>
          </button>
          <button onClick={() => setTab('charge')} className={`${HERO_STAT_CARD.container} text-center hover:scale-105 transition-transform col-span-2`}>
            <div className="flex justify-center">
              <div className={`${HERO_STAT_CARD.icon} bg-orange-100`}>
                <Truck className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{totalDrivers}</p>
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Chauffeurs & Livreurs</p>
          </button>
        </div>

        {/* Liens rapides - HERO AI STYLE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Feuille de charge', sub: 'Planning chauffeurs', icon: Printer, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', tab: 'charge' },
            { label: 'Secteurs & Bons',   sub: 'Équipes · Ramassage',  icon: LayoutGrid, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', tab: 'secteurs' },
            { label: 'Port dû',           sub: 'Versements livreurs', icon: Truck, iconBg: 'bg-orange-100', iconColor: 'text-orange-600', tab: 'drivers' },
            { label: 'Ma Caisse',         sub: 'Mouvements financiers', icon: Wallet, iconBg: 'bg-green-100', iconColor: 'text-green-600', tab: 'caisse' },
            { label: 'Modif. clients',     sub: `${modRequests.filter((m: any) => m.status === 'pending').length} demande(s) en attente`, icon: MessageCircle, iconBg: 'bg-amber-100', iconColor: 'text-amber-600', tab: 'modifications' },
          ].map(l => (
            <button key={l.tab} onClick={() => setTab(l.tab)}
              className="group flex items-center gap-4 bg-white border border-gray-100 shadow-md hover:shadow-lg rounded-2xl px-5 py-4 transition-all duration-200 hover:border-gray-200">
              <div className={`w-12 h-12 ${l.iconBg} rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                <l.icon className={`w-5 h-5 ${l.iconColor}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold text-gray-800 mb-0.5">{l.label}</p>
                <p className="text-xs text-gray-500">{l.sub}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>

        {/* Tableau statuts agence - HERO AI STYLE */}
        {parcels.length > 0 && (
          <div className={HERO_CARD.base}>
            <div className={HERO_CARD.header}>
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" /> État de l'agence
              </h3>
              <span className="text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg font-semibold">
                {parcels.length} colis
              </span>
            </div>
            <div className="space-y-3">
              {statusRows.map(({ status, count, colors }) => (
                <div key={status}
                  className="group flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 transition-all cursor-pointer border border-transparent hover:border-gray-200"
                  onClick={() => setTab('parcels')}>
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
                    <span className="text-sm font-semibold text-gray-700">{status}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors.dot}`}
                          style={{ width: `${Math.round(count/parcels.length*100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-10 text-right">
                        {Math.round(count/parcels.length*100)}%
                      </span>
                    </div>
                    <span className="text-lg font-bold text-gray-900 w-12 text-right">{count}</span>
                    <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ══ VUE AGENT STANDARD ══ */
  const { myParcels, enCours, livres, todayCount, statusRows } = homeAgentStats
  const myE = agentEntries.filter((e: any) => e.cashierId === uid || e.agentId === uid)
  const filteredE = filterByDate(myE, caisseDatePreset, caisseDateFrom, caisseDateTo, entryDate) as any[]
  const filteredEntrees = filteredE.filter((e: any) => e.type === 'entree').reduce((s: number, e: any) => s + (parseFloat(e.amount || 0) || 0), 0)
  const filteredSorties = filteredE.filter((e: any) => e.type === 'sortie').reduce((s: number, e: any) => s + (parseFloat(e.amount || 0) || 0), 0)
  const filteredSolde = filteredEntrees - filteredSorties
  const pendingPort = parcels.filter((p: any) =>
    p.destinationAgentId === uid && p.portType === 'port_du' &&
    p.portStatus !== 'collected' && p.status === 'Arrivé en agence'
  ).length
  const aRegler = parcels.filter((p: any) => p.agentId === uid && p.codAmount > 0 && p.codStatus === 'remis' && !p.codSenderPaid)
  const totalARegler = aRegler.reduce((s: number, p: any) => s + (p.codAmount || 0), 0)

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      {/* Deux grands boutons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <button
          onClick={() => { setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '', operationDate: todayStr() }); setTab('new') }}
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

      {/* Raccourci Ma Caisse */}
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

      {/* Raccourci RETOUR FOND Clients */}
      <button onClick={() => setTab('cod')}
        className={`w-full flex items-center justify-between border shadow-sm hover:shadow-md rounded-2xl px-4 py-3.5 transition ${aRegler.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${aRegler.length > 0 ? 'bg-yellow-100' : 'bg-gray-100'}`}>
            💰
          </div>
          <div className="text-left">
            <p className={`text-sm font-bold ${aRegler.length > 0 ? 'text-yellow-800' : 'text-gray-800'}`}>RETOUR FOND Clients</p>
            <p className="text-xs text-gray-400">
              {aRegler.length > 0
                ? <span className="font-semibold text-yellow-700">{aRegler.length} à régler · {totalARegler.toLocaleString('fr-MA')} DH</span>
                : 'Tous les RETOUR FOND sont réglés'}
            </p>
          </div>
        </div>
        <ArrowRight className={`w-4 h-4 ${aRegler.length > 0 ? 'text-yellow-500' : 'text-gray-400'}`} />
      </button>

      {/* Tableau état des colis */}
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
                  <tr key={status} className="hover:bg-gray-50 transition cursor-pointer" onClick={() => setTab('parcels')}>
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
}
