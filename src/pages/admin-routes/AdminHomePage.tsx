import { lazy, Suspense, useEffect, useState } from 'react'
import { useAdminContext } from '../../contexts/AdminContext'
import {
  subscribeAllParcels, subscribeAllCaisse, subscribeAllReglementsGlobal,
  subscribeAllBankDeposits
} from '../../firebase/firestore'
import { getRealParcelsStats } from '../../firebase/parcels'

const AdminHomeTab = lazy(() => import('../admin/tabs/AdminHomeTab'))

const AdminHomePage = () => {
  const { users } = useAdminContext()
  const [parcels, setParcels] = useState<any[]>([])
  const [caisseEntries, setCaisseEntries] = useState<any[]>([])
  const [reglements, setReglements] = useState<any[]>([])
  const [bankDeposits, setBankDeposits] = useState<any[]>([])
  const [realStats, setRealStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubParcels = subscribeAllParcels(
      (data: any[]) => setParcels(data),
      (err: any) => console.error('Error loading parcels:', err),
      0,
      500 // Load limited for home page
    )

    const unsubCaisse = subscribeAllCaisse(
      (data: any[]) => setCaisseEntries(data),
      (err: any) => console.error('Error loading caisse:', err)
    )

    const unsubReglements = subscribeAllReglementsGlobal(
      (data: any[]) => setReglements(data),
      (err: any) => console.error('Error loading reglements:', err)
    )

    const unsubBanks = subscribeAllBankDeposits(
      (data: any[]) => setBankDeposits(data),
      (err: any) => console.error('Error loading bank deposits:', err)
    )

    loadRealStats()
    setLoading(false)

    return () => {
      unsubParcels()
      unsubCaisse()
      unsubReglements()
      unsubBanks()
    }
  }, [])

  const loadRealStats = async () => {
    try {
      const stats = await getRealParcelsStats()
      setRealStats(stats)
    } catch (err) {
      console.error('Error loading real stats:', err)
    }
  }

  // Calculate period stats (last 30 days)
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
  const periodParcels = parcels.filter((p: any) => {
    const date = p.createdAt?.toDate?.() || new Date(p.createdAt)
    return date.getTime() >= thirtyDaysAgo
  })

  const periodUsers = users.filter((u: any) => {
    const date = u.createdAt ? new Date(u.createdAt) : null
    return date && date.getTime() >= thirtyDaysAgo
  })

  // Calculate COD stats
  const codStats = {
    total: parcels.filter((p: any) => p.codAmount > 0).length,
    collected: parcels.filter((p: any) => p.codCollected).length,
    pending: parcels.filter((p: any) => p.codAmount > 0 && !p.codCollected).length,
  }

  // Calculate agency stats (placeholder - implement as needed)
  const agencyStats: any[] = []

  // Alerts (placeholder)
  const delayedAlerts: any[] = []
  const codAlerts: any[] = []

  // Return parcels
  const returnParcels = parcels.filter((p: any) => p.isReturn)

  if (loading) {
    return <div className="animate-pulse h-96 bg-white rounded-2xl" />
  }

  return (
    <Suspense fallback={<div className="animate-pulse h-96 bg-white rounded-2xl" />}>
      <AdminHomeTab
        periodParcels={periodParcels}
        periodUsers={periodUsers}
        users={users}
        codStats={codStats}
        agencyStats={agencyStats}
        caisseEntries={caisseEntries}
        adminRapports={reglements}
        allBankDeposits={bankDeposits}
        returnParcels={returnParcels}
        delayedAlerts={delayedAlerts}
        codAlerts={codAlerts}
        lockPanelOpen={false}
        setLockPanelOpen={() => {}}
        operationLocks={{}}
        lockBusy={''}
        backupBusy={false}
        backupMessage={null}
        realStats={realStats}
        onRefreshStats={loadRealStats}
        importPreview={null}
        setImportPreview={() => {}}
        handleExportBackup={() => {}}
        handleBackupFile={() => {}}
        handleConfirmImportBackup={() => {}}
        handleToggleGlobalLock={() => {}}
        handleToggleAgencyLock={() => {}}
        setMainTab={() => {}}
        navigate={() => {}}
      />
    </Suspense>
  )
}

export default AdminHomePage
