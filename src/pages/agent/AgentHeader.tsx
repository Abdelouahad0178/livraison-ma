import { signOut } from 'firebase/auth'
import { auth } from '../../firebase/config'
import {
  Package, LogOut, MapPin, Archive, Menu, X, Plus, Wallet, Users, Printer,
  LayoutGrid, Truck, MessageCircle, User, BarChart2, ChevronDown,
} from 'lucide-react'
import LiveClock from '../../components/LiveClock'

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
}: AgentHeaderProps) {
  // ⭐ Compter les colis en transit non encore tous traités
  const newArrivagesCount = transitParcels.filter((p: any) => {
    const total = p.nbColis || 1
    const arrived = (arrivedBoxes as any)[p.id] || 0
    return arrived < total  // Pas tous les colis arrivés
  }).length
  return (
    <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 py-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/LOGO.jpg" alt="BG Express" className="h-9 object-contain shrink-0" />
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-2 min-w-0">
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openScanModal}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
              title="Scanner un code-barres"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5v3M3 5h3M21 5h-3M21 5v3M3 19v-3M3 19h3M21 19h-3M21 19v-3"/>
                <line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/>
                <line x1="13" y1="8" x2="13" y2="12"/><line x1="16" y1="8" x2="16" y2="16"/>
                <line x1="13" y1="14" x2="13" y2="16"/>
              </svg>
              <span className="hidden sm:inline">Scanner</span>
            </button>
            <LiveClock className="text-gray-400 hidden sm:inline" />
            {profile?.code && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg font-mono border border-blue-200 hidden sm:inline">
                Code : <strong>{profile.code}</strong>
              </span>
            )}
            {profile?.role === 'chef_agence' && (
              <button
                onClick={() => navigate('/archive')}
                className="hidden md:flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 transition"
              >
                <Archive className="w-4 h-4" />
                <span>Archives</span>
              </button>
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
        <div className="hidden md:flex items-center gap-1 border-t border-gray-100 pt-1 pb-2 responsive-scroll -mx-4 px-4">
          {[
            { key: 'home',          label: '🏠 Accueil',                onClick: () => { setTab('home'); setCreatedParcel(null) },                                                                                hidden: false },
            { key: 'new',           label: '+ Saisie colis',            onClick: () => { setTab('new'); setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '' }) },                   hidden: false },
            { key: 'parcels',       label: profile?.role === 'aide_agent' ? '📋 Mes saisies' : '📦 Expéditions', onClick: () => setTab('parcels'),                                                               hidden: false },
            { key: 'caisse',        label: profile?.role === 'chef_agence' ? '🏛️ Caisse Agence' : '💼 Ma Caisse', onClick: () => setTab('caisse'),                                                              hidden: profile?.role === 'aide_agent' },
            { key: 'cod',           label: '💰 RETOUR FOND Clients',    onClick: () => setTab('cod'),                                                                                                             hidden: profile?.role === 'aide_agent' },
            { key: 'clients',       label: '👥 Mes clients',            onClick: () => setTab('clients'),                                                                                                         hidden: profile?.role === 'aide_agent' },
            { key: 'charge',        label: '📋 Feuille de charge',      onClick: () => setTab('charge'),                                                                                                          hidden: profile?.role === 'aide_agent' },
            { key: 'secteurs',      label: '🏢 Secteurs',               onClick: () => setTab('secteurs'),                                                                                                        hidden: profile?.role === 'aide_agent' },
            { key: 'arrivage',      label: '🚛 Arrivages',              onClick: () => { setTab('arrivage'); setArrivageTab('nouveau'); setArrivageSuccess(null) },                                               hidden: profile?.role === 'aide_agent' },
            { key: 'retours',       label: '↩️ Retours',                onClick: () => setTab('retours'),                                                                                                         hidden: profile?.role === 'aide_agent' },
            { key: 'modifications', label: '📋 Modif. clients',         onClick: () => setTab('modifications'),                                                                                                   hidden: profile?.role !== 'chef_agence' },
            { key: 'aideagents',    label: '👤 Aide Agents',            onClick: () => setTab('aideagents'),                                                                                                      hidden: profile?.role !== 'chef_agence' && profile?.role !== 'admin' },
            { key: 'dashboard',     label: '📊 Dashboard',              onClick: () => setTab('dashboard'),                                                                                                       hidden: profile?.role !== 'chef_agence' },
            { key: 'notes',         label: '⭐ Notes agents',           onClick: () => setTab('notes'),                                                                                                           hidden: profile?.role !== 'chef_agence' },
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
              {/* ⭐ Badge COD */}
              {t.key === 'cod' && newCodCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {newCodCount}
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
              {tab === 'new' ? '+ Nouveau colis' : tab === 'caisse' ? (profile?.role === 'chef_agence' ? `Caisse Agence ${profile?.city || ''}` : 'Ma Caisse') : tab === 'cod' ? 'RETOUR FOND Clients' : tab === 'clients' ? 'Mes clients' : tab === 'charge' ? 'Feuille de charge' : tab === 'secteurs' ? 'Secteurs' : tab === 'drivers' ? 'Port dû' : tab === 'arrivage' ? 'Arrivages' : tab === 'modifications' ? 'Modif. clients' : tab === 'aideagents' ? 'Aide Agents' : tab === 'dashboard' ? 'Dashboard' : tab === 'notes' ? 'Notes agents' : 'Expéditions'}
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
              <Package className="w-4 h-4" /> Expéditions
            </button>
            {profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('caisse'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'caisse' ? 'bg-green-50 text-green-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Wallet className="w-4 h-4" /> {profile?.role === 'chef_agence' ? 'Caisse Agence' : 'Ma Caisse'}
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
            {profile?.role !== 'aide_agent' && (
              <button
                onClick={() => { setTab('clients'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'clients' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Users className="w-4 h-4" /> Mes clients
              </button>
            )}
            {profile?.role !== 'aide_agent' && (
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
            {profile?.role === 'chef_agence' && (
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
            {(profile?.role === 'chef_agence' || profile?.role === 'admin') && (
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
            {profile?.role === 'chef_agence' && (
              <button
                onClick={() => { setTab('dashboard'); setMenuOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <BarChart2 className="w-4 h-4" /> Dashboard
              </button>
            )}
            {profile?.role === 'chef_agence' && (
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
