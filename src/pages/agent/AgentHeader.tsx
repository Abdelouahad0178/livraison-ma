import { signOut } from 'firebase/auth'
import { auth } from '../../firebase/config'
import { Flower, isFloralUser } from '../../components/FloralTheme'
import { canManageClientAccounts } from '../../config/clientAccountsAccess'
import { livraisonStatsCitiesFor } from '../../config/livraisonStatsAccess'
import { lazy, Suspense } from 'react'
import {
  Package, LogOut, MapPin, Archive, Menu, X, Plus, Wallet, Users, Printer,
  LayoutGrid, Truck, MessageCircle, User, BarChart2, ChevronDown, FileText,
} from 'lucide-react'
import LiveClock from '../../components/LiveClock'
import ProfilePhotoUpload from '../../components/ProfilePhotoUpload'
import WorkingDateIndicator from '../../components/WorkingDateIndicator'
const LivraisonDuJourStats = lazy(() => import('../../components/admin/LivraisonDuJourStats'))

interface AgentHeaderProps {
  profile: any
  tab: string
  setTab: (t: string) => void
  menuOpen: boolean
  setMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  navigate: (path: string) => void
  openScanModal: () => void
  modRequests: any[]
  aideAgents: any[]
  setCreatedParcel: (v: any) => void
  setForm: (fn: any) => void
  setArrivageTab: (v: string) => void
  setArrivageSuccess: (v: any) => void
  EMPTY_FORM: any
  transitParcels?: any[]     // ⭐ Pour badge arrivages
  arrivedBoxes?: any         // ⭐ Pour badge arrivages
  newCodCount?: number       // ⭐ Pour badge COD
  lostParcelsCount?: number  // ⭐ Pour badge Colis perdus
  pendingVersementsCount?: number // 📥 Versements du chef d'exploitation à confirmer
}

export default function AgentHeader({
  profile,
  tab,
  setTab,
  menuOpen,
  setMenuOpen,
  navigate,
  openScanModal,
  modRequests,
  aideAgents,
  setCreatedParcel,
  setForm,
  setArrivageTab,
  setArrivageSuccess,
  EMPTY_FORM,
  transitParcels = [],   // ⭐ Badge arrivages
  arrivedBoxes = {},     // ⭐ Badge arrivages
  newCodCount = 0,       // ⭐ Badge COD
  lostParcelsCount = 0,  // ⭐ Badge Colis perdus
  pendingVersementsCount = 0,
}: AgentHeaderProps) {
  // ⭐ Compter les colis en transit non encore tous traités
  const newArrivagesCount = transitParcels.filter((p: any) => {
    const total = p.nbColis || 1
    const arrived = (arrivedBoxes as any)[p.id] || 0
    return arrived < total  // Pas tous les colis arrivés
  }).length
  // 🌸 Quatre fleurs pour certains comptes (components/FloralTheme)
  const floral = isFloralUser(auth.currentUser?.email || profile?.email)
  const clientAccounts = canManageClientAccounts(auth.currentUser?.email || profile?.email)
  // 🚚 Cartes « Livraison du jour » de l'admin (COD espèces + Ports), limitées aux villes du compte
  const statsCities = livraisonStatsCitiesFor(auth.currentUser?.email || profile?.email)
  return (
    <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl xl:max-w-none xl:w-[95%] mx-auto px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 py-3 min-w-0">
          {/* 📱 overflow-hidden : sur téléphone, le bloc de gauche se rétrécit au lieu de passer sous le Scanner */}
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            {floral && <Flower e="🌸" className="hidden sm:inline" />}
            <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain shrink-0 max-w-[96px] sm:max-w-none" />
            {/* Photo de profil pour chef d'agence (masquée sur téléphone : place du Scanner) */}
            {profile?.role === 'chef_agence' && auth.currentUser?.uid && (
              <div className="border-l border-gray-200 pl-2 hidden sm:block shrink-0">
                <ProfilePhotoUpload
                  userId={auth.currentUser.uid}
                  currentPhotoURL={profile?.photoURL}
                  userName={profile?.name || profile?.email}
                  size="sm"
                  editable={true}
                />
              </div>
            )}
            <div className="hidden sm:flex items-center gap-1.5 border-l border-gray-200 pl-2 min-w-0">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-gray-800 hidden sm:inline whitespace-nowrap">Interface Agent</span>
              {floral && <Flower e="🌷" className="hidden sm:inline" />}
            </div>
            {profile?.name && <span className="text-gray-400 text-sm hidden md:inline truncate">— {profile.name}</span>}
            {profile?.city && (
              <span className="items-center gap-1 text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-medium hidden sm:inline-flex whitespace-nowrap shrink-0">
                <MapPin className="w-3 h-3" /> {profile.city}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {floral && <Flower e="🌺" className="hidden md:inline" />}
            {/* Boutons « Scanner » et « Archives » retirés de l'en-tête (demande du 22/10/2026) */}
            <LiveClock className="text-gray-400 hidden sm:inline" />
            <WorkingDateIndicator />
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
            {floral && <Flower e="🌼" className="hidden md:inline" />}
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {/* 🚚 Chiffres du jour sur LEUR ligne (dans la barre du haut, ils écrasaient le nom et « Interface Agent ») */}
        {statsCities && (
          <div className="pb-2 flex justify-center">
            <Suspense fallback={null}>
              <LivraisonDuJourStats mobile cities={statsCities} />
              <LivraisonDuJourStats cities={statsCities} />
            </Suspense>
          </div>
        )}

        {/* Desktop nav tabs */}
        <div className="hidden md:flex items-center gap-1 border-t border-gray-100 pt-1 pb-2 responsive-scroll -mx-4 px-4">
          {[
            { key: 'home',          label: '🏠 Accueil',                onClick: () => { setTab('home'); setCreatedParcel(null) },                                                                                hidden: false },
            { key: 'new',           label: '+ Saisie colis',            onClick: () => { setTab('new'); setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '' }); setTimeout(() => window.dispatchEvent(new Event('focus-nexp')), 80) },                   hidden: false },
            { key: 'parcels',       label: profile?.role === 'aide_agent' ? '📋 Mes saisies' : '📦 Expéditions', onClick: () => setTab('parcels'),                                                               hidden: false },
            { key: 'caisse',        label: '🏛️ Caisse Agence', onClick: () => setTab('caisse'),                                                              hidden: profile?.role !== 'chef_agence' },
            { key: 'cod',           label: '💰 RETOUR FOND Clients',    onClick: () => setTab('cod'),                                                                                                             hidden: profile?.role === 'aide_agent' },
            { key: 'valeurs',       label: "📥 Versements du chef d'exploitation", onClick: () => setTab('valeurs'),                                                                                                         hidden: profile?.role !== 'chef_agence' },
            { key: 'clientportdu',  label: '🏦 Ports en compte',        onClick: () => setTab('clientportdu'),                                                                                                    hidden: profile?.role !== 'chef_agence' && profile?.role !== 'agentpro' },
            { key: 'portducheque',  label: '📋 Ports dû chèque',        onClick: () => setTab('portducheque'),                                                                                                    hidden: profile?.role !== 'chef_agence' && profile?.role !== 'agentpro' },
            { key: 'versements',    label: '💸 Versements Admin',       onClick: () => setTab('versements'),                                                                                                      hidden: true }, // Caché pour tous les rôles
            { key: 'invoices',      label: '🧾 Factures',               onClick: () => setTab('invoices'),                                                                                                        hidden: true }, // Caché pour tous les rôles
            { key: 'clients',       label: '👥 Mes clients',            onClick: () => setTab('clients'),                                                                                                         hidden: profile?.role === 'aide_agent' },
            { key: 'charge',        label: '📋 Feuille de charge',      onClick: () => setTab('charge'),                                                                                                          hidden: true }, // Caché pour tous les rôles
            { key: 'deliverysheets', label: '📄 Bons de livraison',     onClick: () => setTab('deliverysheets'),                                                                                                  hidden: true }, // Caché pour tous les rôles
            { key: 'secteurs',      label: '🏢 Secteurs',               onClick: () => setTab('secteurs'),                                                                                                        hidden: profile?.role === 'aide_agent' },
            { key: 'arrivage',      label: '🚛 Arrivages',              onClick: () => { setTab('arrivage'); setArrivageTab('nouveau'); setArrivageSuccess(null) },                                               hidden: profile?.role === 'aide_agent' },
            { key: 'comptes',       label: '📝 Comptes clients',        onClick: () => setTab('comptes'),                                                                                                         hidden: !clientAccounts },
            { key: 'retours',       label: '↩️ Retours',                onClick: () => setTab('retours'),                                                                                                         hidden: profile?.role === 'aide_agent' },
            { key: 'lostparcels',   label: '🚨 Colis perdus',           onClick: () => setTab('lostparcels'),                                                                                                     hidden: true }, // Caché pour tous les rôles
            { key: 'modifications', label: '📋 Modif. clients',         onClick: () => setTab('modifications'),                                                                                                   hidden: true }, // Caché pour tous les rôles
            { key: 'aideagents',    label: '👤 Aide Agents',            onClick: () => setTab('aideagents'),                                                                                                      hidden: true }, // Caché pour tous les rôles
            { key: 'dashboard',     label: '📊 Dashboard',              onClick: () => setTab('dashboard'),                                                                                                       hidden: true }, // Caché pour tous les rôles
            { key: 'notes',         label: '⭐ Notes agents',           onClick: () => setTab('notes'),                                                                                                           hidden: true }, // Caché pour tous les rôles
          ].filter(t => !t.hidden).map(t => (
            <button key={t.key} onClick={t.onClick}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-semibold transition relative ${tab === t.key ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              {t.label}
              {/* ⭐ Badge arrivages */}
              {t.key === 'arrivage' && newArrivagesCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newArrivagesCount}
                </span>
              )}
              {/* 📥 Versements du chef d'exploitation à confirmer */}
              {t.key === 'valeurs' && pendingVersementsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingVersementsCount}
                </span>
              )}
              {/* ⭐ Badge COD */}
              {t.key === 'cod' && newCodCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newCodCount}
                </span>
              )}
              {/* ⭐ Badge Colis perdus */}
              {t.key === 'lostparcels' && lostParcelsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {lostParcelsCount}
                </span>
              )}
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
              {tab === 'new' ? '+ Nouveau colis' : tab === 'caisse' ? `Caisse Agence ${profile?.city || ''}` : tab === 'cod' ? 'RETOUR FOND Clients' : tab === 'valeurs' ? "📥 Versements du chef d'exploitation" : tab === 'clientportdu' ? '🏦 Ports en compte clients' : tab === 'portpayecheque' ? '📋 Ports payés chèque' : tab === 'portducheque' ? '📋 Ports dû chèque' : tab === 'invoices' ? '🧾 Factures' : tab === 'clients' ? 'Mes clients' : tab === 'charge' ? 'Feuille de charge' : tab === 'secteurs' ? 'Secteurs' : tab === 'drivers' ? 'Port dû' : tab === 'arrivage' ? 'Arrivages' : tab === 'comptes' ? '📝 Comptes clients' : tab === 'retours' ? '↩️ Retours' : tab === 'lostparcels' ? '🚨 Colis perdus' : tab === 'modifications' ? 'Modif. clients' : tab === 'aideagents' ? 'Aide Agents' : tab === 'dashboard' ? 'Dashboard' : tab === 'notes' ? 'Notes agents' : (profile?.role === 'aide_agent' ? 'Mes saisies' : 'Expéditions')}
            </span>
          </div>
        )}

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 py-2 space-y-1 max-h-[calc(100vh-120px)] overflow-y-auto">
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
              <Package className="w-4 h-4" /> {profile?.role === 'aide_agent' ? 'Mes saisies' : 'Expéditions'}
            </button>
            {profile?.role === 'chef_agence' && (
              <button
                onClick={() => { setTab('caisse'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'caisse' ? 'bg-green-50 text-green-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Wallet className="w-4 h-4" /> Caisse Agence
              </button>
            )}
            {profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('cod'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'cod' ? 'bg-yellow-50 text-yellow-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                💰 RETOUR FOND Clients
                {newCodCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                    {newCodCount}
                  </span>
                )}
              </button>
            )}
            {(profile?.role === 'chef_agence' || profile?.role === 'agentpro') && (
              <>
                <button
                  onClick={() => { setTab('clientportdu'); setMenuOpen(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'clientportdu' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  🏦 Ports en compte clients
                </button>
                {/* CACHÉ: Versements Admin */}
                {false && (
                  <button
                    onClick={() => { setTab('versements'); setMenuOpen(false) }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'versements' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    💸 Versements Admin
                  </button>
                )}
              </>
            )}
            {profile?.role === 'chef_agence' && (
              <button
                onClick={() => { setTab('valeurs'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'valeurs' ? 'bg-violet-50 text-violet-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                📥 Versements du chef d'exploitation
                {pendingVersementsCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{pendingVersementsCount}</span>
                )}
              </button>
            )}
            {profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('clients'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'clients' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Users className="w-4 h-4" /> Mes clients
              </button>
            )}
            {/* CACHÉ: Feuille de charge */}
            {false && profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('charge'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'charge' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Printer className="w-4 h-4" /> Feuille de charge
              </button>
            )}
            {profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('secteurs'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'secteurs' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <LayoutGrid className="w-4 h-4" /> Secteurs & Équipes
              </button>
            )}
            {profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('arrivage'); setArrivageTab('nouveau'); setArrivageSuccess(null); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition relative ${tab === 'arrivage' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Truck className="w-4 h-4" /> Arrivages
                {/* ⭐ Badge arrivages */}
                {newArrivagesCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                    {newArrivagesCount}
                  </span>
                )}
              </button>
            )}
            {clientAccounts && (
              <button
                onClick={() => { setTab('comptes'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'comptes' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <FileText className="w-4 h-4" /> Comptes clients
              </button>
            )}
            {profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('retours'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'retours' ? 'bg-red-50 text-red-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                ↩️ Retours
              </button>
            )}
            {/* CACHÉS: Colis perdus, Modif. clients, Aide Agents, Dashboard, Notes agents */}
            {false && profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('lostparcels'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'lostparcels' ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                🚨 Colis perdus
                {lostParcelsCount > 0 && (
                  <span className="ml-auto text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">{lostParcelsCount}</span>
                )}
              </button>
            )}
            {false && profile?.role === 'chef_agence' && (
              <button
                onClick={() => { setTab('modifications'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'modifications' ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <MessageCircle className="w-4 h-4" /> Modif. clients
                {modRequests.filter(m => m.status === 'pending').length > 0 && (
                  <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{modRequests.filter(m => m.status === 'pending').length}</span>
                )}
              </button>
            )}
            {false && (profile?.role === 'chef_agence' || profile?.role === 'admin') && (
              <button
                onClick={() => { setTab('aideagents'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'aideagents' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <User className="w-4 h-4" /> Aide Agents
                {aideAgents.length > 0 && (
                  <span className="ml-auto text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-bold">{aideAgents.length}</span>
                )}
              </button>
            )}
            {false && profile?.role === 'chef_agence' && (
              <button
                onClick={() => { setTab('dashboard'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <BarChart2 className="w-4 h-4" /> Dashboard
              </button>
            )}
            {false && profile?.role === 'chef_agence' && (
              <button
                onClick={() => { setTab('notes'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'notes' ? 'bg-amber-50 text-amber-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                ⭐ Notes agents
              </button>
            )}
            {profile?.role === 'chef_agence' && (
              <button
                onClick={() => { navigate('/archive'); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-teal-600 hover:bg-teal-50 transition"
              >
                <Archive className="w-4 h-4" /> Archives
              </button>
            )}
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
  )
}
