import { useState, useEffect, useMemo, useRef } from 'react'
import { subscribeAllParcels, getParcelsPage } from '../firebase/parcels'
import { Search, Filter, Calendar, MapPin, Printer, FileSpreadsheet, Edit2, Check, X, FileText, Database, Download } from 'lucide-react'
import { CITIES } from '../firebase/constants'
import * as XLSX from 'xlsx'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { printParcelTicket } from '../utils/printParcelTicket'

export default function FacturierExpeditionsTab({ profileCity }: { profileCity?: string }) {
  const PAGE_SIZE = 300 // Chargement initial rapide (laisse le temps de filtrer)
  const [liveParcels, setLiveParcels] = useState<any[]>([])
  const [moreParcels, setMoreParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAll, setLoadingAll] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadAllProgress, setLoadAllProgress] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('Toutes')
  const [portTypeFilter, setPortTypeFilter] = useState<'all' | 'port_du' | 'port_paye' | 'port_en_compte_expediteur' | 'port_en_compte_destinataire'>('all')
  const [clientRoleFilter, setClientRoleFilter] = useState<'all' | 'expediteur' | 'destinataire'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const lastPageDocRef = useRef<any>(null)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [editingPrice, setEditingPrice] = useState<string>('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [displayLimit, setDisplayLimit] = useState(500) // Limite d'affichage progressive

  // Fusion des expéditions temps réel + chargées progressivement
  const parcels = useMemo(() => {
    const map = new Map()
    moreParcels.forEach((p: any) => map.set(p.id, p))
    liveParcels.forEach((p: any) => map.set(p.id, p))
    return [...map.values()]
  }, [liveParcels, moreParcels])

  // Charger les premiers colis en temps réel
  useEffect(() => {
    const unsubscribe = subscribeAllParcels(
      (docs: any[], lastSnap: any) => {
        setLiveParcels(docs)
        setLoading(false)
        setError(null)
        if (!lastPageDocRef.current) lastPageDocRef.current = lastSnap
        if (docs.length < PAGE_SIZE) setHasMore(false)
      },
      (err) => {
        console.error('Facturier - Erreur:', err)
        setError(`Erreur de chargement: ${err?.message || 'Erreur inconnue'}`)
        setLoading(false)
      },
      0,
      PAGE_SIZE
    )
    return unsubscribe
  }, [])

  // Charger 800 colis de plus manuellement
  const loadMoreParcels = async () => {
    if (!hasMore || loadingMore || loadingAll || !lastPageDocRef.current) return
    setLoadingMore(true)
    try {
      const page = await getParcelsPage(lastPageDocRef.current, PAGE_SIZE)
      const pageDocs = page.docs

      setMoreParcels(prev => {
        const map = new Map()
        prev.forEach((p: any) => map.set(p.id, p))
        pageDocs.forEach((p: any) => map.set(p.id, p))
        return [...map.values()]
      })

      if (page.lastDocSnap) lastPageDocRef.current = page.lastDocSnap
      if (!page.hasMore) setHasMore(false)
      console.log(`✅ Facturier: ${pageDocs.length} expéditions supplémentaires chargées`)
    } catch (err) {
      console.error('Erreur chargement +800:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  // Référence pour arrêter le chargement
  const stopLoadingRef = useRef(false)

  // Arrêter le chargement en cours
  const stopLoading = () => {
    stopLoadingRef.current = true
    setLoadingAll(false)
    setLoadingMore(false)
  }

  // Charger TOUTE la base manuellement (peut être arrêté à tout moment)
  const loadAllParcels = async () => {
    if (!hasMore || loadingAll || loadingMore || !lastPageDocRef.current) return
    stopLoadingRef.current = false // Réinitialiser le flag d'arrêt
    setLoadingAll(true)
    setLoadAllProgress(0)
    try {
      let cursor = lastPageDocRef.current
      let more = true
      let loaded = 0
      let safety = 0

      while (more && cursor && safety < 500 && !stopLoadingRef.current) {
        const page = await getParcelsPage(cursor, 800) // Charger par tranches de 800
        const pageDocs = page.docs
        loaded += pageDocs.length
        setLoadAllProgress(loaded)

        setMoreParcels(prev => {
          const map = new Map()
          prev.forEach((p: any) => map.set(p.id, p))
          pageDocs.forEach((p: any) => map.set(p.id, p))
          return [...map.values()]
        })

        cursor = page.lastDocSnap
        more = page.hasMore && !!page.lastDocSnap
        safety += 1
      }

      if (cursor) lastPageDocRef.current = cursor
      if (!more || !cursor) setHasMore(false)

      const status = stopLoadingRef.current ? 'arrêté' : 'complet'
      console.log(`✅ Facturier: Chargement ${status} - ${loaded} expéditions supplémentaires chargées`)
    } catch (err) {
      console.error('Erreur chargement complet:', err)
    } finally {
      setLoadingAll(false)
      stopLoadingRef.current = false
    }
  }

  // Réinitialiser la limite d'affichage quand les filtres changent
  useEffect(() => {
    setDisplayLimit(500)
  }, [search, cityFilter, portTypeFilter, clientRoleFilter, statusFilter, dateFilter, dateFrom, dateTo])

  // 🚫 CHARGEMENT AUTOMATIQUE DÉSACTIVÉ
  // L'utilisateur décide quand charger plus via les boutons manuels
  // Cela laisse le temps de filtrer sans surcharger la page

  // 🔄 Écouter les mises à jour de parcels depuis d'autres pages (ex: Admin)
  useEffect(() => {
    const handleParcelUpdate = (event: CustomEvent) => {
      const { parcelId, data } = event.detail
      console.log(`📦 Facturier: Parcel mis à jour: ${parcelId}`, data)

      // Mettre à jour dans liveParcels
      setLiveParcels(prev => prev.map(p =>
        p.id === parcelId ? { ...p, ...data } : p
      ))

      // Mettre à jour dans moreParcels
      setMoreParcels(prev => prev.map(p =>
        p.id === parcelId ? { ...p, ...data } : p
      ))
    }

    window.addEventListener('parcelUpdated', handleParcelUpdate as EventListener)
    return () => window.removeEventListener('parcelUpdated', handleParcelUpdate as EventListener)
  }, [])

  // Filtrer les colis
  const filteredParcels = useMemo(() => {
    let result = parcels.filter(p => {
      // Si profileCity est défini (mode agence), filtrer par ville d'origine
      if (profileCity) {
        const originCity = p.sender?.city || p.originCity
        if (originCity !== profileCity) return false
      }

      // Filtre par ville (vérifier sender.city ET originCity) - insensible à la casse
      if (cityFilter !== 'Toutes') {
        const originCity = (p.sender?.city || p.originCity || '').toLowerCase()
        if (originCity !== cityFilter.toLowerCase()) return false
      }

      // Filtre par type de port
      if (portTypeFilter !== 'all' && p.portType !== portTypeFilter) return false

      // Filtre par rôle du client (expéditeur ou destinataire)
      // Ce filtre est conceptuel - il aide à identifier quel rôle du client on veut facturer
      // Pour port_du, port_paye, port_en_compte_expediteur: le client est l'expéditeur
      // Pour port_en_compte_destinataire: le client est le destinataire
      if (clientRoleFilter !== 'all') {
        if (clientRoleFilter === 'expediteur') {
          // Colis où le client à facturer est l'expéditeur
          if (p.portType === 'port_en_compte_destinataire') return false
        } else if (clientRoleFilter === 'destinataire') {
          // Colis où le client à facturer est le destinataire
          if (p.portType !== 'port_en_compte_destinataire') return false
        }
      }

      // Filtre par statut
      if (statusFilter !== 'all' && p.status !== statusFilter) return false

      // Filtre par recherche
      if (search) {
        const term = search.toLowerCase()
        return (
          p.trackingId?.toLowerCase().includes(term) ||
          p.sender?.nic?.toLowerCase().includes(term) ||
          p.sender?.name?.toLowerCase().includes(term) ||
          p.receiver?.name?.toLowerCase().includes(term) ||
          p.sender?.tel?.toLowerCase().includes(term) ||
          p.receiver?.tel?.toLowerCase().includes(term) ||
          p.clientName?.toLowerCase().includes(term)
        )
      }

      return true
    })

    // Filtre par date
    if (dateFilter === 'today') {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)
      result = result.filter(p => {
        const date = p.createdAt?.toDate?.() || new Date(0)
        return date >= startOfDay && date <= endOfDay
      })
    } else if (dateFilter === 'week') {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 7)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date()
      endDate.setHours(23, 59, 59, 999)
      result = result.filter(p => {
        const date = p.createdAt?.toDate?.() || new Date(0)
        return date >= startDate && date <= endDate
      })
    } else if (dateFilter === 'month') {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date()
      endDate.setHours(23, 59, 59, 999)
      result = result.filter(p => {
        const date = p.createdAt?.toDate?.() || new Date(0)
        return date >= startDate && date <= endDate
      })
    } else if (dateFilter === 'custom' && dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      const to = dateTo ? new Date(dateTo) : new Date()
      to.setHours(23, 59, 59, 999)
      result = result.filter(p => {
        const date = p.createdAt?.toDate?.() || new Date(0)
        return date >= from && date <= to
      })
    }

    return result
  }, [parcels, cityFilter, portTypeFilter, clientRoleFilter, statusFilter, search, dateFilter, dateFrom, dateTo])

  // Statistiques
  const stats = useMemo(() => {
    const portDu = filteredParcels.filter(p => p.portType === 'port_du')
    const portPaye = filteredParcels.filter(p => p.portType === 'port_paye')

    // Statistiques par agence
    const byAgency = filteredParcels.reduce((acc: any, p) => {
      const agency = p.sender?.city || p.originCity || 'Non défini'
      if (!acc[agency]) {
        acc[agency] = { count: 0, portDu: 0, portPaye: 0, totalAmount: 0 }
      }
      acc[agency].count++
      acc[agency].totalAmount += (p.price || 0)
      if (p.portType === 'port_du') acc[agency].portDu++
      if (p.portType === 'port_paye') acc[agency].portPaye++
      return acc
    }, {})

    return {
      total: filteredParcels.length,
      portDu: portDu.length,
      portDuAmount: portDu.reduce((sum, p) => sum + (p.price || 0), 0),
      portPaye: portPaye.length,
      portPayeAmount: portPaye.reduce((sum, p) => sum + (p.price || 0), 0),
      byAgency,
      totalAmount: filteredParcels.reduce((sum, p) => sum + (p.price || 0), 0),
    }
  }, [filteredParcels])

  // Fonction de modification du prix
  async function handleSavePrice(parcelId: string, newPrice: number) {
    if (savingPrice) return
    setSavingPrice(true)
    try {
      // Mise à jour locale immédiate pour feedback instantané
      setLiveParcels(prev => prev.map(p =>
        p.id === parcelId ? { ...p, price: newPrice } : p
      ))
      setMoreParcels(prev => prev.map(p =>
        p.id === parcelId ? { ...p, price: newPrice } : p
      ))

      // Mise à jour dans Firestore
      await updateDoc(doc(db, 'parcels', parcelId), {
        price: newPrice,
        priceModifiedAt: new Date().toISOString()
      })

      // Émettre un événement global pour notifier les autres pages
      window.dispatchEvent(new CustomEvent('parcelPriceUpdated', {
        detail: { parcelId, newPrice, timestamp: new Date().toISOString() }
      }))

      // Fermer l'éditeur et afficher le succès
      setEditingPriceId(null)
      setEditingPrice('')
      setSuccessMessage(`Prix mis à jour: ${newPrice.toLocaleString()} DH`)

      // Effacer le message après 3 secondes
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Erreur mise à jour prix:', err)
      alert('Erreur lors de la mise à jour du prix')
    } finally {
      setSavingPrice(false)
    }
  }

  // Fonction d'export Excel
  function exportToExcel(parcels: any[], stats: any, filters: any) {
    // Préparer les données pour l'export
    const excelData = parcels.map(parcel => ({
      'N° EXP (NIC)': parcel.sender?.nic || parcel.trackingId || '-',
      'Client': parcel.clientName || '-',
      'Expéditeur': parcel.sender?.name || '-',
      'Destinataire': parcel.receiver?.name || '-',
      'Agence': parcel.sender?.city || parcel.originCity || '-',
      'Ville Dest.': parcel.receiver?.city || parcel.recipientCity || '-',
      'Nb Colis': parcel.nbColis || parcel.numberOfParcels || 1,
      'Type Port': parcel.portType === 'port_du' ? 'Port Dû' :
                   parcel.portType === 'port_paye' ? 'Port Payé' :
                   parcel.portType === 'port_en_compte_expediteur' ? 'Port en Compte (Expéditeur)' :
                   parcel.portType === 'port_en_compte_destinataire' ? 'Port en Compte (Destinataire)' : '-',
      'Montant Port (DH)': parcel.price || 0,
      'Date': parcel.expeditionDate
        ? new Date(parcel.expeditionDate).toLocaleDateString('fr-MA')
        : parcel.createdAt?.toDate?.().toLocaleDateString('fr-MA') || '-',
      'Statut': parcel.status || '-'
    }))

    // Ajouter une ligne de résumé
    const summary = {
      'N° EXP (NIC)': 'TOTAL',
      'Client': '',
      'Expéditeur': '',
      'Destinataire': '',
      'Agence': `${parcels.length} expéditions`,
      'Ville Dest.': '',
      'Type Port': '',
      'Montant Port (DH)': stats.totalAmount,
      'Date': '',
      'Statut': ''
    }
    excelData.push(summary)

    // Créer le workbook et la feuille
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Facturier')

    // Générer le nom du fichier
    const date = new Date().toLocaleDateString('fr-MA').replace(/\//g, '-')
    const filterText = filters.cityFilter !== 'Toutes' ? `_${filters.cityFilter}` : ''
    const filename = `Facturier_${date}${filterText}.xlsx`

    // Télécharger le fichier
    XLSX.writeFile(wb, filename)
  }

  return (
    <div className="space-y-4">
      {/* Message de succès */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex-shrink-0">
            <Check className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="text-green-700 font-semibold">{successMessage}</div>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="flex-shrink-0 text-green-500 hover:text-green-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message d'erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-red-700 font-semibold mb-1">Erreur de chargement</div>
          <div className="text-red-600 text-sm">{error}</div>
          <div className="text-red-500 text-xs mt-2">
            Vérifiez que votre compte a bien le rôle "facturier" dans Firestore.
          </div>
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Total expéditions</div>
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 shadow-sm border border-orange-200">
          <div className="text-xs text-orange-700 uppercase font-semibold mb-1">Port Dû</div>
          <div className="text-2xl font-bold text-orange-800">{stats.portDu}</div>
          <div className="text-sm text-orange-600 mt-1">{stats.portDuAmount.toLocaleString()} DH</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-200">
          <div className="text-xs text-blue-700 uppercase font-semibold mb-1">Port Payé</div>
          <div className="text-2xl font-bold text-blue-800">{stats.portPaye}</div>
          <div className="text-sm text-blue-600 mt-1">{stats.portPayeAmount.toLocaleString()} DH</div>
        </div>
        <div className="bg-cyan-50 rounded-xl p-4 shadow-sm border border-cyan-200">
          <div className="text-xs text-cyan-700 uppercase font-semibold mb-1">Montant Total</div>
          <div className="text-2xl font-bold text-cyan-800">
            {(stats.portDuAmount + stats.portPayeAmount).toLocaleString()} DH
          </div>
        </div>
      </div>

      {/* Résumé par agence */}
      {!profileCity && Object.keys(stats.byAgency).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-gray-200">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-purple-600" />
              Résumé par Agence
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Agence</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Total Exp.</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Port Dû</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Port Payé</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Montant Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {Object.entries(stats.byAgency)
                  .sort(([, a]: any, [, b]: any) => b.totalAmount - a.totalAmount)
                  .map(([agency, data]: any) => (
                    <tr key={agency} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-indigo-600">🏢 {agency}</td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-800">{data.count}</td>
                      <td className="px-3 py-2 text-center text-orange-700">{data.portDu}</td>
                      <td className="px-3 py-2 text-center text-blue-700">{data.portPaye}</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-900">
                        {data.totalAmount.toLocaleString()} DH
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bandeau d'information chargement */}
      <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-2xl border-2 border-indigo-400 overflow-hidden">
        <div className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm flex-shrink-0">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div className="text-white">
              <p className="font-black text-lg mb-0.5">
                📊 {parcels.length.toLocaleString('fr-MA')} expéditions chargées
              </p>
              <p className="text-xs text-blue-100">
                {loadingAll
                  ? `⏳ Chargement en cours... +${loadAllProgress.toLocaleString('fr-MA')} colis récupérés`
                  : hasMore
                    ? 'Historique disponible — chargez manuellement par tranches ou toute la base.'
                    : '✓ Toute la base est chargée'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {hasMore && !loadingAll && (
              <>
                <button
                  onClick={loadMoreParcels}
                  disabled={loadingMore || loadingAll}
                  className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition shadow-lg flex items-center gap-2"
                >
                  {loadingMore ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Chargement...</>
                  ) : (
                    <>↓ Charger 300 de plus</>
                  )}
                </button>
                <button
                  onClick={loadAllParcels}
                  disabled={loadingMore || loadingAll}
                  className="px-4 py-2.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 border-2 border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 transition flex items-center gap-2"
                >
                  ⚡ Tout charger
                </button>
              </>
            )}
            {loadingAll && (
              <button
                onClick={stopLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 transition shadow-lg flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Arrêter ({loadAllProgress.toLocaleString('fr-MA')}...)
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="Toutes">Toutes les agences</option>
            {CITIES.map(city => (
              <option key={city} value={city}>🏢 {city}</option>
            ))}
          </select>
          <select
            value={portTypeFilter}
            onChange={e => setPortTypeFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Tous les ports</option>
            <option value="port_du">💰 Port Dû</option>
            <option value="port_paye">✅ Port Payé</option>
            <option value="port_en_compte_expediteur">📤 Port en Compte (Expéditeur)</option>
            <option value="port_en_compte_destinataire">📥 Port en Compte (Destinataire)</option>
          </select>
          <select
            value={clientRoleFilter}
            onChange={e => setClientRoleFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Client: Tous les rôles</option>
            <option value="expediteur">📤 Client = Expéditeur</option>
            <option value="destinataire">📥 Client = Destinataire</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="Livré">✅ Livré</option>
            <option value="En cours de livraison">🚚 En cours de livraison</option>
            <option value="Arrivé en agence">🏢 Arrivé en agence</option>
            <option value="En transit">📦 En transit</option>
            <option value="Retourné">↩️ Retourné</option>
          </select>
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="all">Toutes les dates</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">7 derniers jours</option>
            <option value="month">30 derniers jours</option>
            <option value="custom">Personnalisé</option>
          </select>
          <button
            onClick={() => {
              setSearch('')
              setCityFilter('Toutes')
              setPortTypeFilter('all')
              setClientRoleFilter('all')
              setStatusFilter('all')
              setDateFilter('all')
              setDateFrom('')
              setDateTo('')
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Réinitialiser
          </button>
          <button
            onClick={() => exportToExcel(filteredParcels, stats, {
              cityFilter,
              portTypeFilter,
              clientRoleFilter,
              dateFilter,
              dateFrom,
              dateTo,
              search
            })}
            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
          <button
            onClick={() => printFacturation(filteredParcels, stats, {
              cityFilter,
              portTypeFilter,
              clientRoleFilter,
              dateFilter,
              dateFrom,
              dateTo,
              search
            })}
            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm transition flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>

        {dateFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date de début</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date de fin</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Tableau des expéditions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">N° EXP (NIC)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Expéditeur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Destinataire</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">🏢 Agence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Ville Dest.</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Nb Colis</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Type Port</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Montant Port</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                    Chargement...
                  </td>
                </tr>
              ) : filteredParcels.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                    Aucune expédition trouvée
                  </td>
                </tr>
              ) : (
                // Limiter l'affichage pour optimiser le rendu (éviter de surcharger le DOM)
                filteredParcels.slice(0, displayLimit).map(parcel => (
                  <tr key={parcel.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-semibold text-indigo-600">
                      {parcel.sender?.nic || parcel.trackingId || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{parcel.clientName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{parcel.sender?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{parcel.receiver?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{parcel.sender?.city || parcel.originCity || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{parcel.receiver?.city || parcel.recipientCity || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
                        {parcel.nbColis || parcel.numberOfParcels || 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {parcel.portType === 'port_du' ? (
                        <span className="inline-block px-2 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                          Port Dû
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                          Port Payé
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                      {editingPriceId === parcel.id ? (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editingPrice}
                              onChange={e => setEditingPrice(e.target.value)}
                              className="w-28 px-3 py-1.5 border-2 border-cyan-500 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-400"
                              autoFocus
                              disabled={savingPrice}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const newPrice = parseFloat(editingPrice)
                                  if (!isNaN(newPrice) && newPrice >= 0) {
                                    handleSavePrice(parcel.id, newPrice)
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingPriceId(null)
                                  setEditingPrice('')
                                }
                              }}
                            />
                            <span className="text-gray-600 text-xs">DH</span>
                          </div>
                          <button
                            onClick={() => {
                              const newPrice = parseFloat(editingPrice)
                              if (!isNaN(newPrice) && newPrice >= 0) {
                                handleSavePrice(parcel.id, newPrice)
                              }
                            }}
                            disabled={savingPrice}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {savingPrice ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Enregistrement...</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Valider</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setEditingPriceId(null)
                              setEditingPrice('')
                            }}
                            disabled={savingPrice}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Annuler</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span>{(parcel.price || 0).toLocaleString()} DH</span>
                          <button
                            onClick={() => {
                              setEditingPriceId(parcel.id)
                              setEditingPrice(String(parcel.price || 0))
                            }}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 text-xs bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded-lg transition font-medium"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Modifier</span>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {parcel.expeditionDate
                        ? new Date(parcel.expeditionDate).toLocaleDateString('fr-MA')
                        : parcel.createdAt?.toDate?.().toLocaleDateString('fr-MA')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{parcel.status}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => printParcelTicket(parcel)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold transition"
                        title="Afficher le bon d'expédition"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Bon</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Indicateur de pagination et bouton "Afficher plus" */}
        <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-slate-50 border-t border-gray-200">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-gray-600">
              Affichage de <span className="font-bold text-gray-800">{Math.min(displayLimit, filteredParcels.length)}</span> sur <span className="font-bold text-gray-800">{filteredParcels.length}</span> expédition(s)
            </div>
            {filteredParcels.length > displayLimit && (
              <button
                onClick={() => setDisplayLimit(prev => prev + 500)}
                className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Afficher 500 de plus
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Fonction d'impression
function printFacturation(parcels: any[], stats: any, filters: any) {
  const logoUrl = window.location.origin + '/LOGO.jpg'

  // Construire le texte des filtres actifs
  const activeFilters: string[] = []
  if (filters.cityFilter !== 'Toutes') activeFilters.push(`Agence: ${filters.cityFilter}`)
  if (filters.portTypeFilter === 'port_du') activeFilters.push('Type: Port Dû')
  if (filters.portTypeFilter === 'port_paye') activeFilters.push('Type: Port Payé')
  if (filters.portTypeFilter === 'port_en_compte_expediteur') activeFilters.push('Type: Port en Compte (Expéditeur)')
  if (filters.portTypeFilter === 'port_en_compte_destinataire') activeFilters.push('Type: Port en Compte (Destinataire)')
  if (filters.clientRoleFilter === 'expediteur') activeFilters.push('Client: Expéditeur')
  if (filters.clientRoleFilter === 'destinataire') activeFilters.push('Client: Destinataire')
  if (filters.dateFilter === 'today') activeFilters.push('Période: Aujourd\'hui')
  if (filters.dateFilter === 'week') activeFilters.push('Période: 7 derniers jours')
  if (filters.dateFilter === 'month') activeFilters.push('Période: 30 derniers jours')
  if (filters.dateFilter === 'custom' && filters.dateFrom) {
    activeFilters.push(`Période: ${filters.dateFrom} - ${filters.dateTo || 'aujourd\'hui'}`)
  }
  if (filters.search) activeFilters.push(`Recherche: "${filters.search}"`)

  const filterText = activeFilters.length > 0
    ? `<div style="background: #eff6ff; padding: 10px; margin: 15px 0; border-left: 4px solid #2563eb; border-radius: 4px;">
         <strong>Filtres appliqués:</strong> ${activeFilters.join(' • ')}
       </div>`
    : ''

  // Tableau résumé par agence
  const byAgencyTable = stats.byAgency && Object.keys(stats.byAgency).length > 0
    ? `<div style="margin: 20px 0;">
         <h3 style="color: #1e3a8a; margin-bottom: 10px; font-size: 14pt;">Résumé par Agence</h3>
         <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
           <thead>
             <tr style="background: #1e3a8a; color: white;">
               <th style="padding: 8px; text-align: left; font-size: 9pt;">Agence</th>
               <th style="padding: 8px; text-align: center; font-size: 9pt;">Total Exp.</th>
               <th style="padding: 8px; text-align: center; font-size: 9pt;">Port Dû</th>
               <th style="padding: 8px; text-align: center; font-size: 9pt;">Port Payé</th>
               <th style="padding: 8px; text-align: right; font-size: 9pt;">Montant Total</th>
             </tr>
           </thead>
           <tbody>
             ${Object.entries(stats.byAgency)
               .sort(([, a]: any, [, b]: any) => b.totalAmount - a.totalAmount)
               .map(([agency, data]: any) => `
                 <tr style="border-bottom: 1px solid #e5e7eb;">
                   <td style="padding: 6px 8px; font-weight: bold; color: #4f46e5;">🏢 ${agency}</td>
                   <td style="padding: 6px 8px; text-align: center; font-weight: bold;">${data.count}</td>
                   <td style="padding: 6px 8px; text-align: center; color: #c2410c;">${data.portDu}</td>
                   <td style="padding: 6px 8px; text-align: center; color: #1e40af;">${data.portPaye}</td>
                   <td style="padding: 6px 8px; text-align: right; font-weight: bold;">${data.totalAmount.toLocaleString()} DH</td>
                 </tr>
               `).join('')}
           </tbody>
         </table>
       </div>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Facturation Ports - ${new Date().toLocaleDateString('fr-MA')}</title>
  <style>
    @page { size: A4 landscape; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #111; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #1e3a8a; }
    .header img { height: 50px; object-fit: contain; }
    .header h1 { color: #1e3a8a; font-size: 20pt; text-align: center; flex: 1; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; }
    .stat-box { border: 1px solid #ddd; padding: 8px; border-radius: 5px; text-align: center; }
    .stat-box .label { font-size: 7pt; color: #666; text-transform: uppercase; margin-bottom: 3px; }
    .stat-box .value { font-size: 14pt; font-weight: bold; }
    .stat-box .amount { font-size: 8pt; color: #666; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background: #1e3a8a; color: white; padding: 6px; text-align: left; font-size: 8pt; }
    td { padding: 4px 6px; border-bottom: 1px solid #eee; font-size: 8pt; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .port-badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 7pt; font-weight: bold; }
    .port-du { background: #fed7aa; color: #c2410c; }
    .port-paye { background: #bfdbfe; color: #1e40af; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; text-align: center; font-size: 7pt; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl}" alt="Logo">
    <h1>FACTURATION PORTS</h1>
    <div style="width: 50px;"></div>
  </div>

  <div style="text-align: right; font-size: 8pt; color: #666; margin-bottom: 10px;">
    Date d'impression: ${new Date().toLocaleDateString('fr-MA')} à ${new Date().toLocaleTimeString('fr-MA')}
  </div>

  ${filterText}

  <div class="stats">
    <div class="stat-box">
      <div class="label">Total Expéditions</div>
      <div class="value">${stats.total}</div>
    </div>
    <div class="stat-box" style="background: #fed7aa;">
      <div class="label">Port Dû</div>
      <div class="value" style="color: #c2410c;">${stats.portDu}</div>
      <div class="amount">${stats.portDuAmount.toLocaleString()} DH</div>
    </div>
    <div class="stat-box" style="background: #bfdbfe;">
      <div class="label">Port Payé</div>
      <div class="value" style="color: #1e40af;">${stats.portPaye}</div>
      <div class="amount">${stats.portPayeAmount.toLocaleString()} DH</div>
    </div>
    <div class="stat-box" style="background: #cffafe;">
      <div class="label">Montant Total</div>
      <div class="value" style="color: #0e7490;">${(stats.portDuAmount + stats.portPayeAmount).toLocaleString()} DH</div>
    </div>
  </div>

  ${byAgencyTable}

  <h3 style="color: #1e3a8a; margin: 15px 0 10px 0; font-size: 14pt;">Détail des Expéditions</h3>
  <table>
    <thead>
      <tr>
        <th>N° EXP (NIC)</th>
        <th>Client</th>
        <th>Expéditeur</th>
        <th>Destinataire</th>
        <th>Agence</th>
        <th>Ville Dest.</th>
        <th>Type Port</th>
        <th class="text-right">Montant</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${parcels.map(p => `
        <tr>
          <td style="font-weight: bold; color: #4f46e5;">${p.sender?.nic || p.trackingId || '-'}</td>
          <td>${p.clientName || '-'}</td>
          <td>${p.sender?.name || '-'}</td>
          <td>${p.receiver?.name || '-'}</td>
          <td>🏢 ${p.sender?.city || p.originCity || '-'}</td>
          <td>${p.receiver?.city || p.recipientCity || '-'}</td>
          <td>
            <span class="port-badge ${p.portType === 'port_du' ? 'port-du' : 'port-paye'}">
              ${p.portType === 'port_du' ? 'Port Dû' : 'Port Payé'}
            </span>
          </td>
          <td class="text-right" style="font-weight: bold;">${(p.price || 0).toLocaleString()} DH</td>
          <td>${p.expeditionDate ? new Date(p.expeditionDate).toLocaleDateString('fr-MA') : (p.createdAt?.toDate?.().toLocaleDateString('fr-MA') || '-')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    BG EXPRESS - LOTISSEMENT AL MOSTAQBAL SN LAAYOUNE - 0661 97 86 12 - bgonline2024@gmail.com
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1200,height=800')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
