import { useEffect, useRef, useState } from 'react'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase/auth'
import { useLocation, useNavigate } from 'react-router-dom'
import { Lock, Mail, User, ChevronDown, MapPin, Phone } from 'lucide-react'
import CompanyContact from '../components/CompanyContact'
import { CITIES } from '../firebase/constants'
import { checkRateLimit, recordFailure, clearRateLimit, formatRetryAfter } from '../utils/rateLimiter'

const AUTH_ROLES = [
  { key: 'admin',                label: 'Admin',               emoji: '🖥️' },
  { key: 'chef_agence',          label: "Chef d'agence",        emoji: '🏢' },
  { key: 'agent',                label: 'Agent',                emoji: '🧑‍💼' },
  { key: 'aide_agent',           label: 'Aide Agent',           emoji: '✏️' },
  { key: 'agentpro',             label: 'Agent Pro',            emoji: '⭐' },
  { key: 'pointeur_encaisseur',  label: 'Pointeur-Encaisseur',  emoji: '💼' },
  { key: 'encaisseur_central',   label: 'Encaisseur central',   emoji: '🏦' },
  { key: 'chauffeur',            label: 'Chauffeur',            emoji: '🚚' },
  { key: 'livreur',              label: 'Livreur',              emoji: '🛵' },
  { key: 'livreur-gare',         label: 'Livreur en gare',      emoji: '🚉' },
  { key: 'caissier',             label: 'Caissier',             emoji: '🏦' },
  { key: 'client',               label: 'Client',               emoji: '🧾' },
]

const normalizeRole = (value: any) => String(value || '').trim().toLowerCase()

const ADMIN_EMAIL = 'hassan@gmail.com'

export default function LoginPage() {
  const [mode, setMode]           = useState('login') // 'login' | 'register' | 'welcome'
  const [selectedCity, setSelectedCity] = useState('')

  // Login
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')

  // Register extras
  const [confirm, setConfirm]     = useState('')
  const [name, setName]           = useState('')
  const [tel, setTel]             = useState('')
  const [code, setCode]           = useState('')
  const [regCity, setRegCity]     = useState('')
  const [role, setRole]           = useState('admin')

  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [welcomeProfile, setWelcomeProfile] = useState<any>(null)
  const [lockoutMsg, setLockoutMsg] = useState('')
  const lockoutTimer = useRef<any>(null)

  // null = checking, true = admin exists (registration closed), false = first setup
  const [adminExists, setAdminExists] = useState<any>(null)

  useEffect(() => {
    let unsub: any = null
    let cancelled = false
    Promise.all([
      import('../firebase/db'),
      import('firebase/firestore'),
    ])
      .then(([{ db }, { doc, onSnapshot }]) => {
        if (cancelled) return
        unsub = onSnapshot(
          doc(db, 'settings', 'adminSetup'),
          snap => setAdminExists(snap.exists()),
          () => setAdminExists(true)
        )
      })
      .catch(() => setAdminExists(true))
    return () => {
      cancelled = true
      if (unsub) unsub()
    }
  }, [])

  // Tick le compte à rebours de lockout
  const startLockoutCountdown = (retryAfterMs: any, rlKey: any) => {
    if (lockoutTimer.current) clearInterval(lockoutTimer.current)
    const end = Date.now() + retryAfterMs
    const tick = () => {
      const remaining = end - Date.now()
      if (remaining <= 0) {
        clearInterval(lockoutTimer.current)
        setLockoutMsg('')
        clearRateLimit(rlKey)
      } else {
        setLockoutMsg(`Trop de tentatives. Réessayez dans ${formatRetryAfter(remaining)}.`)
      }
    }
    tick()
    lockoutTimer.current = setInterval(tick, 1000)
  }
  useEffect(() => () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current) }, [])

  const navigate = useNavigate()
  const location = useLocation()
  const nextPath = new URLSearchParams(location.search).get('next') || ''
  const isClientPortalLogin = nextPath.startsWith('/client/') || nextPath.includes('/client/')

  useEffect(() => {
    if (isClientPortalLogin && mode !== 'login') setMode('login')
  }, [isClientPortalLogin, mode])

  const reset = () => {
    setEmail(''); setPassword(''); setConfirm(''); setName(''); setTel('')
    setCode(''); setRegCity(''); setRole('admin'); setError(''); setSuccess('')
  }
  const switchMode = (m: any) => {
    reset()
    if (m === 'register') setEmail(ADMIN_EMAIL)
    setMode(m)
  }

  const handleLogin = async (e: any) => {
    e.preventDefault()
    setError(''); setLockoutMsg('')
    const rlKey = `login:${email.trim().toLowerCase()}`
    const check = checkRateLimit(rlKey)
    if (!check.allowed) { startLockoutCountdown(check.retryAfter, rlKey); return }
    setLoading(true)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      const [{ db }, { doc, getDoc }] = await Promise.all([
        import('../firebase/db'),
        import('firebase/firestore'),
      ])
      const snap = await getDoc(doc(db, 'users', cred.user.uid))
      const userData = snap.data()
      const r = normalizeRole(userData?.role)
      if (![...AUTH_ROLES.map(role => role.key), 'directeur'].includes(r)) {
        recordFailure(rlKey)
        setError("Rôle non reconnu. Contactez l'administrateur.")
        setLoading(false)
        return
      }
      if (userData?.blocked) {
        setError("Votre compte a été bloqué. Contactez l'administrateur.")
        setLoading(false)
        return
      }
      clearRateLimit(rlKey)
      const next = new URLSearchParams(location.search).get('next') || ''
      const ownClientPath = userData?.clientId ? `/client/${userData.clientId}` : ''
      const safeClientPathRe = /^\/client\/[a-zA-Z0-9_-]+$/
      const nextClientPath = safeClientPathRe.test(next) ? next : ''
      if      (r === 'admin')                navigate('/admin')
      else if (r === 'chef_agence')          navigate('/agent')
      else if (r === 'agent')                navigate('/agent')
      else if (r === 'aide_agent')           navigate('/agent')
      else if (r === 'agentpro')             navigate('/agent')
      else if (r === 'pointeur_encaisseur')  navigate('/pointeur')
      else if (r === 'encaisseur_central')   navigate('/central')
      else if (r === 'chauffeur')            navigate('/driver')
      else if (r === 'livreur')              navigate('/driver')
      else if (r === 'livreur-gare')         navigate('/gare-driver')
      else if (r === 'directeur')            navigate('/director')
      else if (r === 'caissier')             navigate('/caissier')
      else if (r === 'client')               navigate(nextClientPath || ownClientPath || '/')
    } catch {
      recordFailure(rlKey)
      const recheck = checkRateLimit(rlKey)
      if (!recheck.allowed) {
        startLockoutCountdown(recheck.retryAfter, rlKey)
      } else {
        setError('Email ou mot de passe incorrect.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: any) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLockoutMsg('')

    // Block registration if admin already exists
    if (adminExists !== false) {
      setError("L'inscription est fermée. Contactez votre administrateur.")
      return
    }
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setError(`L'email administrateur doit être ${ADMIN_EMAIL}.`)
      return
    }

    const rlKey = `register:${email.trim().toLowerCase()}`
    const check = checkRateLimit(rlKey)
    if (!check.allowed) { startLockoutCountdown(check.retryAfter, rlKey); return }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (password.length < 6)  { setError('Le mot de passe doit contenir au moins 6 caractères.'); return }
    if (!regCity)             { setError("Sélectionnez la ville."); return }
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, password)
      const [{ db }, { doc, setDoc }] = await Promise.all([
        import('../firebase/db'),
        import('firebase/firestore'),
      ])
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, email: ADMIN_EMAIL, role: 'admin', code: '', city: regCity, tel: tel.trim(),
        createdAt: new Date().toISOString()
      })
      await setDoc(doc(db, 'settings', 'adminSetup'), {
        adminCreated: true,
        email: ADMIN_EMAIL,
        createdAt: new Date().toISOString()
      })
      setAdminExists(true)
      clearRateLimit(rlKey)
      setSuccess('Compte administrateur créé ! Vous pouvez maintenant vous connecter.')
      switchMode('login')
    } catch (err: any) {
      recordFailure(`register:${email.trim().toLowerCase()}`)
      if (err.code === 'auth/email-already-in-use') setError('Cet email est déjà utilisé.')
      else setError("Erreur lors de la création du compte.")
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full bg-white/10 border border-white/20 text-white placeholder-gray-400 pl-10 pr-4 py-3 rounded-xl focus:border-blue-500 focus:outline-none transition"

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 flex flex-col">
      <CompanyContact />
      <div className="flex-1 flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-white rounded-2xl shadow-lg px-5 py-3 mb-4">
            <img src="/LOGO.jpg" alt="BG Express" className="h-14 object-contain" />
          </div>
          <p className="text-blue-300 mt-1 text-sm">Gestion de livraison au Maroc 🇲🇦</p>
        </div>

        {/* Écran de bienvenue */}
        {mode === 'welcome' && welcomeProfile && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg">
              <MapPin className="w-10 h-10 text-white" />
            </div>
            <p className="text-blue-300 text-sm font-medium mb-1">Bienvenue</p>
            <h2 className="text-white font-bold text-2xl">{welcomeProfile.name}</h2>

            {welcomeProfile.city ? (
              <div className="mt-5 bg-blue-600/30 border border-blue-500/40 rounded-2xl px-6 py-4">
                <p className="text-blue-200 text-xs uppercase tracking-wider mb-1">Vous êtes connecté à</p>
                <p className="text-white font-bold text-xl">📍 Agence de {welcomeProfile.city}</p>
              </div>
            ) : (
              <div className="mt-5 bg-white/10 rounded-2xl px-6 py-3">
                <p className="text-gray-300 text-sm capitalize">{welcomeProfile.role}</p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-2 text-blue-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Redirection en cours…
            </div>
          </div>
        )}

        {/* Formulaire */}
        {mode !== 'welcome' && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 shadow-2xl">

            {/* Sélecteur de ville */}
            <div className="mb-6">
              <p className="text-gray-400 text-xs font-medium mb-2 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Plateforme de votre agence
              </p>
              <div className="relative">
                <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  value={selectedCity}
                  onChange={e => setSelectedCity(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 text-white pl-4 pr-10 py-3 rounded-xl focus:border-blue-500 focus:outline-none transition appearance-none"
                >
                  <option value="" className="bg-gray-900">Sélectionner une ville…</option>
                  {CITIES.map(c => (
                    <option key={c} value={c} className="bg-gray-900">{c}</option>
                  ))}
                </select>
              </div>
              {selectedCity && (
                <div className="mt-2 bg-blue-600/25 border border-blue-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse shrink-0" />
                  <span className="text-blue-200 text-sm">Plateforme</span>
                  <span className="text-white font-bold text-sm">Agence de {selectedCity}</span>
                </div>
              )}
              <div className="border-t border-white/10 mt-5" />
            </div>

            {/* Toggle connexion / inscription */}
            {!isClientPortalLogin && adminExists === false && (
              <div className="flex bg-white/10 rounded-xl p-1 mb-6">
                <button onClick={() => switchMode('login')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'login' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  Connexion
                </button>
                <button onClick={() => switchMode('register')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${mode === 'register' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  Config. initiale
                </button>
              </div>
            )}

            {lockoutMsg && (
              <div className="bg-orange-500/20 border border-orange-500/40 text-orange-300 p-3 rounded-xl mb-5 text-sm font-semibold text-center">
                🔒 {lockoutMsg}
              </div>
            )}
            {error && (
              <div className="bg-red-500/20 border border-red-500/30 text-red-300 p-3 rounded-xl mb-5 text-sm">
                ⚠️ {error}
              </div>
            )}
            {success && (
              <div className="bg-green-500/20 border border-green-500/30 text-green-300 p-3 rounded-xl mb-5 text-sm">
                ✅ {success}
              </div>
            )}

            {/* Connexion */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} autoComplete="off" className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input type="email" placeholder="Email" value={email}
                    onChange={e => setEmail(e.target.value)} required className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input type="password" placeholder="Mot de passe" value={password}
                    onChange={e => setPassword(e.target.value)} required className={inputCls} />
                </div>
                <button type="submit" disabled={loading || !!lockoutMsg}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Connexion…</>
                    : lockoutMsg ? '🔒 Veuillez patienter…' : 'Se connecter'
                  }
                </button>
              </form>
            )}

            {/* Inscription initiale admin */}
            {mode === 'register' && adminExists === false && (
              <form onSubmit={handleRegister} autoComplete="off" className="space-y-4">
                <div className="bg-amber-500/15 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-xl text-sm">
                  🔑 Création du compte administrateur principal. Cette action n'est possible qu'une seule fois.
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input type="text" placeholder="Nom complet" value={name}
                    onChange={e => setName(e.target.value)} required className={inputCls} />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input type="tel" placeholder="Téléphone (06XXXXXXXX)" value={tel}
                    onChange={e => setTel(e.target.value)} className={inputCls} />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input type="email" value={ADMIN_EMAIL} readOnly
                    className={`${inputCls} opacity-60 cursor-not-allowed`} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input type="password" placeholder="Mot de passe (min. 6 caractères)" value={password}
                    onChange={e => setPassword(e.target.value)} required className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input type="password" placeholder="Confirmer le mot de passe" value={confirm}
                    onChange={e => setConfirm(e.target.value)} required className={inputCls} />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  <select value={regCity} onChange={e => setRegCity(e.target.value)} required
                    className="w-full bg-white/10 border border-white/20 text-white pl-10 pr-10 py-3 rounded-xl focus:border-blue-500 focus:outline-none transition appearance-none"
                  >
                    <option value="" className="bg-gray-900">Ville de l'agence principale</option>
                    {CITIES.map(c => <option key={c} value={c} className="bg-gray-900">{c}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2"
                >
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Création…</>
                    : '🖥️ Créer le compte Admin'
                  }
                </button>
              </form>
            )}
          </div>
        )}

      </div>
      </div>
    </div>
  )
}
