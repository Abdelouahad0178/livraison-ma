import { useMemo, useState, useEffect, useRef } from 'react'
import { Building2, TrendingUp, Package, Printer, Filter, X, Calendar, ChevronDown, Loader2, AlertCircle, Eye } from 'lucide-react'
import { CITIES } from '../../../firebase/constants'
import { collection, query, orderBy, limit, onSnapshot, startAfter, getDocs, where, Timestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { getOperationalDayRange } from '../../../config/operationalDay'
import { subscribeAdminTransfers } from '../../../firebase/caisse'
import AdminCaisseView from '../components/AdminCaisseView'

interface Props {
  datePreset: string
  setDatePreset: (preset: string) => void
  dateFrom: string
  setDateFrom: (date: string) => void
  dateTo: string
  setDateTo: (date: string) => void
  operationalDay: Date | null
  setOperationalDay: (day: Date | null) => void
}

// ⚡ Chargement optimisé
const PAGE_SIZE = 2000 // Chargement initial : 2000 premiers colis (sans filtre)
const FILTERED_PAGE_SIZE = 50000 // Avec filtre de date : charger tout (limite haute pour sécurité)

export default function AdminPortAgenciesTab({
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  operationalDay,
  setOperationalDay
}: Props) {
  // États pour filtres
  const [selectedCity, setSelectedCity] = useState<string>('all') // all ou nom de ville
  const [portTypeFilter, setPortTypeFilter] = useState('all') // all, port_paye, port_du, port_en_compte_expediteur
  const [directionFilter, setDirectionFilter] = useState('all') // all, sent (envoyées), received (reçues)
  const [originCityFilter, setOriginCityFilter] = useState<string>('all') // Filtre ville d'origine (pour mode "Reçues")
  const [showFilters, setShowFilters] = useState(true)
  const [viewMode, setViewMode] = useState<'theoretical' | 'physical'>('theoretical') // theoretical = tous les ports, physical = argent physique en caisse

  // État pour la modale Caisse Agence
  const [showCaisseModal, setShowCaisseModal] = useState(false)

  // États pour chargement progressif
  const [liveParcels, setLiveParcels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const lastDocRef = useRef<any>(null)

  // État versements admin
  const [adminTransfers, setAdminTransfers] = useState<any[]>([])

  // 🔄 Réinitialiser le filtre ville d'origine quand on quitte le mode "Reçues"
  useEffect(() => {
    if (directionFilter !== 'received') {
      setOriginCityFilter('all')
    }
  }, [directionFilter])

  // 💰 Charger tous les versements admin
  useEffect(() => {
    const unsub = subscribeAdminTransfers(
      (data: any[]) => {
        console.log('📊 Versements admin chargés:', data.length, data)
        setAdminTransfers(data)
      },
      (err) => console.error('❌ Erreur chargement versements admin:', err)
    )
    return () => unsub()
  }, [])

  // ⚡ Chargement optimisé avec détection de filtres (Option 3)
  useEffect(() => {
    // 🔄 CHARGEMENT INTELLIGENT :
    // - Première visite (aucune donnée) : masquer tout avec `loading`
    // - Changement de filtre (données existantes) : garder les données visibles avec `refreshing`
    if (liveParcels.length === 0) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    // 🔍 Détecter si des filtres de DATE sont actifs
    // Note: selectedCity et portTypeFilter sont appliqués côté frontend dans filteredStats
    const hasDateFilter = datePreset !== 'all'
    const hasFilters = hasDateFilter

    const effectivePageSize = hasFilters ? FILTERED_PAGE_SIZE : PAGE_SIZE

    console.warn(`📊 CHARGEMENT Port par Agence:`, {
      hasFilters,
      effectivePageSize,
      filters: { datePreset }
    })

    // 📅 Gérer les différents filtres de date
    let queryConstraints: any[] = []
    const now = new Date()

    if (datePreset === 'today') {
      // 📅 AUJOURD'HUI : depuis 00:00 aujourd'hui
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const fromTimestamp = Timestamp.fromDate(today)

      console.warn(`📅 Aujourd'hui:`, {
        from: today.toLocaleString('fr-MA')
      })

      queryConstraints = [
        where('createdAt', '>=', fromTimestamp),
        orderBy('createdAt', 'desc'),
        limit(effectivePageSize)
      ]
    } else if (datePreset === 'week') {
      // 📅 7 DERNIERS JOURS
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const fromTimestamp = Timestamp.fromDate(weekAgo)

      console.warn(`📅 7 derniers jours:`, {
        from: weekAgo.toLocaleString('fr-MA')
      })

      queryConstraints = [
        where('createdAt', '>=', fromTimestamp),
        orderBy('createdAt', 'desc'),
        limit(effectivePageSize)
      ]
    } else if (datePreset === 'month') {
      // 📅 CE MOIS-CI : depuis le 1er du mois
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const fromTimestamp = Timestamp.fromDate(monthStart)

      console.warn(`📅 Ce mois-ci:`, {
        from: monthStart.toLocaleString('fr-MA')
      })

      queryConstraints = [
        where('createdAt', '>=', fromTimestamp),
        orderBy('createdAt', 'desc'),
        limit(effectivePageSize)
      ]
    } else if (datePreset === 'operational' && operationalDay) {
      // 🗓️ JOUR D'OPÉRATION : charger avec filtre Firestore
      const range = getOperationalDayRange(operationalDay)
      const fromTimestamp = Timestamp.fromDate(range.start)
      const toTimestamp = Timestamp.fromDate(range.end)

      console.warn(`🗓️ Jour d'opération:`, {
        from: range.start.toLocaleString('fr-MA'),
        to: range.end.toLocaleString('fr-MA')
      })

      queryConstraints = [
        where('createdAt', '>=', fromTimestamp),
        where('createdAt', '<=', toTimestamp),
        orderBy('createdAt', 'desc'),
        limit(effectivePageSize)
      ]
    } else if (datePreset === 'custom' && dateFrom && dateTo) {
      // 📅 FILTRE CUSTOM : 00:00 → 23:59
      const fromDate = new Date(dateFrom + 'T00:00:00')
      const toDate = new Date(dateTo + 'T23:59:59')
      const fromTimestamp = Timestamp.fromDate(fromDate)
      const toTimestamp = Timestamp.fromDate(toDate)

      console.warn(`📅 Filtre custom:`, {
        from: fromDate.toLocaleDateString('fr-MA'),
        to: toDate.toLocaleDateString('fr-MA')
      })

      queryConstraints = [
        where('createdAt', '>=', fromTimestamp),
        where('createdAt', '<=', toTimestamp),
        orderBy('createdAt', 'desc'),
        limit(effectivePageSize)
      ]
    } else {
      // Chargement normal (tous)
      queryConstraints = [
        orderBy('createdAt', 'desc'),
        limit(effectivePageSize)
      ]
    }

    const q = query(collection(db, 'parcels'), ...queryConstraints)

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setLiveParcels(data)
        lastDocRef.current = snap.docs[snap.docs.length - 1] || null
        setHasMore(snap.docs.length >= effectivePageSize)
        setLoading(false)
        setRefreshing(false)
        console.warn(`✅ Port par Agence: ${data.length} colis chargés`)
      },
      (err) => {
        console.error('Erreur chargement initial:', err)
        setLoading(false)
        setRefreshing(false)
      }
    )

    return () => unsub()
  }, [datePreset, dateFrom, dateTo, operationalDay])
  // Note: selectedCity et portTypeFilter sont volontairement exclus car ils sont appliqués
  // côté frontend dans le useMemo filteredStats. Les inclure ici causerait un rechargement
  // inutile des données Firestore et créerait un bug nécessitant 2 clics pour filtrer.

  // ⚡ Charger TOUS les colis restants en arrière-plan
  const loadAllParcels = async () => {
    if (!hasMore || loadingAll || !lastDocRef.current) return

    setLoadingAll(true)
    let cursor = lastDocRef.current
    let allNewParcels: any[] = []

    try {
      while (cursor) {
        const q = query(
          collection(db, 'parcels'),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(PAGE_SIZE)
        )

        const snap = await getDocs(q)
        if (snap.empty) break

        const batch = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        allNewParcels = [...allNewParcels, ...batch]
        cursor = snap.docs[snap.docs.length - 1]

        if (snap.docs.length < PAGE_SIZE) break
      }

      // Mettre à jour l'état avec tous les colis
      setLiveParcels((prev) => {
        const map = new Map()
        prev.forEach((p: any) => map.set(p.id, p))
        allNewParcels.forEach((p: any) => map.set(p.id, p))
        return Array.from(map.values())
      })

      setHasMore(false)
      lastDocRef.current = cursor
    } catch (err) {
      console.error('Erreur chargement complet:', err)
    } finally {
      setLoadingAll(false)
    }
  }

  // ❌ DÉSACTIVÉ: Chargement automatique (Option 3 - charge seulement ce dont on a besoin)
  // useEffect(() => {
  //   if (!hasMore || loadingAll || loadingMore || !lastDocRef.current) return
  //   if (liveParcels.length === 0) return
  //
  //   const timer = setTimeout(() => {
  //     if (hasMore && !loadingAll && !loadingMore && lastDocRef.current) {
  //       loadAllParcels()
  //     }
  //   }, 2000)
  //
  //   return () => clearTimeout(timer)
  // }, [liveParcels.length, hasMore, loadingAll, loadingMore])

  // 🔒 Fonction sécurisée pour parser les nombres
  const safeParseFloat = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0
    const num = parseFloat(String(value).replace(',', '.'))
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : 0
  }

  const safeParseInt = (value: any, defaultValue: number = 1): number => {
    if (value === null || value === undefined || value === '') return defaultValue
    const num = parseInt(String(value), 10)
    return (!isNaN(num) && isFinite(num) && num >= 0) ? num : defaultValue
  }

  // ✅ Filtrer les colis par période - UTILISE workDate (jour d'opération)
  const parcelDate = (p: any) => {
    // 📅 PRIORITÉ 1: workDate (jour d'opération 8H→6H du lendemain)
    // Permet de regrouper les saisies de nuit (ex: 14/08 à 2H → workDate=13/08)
    if (p.workDate) {
      // workDate est au format "YYYY-MM-DD", on ajoute 12:00 pour être au milieu de la journée
      return new Date(p.workDate + 'T12:00:00')
    }

    // 📅 FALLBACK: createdAt (pour anciens colis sans workDate)
    if (p.createdAt?.toDate) return p.createdAt.toDate()
    if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
    return new Date(0)
  }

  const filteredByDate = useMemo(() => {
    if (!Array.isArray(liveParcels)) return []

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return liveParcels.filter((p: any) => {
      const pDate = parcelDate(p)

      if (datePreset === 'today') return pDate >= today
      if (datePreset === 'week') return pDate >= weekAgo
      if (datePreset === 'month') return pDate >= monthStart
      if (datePreset === 'operational' && operationalDay) {
        // 🗓️ JOUR D'OPÉRATION : 8H → 6H lendemain
        const range = getOperationalDayRange(operationalDay)
        return pDate >= range.start && pDate <= range.end
      }
      if (datePreset === 'custom' && dateFrom && dateTo) {
        // 📅 CORRECTION TIMEZONE: 00:00 → 23:59
        const from = new Date(dateFrom + 'T00:00:00')
        const to = new Date(dateTo + 'T23:59:59')
        return pDate >= from && pDate <= to
      }
      return true // 'all'
    })
  }, [liveParcels, datePreset, dateFrom, dateTo, operationalDay])

  // 💰 Calculer les versements confirmés par ville
  const versementsByCity = useMemo(() => {
    const byCity: Record<string, number> = {}

    // Initialiser toutes les villes à 0
    CITIES.forEach(city => {
      byCity[city] = 0
    })

    // Calculer le total des versements confirmés par ville
    const confirmedTransfers = adminTransfers.filter((t: any) => t.status === 'confirmed')
    console.log('💰 Versements confirmés:', confirmedTransfers.length, confirmedTransfers)

    confirmedTransfers.forEach((t: any) => {
      const city = t.city
      const amount = parseFloat(t.amount) || 0
      if (city && byCity[city] !== undefined) {
        byCity[city] += amount
        console.log(`  → ${city}: +${amount} DH (total: ${byCity[city]} DH)`)
      }
    })

    console.log('💰 Versements par ville:', byCity)
    return byCity
  }, [adminTransfers])

  // ✅ Calculer les statistiques par agence
  // Mode theoretical = tous les ports (actuel)
  // Mode physical = argent réellement collecté en caisse
  const portStats = useMemo(() => {
    if (!Array.isArray(filteredByDate)) return []

    const stats: Record<string, {
      city: string
      portPaye: number              // ✅ Port Payé (expéditeur) OU Ports payés reçus (mode physical)
      portDu: number                 // 💰 Port Dû (destinataire) OU Ports dû collectés (mode physical)
      enCompteExp: number            // 📤 En Compte Expéditeur
      enCompteDest: number           // 📥 En Compte Destinataire
      totalPort: number
      nbExpeditions: number          // Seulement les expéditions (pas colis)
    }> = {}

    // Initialiser toutes les villes
    CITIES.forEach(city => {
      stats[city] = {
        city,
        portPaye: 0,
        portDu: 0,
        enCompteExp: 0,
        enCompteDest: 0,
        totalPort: 0,
        nbExpeditions: 0,
      }
    })

    // Parcourir tous les colis filtrés par date
    filteredByDate.forEach((p: any) => {
      const originCity = p.originCity || p.sender?.city || p.createdByCity
      const destCity = p.destinationCity || p.receiver?.city

      if (viewMode === 'theoretical') {
        // 📊 MODE THÉORIQUE : TOUS LES PORTS (actuel)
        // ✅ NOUVEAUX PORTS : expéditeur et destinataire séparés
        // 🔄 FALLBACK: Si nouveaux champs absents, utiliser ancien système
        let senderPort = safeParseFloat(p.sender?.port || p.senderPort || 0)
        let senderPortType = p.sender?.portType || p.senderPortType || 'port_paye'

        let receiverPort = safeParseFloat(p.receiver?.port || p.receiverPort || 0)
        let receiverPortType = p.receiver?.portType || p.receiverPortType || 'port_du'

        // 🔄 COMPATIBILITÉ: Si pas de nouveaux ports, utiliser l'ancien p.price
        if (senderPort === 0 && receiverPort === 0 && p.price) {
          const price = safeParseFloat(p.price)
          const portType = p.portType || 'port_paye'

          // Ancien système : un seul port, déterminer s'il va à l'expéditeur ou destinataire
          if (portType === 'port_paye' || portType === 'port_en_compte_expediteur' || portType === 'port_en_compte') {
            // Port collecté à l'ORIGINE (expéditeur)
            senderPort = price
            senderPortType = portType
          } else if (portType === 'port_du' || portType === 'port_en_compte_destinataire') {
            // Port collecté à la DESTINATION (destinataire)
            receiverPort = price
            receiverPortType = portType
          }
        }

        // 📤 PORT EXPÉDITEUR : collecté à l'agence d'ORIGINE (expéditions envoyées)
        // Ne comptabiliser que si le filtre autorise les envoyées (all ou sent)
        if (senderPort > 0 && originCity && stats[originCity] && (directionFilter === 'all' || directionFilter === 'sent')) {
          if (senderPortType === 'port_paye') {
            stats[originCity].portPaye += senderPort
          } else if (senderPortType === 'port_en_compte_expediteur' || senderPortType === 'port_en_compte') {
            stats[originCity].enCompteExp += senderPort
          }
        }

        // 📥 PORT DESTINATAIRE : collecté à l'agence de DESTINATION (expéditions reçues)
        // Ne comptabiliser que si le filtre autorise les reçues (all ou received)
        // ET si le filtre ville d'origine est respecté (en mode received)
        const matchesOriginFilter = directionFilter !== 'received' || originCityFilter === 'all' || originCity === originCityFilter
        if (receiverPort > 0 && destCity && stats[destCity] && (directionFilter === 'all' || directionFilter === 'received') && matchesOriginFilter) {
          if (receiverPortType === 'port_du') {
            stats[destCity].portDu += receiverPort
          } else if (receiverPortType === 'port_en_compte_destinataire' || receiverPortType === 'port_en_compte') {
            stats[destCity].enCompteDest += receiverPort
          }
        }
      } else {
        // 💵 MODE SITUATION CAISSE : ARGENT PHYSIQUE COLLECTÉ
        const price = safeParseFloat(p.price)
        const portType = p.portType
        const portStatus = p.portStatus

        // 1️⃣ PORTS DÛ COLLECTÉS : portType = 'port_du', portStatus = 'collected' ou 'received'
        if (portType === 'port_du' && (portStatus === 'collected' || portStatus === 'received') && price > 0 && destCity && stats[destCity]) {
          stats[destCity].portDu += price
        }

        // 2️⃣ PORTS PAYÉS REÇUS LOCALEMENT : portType = 'port_paye', from this city, portStatus = 'received'
        if (portType === 'port_paye' && !p.portPayeMethod && portStatus === 'received' && price > 0 && originCity && stats[originCity]) {
          stats[originCity].portPaye += price
        }
      }

      // ✅ EXPÉDITIONS : comptées selon la direction
      const matchesOriginFilter = directionFilter !== 'received' || originCityFilter === 'all' || originCity === originCityFilter
      if (directionFilter === 'all' || directionFilter === 'sent') {
        // Expéditions envoyées : comptées à l'agence d'ORIGINE
        if (originCity && stats[originCity]) {
          stats[originCity].nbExpeditions += 1
        }
      } else if (directionFilter === 'received') {
        // Expéditions reçues : comptées à l'agence de DESTINATION
        // Et filtrées par ville d'origine si spécifié
        if (destCity && stats[destCity] && matchesOriginFilter) {
          stats[destCity].nbExpeditions += 1
        }
      }
    })

    // Calculer les totaux et arrondir - afficher toutes les agences
    return Object.values(stats).map(stat => {
      // 💰 Total Port = Somme de tous les ports (sans déduire les versements)
      const totalPort = stat.portPaye + stat.portDu + stat.enCompteExp + stat.enCompteDest

      return {
        ...stat,
        portPaye: Math.round(stat.portPaye * 100) / 100,
        portDu: Math.round(stat.portDu * 100) / 100,
        enCompteExp: Math.round(stat.enCompteExp * 100) / 100,
        enCompteDest: Math.round(stat.enCompteDest * 100) / 100,
        totalPort: Math.round(totalPort * 100) / 100,
      }
    })
  }, [filteredByDate, directionFilter, originCityFilter, viewMode, versementsByCity])

  // Appliquer les filtres de ville et type de port
  const filteredStats = useMemo(() => {
    let filtered = portStats

    // Filtre par ville sélectionnée
    if (selectedCity !== 'all') {
      filtered = filtered.filter(stat => stat.city === selectedCity)
    }

    // Filtre par type de port - 4 TYPES SÉPARÉS
    if (portTypeFilter !== 'all') {
      filtered = filtered.filter(stat => {
        if (portTypeFilter === 'port_paye') return stat.portPaye > 0
        if (portTypeFilter === 'port_du') return stat.portDu > 0
        if (portTypeFilter === 'port_en_compte_expediteur') return stat.enCompteExp > 0
        if (portTypeFilter === 'port_en_compte_destinataire') return stat.enCompteDest > 0
        return true
      })
    }

    return filtered
  }, [portStats, selectedCity, portTypeFilter])

  // ✅ Calculer les totaux sur les stats FILTRÉES - 4 TYPES + EXPÉDITIONS SEULEMENT
  const totauxFiltres = useMemo(() => {
    const totaux = filteredStats.reduce((acc, stat) => ({
      portPaye: acc.portPaye + stat.portPaye,
      portDu: acc.portDu + stat.portDu,
      enCompteExp: acc.enCompteExp + stat.enCompteExp,
      enCompteDest: acc.enCompteDest + stat.enCompteDest,
      nbExpeditions: acc.nbExpeditions + stat.nbExpeditions,
    }), { portPaye: 0, portDu: 0, enCompteExp: 0, enCompteDest: 0, nbExpeditions: 0 })

    // 💰 Calculer le total des versements pour les villes filtrées
    const totalVersements = filteredStats.reduce((sum, stat) => {
      return sum + (versementsByCity[stat.city] || 0)
    }, 0)

    // 💵 Total Port (dans les cartes) = Port Dû + Port Payé - Versements
    const totalPortCartes = Math.max(0, totaux.portPaye + totaux.portDu - totalVersements)

    return {
      portPaye: Math.round(totaux.portPaye * 100) / 100,
      portDu: Math.round(totaux.portDu * 100) / 100,
      enCompteExp: Math.round(totaux.enCompteExp * 100) / 100,
      enCompteDest: Math.round(totaux.enCompteDest * 100) / 100,
      totalPort: Math.round(totalPortCartes * 100) / 100,
      nbExpeditions: totaux.nbExpeditions,
    }
  }, [filteredStats, versementsByCity])

  const hasActiveFilter = selectedCity !== 'all' || portTypeFilter !== 'all' || datePreset !== 'all' || directionFilter !== 'all' || (directionFilter === 'received' && originCityFilter !== 'all')

  // 🖨️ Fonction d'impression
  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      {/* 🖨️ Styles d'impression */}
      <style>{`
        @media print {
          @page {
            margin: 1cm;
            size: A4 landscape;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print-page-break {
            page-break-before: always;
          }
          /* Assurer que les gradients et couleurs sont visibles */
          * {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          /* Optimiser l'affichage du tableau */
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          /* Enlever les ombres à l'impression pour meilleure lisibilité */
          .shadow-xl, .shadow-lg, .shadow-sm {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="mt-4 space-y-4">
      {/* Chargement initial */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
          <Loader2 className="w-12 h-12 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Chargement des données...</p>
        </div>
      )}

      {/* 🔄 Indicateur de rafraîchissement en arrière-plan */}
      {refreshing && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-300 rounded-xl p-3 flex items-center gap-3 shadow-sm print:hidden">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900">
              🔄 Actualisation des données en cours...
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Les données actuelles restent visibles pendant le chargement
            </p>
          </div>
        </div>
      )}

      {!loading && (
        <div id="port-agence-print">
          {/* 🖨️ En-tête d'impression simplifié - visible uniquement à l'impression */}
          <div className="hidden print:block bg-white pb-4 mb-4">
            {/* Titre principal avec détails */}
            <div className="text-center mb-4">
              <h1 className="text-3xl font-black text-gray-900">
                Port par Agence
                {selectedCity !== 'all' && ` - ${selectedCity}`}
              </h1>
              <p className="text-lg font-bold text-indigo-700 mt-2">
                {totauxFiltres.nbExpeditions} expédition{totauxFiltres.nbExpeditions > 1 ? 's' : ''}
                {directionFilter === 'sent' && ' envoyée' + (totauxFiltres.nbExpeditions > 1 ? 's' : '')}
                {directionFilter === 'received' && (
                  <>
                    {' reçue' + (totauxFiltres.nbExpeditions > 1 ? 's' : '')}
                    {originCityFilter !== 'all' && ` de ${originCityFilter}`}
                  </>
                )}
              </p>
              {datePreset === 'operational' && operationalDay && (
                <p className="text-lg font-semibold text-gray-600 mt-2">
                  Jour d'opération : {operationalDay.toLocaleDateString('fr-MA', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              )}
              {datePreset !== 'operational' && datePreset !== 'all' && (
                <p className="text-lg font-semibold text-gray-600 mt-2">
                  Période : {dateFrom ? new Date(dateFrom).toLocaleDateString('fr-MA') : ''} - {dateTo ? new Date(dateTo).toLocaleDateString('fr-MA') : ''}
                </p>
              )}
            </div>

            {/* Ligne de séparation */}
            <div className="mt-4 border-t-2 border-gray-300"></div>
          </div>

          {/* En-tête */}
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-4 sm:p-6 shadow-xl print:hidden">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-white">
              <div className="flex items-center gap-2 sm:gap-3">
                <Building2 className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
                <div>
                  <h2 className="text-xl sm:text-2xl font-black">Port par Agence</h2>
                  <p className="text-blue-100 text-xs sm:text-sm mt-1 hidden sm:block">
                    {viewMode === 'theoretical'
                      ? 'Port Payé et En Compte (collecté par expéditeur) · Port Dû (collecté à destination)'
                      : 'Situation physique de la caisse - Argent réellement collecté'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {/* Toggle Vue Théorique / Situation Caisse */}
                <div className="flex items-center gap-1 sm:gap-2 bg-white/20 backdrop-blur-sm rounded-xl p-1 w-full sm:w-auto">
                  <button
                    onClick={() => setViewMode('theoretical')}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg transition-all font-bold text-xs sm:text-sm whitespace-nowrap ${
                      viewMode === 'theoretical'
                        ? 'bg-white text-purple-600 shadow-lg'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="hidden xs:inline">📊 Vue Théorique</span>
                    <span className="xs:hidden">📊 Théorique</span>
                  </button>
                  <button
                    onClick={() => setViewMode('physical')}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 rounded-lg transition-all font-bold text-xs sm:text-sm whitespace-nowrap ${
                      viewMode === 'physical'
                        ? 'bg-white text-purple-600 shadow-lg'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="hidden xs:inline">💵 Situation Caisse</span>
                    <span className="xs:hidden">💵 Caisse</span>
                  </button>
                </div>
                {/* Bouton pour ouvrir la fenêtre Caisse Agence */}
                <button
                  onClick={() => setShowCaisseModal(true)}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors font-bold text-white print:hidden text-xs sm:text-sm whitespace-nowrap"
                  title="Voir Caisse Agence"
                >
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden md:inline">Détails Agences</span>
                  <span className="md:hidden">Détails</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors font-bold print:hidden text-xs sm:text-sm whitespace-nowrap"
                >
                  <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden md:inline">Imprimer</span>
                </button>
              </div>
            </div>
          </div>

          {/* Avertissement chargement progressif */}
          {hasMore && datePreset !== 'all' && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-orange-500 rounded-lg p-4 shadow-sm print:hidden">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-900">
                    ⚠️ Chargement en cours : {liveParcels.length} colis chargés
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    Le filtre de date est actif mais toutes les données ne sont pas encore chargées.
                    Les statistiques affichées sont partielles. Attendez quelques secondes pour des résultats complets.
                  </p>
                </div>
                {loadingAll && (
                  <Loader2 className="w-5 h-5 text-orange-600 animate-spin flex-shrink-0" />
                )}
              </div>
            </div>
          )}

          {/* Indicateur de chargement en arrière-plan */}
          {loadingAll && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3 print:hidden">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <p className="text-sm text-blue-900">
                <span className="font-semibold">Chargement en arrière-plan...</span> {liveParcels.length} colis déjà disponibles
              </p>
            </div>
          )}

      {/* Section Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden print:hidden">
        {/* En-tête des filtres */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 transition"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-purple-600" />
            <span className="font-bold text-gray-800">Filtres et Recherche</span>
            {hasActiveFilter && (
              <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full font-bold">
                Actifs
              </span>
            )}
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-600 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Contenu des filtres */}
        {showFilters && (
          <div className="p-4 space-y-4 border-t border-gray-100">
            {/* Ligne 1: Période */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Période
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                {[
                  { key: 'all', label: 'Tous' },
                  { key: 'today', label: "Auj." },
                  { key: 'week', label: '7j' },
                  { key: 'month', label: 'Mois' },
                  { key: 'operational', label: '🗓️ J.Opé' },
                  { key: 'custom', label: 'Période' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDatePreset(key)
                      // 🗓️ Si J.Opé et pas de date définie, utiliser dateFrom ou aujourd'hui
                      if (key === 'operational' && !operationalDay) {
                        setOperationalDay(
                          dateFrom
                            ? new Date(dateFrom + 'T00:00:00')
                            : new Date()
                        )
                      }
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                      datePreset === key
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}

                {datePreset === 'operational' && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:ml-2 w-full sm:w-auto">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Jour d'opération (8H → 6H lendemain)</span>
                    <input
                      type="date"
                      value={operationalDay ? `${operationalDay.getFullYear()}-${String(operationalDay.getMonth() + 1).padStart(2, '0')}-${String(operationalDay.getDate()).padStart(2, '0')}` : ''}
                      onChange={e => {
                        if (!e.target.value) {
                          setOperationalDay(null)
                          return
                        }
                        setOperationalDay(new Date(e.target.value + 'T00:00:00'))
                      }}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
                    />
                  </div>
                )}

                {datePreset === 'custom' && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:ml-2 w-full sm:w-auto">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
                    />
                    <span className="text-gray-400 text-xs font-bold">→</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 w-full sm:w-auto"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Ligne 2: Filtre Ville par boutons */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">
                <Building2 className="w-3.5 h-3.5 inline mr-1" />
                Filtrer par ville / agence
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCity('all')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                    selectedCity === 'all'
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Toutes les villes
                </button>
                {CITIES.map(city => (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                      selectedCity === city
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Ligne 3: Filtre type de port */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">
                <Filter className="w-3.5 h-3.5 inline mr-1" />
                Type de port
              </label>
              <select
                value={portTypeFilter}
                onChange={(e) => setPortTypeFilter(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-medium"
              >
                <option value="all">Tous les types</option>
                <option value="port_paye">✅ Port Payé uniquement</option>
                <option value="port_du">📮 Port Dû uniquement</option>
                <option value="port_en_compte_expediteur">📤 En Compte Exp uniquement</option>
                <option value="port_en_compte_destinataire">📥 En Compte Dest uniquement</option>
              </select>
            </div>

            {/* Ligne 4: Filtre Direction (Envoyées / Reçues) */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">
                🔄 Direction des expéditions
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDirectionFilter('all')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    directionFilter === 'all'
                      ? 'bg-green-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Toutes (envoyées + reçues)
                </button>
                <button
                  onClick={() => setDirectionFilter('sent')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    directionFilter === 'sent'
                      ? 'bg-orange-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📤 Envoyées (origine)
                </button>
                <button
                  onClick={() => setDirectionFilter('received')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    directionFilter === 'received'
                      ? 'bg-teal-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  📥 Reçues (destination)
                </button>
              </div>
            </div>

            {/* Ligne 5: Filtre Ville d'origine (visible uniquement en mode "Reçues") */}
            {directionFilter === 'received' && (
              <div className="border-t border-gray-100 pt-4 bg-teal-50/30 p-4 rounded-lg">
                <label className="block text-xs font-bold text-teal-700 mb-3 uppercase tracking-wide">
                  📍 Ville d'origine (expéditions reçues de...)
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setOriginCityFilter('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                      originCityFilter === 'all'
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    Toutes les villes
                  </button>
                  {CITIES.map(city => (
                    <button
                      key={city}
                      onClick={() => setOriginCityFilter(city)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                        originCityFilter === city
                          ? 'bg-teal-700 text-white shadow-md'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Bouton Reset et Tags actifs */}
            {hasActiveFilter && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <div className="flex flex-wrap gap-2 flex-1">
                  {datePreset !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold">
                      <Calendar className="w-3 h-3" />
                      {datePreset === 'today' && "Aujourd'hui"}
                      {datePreset === 'week' && "7 derniers jours"}
                      {datePreset === 'month' && "Ce mois"}
                      {datePreset === 'operational' && operationalDay && `J.Opé ${operationalDay.toLocaleDateString('fr-MA')}`}
                      {datePreset === 'custom' && `${dateFrom} → ${dateTo}`}
                      <button
                        onClick={() => setDatePreset('all')}
                        className="hover:bg-purple-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {selectedCity !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                      <Building2 className="w-3 h-3" />
                      Ville: {selectedCity}
                      <button
                        onClick={() => setSelectedCity('all')}
                        className="hover:bg-blue-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {portTypeFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold">
                      {portTypeFilter === 'port_paye' && '✅ Port Payé'}
                      {portTypeFilter === 'port_du' && '📮 Port Dû'}
                      {portTypeFilter === 'port_en_compte_expediteur' && '📤 En Compte Exp'}
                      {portTypeFilter === 'port_en_compte_destinataire' && '📥 En Compte Dest'}
                      <button
                        onClick={() => setPortTypeFilter('all')}
                        className="hover:bg-green-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {directionFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold">
                      {directionFilter === 'sent' && '📤 Envoyées'}
                      {directionFilter === 'received' && '📥 Reçues'}
                      <button
                        onClick={() => setDirectionFilter('all')}
                        className="hover:bg-amber-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {directionFilter === 'received' && originCityFilter !== 'all' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg text-xs font-bold">
                      📍 Origine: {originCityFilter}
                      <button
                        onClick={() => setOriginCityFilter('all')}
                        className="hover:bg-teal-200 rounded p-0.5 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedCity('all')
                    setPortTypeFilter('all')
                    setDirectionFilter('all')
                    setOriginCityFilter('all')
                    setDatePreset('all')
                  }}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-bold transition-colors flex items-center gap-2 text-xs"
                >
                  <X className="w-4 h-4" />
                  Tout réinitialiser
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Carte résumé (filtré) */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-orange-200 rounded-xl p-6 shadow-lg print:bg-gray-50 print:rounded-none print:mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            📊 Résumé {hasActiveFilter ? '(Filtré)' : 'Global'}
          </h3>
          <span className="text-sm text-gray-600">
            {filteredStats.length} agence(s) affichée(s)
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-around gap-6">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-indigo-600" />
            <div>
              <div className="text-xs text-gray-600 font-medium uppercase tracking-wide">Expéditions</div>
              <div className="text-2xl font-black text-indigo-700">{totauxFiltres.nbExpeditions}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">✅ Port Payé</div>
              <div className="text-xl font-black text-blue-700">{totauxFiltres.portPaye.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">💰 Port Dû</div>
              <div className="text-xl font-black text-orange-700">{totauxFiltres.portDu.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">📤 En Compte Exp</div>
              <div className="text-xl font-black text-purple-700">{totauxFiltres.enCompteExp.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
            <div>
              <div className="text-xs text-gray-600 font-medium">📥 En Compte Dest</div>
              <div className="text-xl font-black text-pink-700">{totauxFiltres.enCompteDest.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <div>
              <div className="text-xs text-gray-600 font-medium uppercase">💵 Total Port</div>
              <div className="text-2xl font-black text-green-700">{totauxFiltres.totalPort.toLocaleString('fr-MA')} DH</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau par agence */}
      <div className="bg-white rounded-2xl shadow-xl border-2 border-purple-100 overflow-hidden print:rounded-none print:border print:border-gray-300">
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full print:text-sm">
            <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white">
              <tr>
                <th className="px-6 py-4 text-left font-bold whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Agence (Ville)
                  </div>
                </th>
                <th className="px-6 py-4 text-center font-bold whitespace-nowrap">
                  📋 Expéditions
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-blue-600/30">
                  ✅ Port Payé
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-orange-600/30">
                  💰 Port Dû
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-green-600/30">
                  💵 Total (Payé + Dû)
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-purple-600/30 print:hidden">
                  📤 En Compte Exp
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-pink-600/30 print:hidden">
                  📥 En Compte Dest
                </th>
                <th className="px-6 py-4 text-right font-bold whitespace-nowrap bg-green-600/30 print:hidden">
                  💵 Total Port
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((stat, idx) => (
                <tr
                  key={stat.city}
                  className={`border-b border-gray-100 transition-all hover:bg-purple-50 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-gradient-to-r from-blue-50/30 via-purple-50/20 to-pink-50/30'
                  }`}
                >
                  <td className="px-6 py-4 font-bold text-gray-900">
                    <div className="flex items-center gap-2">
                      📍 <span className="text-lg">{stat.city}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg font-bold text-base">
                      {stat.nbExpeditions}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-blue-50/50">
                    <span className="text-blue-700 text-lg">
                      {stat.portPaye.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-orange-50/50">
                    <span className="text-orange-700 text-lg">
                      {stat.portDu.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-green-50/50">
                    <span className="text-green-700 text-xl">
                      {(stat.portPaye + stat.portDu).toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-purple-50/50 print:hidden">
                    <span className="text-purple-700 text-lg">
                      {stat.enCompteExp.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-pink-50/50 print:hidden">
                    <span className="text-pink-700 text-lg">
                      {stat.enCompteDest.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold bg-green-50/50 print:hidden">
                    <span className="text-green-700 text-xl">
                      {stat.totalPort.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                </tr>
              ))}
              {/* Ligne totaux */}
              {filteredStats.length > 0 && (
                <tr className="bg-gradient-to-r from-gray-100 to-gray-50 font-black border-t-2 border-gray-300">
                  <td className="px-6 py-5 text-gray-900 text-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                      TOTAL {hasActiveFilter ? '(FILTRÉ)' : 'GÉNÉRAL'}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span className="inline-flex items-center justify-center px-4 py-2 bg-indigo-200 text-indigo-900 rounded-lg font-black text-lg">
                      {totauxFiltres.nbExpeditions}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-blue-100">
                    <span className="text-blue-900 text-xl font-black">
                      {totauxFiltres.portPaye.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-orange-100">
                    <span className="text-orange-900 text-xl font-black">
                      {totauxFiltres.portDu.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-green-100">
                    <span className="text-green-900 text-2xl font-black">
                      {(totauxFiltres.portPaye + totauxFiltres.portDu).toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-purple-100 print:hidden">
                    <span className="text-purple-900 text-xl font-black">
                      {totauxFiltres.enCompteExp.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-pink-100 print:hidden">
                    <span className="text-pink-900 text-xl font-black">
                      {totauxFiltres.enCompteDest.toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right bg-green-100 print:hidden">
                    <span className="text-green-900 text-2xl font-black">
                      {(totauxFiltres.portPaye + totauxFiltres.portDu + totauxFiltres.enCompteExp + totauxFiltres.enCompteDest).toLocaleString('fr-MA')} DH
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message si aucun résultat */}
      {filteredStats.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-12 text-center border-2 border-dashed border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilter
              ? 'Aucune agence ne correspond aux filtres sélectionnés'
              : 'Aucune donnée de port disponible'
            }
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {hasActiveFilter
              ? 'Essayez de modifier vos critères de recherche'
              : 'Les statistiques apparaîtront ici une fois que des colis seront créés'
            }
          </p>
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearchCity('')
                setPortTypeFilter('all')
                setDatePreset('all')
              }}
              className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}
        </div>
      )}
      </div>

      {/* Modale Caisse Agence en plein écran (90%) */}
      {showCaisseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-[90%] h-[90%] overflow-hidden flex flex-col">
            {/* En-tête de la modale */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <Eye className="w-6 h-6" />
                <h2 className="text-xl font-bold">Caisse Agence - Détails</h2>
              </div>
              <button
                onClick={() => setShowCaisseModal(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                title="Fermer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Contenu de la modale */}
            <div className="flex-1 overflow-hidden">
              <AdminCaisseView onClose={() => setShowCaisseModal(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
