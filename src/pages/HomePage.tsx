import { Link } from 'react-router-dom'
import {
  Package, MapPin, Truck, ArrowRight,
  CheckCircle, BarChart3, Shield, Users, Zap
} from 'lucide-react'
import { CITIES } from '../firebase/constants'

const STEPS = [
  {
    icon: Package,
    color: 'blue',
    num: '01',
    title: 'Enregistrement',
    desc: "L'agent enregistre le colis et assigne un chauffeur de transport inter-ville.",
  },
  {
    icon: Truck,
    color: 'indigo',
    num: '02',
    title: 'Transport inter-ville',
    desc: 'Le chauffeur transporte le colis jusqu\'à l\'agence de destination en toute sécurité.',
  },
  {
    icon: MapPin,
    color: 'purple',
    num: '03',
    title: 'Arrivée en agence',
    desc: "L'agent de destination prend en charge le colis et organise la livraison finale.",
  },
  {
    icon: CheckCircle,
    color: 'emerald',
    num: '04',
    title: 'Livraison au client',
    desc: 'Un chauffeur local livre le colis, ou le client vient le récupérer en agence.',
  },
]

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Suivi en temps réel',
    desc: 'Chaque colis est tracé à chaque étape du voyage. Le client suit son colis avec un numéro unique.',
    grad: 'from-blue-600/20 to-blue-900/20',
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-600/20',
    iconColor: 'text-blue-400',
  },
  {
    icon: Shield,
    title: 'Paiement RETOUR FOND',
    desc: 'Gestion intégrée du contre-remboursement. Le chauffeur collecte le paiement à la livraison.',
    grad: 'from-emerald-600/20 to-emerald-900/20',
    border: 'border-emerald-500/20',
    iconBg: 'bg-emerald-600/20',
    iconColor: 'text-emerald-400',
  },
  {
    icon: Users,
    title: 'Multi-agences',
    desc: '15 villes couvertes. Chaque agence gère ses expéditions sortantes et ses arrivées de manière indépendante.',
    grad: 'from-purple-600/20 to-purple-900/20',
    border: 'border-purple-500/20',
    iconBg: 'bg-purple-600/20',
    iconColor: 'text-purple-400',
  },
]

const ROUTE_CITIES = ['Casablanca', 'Rabat', 'Fès', 'Meknès', 'Tanger']

const STEP_COLORS = {
  blue:    { bg: 'bg-blue-600',    ring: 'ring-blue-500/30',    border: 'border-blue-500/20',    num: 'text-blue-600'    },
  indigo:  { bg: 'bg-indigo-600',  ring: 'ring-indigo-500/30',  border: 'border-indigo-500/20',  num: 'text-indigo-600'  },
  purple:  { bg: 'bg-purple-600',  ring: 'ring-purple-500/30',  border: 'border-purple-500/20',  num: 'text-purple-600'  },
  emerald: { bg: 'bg-emerald-600', ring: 'ring-emerald-500/30', border: 'border-emerald-500/20', num: 'text-emerald-600' },
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-x-hidden">
      <style>{`
        @keyframes drive {
          0%   { left: -80px }
          100% { left: calc(100% + 80px) }
        }
        @keyframes float-y {
          0%, 100% { transform: translateY(0px) rotate(-2deg) }
          50%       { transform: translateY(-14px) rotate(2deg) }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes city-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.5) }
          50%       { box-shadow: 0 0 0 8px rgba(59,130,246,0) }
        }
        .animate-drive    { animation: drive 9s linear infinite; position: absolute; top: 50%; transform: translateY(-55%) }
        .animate-float-y  { animation: float-y 4s ease-in-out infinite }
        .animate-fade-up  { animation: fade-up 0.7s ease both }
        .city-pulse       { animation: city-pulse 2.4s ease-in-out infinite }
        .delay-1 { animation-delay: 0.15s }
        .delay-2 { animation-delay: 0.30s }
        .delay-3 { animation-delay: 0.45s }
        .delay-4 { animation-delay: 0.60s }
      `}</style>

      {/* ─── NAVIGATION ─── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-white rounded-xl px-3 py-1.5 shadow-lg">
              <img src="/LOGO.jpg" alt="BG Express" className="h-8 object-contain" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold transition shadow-lg shadow-blue-600/20"
            >
              Se connecter
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 pb-10">
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'radial-gradient(circle at 1.5px 1.5px, white 1.5px, transparent 0)', backgroundSize: '38px 38px' }}
        />
        {/* Glow blobs */}
        <div className="absolute top-1/3 left-1/4  w-[480px] h-[480px] bg-blue-600/15  rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/3 right-1/4 w-[380px] h-[380px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 text-center">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 bg-blue-950/70 border border-blue-500/30 rounded-full px-4 py-1.5 mb-7 text-sm text-blue-300 animate-fade-up">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            Gestion de livraison inter-ville au Maroc 🇲🇦
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-7xl md:text-8xl font-black leading-none mb-5 animate-fade-up delay-1">
            Livraison<span className="text-blue-500">MA</span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-300 max-w-2xl mx-auto mb-3 leading-relaxed animate-fade-up delay-2">
            La plateforme qui connecte vos agences à travers tout le Maroc
          </p>
          <p className="text-gray-500 max-w-lg mx-auto mb-10 text-sm animate-fade-up delay-3">
            Enregistrez, transportez, tracez et livrez chaque colis en toute simplicité.
            De Casablanca à Dakhla, en temps réel.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14 animate-fade-up delay-4">
            <Link to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-bold text-base transition shadow-2xl shadow-blue-600/30 active:scale-95"
            >
              <Package className="w-5 h-5" /> Accéder à la plateforme
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* ── Route Animation ── */}
          <div className="relative bg-white/[0.04] border border-white/10 rounded-2xl p-6 max-w-3xl mx-auto overflow-hidden animate-fade-up">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-5">
              Réseau de transport — itinéraires en cours
            </p>
            <div className="relative h-16">
              {/* Road */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="absolute top-1/2 left-4 right-4 border-t border-dashed border-blue-500/25" />

              {/* City dots */}
              {ROUTE_CITIES.map((city, i) => {
                const pct = (i / (ROUTE_CITIES.length - 1)) * 100
                return (
                  <div key={city} className="absolute flex flex-col items-center"
                    style={{ left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                  >
                    <div className="w-3 h-3 bg-blue-500 rounded-full city-pulse border-2 border-blue-300/80"
                      style={{ animationDelay: `${i * 0.5}s` }}
                    />
                    <span className="absolute top-5 text-[10px] text-blue-300/80 whitespace-nowrap font-medium">{city}</span>
                  </div>
                )
              })}

              {/* Truck */}
              <div className="animate-drive">
                <div className="bg-blue-600 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow-xl shadow-blue-600/50 border border-blue-400/30">
                  <Truck className="w-4 h-4 text-white" />
                  <span className="text-xs text-white font-bold hidden sm:inline">LMA-Express</span>
                </div>
              </div>
            </div>

            {/* Second truck (offset) */}
            <div className="relative h-12 mt-1">
              <div className="absolute top-1/2 left-4 right-4 border-t border-dashed border-indigo-500/20" />
              <div className="animate-drive" style={{ animationDelay: '-4.5s', animationDuration: '11s' }}>
                <div className="bg-indigo-700/80 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow-lg border border-indigo-400/20">
                  <Truck className="w-4 h-4 text-white" />
                  <span className="text-xs text-indigo-200 font-bold hidden sm:inline">LMA-Cargo</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS BAR ─── */}
      <section className="border-y border-blue-500/15 bg-blue-950/30 py-8">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { val: '15',    unit: 'villes',      icon: '📍', label: 'à travers le Maroc' },
            { val: '100%',  unit: 'tracé',        icon: '📡', label: 'en temps réel' },
            { val: 'RETOUR FOND',   unit: 'intégré',      icon: '💵', label: 'contre-remboursement' },
            { val: '4',     unit: 'interfaces',   icon: '🖥️', label: 'Admin · Agent · Chauffeur · Caissier' },
          ].map(({ val, unit, icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-3xl mb-1">{icon}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-white">{val}</span>
                <span className="text-sm font-semibold text-blue-400">{unit}</span>
              </div>
              <span className="text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-28 max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-3 block">Processus</span>
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4">
            Comment ça fonctionne ?
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto leading-relaxed">
            Du dépôt du colis à la livraison au client final — chaque étape est contrôlée et traçable.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => {
            const Icon  = step.icon
            const c     = (STEP_COLORS as any)[step.color]
            return (
              <div key={i} className={`relative bg-white/[0.04] hover:bg-white/[0.07] border ${c.border} rounded-2xl p-6 transition group`}>
                {/* Big number bg */}
                <span className={`absolute top-3 right-4 text-6xl font-black opacity-[0.07] ${c.num} select-none`}>
                  {step.num}
                </span>
                {/* Icon */}
                <div className={`w-12 h-12 ${c.bg} rounded-xl flex items-center justify-center mb-5 ring-4 ${c.ring} shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-bold text-white text-base mb-2">{step.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{step.desc}</p>
                {/* Arrow connector */}
                {i < STEPS.length - 1 && (
                  <ArrowRight className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-700 z-10" />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── CITIES ─── */}
      <section className="py-20 bg-gradient-to-b from-transparent via-blue-950/20 to-transparent">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-3 block">Réseau national</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
              15 villes, un seul réseau
            </h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              Du Nord au Sud, de l'Atlantique au Sahara — vos colis voyagent partout au Maroc.
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
            {CITIES.map((city) => (
              <div key={city}
                className="group flex items-center gap-2 bg-white/[0.04] hover:bg-blue-600/15 border border-white/8 hover:border-blue-500/40 rounded-xl px-3 py-3 transition cursor-default"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-500/70 group-hover:text-blue-400 shrink-0 transition" />
                <span className="text-sm text-gray-400 group-hover:text-white font-medium truncate transition">{city}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section className="py-28 max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-3 block">Fonctionnalités</span>
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4">
            Une plateforme complète
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto">
            Tout ce dont vos agences ont besoin pour gérer vos expéditions inter-villes.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title}
                className={`bg-gradient-to-br ${f.grad} border ${f.border} rounded-2xl p-7 hover:scale-[1.02] transition`}
              >
                <div className={`w-12 h-12 ${f.iconBg} border ${f.border} rounded-xl flex items-center justify-center mb-5`}>
                  <Icon className={`w-6 h-6 ${f.iconColor}`} />
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── INTERFACES ─── */}
      <section className="py-16 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-4xl mx-auto px-4">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-8">
            Quatre interfaces adaptées à chaque rôle
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                emoji: '🖥️',
                role: 'Administrateur',
                color: 'from-red-950/50 border-red-500/20',
                badge: 'bg-red-900/50 text-red-300',
                points: ['Vue globale de tous les colis', 'Gestion des statuts', 'Filtres avancés par ville'],
              },
              {
                emoji: '🧑‍💼',
                role: 'Agent',
                color: 'from-blue-950/50 border-blue-500/20',
                badge: 'bg-blue-900/50 text-blue-300',
                points: ['Enregistrement des colis', 'Boîte de réception agence', 'Assignation livraison'],
              },
              {
                emoji: '🚚',
                role: 'Chauffeur',
                color: 'from-orange-950/50 border-orange-500/20',
                badge: 'bg-orange-900/50 text-orange-300',
                points: ['Trajets inter-villes', 'Livraisons locales', 'Scanner QR + mise à jour'],
              },
              {
                emoji: '🏦',
                role: 'Caissier',
                color: 'from-teal-950/50 border-teal-500/20',
                badge: 'bg-teal-900/50 text-teal-300',
                points: ['Entrées et sorties caisse', 'RETOUR FOND remis par agence', 'Suivi des mouvements'],
              },
            ].map(({ emoji, role, color, badge, points }) => (
              <div key={role} className={`bg-gradient-to-br ${color} border rounded-2xl p-5`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">{emoji}</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>{role}</span>
                </div>
                <ul className="space-y-2">
                  {points.map(p => (
                    <li key={p} className="flex items-center gap-2 text-sm text-gray-400">
                      <Zap className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-28 bg-gradient-to-br from-blue-950/60 via-gray-950 to-gray-950">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="text-6xl mb-6 animate-float-y inline-block">📦</div>
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4">
            Prêt à commencer ?
          </h2>
          <p className="text-gray-400 mb-10 max-w-md mx-auto">
            Connectez-vous à votre espace et gérez vos expéditions en quelques clics.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl font-bold text-lg transition shadow-2xl shadow-blue-600/30 active:scale-95"
            >
              <Package className="w-5 h-5" /> Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-6 bg-gray-950 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-400">
              Livraison<span className="text-blue-500">MA</span>
            </span>
          </div>
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} LivraisonMA · Gestion de livraison au Maroc 🇲🇦
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <Link to="/login" className="hover:text-gray-400 transition">Connexion</Link>
            <Link to="/track" className="hover:text-gray-400 transition">Suivi colis</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
