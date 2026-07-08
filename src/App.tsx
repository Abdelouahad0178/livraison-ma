import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import { initMonitoring, setUserContext } from './utils/monitoring'
import { loadWorkingDateFromFirestore } from './utils/workingDate'

initMonitoring()

const DEFAULT_OPERATION_LOCKS = {
  globalStopped: false,
  globalUpdatedAt: null,
  globalUpdatedBy: '',
  agencies: {},
}

const normalizeRole = (value: any) => String(value || '').trim().toLowerCase()

const isPublicPath = (pathname: any) =>
  pathname === '/' ||
  pathname === '/login' ||
  pathname === '/track' ||
  pathname === '/client' ||
  pathname.startsWith('/sign/')

const HomePage    = lazy(() => import('./pages/HomePage'))
const LoginPage   = lazy(() => import('./pages/LoginPage'))
const AgentPage   = lazy(() => import('./pages/AgentPage'))
const AdminPage   = lazy(() => import('./pages/AdminPage'))
const TrackingPage  = lazy(() => import('./pages/TrackingPage'))
const ClientsPage   = lazy(() => import('./pages/ClientsPage'))
const FleetPage     = lazy(() => import('./pages/FleetPage'))
const DirectorPage  = lazy(() => import('./pages/DirectorPage'))
const DashboardPage  = lazy(() => import('./pages/DashboardPage'))
const CaissierPage   = lazy(() => import('./pages/CaissierPage'))
const DriverPage     = lazy(() => import('./pages/DriverPage'))
const DriverGarePage = lazy(() => import('./pages/DriverGarePage'))
const DriverGarePageTest = lazy(() => import('./pages/DriverGarePageTest'))
const TestMinimal = lazy(() => import('./pages/TestMinimal'))
const CaisseAdminPage = lazy(() => import('./pages/CaisseAdminPage'))
const ClientPortalPage = lazy(() => import('./pages/ClientPortalPage'))
const SignaturePage    = lazy(() => import('./pages/SignaturePage'))
const ArrivagePage     = lazy(() => import('./pages/ArrivagePage'))
const PointeurPage     = lazy(() => import('./pages/PointeurPage'))
const PointeurPageNew  = lazy(() => import('./pages/PointeurPageNew'))
const CentralCollectorPage = lazy(() => import('./pages/CentralCollectorPage'))
const SeedPage         = lazy(() => import('./pages/SeedPage'))
const ArchivePage      = lazy(() => import('./pages/ArchivePage'))

// Auth vérifié UNE SEULE FOIS au niveau App — pas à chaque navigation
function BlockedScreen({ profile, operationLocks }: any) {
  const city = profile?.city || ''
  const agencyLock = city ? operationLocks.agencies?.[city] : null
  const isGlobal = !!operationLocks.globalStopped
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white border border-red-100 rounded-3xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-red-600 text-white flex items-center justify-center text-4xl shadow-lg mb-5">
          ⏻
        </div>
        <h1 className="text-2xl font-black text-gray-900">Operations arretees</h1>
        <p className="text-gray-500 mt-3">
          {isGlobal
            ? "L'Admin a coupe toutes les operations du site."
            : `L'Admin a bloque les operations de l'agence ${city || ''}.`}
        </p>
        <div className="mt-5 text-xs text-red-700 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
          Contactez l'administrateur pour reactiver l'acces.
          {(isGlobal ? operationLocks.globalUpdatedBy : agencyLock?.updatedBy) && (
            <span className="block mt-1">Derniere action : {isGlobal ? operationLocks.globalUpdatedBy : agencyLock?.updatedBy}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function PrivateRoute({ user, role, profile, operationLocks, requiredRole, children }: any) {
  const location = useLocation()
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (profile?.blocked) return <Navigate to="/login" replace />
  const allowed = Array.isArray(requiredRole) ? requiredRole.includes(role) : role === requiredRole
  if (requiredRole && !allowed) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (role !== 'admin') {
    const city = profile?.city
    const agencyLocked = city && operationLocks.agencies?.[city]?.locked
    if (operationLocks.globalStopped || agencyLocked) {
      return <BlockedScreen profile={profile} operationLocks={operationLocks} />
    }
  }
  return children
}

function Loader() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-400 text-sm">Chargement...</p>
    </div>
  )
}

function AppContent() {
  const location = useLocation()
  const publicPath = isPublicPath(location.pathname)
  const [user,    setUser]    = useState<any>(null)
  const [role,    setRole]    = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [operationLocks, setOperationLocks] = useState(DEFAULT_OPERATION_LOCKS)
  const [loading, setLoading] = useState(!publicPath)
  const [blockedOut, setBlockedOut] = useState(false)

  // PWA : le service worker gère le cache — ne pas l'annuler

  useEffect(() => {
    if (publicPath) {
      setUser(null)
      setProfile(null)
      setRole(null)
      setOperationLocks(DEFAULT_OPERATION_LOCKS)
      setBlockedOut(false)
      setLoading(false)
      return
    }

    let unsubLocks: any = null
    let unsubProfile: any = null
    let unsubAuth: any = null
    let alive = true

    setLoading(true)

    Promise.all([
      import('firebase/auth'),
      import('./firebase/auth'),
    ]).then(([{ onAuthStateChanged }, { auth }]) => {
      if (!alive) return
      unsubAuth = onAuthStateChanged(auth, (u) => {
      if (unsubLocks)   { unsubLocks();   unsubLocks   = null }
      if (unsubProfile) { unsubProfile(); unsubProfile = null }

      if (u) {
        setUser(u)
        setUserContext(u.uid, u.email ?? undefined)

        // Charger la date de travail une fois authentifié
        loadWorkingDateFromFirestore().catch(err => {
          console.error('Erreur chargement date de travail:', err)
        })

        ;(async () => {
          const [{ doc, onSnapshot }, { db }, { subscribeOperationLocks }] = await Promise.all([
            import('firebase/firestore'),
            import('./firebase/db'),
            import('./firebase/operationLocks'),
          ])
          if (!alive) return

          unsubProfile = onSnapshot(
            doc(db, 'users', u.uid),
            (snap) => {
              const data = snap.exists() ? snap.data() : null

              if (data?.blocked) {
                setBlockedOut(true)
                return
              }
              setBlockedOut(false)

              const normalizedRole = normalizeRole(data?.role)
              setProfile(data ? { ...data, role: normalizedRole } : data)
              setRole(normalizedRole || null)
              setLoading(false)
            },
            (err) => {
              console.warn('User profile listener permission denied:', err.code)
              setProfile(null)
              setRole(null)
              setLoading(false)
            }
          )

          unsubLocks = subscribeOperationLocks(setOperationLocks, err => {
            console.error('App subscribeOperationLocks:', err)
            setOperationLocks(DEFAULT_OPERATION_LOCKS)
          })
        })().catch(err => {
          console.error('App auth bootstrap:', err)
          setProfile(null)
          setRole(null)
          setLoading(false)
        })
      } else {
        setUserContext('')
        setUser(null)
        setProfile(null)
        setRole(null)
        setOperationLocks(DEFAULT_OPERATION_LOCKS)
        setLoading(false)
      }
    })
    }).catch(err => {
      console.error('App auth import:', err)
      setUser(null)
      setProfile(null)
      setRole(null)
      setLoading(false)
    })

    return () => {
      alive = false
      if (unsubAuth) unsubAuth()
      if (unsubLocks)   unsubLocks()
      if (unsubProfile) unsubProfile()
    }
  }, [publicPath])

  const handleBlockedAck = async () => {
    setBlockedOut(false)
    const [{ signOut }, { auth }] = await Promise.all([
      import('firebase/auth'),
      import('./firebase/auth'),
    ])
    await signOut(auth)
  }

  // When navigating from a public path (e.g. /login) to a private path right after a
  // successful signIn, there is a single render cycle where loading=false and user=null
  // before the useEffect can set loading=true. PrivateRoute would redirect back to /login.
  // Detect this transition synchronously via a ref and hold the Loader for that one render.
  const prevPublicRef = useRef(publicPath)
  const justTransitionedToPrivate = prevPublicRef.current !== publicPath && !publicPath
  if (prevPublicRef.current !== publicPath) prevPublicRef.current = publicPath

  if (loading || justTransitionedToPrivate) return <Loader />

  return (
    <>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/"      element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/track" element={<TrackingPage />} />
          <Route path="/sign/:parcelId/:token" element={<SignaturePage />} />

          <Route path="/admin" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="admin">
              <AdminPage />
            </PrivateRoute>
          } />
          <Route path="/agent" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole={['agent', 'chef_agence', 'aide_agent']}>
              <AgentPage />
            </PrivateRoute>
          } />
          <Route path="/clients" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole={['admin','directeur']}>
              <ClientsPage />
            </PrivateRoute>
          } />
          <Route path="/fleet" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole={['admin','directeur']}>
              <FleetPage />
            </PrivateRoute>
          } />
          <Route path="/director" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="directeur">
              <DirectorPage />
            </PrivateRoute>
          } />
          <Route path="/dashboard" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="admin">
              <DashboardPage />
            </PrivateRoute>
          } />
          <Route path="/caissier" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="caissier">
              <CaissierPage />
            </PrivateRoute>
          } />
          <Route path="/driver" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole={['chauffeur', 'livreur']}>
              <DriverPage />
            </PrivateRoute>
          } />
          <Route path="/gare-driver" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="livreur-gare">
              <DriverGarePage />
            </PrivateRoute>
          } />
          <Route path="/gare-driver-test" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="livreur-gare">
              <DriverGarePageTest />
            </PrivateRoute>
          } />
          <Route path="/gare-driver-test-public" element={<DriverGarePageTest />} />
          <Route path="/test-minimal" element={<TestMinimal />} />
          <Route path="/caisse-admin" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="admin">
              <CaisseAdminPage />
            </PrivateRoute>
          } />
          <Route path="/client/:clientId" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="client">
              <ClientPortalPage />
            </PrivateRoute>
          } />
          <Route path="/client" element={<Navigate to="/" replace />} />

          <Route path="/arrivage" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole={['agent', 'chef_agence', 'admin', 'directeur']}>
              <ArrivagePage />
            </PrivateRoute>
          } />

          <Route path="/pointeur" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="pointeur_encaisseur">
              <PointeurPageNew />
            </PrivateRoute>
          } />

          <Route path="/central" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="encaisseur_central">
              <CentralCollectorPage />
            </PrivateRoute>
          } />

          <Route path="/seed" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole="admin">
              <SeedPage />
            </PrivateRoute>
          } />

          <Route path="/archive" element={
            <PrivateRoute user={user} role={role} profile={profile} operationLocks={operationLocks} requiredRole={['chef_agence', 'admin']}>
              <ArchivePage />
            </PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {/* ── Popup de blocage de compte ── */}
      {blockedOut && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center animate-fade-in">
            <div className="w-20 h-20 mx-auto rounded-full bg-red-100 flex items-center justify-center text-5xl mb-5">
              🚫
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-2">Compte bloqué</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-1">
              Votre compte a été <span className="font-semibold text-red-600">bloqué par l'administrateur</span>.
            </p>
            <p className="text-gray-400 text-xs mb-6">
              Contactez votre administrateur pour connaître la raison et rétablir votre accès.
            </p>
            <button
              onClick={handleBlockedAck}
              className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition"
            >
              J'ai compris — Se déconnecter
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
