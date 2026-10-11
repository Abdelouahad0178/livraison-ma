import { Link } from 'react-router-dom'
import {
  Package, MapPin, Truck, ArrowRight, CheckCircle, Shield, Users, Zap, Search,
  Phone, Smartphone, Mail, Building2, Radio,
} from 'lucide-react'

// 🏢 Coordonnées de la société (mêmes que la bande CompanyContact des pages internes)
const INFO = {
  siege: 'N°19, Rue 5, Hay Tissir2 - Casablanca',
  tel1: '0522 62 92 89',
  tel2: '0661 97 86 12',
  email: 'bgexpress2019@gmail.com',
}

// 📍 Agences ACTIVES du réseau (du nord au sud — ordre du trajet animé)
const ACTIVE_CITIES = [
  { name: 'Casablanca',  role: 'Siège · agence',  desc: 'Siège social et agence de départ / arrivée.' },
  { name: 'Marrakech',   role: 'Agence',          desc: 'Enlèvement, arrivage et livraison à domicile.' },
  { name: 'Agadir',      role: 'Agence',          desc: 'Enlèvement, arrivage, livraison et retrait en gare.' },
  { name: 'Ait Melloul', role: 'Agence',          desc: 'Livraison locale, rattachée au réseau Agadir.' },
]

const STEPS = [
  {
    icon: Package,
    color: 'blue',
    num: '01',
    title: 'Dépôt en agence',
    desc: "L'expédition est enregistrée avec son N° EXP : expéditeur, destinataire, port payé ou port dû, RETOUR FOND.",
  },
  {
    icon: Truck,
    color: 'indigo',
    num: '02',
    title: 'Transport inter-ville',
    desc: "Le colis voyage entre Casablanca, Marrakech, Agadir et Ait Melloul, suivi à chaque étape.",
  },
  {
    icon: MapPin,
    color: 'purple',
    num: '03',
    title: 'Arrivée et assignation',
    desc: "À l'arrivée, le chef d'exploitation assigne chaque colis à un livreur de la ville, ou le garde en gare pour retrait.",
  },
  {
    icon: CheckCircle,
    color: 'emerald',
    num: '04',
    title: 'Livraison et encaissement',
    desc: "Le livreur remet le colis et encaisse le port dû et le RETOUR FOND, remis le soir même à l'agence.",
  },
]

const FEATURES = [
  {
    icon: Radio,
    title: 'Suivi en temps réel',
    desc: "Chaque expédition est tracée de l'enregistrement à la livraison. Le client suit son colis avec son numéro.",
    grad: 'from-blue-600/20 to-blue-900/20',
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-600/20',
    iconColor: 'text-blue-400',
  },
  {
    icon: Shield,
    title: 'RETOUR FOND sécurisé',
    desc: "Contre-remboursement en espèces, chèque ou traite (ou mixte). Chaque valeur suit un circuit contrôlé : livreur → chef d'exploitation → chef d'agence.",
    grad: 'from-emerald-600/20 to-emerald-900/20',
    border: 'border-emerald-500/20',
    iconBg: 'bg-emerald-600/20',
    iconColor: 'text-emerald-400',
  },
  {
    icon: Users,
    title: '4 agences connectées',
    desc: "Casablanca, Marrakech, Agadir et Ait Melloul partagent la même plateforme : expéditions, arrivages, caisse et COD par agence.",
    grad: 'from-purple-600/20 to-purple-900/20',
    border: 'border-purple-500/20',
    iconBg: 'bg-purple-600/20',
    iconColor: 'text-purple-400',
  },
]

const ROLES = [
  {
    emoji: '🏢',
    role: "Chef d'agence",
    color: 'from-blue-950/50 border-blue-500/20',
    badge: 'bg-blue-900/50 text-blue-300',
    points: ['Saisie et suivi des expéditions', 'Caisse agence et RETOUR FOND', 'Validation des valeurs reçues'],
  },
  {
    emoji: '🧭',
    role: "Chef d'exploitation",
    color: 'from-violet-950/50 border-violet-500/20',
    badge: 'bg-violet-900/50 text-violet-300',
    points: ['Assignation du matin', 'Collecte du soir des livreurs', 'Envoi des valeurs au chef d\'agence'],
  },
  {
    emoji: '🛵',
    role: 'Livreur',
    color: 'from-orange-950/50 border-orange-500/20',
    badge: 'bg-orange-900/50 text-orange-300',
    points: ['Tournée du jour', 'Livraison et encaissement', 'Ports payés à ramasser'],
  },
  {
    emoji: '📊',
    role: 'Direction',
    color: 'from-teal-950/50 border-teal-500/20',
    badge: 'bg-teal-900/50 text-teal-300',
    points: ['Vue de toutes les agences', 'Suivi des caisses et du COD', 'Facturation des clients'],
  },
]

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
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/track"
              className="text-sm text-gray-300 hover:text-white px-3 py-2 rounded-xl font-semibold transition inline-flex items-center gap-1.5"
            >
              <Search className="w-4 h-4" /> <span className="hidden sm:inline">Suivre un colis</span>
            </Link>
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
            Messagerie et livraison inter-ville au Maroc 🇲🇦
          </div>

          {/* Title */}
          <h1 className="text-5xl sm:text-7xl md:text-8xl font-black leading-none mb-5 animate-fade-up delay-1">
            BG <span className="text-blue-500">Express</span>
          </h1>
          <p className="text-xl sm:text-2xl text-gray-300 max-w-2xl mx-auto mb-3 leading-relaxed animate-fade-up delay-2">
            Vos colis entre Casablanca, Marrakech, Agadir et Ait Melloul
          </p>
          <p className="text-gray-500 max-w-lg mx-auto mb-10 text-sm animate-fade-up delay-3">
            Enregistrement en agence, transport, livraison à domicile ou retrait en gare,
            RETOUR FOND encaissé et reversé — suivi en temps réel.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14 animate-fade-up delay-4">
            <Link to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-bold text-base transition shadow-2xl shadow-blue-600/30 active:scale-95"
            >
              <Package className="w-5 h-5" /> Accéder à la plateforme
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/track"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white px-8 py-4 rounded-2xl font-bold text-base transition active:scale-95"
            >
              <Search className="w-5 h-5" /> Suivre un colis
            </Link>
          </div>

          {/* ── Route Animation ── */}
          <div className="relative bg-white/[0.04] border border-white/10 rounded-2xl p-6 max-w-3xl mx-auto overflow-hidden animate-fade-up">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-5">
              Notre réseau — 4 agences actives
            </p>
            <div className="relative h-16">
              {/* Road */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="absolute top-1/2 left-4 right-4 border-t border-dashed border-blue-500/25" />

              {/* City dots */}
              {ACTIVE_CITIES.map(({ name }, i) => {
                const pct = 6 + (i / (ACTIVE_CITIES.length - 1)) * 88
                return (
                  <div key={name} className="absolute flex flex-col items-center"
                    style={{ left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
                  >
                    <div className="w-3 h-3 bg-blue-500 rounded-full city-pulse border-2 border-blue-300/80"
                      style={{ animationDelay: `${i * 0.5}s` }}
                    />
                    <span className="absolute top-5 text-[10px] sm:text-xs text-blue-300/80 whitespace-nowrap font-medium">{name}</span>
                  </div>
                )
              })}

              {/* Truck */}
              <div className="animate-drive">
                <div className="bg-blue-600 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow-xl shadow-blue-600/50 border border-blue-400/30">
                  <Truck className="w-4 h-4 text-white" />
                  <span className="text-xs text-white font-bold hidden sm:inline">BG Express</span>
                </div>
              </div>
            </div>

            {/* Second truck (offset) */}
            <div className="relative h-12 mt-1">
              <div className="absolute top-1/2 left-4 right-4 border-t border-dashed border-indigo-500/20" />
              <div className="animate-drive" style={{ animationDelay: '-4.5s', animationDuration: '11s' }}>
                <div className="bg-indigo-700/80 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow-lg border border-indigo-400/20">
                  <Truck className="w-4 h-4 text-white" />
                  <span className="text-xs text-indigo-200 font-bold hidden sm:inline">BG Cargo</span>
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
            { val: '4',            unit: 'agences',    icon: '📍', label: 'Casablanca · Marrakech · Agadir · Ait Melloul' },
            { val: '100%',         unit: 'tracé',      icon: '📡', label: 'en temps réel' },
            { val: 'RETOUR FOND',  unit: 'intégré',    icon: '💵', label: 'espèces · chèque · traite' },
            { val: 'Domicile',     unit: '& gare',     icon: '🏠', label: 'livraison ou retrait en agence' },
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
            <span className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-3 block">Notre réseau</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
              4 agences, un seul réseau
            </h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              De Casablanca au Souss : vos colis voyagent entre nos agences et sont livrés dans chaque ville.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ACTIVE_CITIES.map(({ name, role, desc }) => (
              <div key={name}
                className="group bg-white/[0.04] hover:bg-blue-600/15 border border-white/10 hover:border-blue-500/40 rounded-2xl p-5 transition"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{name}</div>
                    <div className="text-[11px] font-semibold text-emerald-400 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> {role}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
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
            Tout ce dont nos agences ont besoin pour gérer les expéditions, la caisse et le RETOUR FOND.
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

      {/* ─── ROLES ─── */}
      <section className="py-16 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-8">
            Un espace adapté à chaque métier
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLES.map(({ emoji, role, color, badge, points }) => (
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

      {/* ─── CONTACT ─── */}
      <section className="py-20 max-w-5xl mx-auto px-4">
        <div className="text-center mb-10">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-3 block">Contact</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white">Nous joindre</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Building2,  label: 'Siège',     val: INFO.siege, href: undefined },
            { icon: Phone,      label: 'Téléphone', val: INFO.tel1,  href: `tel:${INFO.tel1.replace(/\s/g, '')}` },
            { icon: Smartphone, label: 'Mobile',    val: INFO.tel2,  href: `tel:${INFO.tel2.replace(/\s/g, '')}` },
            { icon: Mail,       label: 'E-mail',    val: INFO.email, href: `mailto:${INFO.email}` },
          ].map(({ icon: Icon, label, val, href }) => {
            const body = (
              <>
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</div>
                <div className="text-sm font-semibold text-white break-words">{val}</div>
              </>
            )
            return href
              ? <a key={label} href={href} className="block bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-2xl p-5 transition">{body}</a>
              : <div key={label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-5">{body}</div>
          })}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-28 bg-gradient-to-br from-blue-950/60 via-gray-950 to-gray-950">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="text-6xl mb-6 animate-float-y inline-block">📦</div>
          <h2 className="text-3xl sm:text-5xl font-black text-white mb-4">
            Votre espace BG Express
          </h2>
          <p className="text-gray-400 mb-10 max-w-md mx-auto">
            Connectez-vous pour gérer vos expéditions, ou suivez un colis avec son numéro.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl font-bold text-lg transition shadow-2xl shadow-blue-600/30 active:scale-95"
            >
              <Package className="w-5 h-5" /> Se connecter
            </Link>
            <Link to="/track"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white px-10 py-4 rounded-2xl font-bold text-lg transition active:scale-95"
            >
              <Search className="w-5 h-5" /> Suivre un colis
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-6 bg-gray-950 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <Truck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-400">
              BG <span className="text-blue-500">Express</span>
            </span>
          </div>
          <p className="text-xs text-gray-600 text-center">
            © {new Date().getFullYear()} BG Express · Casablanca · Marrakech · Agadir · Ait Melloul 🇲🇦
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
