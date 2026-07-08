import { Building2, Wallet, Users, BarChart2, Contact, Car, TrendingUp, AlertTriangle, Calculator, RotateCcw, Download, FileText, Banknote, ShieldCheck, Power, ChevronDown, Upload, Package, Monitor, Star, Archive } from 'lucide-react'
import { CITIES } from '../../../firebase/constants'
import { BACKUP_COLLECTIONS } from '../../../firebase/backupCollections'
import { fmt } from '../../../utils/formatNumber'

// BACKUP_COLLECTIONS is imported for potential use in the exports section (passed via props or used in parent)
void BACKUP_COLLECTIONS

interface AdminHomeTabProps {
  periodParcels: any[]
  periodUsers: any[]
  codStats: any
  agencyStats: any[]
  caisseEntries: any[]
  adminRapports: any[]
  allBankDeposits: any[]
  returnParcels: any[]
  delayedAlerts: any[]
  codAlerts: any[]
  lockPanelOpen: boolean
  setLockPanelOpen: (v: (prev: boolean) => boolean) => void
  operationLocks: any
  lockBusy: string
  backupBusy: boolean
  backupMessage: any
  realStats: any
  onRefreshStats: () => void
  importPreview: any
  setImportPreview: (v: any) => void
  handleExportBackup: () => void
  handleBackupFile: (e: any) => void
  handleConfirmImportBackup: () => void
  handleToggleGlobalLock: () => void
  handleToggleAgencyLock: (city: string) => void
  setMainTab: (tab: string) => void
  navigate: (path: string) => void
  users: any[]
}

export default function AdminHomeTab({
  periodParcels,
  periodUsers,
  codStats,
  agencyStats,
  caisseEntries,
  adminRapports,
  allBankDeposits,
  returnParcels,
  delayedAlerts,
  codAlerts,
  lockPanelOpen,
  setLockPanelOpen,
  operationLocks,
  lockBusy,
  backupBusy,
  backupMessage,
  realStats,
  onRefreshStats,
  importPreview,
  setImportPreview,
  handleExportBackup,
  handleBackupFile,
  handleConfirmImportBackup,
  handleToggleGlobalLock,
  handleToggleAgencyLock,
  setMainTab,
  navigate,
  users,
}: AdminHomeTabProps) {
  // Utiliser les vrais stats si disponibles, sinon fallback sur les colis chargés
  const total    = realStats?.total ?? periodParcels.length
  const enCours  = realStats?.enCours ?? periodParcels.filter((p: any) => !['Livré','Retourné'].includes(p.status)).length
  const livres   = realStats?.livres ?? periodParcels.filter((p: any) => p.status === 'Livré').length
  const codPend  = periodParcels.filter((p: any) => p.codAmount > 0 && (!p.codStatus || p.codStatus === 'pending')).reduce((s: any,p: any) => s+(p.codAmount||0), 0)
  const agents   = periodUsers.filter((u: any) => u.role === 'agent').length
  const drivers  = periodUsers.filter((u: any) => u.role === 'chauffeur').length
  const livreurs  = periodUsers.filter((u: any) => u.role === 'livreur').length
  const cashiers = periodUsers.filter((u: any) => u.role === 'caissier').length
  const salaries = periodUsers.filter((u: any) => u.role === 'salarie').length
  const adminName = users.find((u: any) => u.role === 'admin')?.name || 'Admin'

  // adminName is available for use in the welcome banner
  void adminName

  // Stats de port
  const portPaye = periodParcels.filter((p: any) => p.portType === 'port_paye').reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0)
  const portDu = periodParcels.filter((p: any) => p.portType === 'port_du').reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0)
  const portEnCompte = periodParcels.filter((p: any) => p.portType === 'port_en_compte').reduce((s: number, p: any) => s + (parseFloat(p.price) || 0), 0)
  const totalPort = portPaye + portDu + portEnCompte

  const CARDS = [
    {
      key: 'expeditions', label: 'Expéditions', desc: 'Gérer tous les colis',
      icon: Package, grad: 'from-blue-500 via-blue-600 to-indigo-700',
      glow: 'bg-blue-50/80', stat: `${enCours} en cours · ${livres} livrés`,
      action: () => setMainTab('expeditions'),
    },
    {
      key: 'cod', label: 'RETOUR FOND / Remboursement', desc: 'Gérer les paiements à remettre',
      icon: Wallet, grad: 'from-orange-400 via-orange-500 to-amber-600',
      glow: 'bg-orange-50/80', stat: `${fmt(codPend)} DH en attente`,
      badge: codStats.collectedDH > 0 ? `${fmt(codStats.collectedDH)} DH` : null,
      action: () => setMainTab('cod'),
    },
    {
      key: 'port_agencies', label: '📮 Port par agence', desc: 'Statistiques de port par ville',
      icon: Building2, grad: 'from-purple-500 via-pink-600 to-rose-700',
      glow: 'bg-purple-50/80', stat: `${fmt(totalPort)} DH total`,
      badge: portDu > 0 ? `${fmt(portDu)} DH dû` : null,
      action: () => setMainTab('port_agencies'),
    },
    {
      key: 'archivage', label: '🗄️ Archives', desc: 'Archivage cloud automatique et manuel',
      icon: Archive, grad: 'from-slate-500 via-gray-600 to-slate-700',
      glow: 'bg-slate-50/80', stat: 'Optimisation base de données',
      action: () => setMainTab('archivage'),
    },
    {
      key: 'users', label: 'Utilisateurs', desc: 'Gérer agents, chauffeurs, livreurs, caissiers, directeurs & salariés',
      icon: Users, grad: 'from-teal-500 via-teal-600 to-cyan-700',
      glow: 'bg-teal-50/80', stat: `${agents} agents · ${drivers} chauffeurs · ${livreurs} livreurs · ${cashiers} caissiers · ${salaries} salariés`,
      action: () => setMainTab('users'),
    },
    {
      key: 'activity', label: 'Activité', desc: "Suivi des performances de l'équipe",
      icon: BarChart2, grad: 'from-purple-500 via-purple-600 to-violet-700',
      glow: 'bg-purple-50/80', stat: `${agents + drivers + livreurs} membres actifs`,
      action: () => setMainTab('activity'),
    },
    {
      key: 'notes', label: 'Notes agents', desc: 'Évaluations hebdomadaires des agents',
      icon: Star, grad: 'from-amber-500 via-orange-500 to-red-600',
      glow: 'bg-amber-50/80', stat: 'Notes par semaine et agence',
      action: () => setMainTab('notes'),
    },
    {
      key: 'clients', label: 'Clients', desc: 'Comptes · Paiements · Remises',
      icon: Contact, grad: 'from-emerald-500 via-green-600 to-green-700',
      glow: 'bg-green-50/80', stat: 'Gestion clientèle',
      action: () => navigate('/clients'),
    },
    {
      key: 'fleet', label: 'Parc véhicules', desc: 'Camions · Fourgons · Voitures',
      icon: Car, grad: 'from-slate-500 via-gray-600 to-zinc-700',
      glow: 'bg-gray-50/80', stat: 'Suivi du parc automobile',
      action: () => navigate('/fleet'),
    },
    {
      key: 'dashboard', label: 'Tableau de bord', desc: 'Statistiques & graphiques globaux',
      icon: TrendingUp, grad: 'from-indigo-500 via-indigo-600 to-blue-800',
      glow: 'bg-indigo-50/80', stat: `${total} colis au total`,
      action: () => navigate('/dashboard'),
    },
    {
      key: 'agencies', label: 'Agences', desc: 'Responsables, flux et performance',
      icon: Building2, grad: 'from-cyan-500 via-sky-600 to-blue-700',
      glow: 'bg-cyan-50/80', stat: `${agencyStats.length} villes suivies`,
      action: () => setMainTab('agencies'),
    },
    {
      key: 'alerts', label: 'Alertes', desc: 'Retards et RETOUR FOND non remis',
      icon: AlertTriangle, grad: 'from-red-500 via-rose-600 to-orange-600',
      glow: 'bg-red-50/80', stat: `${delayedAlerts.length + codAlerts.length} alerte(s)`,
      badge: codAlerts.length ? `${codAlerts.length} RETOUR FOND` : null,
      action: () => setMainTab('alerts'),
    },
    {
      key: 'tariffs', label: 'Tarifs', desc: 'Prix par ville, poids et colis',
      icon: Calculator, grad: 'from-amber-400 via-yellow-500 to-orange-500',
      glow: 'bg-amber-50/80', stat: 'Ville + poids + nb colis',
      action: () => setMainTab('tariffs'),
    },
    {
      key: 'returns', label: 'Retours', desc: 'Motifs, agences et suivi',
      icon: RotateCcw, grad: 'from-rose-500 via-pink-600 to-red-700',
      glow: 'bg-rose-50/80', stat: `${returnParcels.length} retour(s)`,
      action: () => setMainTab('returns'),
    },
    {
      key: 'exports', label: 'Exports / Sauvegardes', desc: 'CSV, sauvegarde JSON et restauration',
      icon: Download, grad: 'from-lime-500 via-green-600 to-emerald-700',
      glow: 'bg-green-50/80', stat: 'CSV + backup complet',
      action: () => setMainTab('exports'),
    },
    {
      key: 'caisse', label: 'Caisse', desc: 'Mouvements · Charges · Personnel',
      icon: Wallet, grad: 'from-teal-500 via-teal-600 to-cyan-700',
      glow: 'bg-teal-50/80', stat: `${caisseEntries.length} mouvement(s)`,
      action: () => setMainTab('caisse'),
    },
    {
      key: 'employees', label: 'Dossiers RH', desc: 'CIN · CNSS · Contrats · Salaires',
      icon: FileText, grad: 'from-rose-500 via-pink-600 to-fuchsia-700',
      glow: 'bg-rose-50/80', stat: `${users.filter((u: any) => u.role !== 'admin').length} employé(s)`,
      action: () => setMainTab('employees'),
    },
    {
      key: 'banque', label: 'Banque RETOUR FOND', desc: "Versements espèces des chefs d'agence",
      icon: Building2, grad: 'from-blue-600 via-blue-700 to-indigo-800',
      glow: 'bg-blue-50/80',
      stat: `${allBankDeposits.length} versement(s) · ${fmt(allBankDeposits.reduce((s: any, d: any) => s + Number(d.amount || 0), 0))} DH`,
      badge: allBankDeposits.filter((d: any) => !d.adminConfirmed).length > 0
        ? `${allBankDeposits.filter((d: any) => !d.adminConfirmed).length} à confirmer`
        : null,
      action: () => setMainTab('banque'),
    },
    {
      key: 'permissions', label: '🔐 Permissions', desc: 'Contrôler les champs modifiables par rôle',
      icon: ShieldCheck, grad: 'from-violet-500 via-purple-600 to-indigo-700',
      glow: 'bg-violet-50/80', stat: 'Chef d\'agence · Aide agent',
      action: () => setMainTab('permissions'),
    },
  ]

  return (
    <div className="mt-6 space-y-6">
      {/* Bienvenue */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 90% 10%, white 0%, transparent 45%)' }} />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm font-medium">Bienvenue</p>
            <h1 className="font-black text-3xl mt-0.5 flex items-center gap-2">
              Tableau Admin <Monitor className="w-7 h-7" />
            </h1>
            <p className="text-blue-200 text-sm mt-1">Temps réel · BG Express Maroc</p>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total',    value: fmt(total),   color: 'text-white'       },
                { label: 'En cours', value: fmt(enCours), color: 'text-orange-300'  },
                { label: 'Livrés',   value: fmt(livres),  color: 'text-green-300'   },
              ].map(s => (
                <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3 text-center">
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-blue-200 text-xs font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={onRefreshStats}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-2xl px-3 py-3 transition-all duration-200 hover:scale-105 active:scale-95"
              title="Rafraîchir les compteurs"
            >
              <RotateCcw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-gray-800">Sauvegarde des données</h2>
              <p className="text-sm text-gray-500 mt-1">
                Export complet JSON et import sécurisé en mode fusion, sans suppression automatique.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={handleExportBackup} disabled={backupBusy}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-3 rounded-xl transition">
              <Download className="w-4 h-4" /> Exporter JSON
            </button>
            <label className={`inline-flex items-center justify-center gap-2 text-sm font-bold px-4 py-3 rounded-xl transition cursor-pointer ${
              backupBusy ? 'bg-gray-100 text-gray-400 pointer-events-none' : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}>
              <Upload className="w-4 h-4" /> Importer JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => { handleBackupFile(e); setMainTab('exports') }}
                className="hidden"
              />
            </label>
            <button onClick={() => setMainTab('exports')}
              className="inline-flex items-center justify-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-bold px-4 py-3 rounded-xl transition">
              Details
            </button>
          </div>
        </div>
        {backupMessage && (
          <div className={`mt-4 text-sm font-semibold px-4 py-3 rounded-xl ${
            backupMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
          }`}>
            {backupMessage.text}
          </div>
        )}
      </div>

      {/* Cards grille */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {CARDS.map(card => {
          const Icon = card.icon
          return (
            <button key={card.key} onClick={card.action}
              className="group relative overflow-hidden rounded-3xl shadow-lg transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.97] text-left"
              style={{ minHeight: 170 }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${card.grad}`} />
              <div className="absolute inset-0 opacity-20"
                style={{ backgroundImage: 'radial-gradient(circle at 85% 15%, white 0%, transparent 55%)' }} />
              <div className="relative p-6 flex flex-col justify-between h-full">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  {card.badge && (
                    <span className="bg-white/25 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                      {card.badge}
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-white font-black text-lg leading-tight">{card.label}</p>
                  <p className="text-white/70 text-xs mt-0.5">{card.desc}</p>
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                    {card.stat}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-3xl border border-red-100 shadow-sm overflow-hidden">
        <button onClick={() => setLockPanelOpen(v => !v)}
          className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-red-50/60 transition">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              operationLocks.globalStopped ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'
            }`}>
              <Power className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-red-500">Commandes de blocage</p>
              <h2 className="font-black text-gray-900 truncate">Interrupteur general et blocage par agence</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {operationLocks.globalStopped
                  ? 'Site arrete'
                  : `${CITIES.filter(city => (operationLocks.agencies as any)?.[city]?.locked).length} agence(s) bloquee(s)`}
              </p>
            </div>
          </div>
          <ChevronDown className={`w-6 h-6 text-red-500 shrink-0 transition-transform ${lockPanelOpen ? 'rotate-180' : ''}`} />
        </button>

        {lockPanelOpen && (
          <div className="border-t border-red-100 p-5">
            <div className="flex flex-col xl:flex-row xl:items-center gap-5">
              <div className="flex items-start gap-4 flex-1">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                  operationLocks.globalStopped ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'
                }`}>
                  <Power className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-red-500">Interrupteur general</p>
                  <h2 className="font-black text-gray-900 text-xl mt-0.5">Arret des operations du site</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Coupe instantanement l'acces operationnel pour tous les agents, chauffeurs, caissiers et directeurs. L'Admin reste connecte pour reactiver.
                  </p>
                </div>
              </div>
              <button onClick={handleToggleGlobalLock} disabled={lockBusy === 'global'}
                className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-base font-black shadow-lg transition disabled:opacity-60 ${
                  operationLocks.globalStopped
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}>
                <Power className="w-6 h-6" />
                {operationLocks.globalStopped ? 'Rallumer le site' : 'Arreter tout le site'}
              </button>
            </div>
            <div className="mt-5 border-t border-red-50 pt-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-black text-gray-800">Blocage par agence</h3>
                  <p className="text-xs text-gray-400">Une agence bloquee ne peut plus effectuer d'operations.</p>
                </div>
                <span className="text-xs font-bold bg-red-50 text-red-600 px-3 py-1.5 rounded-full">
                  {CITIES.filter(city => (operationLocks.agencies as any)?.[city]?.locked).length} bloquee(s)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                {CITIES.map(city => {
                  const locked = !!(operationLocks.agencies as any)?.[city]?.locked
                  return (
                    <button key={city} onClick={() => handleToggleAgencyLock(city)} disabled={lockBusy === city}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                        locked
                          ? 'bg-red-600 border-red-600 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-red-200 hover:bg-red-50'
                      }`}>
                      <span className="truncate">{city}</span>
                      <span className={`w-9 h-5 rounded-full p-0.5 flex transition ${locked ? 'bg-white/25 justify-end' : 'bg-gray-200 justify-start'}`}>
                        <span className={`w-4 h-4 rounded-full ${locked ? 'bg-white' : 'bg-gray-500'}`} />
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
