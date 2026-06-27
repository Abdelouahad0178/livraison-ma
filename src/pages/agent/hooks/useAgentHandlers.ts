import React from 'react'
import { createUserWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth'
import { auth, authSecondary, db } from '../../../firebase/config'
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import {
  assignDriver, assignDriversBulk, assignDeliveryDriver,
  remitCod, collectCodAtSource, collectCodAtDestination, collectPortDu,
  createCaisseEntry, deleteAgentCashierHistory,
  adjustAgencyCash, directTransferAgentToCashierAtomic,
  createAgentCashRecoveryRequest,
  settleCodToSender, batchSettleCods, fetchAllAgentCodParcels,
  markCodSentToSource, confirmCodReceivedBySource,
  validateCodByChef,  // ⭐ Nouvelle fonction
  createAdminTransferFromAgent,
  createReturnParcel, createArrivage, saveArrivagePointage, searchParcelByTrackingId,
  markPortDuReceivedByChef, markParcelChefPointed,
  createCentralCodDeposit,
  validateParcelEntry,
  updateParcel, deleteParcel, getAgentCode, markParcelAsReturned,
  updateParcelStatus,
  confirmReglementReceivedBySource,
  confirmDriverVersement,
  deleteCaisseEntries,
} from '../../../firebase/firestore'
import {
  addAgentCodRequestReply, resolveAgentCodRequest,
} from '../../../firebase/agentCodRequests'
import {
  createClient, updateClient, addPayment,
  resolveModificationRequest, deleteModificationRequest,
} from '../../../firebase/clients'
import { createBankDeposit } from '../../../firebase/bankDeposits'
import { createParticularPortalAccount } from '../../../firebase/portalAccounts'
import { printCharge, printTable, printBonRamassage } from '../../../utils/agentPrintUtils'

const SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

// ── Module-level helpers (no state needed) ────────────────────────────────────

export const serviceToPaymentType = (st: any) =>
  st === 'retour_bl' ? 'bon_livraison' : (st === 'simple' ? 'especes' : (st || 'especes'))

export const parsePositiveNumber = (value: any, fallback = 0) => {
  const num = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) && num >= 0 ? num : fallback
}

export const entryDate = (e: any) => {
  if (e.createdAt?.toDate) return e.createdAt.toDate()
  if (e.createdAt) return new Date(e.createdAt)
  return new Date(0)
}

export const filterByDate = (list: any, preset: any, from: any, to: any, getDate = (p: any) => {
  if (p.createdAt?.toDate) return p.createdAt.toDate()
  if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
  return new Date(0)
}) => {
  if (preset === 'all') return list
  const now = new Date()
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999)
  let start: any = null, end: any = endOfToday
  if      (preset === 'today')  { start = new Date(); start.setHours(0, 0, 0, 0) }
  else if (preset === 'week')   { start = new Date(); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0) }
  else if (preset === 'month')  { start = new Date(now.getFullYear(), now.getMonth(), 1) }
  else if (preset === 'day')    { start = from ? new Date(from) : null; if (start) { start.setHours(0, 0, 0, 0); end = new Date(from + 'T23:59:59') } }
  else if (preset === 'custom') { start = from ? new Date(from) : null; if (start) start.setHours(0, 0, 0, 0); end = to ? new Date(to + 'T23:59:59') : endOfToday }
  return list.filter((p: any) => {
    const d = getDate(p)
    if (start && d < start) return false
    if (end   && d > end)   return false
    return true
  })
}

// Module-level COD helpers ─────────────────────────────────────────────────────

export const codCaisseCategory = (parcel: any) => {
  const pt = parcel.codPaymentType || parcel.serviceType || 'especes'
  if (pt === 'cheque')                              return 'cod_cheque'
  if (pt === 'traite')                              return 'cod_traite'
  if (pt === 'bon_livraison' || pt === 'retour_bl') return 'doc_agent'
  return 'cod_agent'
}

export const isCash = (parcel: any) => {
  const pt = parcel.codPaymentType || parcel.serviceType || 'especes'
  return !['cheque', 'traite', 'bon_livraison', 'retour_bl'].includes(pt)
}

export const isRetourFondValue = (parcel: any) => {
  const pt = parcel.codPaymentType || parcel.serviceType || 'especes'
  return (parseFloat(parcel.codAmount) || 0) > 0 || ['cheque', 'traite', 'bon_livraison', 'retour_bl'].includes(pt)
}

// ─────────────────────────────────────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAgentHandlers(s: React.MutableRefObject<Record<string, any>>) {

  // ── Transport / Assignment ─────────────────────────────────────────────────

  const handleAssignTransport = async () => {
    const { transportModal, setTransportModal } = s.current
    const { parcel, chauffeurName, chauffeurPhone } = transportModal
    if (!chauffeurName.trim()) { setTransportModal((m: any) => ({ ...m, error: 'Nom du chauffeur requis.' })); return }
    setTransportModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await assignDriver(parcel.id, chauffeurName.trim(), chauffeurPhone.trim())
      setTransportModal({ open: false, parcel: null, chauffeurName: '', chauffeurPhone: '', loading: false, error: '' })
    } catch (err: any) {
      console.error('handleAssignTransport:', err)
      setTransportModal((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors du chargement camion.' }))
    }
  }

  const handleBulkLoadTransport = async (loadableParcels: any) => {
    const { bulkLoadSelectedIds, bulkLoadName, bulkLoadPhone, setBulkLoadError, setBulkLoadBusy, setBulkLoadSelectedIds, setBulkLoadName, setBulkLoadPhone } = s.current
    setBulkLoadError('')
    if (!bulkLoadName.trim()) {
      setBulkLoadError('Entrez le nom du chauffeur.')
      return
    }
    const selectedParcels = bulkLoadSelectedIds
      .map((id: any) => loadableParcels.find((p: any) => p.id === id))
      .filter(Boolean)
    if (selectedParcels.length === 0) {
      setBulkLoadError('Sélectionnez au moins un colis à charger.')
      return
    }
    const assignments = selectedParcels.map((parcel: any) => ({
      parcelId: parcel.id,
      chauffeurName: bulkLoadName.trim(),
      chauffeurPhone: bulkLoadPhone.trim(),
    }))
    setBulkLoadBusy(true)
    try {
      await assignDriversBulk(assignments)
      setBulkLoadSelectedIds([])
      setBulkLoadName('')
      setBulkLoadPhone('')
    } catch (err: any) {
      console.error('handleBulkLoadTransport:', err)
      setBulkLoadError(err?.message || 'Erreur lors du chargement groupé.')
    } finally {
      setBulkLoadBusy(false)
    }
  }

  const handleAssignDelivery = async () => {
    const { deliveryModal, setDeliveryModal, drivers, allSectors, vehicles, profile } = s.current
    const { parcel, sectorId, driverId, vehicleId } = deliveryModal
    if (!driverId) { setDeliveryModal((m: any) => ({ ...m, error: 'Sélectionnez un livreur.' })); return }
    setDeliveryModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const driver  = drivers.find((d: any) => d.id === driverId)
      const sector  = allSectors.find((s: any) => s.id === sectorId) || allSectors.find((s: any) => s.id === driver?.sectorId)
      const vehicle = vehicles.find((v: any) => v.id === vehicleId)
      const vehicleLabel = vehicle
        ? [vehicle.matricule, vehicle.marque, vehicle.modele].filter(Boolean).join(' - ')
        : ''
      await assignDeliveryDriver(parcel.id, driverId, driver?.name || '', {
        deliverySectorId:     sector?.id || '',
        deliverySectorCode:   sector?.code || '',
        deliverySectorName:   sector?.name || '',
        deliveryVehicleId:    vehicle?.id || '',
        deliveryVehicleLabel: vehicleLabel,
        deliveryAssignedBy:   profile?.name || 'Chef agence',
      })
      await updateParcelStatus(parcel.id, 'En cours de livraison', {
        note: `Livraison assignée au livreur ${driver?.name || ''}${vehicleLabel ? ` avec ${vehicleLabel}` : ''}`.trim()
      })
      setDeliveryModal({ open: false, parcel: null, sectorId: '', driverId: '', vehicleId: '', loading: false, error: '' })
    } catch (err: any) {
      console.error('handleAssignDelivery:', err)
      setDeliveryModal((m: any) => ({ ...m, loading: false, error: err?.message || "Erreur lors de l'assignation." }))
    }
  }

  const handleChefPointParcel = async (parcel: any) => {
    const { profile, setChefPointing } = s.current
    const uid = auth.currentUser?.uid
    setChefPointing((st: any) => ({ ...st, [parcel.id]: true }))
    try {
      await markParcelChefPointed(parcel.id, uid, profile?.name || 'Chef')
    } catch (err: any) {
      console.error('handleChefPointParcel:', err)
    } finally {
      setChefPointing((st: any) => ({ ...st, [parcel.id]: false }))
    }
  }

  // ── COD Collect ───────────────────────────────────────────────────────────

  const handleAgentCollectCod = async () => {
    const { codCollectModal, setCodCollectModal, setPortCollectModal, profile, collectedCodIds } = s.current
    const { parcel, paymentType, withDelivery } = codCollectModal
    if (!paymentType) return
    if (collectedCodIds.current.has(parcel.id) || ['collected', 'remis'].includes(parcel.codStatus)) {
      setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })
      return
    }
    collectedCodIds.current.add(parcel.id)
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodCollectModal((m: any) => ({ ...m, loading: true }))
    try {
      const NON_CASH = ['cheque', 'traite', 'bon_livraison', 'retour_bl']
      const contractedType = serviceToPaymentType(parcel.serviceType)
      const effectivePaymentType = NON_CASH.includes(contractedType) ? contractedType : paymentType
      const isSourceAgent = uid === parcel.agentId
      if (isSourceAgent) {
        await collectCodAtSource(parcel.id, effectivePaymentType, name)
      } else {
        await collectCodAtDestination(parcel.id, effectivePaymentType, name)
      }
      const isEspeces = !NON_CASH.includes(effectivePaymentType)
      if (isEspeces) {
        await createCaisseEntry({
          type: 'entree', category: 'cod_agence',
          amount: parcel.codAmount,
          description: `RETOUR FOND espèces collecté — ${parcel.trackingId} (${parcel.receiver?.name})`,
          reference: parcel.trackingId,
          agentId: uid,
          agentName: name,
          city: profile?.city || parcel.receiver?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      if (withDelivery) {
        const portPending = parcel.portType === 'port_du' && parcel.portStatus !== 'collected'
        if (portPending) {
          setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })
          setPortCollectModal({ open: true, parcel, paymentType: '', loading: false })
          return
        }
        await updateParcelStatus(parcel.id, 'Livré', { note: 'Retrait en agence par le client' })
      }
      setCodCollectModal({ open: false, parcel: null, paymentType: '', loading: false, withDelivery: false })
    } catch {
      setCodCollectModal((m: any) => ({ ...m, loading: false }))
    }
  }

  const handleAgentCollectPort = async () => {
    const { portCollectModal, setPortCollectModal, profile } = s.current
    const { parcel, paymentType } = portCollectModal
    if (!paymentType) return
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setPortCollectModal((m: any) => ({ ...m, loading: true }))
    try {
      await collectPortDu(parcel.id, name, uid || '')
      await createCaisseEntry({
        type: 'entree', category: 'port_du',
        amount: parcel.price || 0,
        description: `Port dû — ${parcel.trackingId} (${parcel.receiver?.name})`,
        reference: parcel.trackingId,
        agentId: uid || '',
        agentName: name,
        city: profile?.city || parcel.receiver?.city || '',
        cashierId: uid || '', cashierName: name,
      })
      await updateParcelStatus(parcel.id, 'Livré', { note: 'Retrait en agence — port dû encaissé' })
      setPortCollectModal({ open: false, parcel: null, paymentType: '', loading: false })
    } catch {
      setPortCollectModal((m: any) => ({ ...m, loading: false }))
    }
  }

  // ── Caisse transfers ──────────────────────────────────────────────────────

  const handleDirectCashierTransfer = async () => {
    const { profile, agencyCashiers, agentEntries, directTransfer, setDirectTransfer } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const amount = parseFloat(directTransfer.amount || '0')
    const selectedCashier = agencyCashiers.find((c: any) => c.id === directTransfer.cashierId)
    const isChef = profile?.role === 'chef_agence'
    // Chef d'agence voit toute la caisse de l'agence ; agent/aide voit uniquement ses propres entrées
    const myEntries = isChef
      ? agentEntries
      : agentEntries.filter((e: any) => e.cashierId === uid || e.agentId === uid)
    const currentBalance = myEntries.reduce((sum: any, e: any) => sum + (e.type === 'entree' ? 1 : -1) * (parseFloat(e.amount) || 0), 0)

    if (!selectedCashier || !profile?.city || selectedCashier.city !== profile.city) {
      setDirectTransfer((m: any) => ({ ...m, error: 'Selectionnez un caissier de votre agence.', success: '' }))
      return
    }
    if (!amount || amount <= 0) {
      setDirectTransfer((m: any) => ({ ...m, error: 'Entrez un montant valide.', success: '' }))
      return
    }
    if (amount > currentBalance) {
      setDirectTransfer((m: any) => ({ ...m, error: 'Montant superieur au solde de votre caisse.', success: '' }))
      return
    }

    setDirectTransfer((m: any) => ({ ...m, loading: true, error: '', success: '' }))
    try {
      await directTransferAgentToCashierAtomic({
        city:        profile.city,
        agentId:     uid,
        agentName:   name,
        caisserId:   selectedCashier.id,
        cashierName: selectedCashier.name || 'Caissier',
        amount,
        description: directTransfer.description || 'Transfert direct agent vers caissier',
        note:        directTransfer.description || '',
      })
      setDirectTransfer({ cashierId: '', amount: '', description: '', loading: false, error: '', success: 'Transfert effectue.' })
    } catch (err: any) {
      console.error('Erreur transfert caissier:', err)
      setDirectTransfer((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors du transfert.', success: '' }))
    }
  }

  const handleRequestCashRecovery = async () => {
    const { profile, agencyCashiers, agencyCash, recoveryRequest, setRecoveryRequest } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const amount = parseFloat(recoveryRequest.amount || '0')
    const selectedCashier = agencyCashiers.find((c: any) => c.id === recoveryRequest.cashierId)

    if (!selectedCashier || !profile?.city || selectedCashier.city !== profile.city) {
      setRecoveryRequest((m: any) => ({ ...m, error: 'Selectionnez un caissier de votre agence.', success: '' }))
      return
    }
    if (!amount || amount <= 0) {
      setRecoveryRequest((m: any) => ({ ...m, error: 'Entrez un montant valide.', success: '' }))
      return
    }
    if (amount > (agencyCash?.soldeEspeces || agencyCash?.solde || 0)) {
      setRecoveryRequest((m: any) => ({ ...m, error: 'Montant superieur a la caisse gardee par le caissier.', success: '' }))
      return
    }

    setRecoveryRequest((m: any) => ({ ...m, loading: true, error: '', success: '' }))
    try {
      await createAgentCashRecoveryRequest({
        city:        profile.city,
        agentId:     uid,
        agentName:   name,
        cashierId:   selectedCashier.id,
        cashierName: selectedCashier.name || 'Caissier',
        amount,
        description: recoveryRequest.description || 'Recuperation demandee par l agent',
      })
      setRecoveryRequest({ cashierId: '', amount: '', description: '', loading: false, error: '', success: 'Demande envoyee au caissier.' })
    } catch (err: any) {
      console.error('Erreur demande recuperation:', err)
      setRecoveryRequest((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la demande.', success: '' }))
    }
  }

  const handleAdminTransfer = async () => {
    const { profile, agentEntries, parcels, adminTransferForm, setAdminTransferForm } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const amount = parseFloat(adminTransferForm.amount || '0')
    const isChef = profile?.role === 'chef_agence'
    // Solde TOTAL (toutes périodes confondues) — on ne filtre PAS par date
    // car l'agent peut avoir accumulé de l'argent sur plusieurs jours
    // Chef d'agence voit toute la caisse de l'agence ; agent/aide voit uniquement ses propres entrées
    const myEntries = isChef
      ? agentEntries
      : agentEntries.filter((e: any) => e.cashierId === uid || e.agentId === uid)
    const totalBalance = myEntries
      .reduce((sum: any, e: any) => sum + (e.type === 'entree' ? 1 : -1) * (parseFloat(e.amount) || 0), 0)
    if (!amount || amount <= 0) {
      setAdminTransferForm((m: any) => ({ ...m, error: 'Entrez un montant valide.', success: '' }))
      return
    }
    if (amount > totalBalance) {
      setAdminTransferForm((m: any) => ({ ...m, error: `Montant supérieur à votre solde total (${Math.round(totalBalance).toLocaleString('fr-MA')} DH).`, success: '' }))
      return
    }

    // Récupérer les COD en espèces éligibles pour transfert admin (non déjà versés au central)
    const eligibleCods = (parcels || []).filter((p: any) =>
      parseFloat(p.codAmount || 0) > 0 &&
      isCash(p) &&
      ['remis', 'collected'].includes(p.codStatus || '') &&
      !p.centralDeposited &&  // Pas déjà versé au central
      !p.adminTransferred &&  // Pas déjà transféré à l'admin
      !p.codSenderPaid
    )
    const codParcelIds = eligibleCods.map((p: any) => p.id)

    setAdminTransferForm((m: any) => ({ ...m, loading: true, error: '', success: '' }))
    try {
      await createAdminTransferFromAgent({
        fromId:   uid,
        fromName: name,
        city:     profile.city,
        amount,
        note:     adminTransferForm.note,
        codParcelIds,  // Inclure les COD pour marquage
      })
      setAdminTransferForm({ amount: '', note: '', loading: false, error: '', success: `Transfert envoyé à l'Admin (${codParcelIds.length} COD inclus). En attente de confirmation.` })
    } catch (err: any) {
      setAdminTransferForm((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors du transfert.', success: '' }))
    }
  }

  const handleDeleteAgentOperations = async (entries: any) => {
    const { profile, agentOpsDelete, setAgentOpsDelete } = s.current
    const uid = auth.currentUser?.uid
    if (!uid || agentOpsDelete.loading) return

    const agentOperations = entries.filter((e: any) =>
      e.agentId === uid ||
      e.sourceAgentId === uid ||
      e.cashierId === uid
    )
    if (agentOperations.length === 0) {
      setAgentOpsDelete({ loading: false, message: '', error: 'Aucune operation liee a cet agent a supprimer.' })
      return
    }

    const ok = window.confirm(`Supprimer ${agentOperations.length} operation(s) de caisse liee(s) a cet agent ? Cette action ne supprime ni les expediteurs ni les autres agents.`)
    if (!ok) return

    setAgentOpsDelete({ loading: true, message: '', error: '' })
    try {
      const agencyCashDelta = agentOperations.reduce((sum: any, e: any) => {
        const amount = parseFloat(e.amount) || 0
        if (e.category === 'depot_agent' && e.sourceAgentId === uid && e.type === 'entree') return sum - amount
        if (e.category === 'restitution_agent' && e.sourceAgentId === uid && e.type === 'sortie') return sum + amount
        return sum
      }, 0)

      await deleteCaisseEntries(agentOperations.map((e: any) => e.id))

      if (agencyCashDelta !== 0 && profile?.city) {
        await adjustAgencyCash(profile.city, {
          soldeDelta:    agencyCashDelta,
          especesDelta:  agencyCashDelta,
          lastUpdatedBy: profile?.name || 'Agent',
        })
      }

      setAgentOpsDelete({ loading: false, message: `${agentOperations.length} operation(s) supprimee(s) pour cet agent.`, error: '' })
    } catch (err: any) {
      console.error('Erreur suppression operations agent:', err)
      setAgentOpsDelete({ loading: false, message: '', error: 'Erreur lors de la suppression des operations.' })
    }
  }

  const handleDeleteCashierHistory = async () => {
    const { cashierHistoryDelete, setCashierHistoryDelete } = s.current
    const uid = auth.currentUser?.uid
    if (!uid || cashierHistoryDelete.loading) return

    const ok = window.confirm("Supprimer les messages et historiques entre cet agent et le caissier ? Les mouvements de caisse restent geres par le bouton de suppression des operations.")
    if (!ok) return

    setCashierHistoryDelete({ loading: true, message: '', error: '' })
    try {
      const deletedCount = await deleteAgentCashierHistory(uid)
      setCashierHistoryDelete({
        loading: false,
        message: deletedCount > 0
          ? `${deletedCount} message(s) / historique(s) supprime(s).`
          : 'Aucun historique agent-caissier trouve pour cet agent.',
        error: '',
      })
    } catch (err: any) {
      console.error('Erreur suppression historique caissier:', err)
      setCashierHistoryDelete({ loading: false, message: '', error: "Erreur lors de la suppression de l'historique caissier." })
    }
  }

  // ── COD helpers ───────────────────────────────────────────────────────────

  const patchAllCod = (id: any, fields: any) => {
    const { setAllCodParcels, setParcels } = s.current
    setAllCodParcels((prev: any) => prev ? prev.map((p: any) => p.id === id ? { ...p, ...fields } : p) : prev)
    setParcels((prev: any) => prev.map((p: any) => p.id === id ? { ...p, ...fields } : p))
  }

  const handleRemitCod = async (parcel: any) => {
    const { profile } = s.current
    const name = profile?.name || 'Agent'
    await remitCod(parcel.id, name)
  }

  const handleSettleCod = async (parcel: any) => {
    const { profile, setCodSettling } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodSettling(parcel.id)
    try {
      await settleCodToSender(parcel.id, name, uid || '')
      if (isCash(parcel)) {
        await createCaisseEntry({
          type: 'sortie', category: 'cod_regle_expediteur',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `RETOUR FOND espèces réglé expéditeur — ${parcel.trackingId} (${parcel.sender?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid || '', agentName: name, city: profile?.city || '',
          cashierId: uid || '', cashierName: name,
        })
      }
      patchAllCod(parcel.id, { codSenderPaid: true, codSenderPaidAt: new Date().toISOString() })
    } finally {
      setCodSettling(null)
    }
  }

  const handleLoadAllCod = async () => {
    const { setCodLoadingAll, setAllCodParcels } = s.current
    const uid = auth.currentUser?.uid
    setCodLoadingAll(true)
    try {
      const all = await fetchAllAgentCodParcels(uid || '')
      setAllCodParcels(all)
    } finally {
      setCodLoadingAll(false)
    }
  }

  const handleReplyCodRequest = async (req: any) => {
    const { codRequestDrafts, setCodRequestDrafts, setCodRequestBusy, profile } = s.current
    const text = (codRequestDrafts[req.id] || '').trim()
    if (!text) return
    setCodRequestBusy(req.id)
    try {
      await addAgentCodRequestReply(req.id, {
        message: text,
        authorName: profile?.name || 'Agent',
        authorRole: 'agent',
      })
      setCodRequestDrafts((d: any) => ({ ...d, [req.id]: '' }))
    } finally {
      setCodRequestBusy('')
    }
  }

  const handleSettleCodFromRequest = async (req: any, parcel: any) => {
    const { setCodRequestBusy, profile } = s.current
    if (!parcel) return
    setCodRequestBusy(req.id)
    try {
      await handleSettleCod(parcel)
      await addAgentCodRequestReply(req.id, {
        message: 'RETOUR FOND regle avec l expediteur.',
        authorName: profile?.name || 'Agent',
        authorRole: 'agent',
      })
      await resolveAgentCodRequest(req.id, profile?.name || 'Agent')
    } finally {
      setCodRequestBusy('')
    }
  }

  const handleBatchSettle = async (parcels: any) => {
    const { profile, setBatchSettling } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const ids  = parcels.map((p: any) => p.id)
    setBatchSettling(true)
    try {
      await batchSettleCods(ids, name, uid || '')
      const espacesParcels = parcels.filter((p: any) => isCash(p))
      if (espacesParcels.length > 0) {
        await Promise.all(espacesParcels.map((parcel: any) =>
          createCaisseEntry({
            type: 'sortie', category: 'cod_regle_expediteur',
            amount: parseFloat(parcel.codAmount) || 0,
            description: `RETOUR FOND espèces réglé expéditeur — ${parcel.trackingId} (${parcel.sender?.name || ''})`,
            reference: parcel.trackingId,
            agentId: uid || '', agentName: name, city: profile?.city || '',
            cashierId: uid || '', cashierName: name,
          })
        ))
      }
      const { setAllCodParcels } = s.current
      setAllCodParcels((prev: any) => prev
        ? prev.map((p: any) => ids.includes(p.id) ? { ...p, codSenderPaid: true, codSenderPaidAt: new Date().toISOString() } : p)
        : prev
      )
    } finally {
      setBatchSettling(false)
    }
  }

  const findSourceReglementForParcel = (parcel: any) => {
    const { sourcePointeurReglements } = s.current
    return sourcePointeurReglements.find((r: any) => r.parcelId === parcel.id)
      || sourcePointeurReglements.find((r: any) => r.trackingNumber && r.trackingNumber === parcel.trackingId)
  }

  const openReceiveModal = (parcel: any) => {
    const { setReceiveModal } = s.current
    const reglement = findSourceReglementForParcel(parcel)
    const mode = reglement?.modeReglement || parcel.codPaymentType || parcel.serviceType || 'especes'
    if (['cheque', 'traite'].includes(mode)) {
      setReceiveModal({
        parcel,
        reglement: reglement || null,
        step: 'document',
        paymentType: mode,
        chequeNum: reglement?.numeroPiece || '',
        banque: reglement?.banque || '',
        echeance: reglement?.dateEcheance || '',
        matchesPointeur: true,
        note: '',
        loading: false,
        error: '',
      })
      return
    }
    setReceiveModal({
      parcel,
      reglement: reglement || null,
      step: 'choice',
      paymentType: mode,
      chequeNum: reglement?.numeroPiece || '',
      banque: reglement?.banque || '',
      echeance: reglement?.dateEcheance || '',
      matchesPointeur: true,
      note: '',
      loading: false,
      error: '',
    })
  }

  const getCentralDepositEligibleCods = (list: any) => (list || []).filter((p: any) =>
    parseFloat(p.codAmount || 0) > 0 &&
    isCash(p) &&
    p.codStatus === 'remis' &&  // ⭐ Seulement après réception (pas 'collected')
    !p.centralDeposited &&
    !p.codSenderPaid &&
    !p.adminTransferred  // EXCLUSION: COD déjà transféré à l'admin
  )

  const handleCentralCodDeposit = async (eligibleParcels: any) => {
    const { profile, setCentralDepositState, setCentralDepositSelectedIds } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Chef agence'
    const city = profile?.city || ''
    const list  = getCentralDepositEligibleCods(eligibleParcels)
    const total = list.reduce((sum: any, p: any) => sum + (parseFloat(p.codAmount) || 0), 0)
    if (list.length === 0 || total <= 0) return
    setCentralDepositState({ loading: true, error: '', success: '' })
    try {
      const depositId = await createCentralCodDeposit({
        parcelIds: list.map((p: any) => p.id),
        parcels:   list,
        amount:    total,
        city,
        agentId:   uid,
        agentName: name,
        note:      `Versement RETOUR FOND espèces au compte société - ${list.length} colis`,
      })
      const now = new Date().toISOString()
      list.forEach((p: any) => patchAllCod(p.id, {
        centralDeposited:     true,
        centralDepositId:     depositId,
        centralDepositAt:     now,
        centralDepositBy:     name,
        centralDepositById:   uid,
        centralDepositCity:   city,
      }))
      setCentralDepositSelectedIds((ids: any) => ids.filter((id: any) => !list.some((p: any) => p.id === id)))
      setCentralDepositState({
        loading: false,
        error:   '',
        success: `${list.length} RETOUR FOND versés au compte société (${total.toLocaleString('fr-MA')} DH).`,
      })
    } catch (err: any) {
      console.error('handleCentralCodDeposit:', err)
      setCentralDepositState({ loading: false, error: err?.message || 'Erreur lors du versement société.', success: '' })
    }
  }

  const handleReceptionCod = async (parcel: any) => {
    const { profile, setCodReceptioning, setReceptionCodError } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodReceptioning(parcel.id)
    setReceptionCodError('')
    try {
      let codCaisseEntryId = parcel.codCaisseEntryId || null
      if (isCash(parcel) && !parcel.codCaisseEntryId) {
        codCaisseEntryId = await createCaisseEntry({
          type: 'entree', category: 'cod_agent',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `RETOUR FOND espèces réceptionné du livreur — ${parcel.trackingId} (${parcel.receiver?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      const now = new Date().toISOString()
      const extraFields = {
        codReceivedByChef:   true,              // ⭐ Boolean pour filtrage livreur
        codReceivedByChefAt: now,               // ⭐ Date réception (format ISO pour livreur)
        codReceivedByChefBy: name,              // ⭐ Nom chef (pour accusé livreur)
        codChefReceivedAt:   now,
        codChefReceivedBy:   name,
        codChefReceivedById: uid,
        ...(codCaisseEntryId ? { codCaisseEntryId } : {}),
      }
      await remitCod(parcel.id, name, extraFields)
      patchAllCod(parcel.id, { codStatus: 'remis', codRemisAt: now, codRemisBy: name, ...extraFields })
    } catch (err: any) {
      console.error('handleReceptionCod:', err)
      setReceptionCodError(err?.message || 'Erreur lors de la réception RETOUR FOND.')
    } finally {
      setCodReceptioning(null)
    }
  }

  const handleReceiveCodFromDriver = async (parcel: any) => {
    const { profile, setCodFromDriverReceiving, setParcels } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Chef'
    setCodFromDriverReceiving((st: any) => ({ ...st, [parcel.id]: true }))
    try {
      let entryId = parcel.codCaisseEntryId || null
      if (isCash(parcel) && !entryId) {
        entryId = await createCaisseEntry({
          type: 'entree', category: 'cod_agent',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `RETOUR FOND espèces reçu du livreur — ${parcel.trackingId} (${parcel.receiver?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      const now = new Date().toISOString()
      const extraFields = {
        codChefReceivedAt:   now,
        codChefReceivedBy:   name,
        codChefReceivedById: uid,
        ...(entryId ? { codCaisseEntryId: entryId } : {}),
      }
      await remitCod(parcel.id, name, extraFields)
      setParcels((prev: any) => prev.map((p: any) => p.id === parcel.id
        ? { ...p, codStatus: 'remis', codRemisAt: now, codRemisBy: name, ...extraFields }
        : p
      ))
    } catch (err: any) {
      console.error('handleReceiveCodFromDriver:', err)
    } finally {
      setCodFromDriverReceiving((st: any) => { const n = { ...st }; delete n[parcel.id]; return n })
    }
  }

  const handleConfirmDriverVersement = async (tx: any) => {
    const { profile, setVersementConfirming, setDriverVersements } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Chef'
    setVersementConfirming((st: any) => ({ ...st, [tx.id]: true }))
    try {
      await confirmDriverVersement(tx.id, {
        confirmedById: uid,
        confirmedBy:   name,
        city:          profile?.city || '',
        amount:        tx.amount,
        driverName:    tx.driverName || '',
        driverId:      tx.driverId   || '',
      })
      setDriverVersements((prev: any) => prev.map((v: any) => v.id === tx.id ? { ...v, status: 'confirmed', confirmedBy: name } : v))
    } catch (err: any) {
      console.error('handleConfirmDriverVersement:', err)
    } finally {
      setVersementConfirming((st: any) => { const n = { ...st }; delete n[tx.id]; return n })
    }
  }

  const handleReceivePortDuEspeces = async (parcel: any) => {
    const { profile, setPortDuReceiving, setPortDuReceiveError, setParcels } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Chef'
    setPortDuReceiving((st: any) => ({ ...st, [parcel.id]: true }))
    setPortDuReceiveError('')
    try {
      if (parcel.portChefReceivedAt) return
      let entryId = parcel.portCaisseEntryId || null
      if (!entryId) {
        entryId = await createCaisseEntry({
          type: 'entree', category: 'port_du',
          amount: parseFloat(parcel.price) || 0,
          description: `Port dû espèces reçu du livreur — ${parcel.trackingId} (${parcel.receiver?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      const now = new Date().toISOString()
      await markPortDuReceivedByChef(parcel.id, name, uid, entryId ? { portCaisseEntryId: entryId } : {})
      setParcels((prev: any) => prev.map((p: any) => p.id === parcel.id
        ? { ...p, portChefReceivedAt: now, portChefReceivedBy: name, portChefReceivedById: uid, ...(entryId ? { portCaisseEntryId: entryId } : {}) }
        : p
      ))
    } catch (err: any) {
      console.error('handleReceivePortDuEspeces:', err)
      setPortDuReceiveError(err?.message || 'Erreur lors de la réception port dû.')
    } finally {
      setPortDuReceiving((st: any) => { const n = { ...st }; delete n[parcel.id]; return n })
    }
  }

  const handleMarkSentToSource = async (parcel: any) => {
    const { profile, setCodSending, setCentralDepositState } = s.current
    if (isCash(parcel)) {
      setCentralDepositState({
        loading: false,
        error:   "Les RETOUR FOND espèces se versent au compte société, pas à l'agence source.",
        success: '',
      })
      return
    }
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setCodSending(parcel.id)
    try {
      await markCodSentToSource(parcel.id, name, uid || '')
      patchAllCod(parcel.id, { codSentToSource: true, codSentToSourceAt: new Date().toISOString(), codSentToSourceBy: name })
    } finally {
      setCodSending(null)
    }
  }

  // ⭐ Envoyer plusieurs règlements COD pointés à l'agence source
  const handleSendSelectedCodReglements = async (reglements: any[]) => {
    const { profile, parcels, setParcels } = s.current
    if (!reglements?.length) return

    const uid = auth.currentUser?.uid
    const name = profile?.name || 'Agent'

    // Récupérer les parcelIds uniques des règlements
    const parcelIds = [...new Set(reglements.map(r => r.parcelId).filter(Boolean))]

    if (parcelIds.length === 0) {
      alert('Aucun COD associé à ces règlements.')
      return
    }

    const confirm = window.confirm(`Envoyer ${parcelIds.length} COD à l'agence source ?`)
    if (!confirm) return

    try {
      // Envoyer chaque COD
      for (const parcelId of parcelIds) {
        await markCodSentToSource(parcelId, name, uid || '')
      }

      // Mise à jour optimiste des parcels
      setParcels((prev: any[]) => prev.map(p =>
        parcelIds.includes(p.id)
          ? { ...p, codSentToSource: true, codSentToSourceAt: new Date().toISOString(), codSentToSourceBy: name }
          : p
      ))

      alert(`${parcelIds.length} COD envoyé(s) à l'agence source avec succès !`)
    } catch (err: any) {
      console.error('handleSendSelectedCodReglements:', err)
      alert('Erreur lors de l\'envoi : ' + (err?.message || 'Erreur inconnue'))
    }
  }

  // ⭐ Valider le rapport COD envoyé par le pointeur
  const handleValidateCodReport = async (parcel: any) => {
    const { profile, parcels, setParcels } = s.current
    const uid = auth.currentUser?.uid
    const name = profile?.name || 'Chef'

    try {
      await validateCodByChef(parcel.id, name, uid || '')

      // Mise à jour optimiste
      setParcels((prev: any[]) => prev.map(p =>
        p.id === parcel.id
          ? { ...p, codValidatedByChef: true, codValidatedByChefAt: new Date().toISOString(), codValidatedByChefBy: name }
          : p
      ))

      alert('Rapport validé avec succès !')
    } catch (err: any) {
      console.error('handleValidateCodReport:', err)
      alert('Erreur lors de la validation : ' + (err?.message || 'Erreur inconnue'))
    }
  }

  // ⭐ Envoyer COD à l'agence source (avec ou sans validation préalable)
  const handleSendCodToSource = async (parcel: any) => {
    const { profile, parcels, setParcels } = s.current
    const uid = auth.currentUser?.uid
    const name = profile?.name || 'Chef'
    const isValidated = parcel.codValidatedByChef === true

    const confirmMsg = isValidated
      ? `Envoyer ce COD validé à l'agence source ?`
      : `⚠️ Envoyer ce COD à l'agence source SANS validation ?\n\nLe pointeur sera notifié que c'est envoyé sans validation.`

    if (!window.confirm(confirmMsg)) return

    try {
      await markCodSentToSource(parcel.id, name, uid || '', isValidated)

      // Mise à jour optimiste
      setParcels((prev: any[]) => prev.map(p =>
        p.id === parcel.id
          ? {
              ...p,
              codSentToSource: true,
              codSentToSourceAt: new Date().toISOString(),
              codSentToSourceBy: name,
              codSentWithValidation: isValidated
            }
          : p
      ))

      alert(`COD envoyé à l'agence source ${isValidated ? 'avec validation' : 'sans validation'} !`)
    } catch (err: any) {
      console.error('handleSendCodToSource:', err)
      alert('Erreur lors de l\'envoi : ' + (err?.message || 'Erreur inconnue'))
    }
  }

  const handleBankDeposit = async () => {
    const { bankDepositModal, setBankDepositModal, profile } = s.current
    const m = bankDepositModal
    if (!m) return
    if (!m.bankName?.trim()) {
      setBankDepositModal((prev: any) => ({ ...prev, error: 'Nom de la banque requis.' }))
      return
    }
    if (!m.amount || parseFloat(m.amount) <= 0) {
      setBankDepositModal((prev: any) => ({ ...prev, error: 'Montant invalide.' }))
      return
    }
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    setBankDepositModal((prev: any) => ({ ...prev, loading: true, error: '' }))
    try {
      await createBankDeposit({
        parcelId:    m.parcel.id,
        trackingId:  m.parcel.trackingId,
        senderName:  m.parcel.sender?.name || '',
        receiverName: m.parcel.receiver?.name || '',
        amount:      parseFloat(m.amount),
        bankName:    m.bankName.trim(),
        refNum:      m.refNum?.trim() || '',
        depositDate: m.depositDate || new Date().toISOString().split('T')[0],
        city:        profile?.city || '',
        agentId:     uid,
        agentName:   name,
        note:        m.note?.trim() || '',
      })
      setBankDepositModal(null)
    } catch (err: any) {
      setBankDepositModal((prev: any) => ({ ...prev, loading: false, error: 'Erreur : ' + (err.message || 'réessayez') }))
    }
  }

  const handleConfirmReceived = async (parcel: any, paymentType = 'especes', chequeDetails: any = {}) => {
    const { profile, setReceiveModal, setCodConfirming } = s.current
    const uid  = auth.currentUser?.uid
    const name = profile?.name || 'Agent'
    const reglementId = chequeDetails.reglementId || s.current.receiveModal?.reglement?.id || ''
    setReceiveModal((m: any) => m ? { ...m, loading: true, error: '' } : null)
    setCodConfirming(parcel.id)
    try {
      await confirmCodReceivedBySource(parcel.id, name, uid || '', paymentType, { ...chequeDetails, reglementId })
      if (reglementId && ['cheque', 'traite'].includes(paymentType)) {
        await confirmReglementReceivedBySource(reglementId, {
          receivedBy:    name,
          receivedById:  uid,
          modeReglement: paymentType,
          montant:       parseFloat(parcel.codAmount) || 0,
          banque:        chequeDetails.banque || '',
          numeroPiece:   chequeDetails.chequeNum || '',
          dateEcheance:  chequeDetails.echeance || '',
          matches:       chequeDetails.matchesPointeur !== false,
          note:          chequeDetails.note || '',
        })
      }
      if (paymentType === 'especes') {
        await createCaisseEntry({
          type: 'entree', category: 'cod_agent',
          amount: parseFloat(parcel.codAmount) || 0,
          description: `RETOUR FOND espèces reçu agence dest. — ${parcel.trackingId} (${parcel.receiver?.name || ''})`,
          reference: parcel.trackingId,
          agentId: uid, agentName: name, city: profile?.city || '',
          cashierId: uid, cashierName: name,
        })
      }
      patchAllCod(parcel.id, {
        codReceivedBySource:     true,
        codReceivedBySourceAt:   new Date().toISOString(),
        codReceivedBySourceType: paymentType,
        ...(reglementId ? { codReceivedReglementId: reglementId } : {}),
      })
      setReceiveModal(null)
    } catch (err: any) {
      setReceiveModal((m: any) => m ? { ...m, loading: false, error: 'Erreur : ' + (err?.message || 'réessayez') } : null)
    } finally {
      setCodConfirming(null)
    }
  }

  // ── Clients ───────────────────────────────────────────────────────────────

  const handleCreateInlineClient = async () => {
    const { inlineNewClient, setInlineNewClient, setForm } = s.current
    if (!inlineNewClient.name.trim() || !inlineNewClient.city.trim()) {
      setInlineNewClient((m: any) => ({ ...m, error: 'Nom et ville requis.' }))
      return
    }
    setInlineNewClient((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const id = await createClient({
        name:        inlineNewClient.name.trim(),
        tel:         inlineNewClient.tel.trim(),
        city:        inlineNewClient.city.trim(),
        accountType: 'compte',
        createdBy:   auth.currentUser?.uid,
      })
      setForm((p: any) => ({ ...p, shipmentMode: 'client', clientId: id, clientName: inlineNewClient.name.trim() }))
      setInlineNewClient(null)
    } catch {
      setInlineNewClient((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la création.' }))
    }
  }

  const handleAgentCreateClient = async () => {
    const { agentNewClient, setAgentNewClient, setAgentClientSaving, profile } = s.current
    if (!agentNewClient?.name?.trim()) return
    setAgentClientSaving(true)
    try {
      if (agentNewClient.id) {
        await updateClient(agentNewClient.id, {
          name:        agentNewClient.name.trim(),
          tel:         agentNewClient.tel?.trim() || '',
          address:     agentNewClient.address?.trim() || '',
          accountType: agentNewClient.accountType || 'cash',
          remise:      parseFloat(agentNewClient.remise) || 0,
        })
      } else {
        await createClient({
          name:          agentNewClient.name.trim(),
          tel:           agentNewClient.tel?.trim() || '',
          city:          profile?.city || '',
          address:       agentNewClient.address?.trim() || '',
          accountType:   agentNewClient.accountType || 'cash',
          remise:        parseFloat(agentNewClient.remise) || 0,
          createdBy:     auth.currentUser?.uid,
          createdByName: profile?.name || '',
          createdByRole: 'agent',
        })
      }
      setAgentNewClient(null)
    } catch { /* silent */ }
    setAgentClientSaving(false)
  }

  // ── Print handlers ────────────────────────────────────────────────────────

  const handlePrint = () => {
    const { createdParcel } = s.current
    const previousTitle = document.title
    const style = document.createElement('style')
    style.textContent = `
      @page { size: A5 portrait; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #ticket-print { width: 148mm !important; max-width: 148mm !important; margin: 0 auto !important; }
      }
    `
    document.head.appendChild(style)
    document.title = createdParcel ? `Bon-Ramassage-${createdParcel.trackingId}` : 'Bon-Ramassage'
    window.print()
    setTimeout(() => {
      document.title = previousTitle
      style.remove()
    }, 500)
  }

  const handlePrintCharge = (groups: any, profileData: any) => printCharge(groups, profileData)

  const handlePrintTable = async (parcelsArg: any, driverName?: string) => printTable(parcelsArg, driverName)

  const handlePrintBonRamassage = async (nexpCodes: any, batchRef: any, sectorCode: any, chauffeurName: any) =>
    printBonRamassage(nexpCodes, batchRef, sectorCode, chauffeurName)

  const handlePrintTicket = async (parcel: any) => {
    const [{ default: JsBarcode }, { default: QRCodeForPrint }, { createRoot }, { flushSync }] = await Promise.all([
      import('jsbarcode'),
      import('../../../components/QRCodeSvg'),
      import('react-dom/client'),
      import('react-dom'),
    ])
    const logoUrl   = window.location.origin + '/LOGO.jpg'
    const parcelCreatedAt = parcel.createdAt?.toDate ? parcel.createdAt.toDate() : (parcel.createdAt ? new Date(parcel.createdAt) : new Date())
    const printDate = parcelCreatedAt.toLocaleDateString('fr-MA')

    const barcodeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(barcodeSvgEl, parcel.trackingId, { width: 1.3, height: 48, fontSize: 10, margin: 0, displayValue: true })
    const barcodeSvgStr = barcodeSvgEl.outerHTML

    const qrContainer = document.createElement('div')
    const qrRoot = createRoot(qrContainer)
    flushSync(() => {
      qrRoot.render(
        React.createElement(QRCodeForPrint, {
          value: `https://arelanc.web.app/track?id=${parcel.trackingId}`,
          size: 64,
          level: 'M',
          includeMargin: false,
        })
      )
    })
    const qrSvgStr = qrContainer.innerHTML
    qrRoot.unmount()

    const checks = SERVICE_TYPES.map((st: any) => {
      // Cas spécial: Retour BL se base sur hasRetourBL au lieu de serviceType
      const isChecked = st.key === 'retour_bl'
        ? (parcel.hasRetourBL === true)
        : (parcel.serviceType === st.key)
      return `
      <label style="display:flex;align-items:center;gap:4px;font-size:9pt;font-weight:600">
        <span style="width:12px;height:12px;border:1px solid #9ca3af;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:8px;${isChecked ? 'background:#2563eb;border-color:#2563eb;color:white' : ''}">${isChecked ? '✓' : ''}</span>
        ${st.label}
      </label>`
    }).join('')

    const ticketHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bon-Ramassage-${parcel.trackingId}</title>
  <style>
    @page { size: 148mm 210mm; margin: 6mm; }
    * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body { font-family:Arial,sans-serif; font-size:10pt; margin:0; padding:0; }
    table { border-collapse:collapse; width:100%; }
    td { vertical-align:top; padding:6px 10px; }
  </style>
</head>
<body>
  <div style="border:1px solid #d1d5db;max-width:148mm;margin:0 auto">
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d1d5db;padding:6px 10px">
      <img src="${logoUrl}" style="height:36px;object-fit:contain" onerror="this.style.display='none'">
      <div style="text-align:right">
        <div style="font-size:8pt;color:#6b7280">Bon de Ramassage</div>
        ${parcel.sender?.nic ? `<div style="font-weight:bold;color:#2563eb;font-size:9pt;font-family:monospace;letter-spacing:1px">N EXP : ${parcel.sender.nic}</div>` : ''}
        <div style="font-weight:bold;color:#1d4ed8;font-size:11pt;letter-spacing:1px;font-family:monospace">${parcel.trackingId}</div>
        <div style="font-size:8pt;color:#9ca3af">${printDate}</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;padding:5px 10px;border-bottom:1px solid #e5e7eb;background:#f9fafb">${checks}</div>
    <table style="border-bottom:1px solid #d1d5db">
      <tr>
        <td style="width:50%;border-right:1px solid #d1d5db">
          <div style="font-weight:bold;font-size:8pt;text-transform:uppercase;color:#1d4ed8;margin-bottom:4px">Expéditeur</div>
          <div><span style="color:#6b7280">Nom : </span><strong>${parcel.sender?.name || '—'}</strong></div>
          <div style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:2px 6px;margin:2px 0">
            <span style="font-size:8pt;font-weight:bold;color:#2563eb;text-transform:uppercase;letter-spacing:0.5px">N EXP :</span>
            <span style="font-weight:bold;color:#1e3a8a;font-family:monospace;font-size:10pt">${parcel.sender?.nic || '—'}</span>
          </div>
          ${parcel.sender?.address ? `<div><span style="color:#6b7280">Adresse : </span>${parcel.sender.address}</div>` : ''}
          <div><span style="color:#6b7280">Ville : </span><strong>${parcel.sender?.city || '—'}</strong></div>
          <div><span style="color:#6b7280">Tél : </span>${parcel.sender?.tel || '—'}</div>
        </td>
        <td style="width:50%">
          <div style="font-weight:bold;font-size:8pt;text-transform:uppercase;color:#1d4ed8;margin-bottom:4px">Destinataire</div>
          <div><span style="color:#6b7280">Nom : </span><strong>${parcel.receiver?.name || '—'}</strong></div>
          ${parcel.receiver?.address ? `<div><span style="color:#6b7280">Adresse : </span>${parcel.receiver.address}</div>` : ''}
          <div><span style="color:#6b7280">Ville : </span><strong style="color:#1d4ed8">${parcel.receiver?.city || '—'}</strong></div>
          <div><span style="color:#6b7280">Tél : </span>${parcel.receiver?.tel || '—'}</div>
        </td>
      </tr>
    </table>
    <table style="border-bottom:1px solid #d1d5db;background:#eff6ff">
      <tr>
        <td style="width:50%;border-right:1px solid #d1d5db">
          <div style="font-size:8pt;color:#6b7280;text-transform:uppercase">Nature de marchandise</div>
          <div style="font-weight:bold;font-size:13pt;color:#1e40af">${parcel.natureOfGoods || '—'}</div>
        </td>
        <td style="width:50%">
          <div style="font-size:8pt;color:#6b7280;text-transform:uppercase">Nombre de colis</div>
          <div style="font-weight:bold;font-size:13pt;color:#1e40af">${parcel.nbColis || 1}</div>
        </td>
      </tr>
    </table>
    <table style="border-bottom:1px solid #d1d5db;text-align:center">
      <tr>
        <td style="width:33%;border-right:1px solid #e5e7eb">
          <div style="font-size:8pt;color:#9ca3af;text-transform:uppercase">Poids</div>
          <div style="font-weight:bold;font-size:12pt">${parcel.weight ? parcel.weight + ' kg' : '—'}</div>
        </td>
        <td style="width:33%;border-right:1px solid #e5e7eb">
          <div style="font-size:8pt;color:#9ca3af;text-transform:uppercase">Prix</div>
          <div style="font-weight:bold;font-size:12pt;color:#1d4ed8">${parcel.price > 0 ? parcel.price + ' DH' : '—'}</div>
        </td>
        <td style="width:33%">
          <div style="font-size:8pt;color:#9ca3af;text-transform:uppercase">RETOUR FOND</div>
          <div style="font-weight:bold;font-size:12pt;color:${parcel.codAmount > 0 ? '#ea580c' : '#d1d5db'}">${parcel.codAmount > 0 ? parcel.codAmount + ' DH' : '—'}</div>
        </td>
      </tr>
    </table>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #e5e7eb">
      ${barcodeSvgStr}
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;margin-left:8px">
        ${qrSvgStr}
        <div style="font-size:7pt;color:#9ca3af">Suivi en ligne</div>
      </div>
    </div>
    <table style="border-top:1px solid #d1d5db;font-size:8pt;color:#9ca3af">
      <tr>
        <td style="width:50%;border-right:1px solid #e5e7eb">Cachet et Signature expéditeur</td>
        <td style="width:50%">Cachet et Signature destinataire</td>
      </tr>
    </table>
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=700,height=900')
    if (win) { win.document.write(ticketHtml); win.document.close() }
  }

  // ── Driver management ─────────────────────────────────────────────────────

  const handleCreateDriver = async (e: any) => {
    const { driverModal, setDriverModal, profile } = s.current
    e.preventDefault()
    const m = driverModal
    if (!m.name.trim())        { setDriverModal((d: any) => ({ ...d, error: 'Nom complet requis.' })); return }
    if (!m.email.trim())       { setDriverModal((d: any) => ({ ...d, error: 'Email requis.' })); return }
    if (m.password.length < 6) { setDriverModal((d: any) => ({ ...d, error: 'Mot de passe : 6 caractères minimum.' })); return }
    setDriverModal((d: any) => ({ ...d, loading: true, error: '' }))
    try {
      const cred = await createUserWithEmailAndPassword(authSecondary, m.email.trim(), m.password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        name:          m.name.trim(),
        email:         m.email.trim().toLowerCase(),
        role:          'livreur',
        city:          profile?.city || '',
        code:          '',
        tel:           m.tel || '',
        matricule:     m.matricule || '',
        sectorId:      m.sectorId || '',
        chauffeurType: 'livreur',
        directorPermissions: [],
        createdAt:     new Date().toISOString(),
        createdBy:     auth.currentUser?.uid,
        createdByRole: 'chef_agence',
      })
      await fbSignOut(authSecondary)
      setDriverModal(null)
    } catch (err: any) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'Cet email est déjà utilisé.'
        : 'Erreur lors de la création du compte.'
      setDriverModal((d: any) => ({ ...d, loading: false, error: msg }))
    }
  }

  const handleEditDriver = async (e: any) => {
    const { driverModal, setDriverModal } = s.current
    e.preventDefault()
    const m = driverModal
    if (!m.name.trim()) { setDriverModal((d: any) => ({ ...d, error: 'Nom requis.' })); return }
    setDriverModal((d: any) => ({ ...d, loading: true, error: '' }))
    try {
      await updateDoc(doc(db, 'users', m.id), {
        name:      m.name.trim(),
        tel:       m.tel || '',
        matricule: m.matricule || '',
        sectorId:  m.sectorId || '',
      })
      setDriverModal(null)
    } catch {
      setDriverModal((d: any) => ({ ...d, loading: false, error: 'Erreur lors de la modification.' }))
    }
  }

  // ── Scan utilities ────────────────────────────────────────────────────────

  const azertyFix = (str: any) => {
    const map: Record<string, string> = {
      'q':'a','Q':'A','a':'q','A':'Q',
      'z':'w','Z':'W','w':'z','W':'Z',
      ',':'m','?':'M',
      '°':'_',
      '&':'1','é':'2','"':'3',"'":'4','(':'5',
      '-':'6','è':'7','_':'8','ç':'9','à':'0',
      ')':'-',
    }
    return str.split('').map((c: any) => map[c] ?? c).join('')
  }

  const needsAzertyFix = (str: any) => /[éèàùçâêîôû&"'(_)?°,]/.test(str)

  const normalizeScanText = (value: any) =>
    String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[‐‑‒–—−]/g, '-')
      .replace(/\s+/g, '')

  const normalizeScanLoose = (value: any) =>
    normalizeScanText(value)
      .replace(/[OQ]/g, '0')
      .replace(/[IL]/g, '1')

  const findScannedParcel = (query: any) => {
    const { parcels } = s.current
    const q = normalizeScanText(query)
    if (!q) return null
    const visibleParcels = [...parcels]
    const exact = visibleParcels.find((p: any) =>
      normalizeScanText(p.trackingId) === q ||
      normalizeScanText(p.sender?.nic) === q
    )
    if (exact) return exact
    const loose = normalizeScanLoose(q)
    return visibleParcels.find((p: any) =>
      normalizeScanLoose(p.trackingId) === loose ||
      normalizeScanLoose(p.sender?.nic) === loose
    ) || null
  }

  const doScan = (query: any) => {
    const { setScanQuery, setScanResult } = s.current
    const raw   = query.trim()
    if (!raw) return
    const fixed = needsAzertyFix(raw) ? azertyFix(raw) : raw
    const found = findScannedParcel(fixed)
    setScanQuery(fixed)
    setScanResult(found || 'not_found')
  }

  const openScanModal = () => {
    const { setScanQuery, setScanResult, setScanOpen, scanInputRef } = s.current
    setScanQuery('')
    setScanResult(null)
    setScanOpen(true)
    setTimeout(() => scanInputRef.current?.focus(), 80)
  }

  // ── Parcel CRUD ───────────────────────────────────────────────────────────

  const handleSubmit = async (e: any) => {
    const {
      form, setError, setLoading, setCreatedParcel, profile,
      allSectors, drivers, clients, price,
    } = s.current
    e.preventDefault()
    setError('')

    // ⚠️ VALIDATION OBLIGATOIRE - Expéditeur et Destinataire
    const errors: string[] = []

    if (!form.senderName || form.senderName.trim() === '') {
      errors.push('❌ Nom expéditeur')
    }
    if (!form.senderAddress || form.senderAddress.trim() === '') {
      errors.push('❌ Adresse expéditeur')
    }
    if (!form.senderTel || form.senderTel.trim() === '') {
      errors.push('❌ Téléphone expéditeur')
    }

    if (!form.receiverName || form.receiverName.trim() === '') {
      errors.push('❌ Nom destinataire')
    }
    // Adresse obligatoire seulement si aucun livreur/secteur n'est choisi ET que ce n'est pas "En gare"
    if ((!form.deliveryDriverId && !form.deliverySectorId && !form.enGare) && (!form.receiverAddress || form.receiverAddress.trim() === '')) {
      errors.push('❌ Adresse destinataire')
    }
    if (!form.receiverTel || form.receiverTel.trim() === '') {
      errors.push('❌ Téléphone destinataire')
    }

    if (errors.length > 0) {
      setError('⚠️ CHAMPS OBLIGATOIRES MANQUANTS:\n\n' + errors.join('\n'))
      return
    }

    if (form.portType === 'port_en_compte' && !form.clientId) {
      setError('Sélectionnez ou créez un client en compte avant de valider.')
      return
    }
    if (form.shipmentMode === 'client' && !form.clientId) {
      setError('Selectionnez un client existant ou passez en envoi personnel.')
      return
    }
    setLoading(true)
    try {
      if (!auth.currentUser) {
        setError("Session expirée. Veuillez vous reconnecter.")
        setLoading(false)
        return
      }
      if (!profile?.role) {
        setError("Profil utilisateur non chargé. Rechargez la page puis réessayez.")
        setLoading(false)
        return
      }
      const selectedDeliverySector = allSectors.find((sec: any) => sec.id === form.deliverySectorId)
      const selectedDeliveryDriver = drivers.find((d: any) => d.id === form.deliveryDriverId)

      // Sauvegarder les clients de passage localement (si ce ne sont pas des clients Firestore)
      const { saveLocalClient } = await import('../../../utils/localClients')

      // Sauvegarder expéditeur localement si pas de clientId Firestore
      if (!form.clientId && form.senderName && form.senderTel) {
        saveLocalClient({
          name: form.senderName,
          tel: form.senderTel,
          address: form.senderAddress || '',
          city: form.senderCity || '',
        })
      }

      // Sauvegarder destinataire localement
      if (form.receiverName && form.receiverTel) {
        saveLocalClient({
          name: form.receiverName,
          tel: form.receiverTel,
          address: form.receiverAddress || '',
          city: form.receiverCity || '',
        })
      }

      const { createParcel } = await import('../../../firebase/firestore')
      const parcel = await createParcel({
        sender:        { name: form.senderName, nic: form.senderNic, address: form.senderAddress, tel: form.senderTel, city: form.senderCity },
        receiver:      { name: form.receiverName, address: form.receiverAddress, tel: form.receiverTel, city: form.receiverCity },
        weight:        form.weight,
        nbColis:       form.nbColis,
        natureOfGoods: form.natureOfGoods === 'Autres' ? (form.natureOfGoodsCustomPrice || 'Autres') : form.natureOfGoods,
        serviceType:   form.serviceType,
        codAmount:     form.serviceType === 'simple' || form.serviceType === 'retour_bl' ? 0 : (parseFloat(form.codAmount) || 0),
        price,
        portType:        form.portType,
        portPayeMethod:  form.portType === 'port_paye' ? (form.portPayeMethod || '') : '',
        portPayeMontant: form.portType === 'port_paye' ? (parseFloat(form.portPayeMontant) || 0) : 0,
        customerMode:    form.shipmentMode,
        clientId:        form.clientId   || null,
        clientName:      form.clientName || null,
        agentId:         auth.currentUser?.uid,
        agentName:       profile?.name || '',
        deliverySectorId:     selectedDeliverySector?.id || null,
        deliverySectorCode:   selectedDeliverySector?.code || '',
        deliverySectorName:   selectedDeliverySector?.name || '',
        deliveryDriverId:     selectedDeliveryDriver?.id || null,
        deliveryDriverName:   selectedDeliveryDriver?.name || null,
        operationDate:        form.operationDate || null,
        agentRole:            profile?.role || 'agent',
        hasRetourBL:          form.hasRetourBL || false,  // ⭐ Retour BL obligatoire
        enGare:               form.enGare || false,       // 🚉 Livraison en gare
      })

      // Créer automatiquement un compte portail pour les particuliers
      if (!form.clientId && form.senderName && form.senderTel) {
        try {
          const result = await createParticularPortalAccount({
            name: form.senderName,
            tel: form.senderTel,
            city: form.senderCity || '',
            address: form.senderAddress || '',
            nic: form.senderNic || ''
          })
          if (result.success && !result.alreadyExists) {
            console.log(`✅ Compte portail créé pour ${form.senderName}: ${result.email} / ${result.password}`)
          }
        } catch (err: any) {
          console.error('❌ Erreur création compte portail particulier:', err)
          // Ne pas bloquer la création du colis si la création du compte échoue
        }
      }

      if (form.autoDebit && form.clientId && (parcel.price as number) > 0) {
        try {
          await addPayment({
            clientId:    form.clientId,
            parcelId:    parcel.trackingId,
            amount:      parcel.price as number,
            type:        'debit',
            invoiced:    true,
            description: `Livraison ${parcel.trackingId} → ${form.receiverCity}`,
            createdBy:   auth.currentUser?.uid,
          })
        } catch (err: any) { console.error('addPayment:', err) }
      }
      if (form.portType === 'port_en_compte' && form.clientId && (parcel.price as number) > 0) {
        try {
          await addPayment({
            clientId:    form.clientId,
            parcelId:    parcel.trackingId,
            amount:      parcel.price as number,
            type:        'debit',
            invoiced:    true,
            description: `Port en compte — ${parcel.trackingId} → ${form.receiverCity}`,
            createdBy:   auth.currentUser?.uid,
          })
        } catch (err: any) { console.error('addPayment port_en_compte:', err) }
      }
      if (parcel.portType === 'port_paye' && (parcel.price as number) > 0) {
        const agentName = profile?.name || 'Agent'
        try {
          await createCaisseEntry({
            type: 'entree', category: 'port_paye',
            amount: parcel.price as number,
            description: `Port payé — ${parcel.trackingId} → ${form.receiverCity}`,
            reference: parcel.trackingId,
            agentId: auth.currentUser?.uid,
            agentName,
            city: profile?.city || form.senderCity || '',
            cashierId: auth.currentUser?.uid, cashierName: agentName,
          })
        } catch (err: any) { console.error('createCaisseEntry port_paye:', err) }
      }
      // Mise à jour client si clientId Firestore existant
      if (form.clientId && form.senderName.trim()) {
        const tel     = form.senderTel.trim()
        const name    = form.senderName.trim()
        const address = form.senderAddress?.trim() || ''
        const nic     = form.senderNic?.trim() || ''
        updateClient(form.clientId, { name, tel, address, nic }).catch(() => {})
      }
      setCreatedParcel(parcel)
    } catch (err: any) {
      console.error('handleSubmit error:', err)
      setError(err?.code === 'permission-denied'
        ? "Permission refusée par Firestore. Vérifiez que les règles sont déployées et que votre compte possède le rôle agent, chef_agence ou aide_agent."
        : (err?.message || "Erreur lors de l'enregistrement. Réessayez."))
    } finally {
      setLoading(false)
    }
  }

  const openEditModal = (parcel: any) => {
    const { setEditingParcel, setEditForm, setEditError } = s.current
    setEditingParcel(parcel)
    setEditForm({
      senderName:    parcel.sender?.name    || '',
      senderNic:     parcel.sender?.nic     || '',
      senderAddress: parcel.sender?.address || '',
      senderTel:     parcel.sender?.tel     || '',
      senderCity:    parcel.sender?.city    || '',
      receiverName:    parcel.receiver?.name    || '',
      receiverAddress: parcel.receiver?.address || '',
      receiverTel:     parcel.receiver?.tel     || '',
      receiverCity:    parcel.receiver?.city    || '',
      weight:          parcel.weight            ?? '',
      nbColis:         parcel.nbColis           ?? 1,
      natureOfGoods:   ['Palette','Colis','Bagages','Autres'].includes(parcel.natureOfGoods) ? parcel.natureOfGoods : (parcel.natureOfGoods ? 'Autres' : ''),
      natureOfGoodsCustom: ['Palette','Colis','Bagages','Autres'].includes(parcel.natureOfGoods) ? '' : (parcel.natureOfGoods || ''),
      codAmount:       parcel.codAmount         ?? 0,
      price:           parcel.price             ?? '',
      serviceType:     parcel.serviceType       || 'oc',
      status:          parcel.status            || 'Initialisé',
      note:            '',
    })
    setEditError('')
  }

  const handleEditClick = (parcel: any) => {
    openEditModal(parcel)
  }

  const handleDeleteClick = (parcel: any) => {
    console.log('🗑️ handleDeleteClick appelé', { parcel })
    const { canEditParcelDetails, setDeleteConfirm } = s.current
    console.log('🔍 canEditParcelDetails:', canEditParcelDetails)
    console.log('🔍 setDeleteConfirm:', setDeleteConfirm)

    if (canEditParcelDetails(parcel)) {
      console.log('✅ Autorisation OK - ouverture modal')
      setDeleteConfirm(parcel)
    } else {
      console.log('❌ Pas autorisé')
      window.alert('Lecture seule : seul le createur de ce bon peut le supprimer.')
    }
  }

  const confirmDelete = async (parcel: any) => {
    const { setDeleteConfirm } = s.current
    await deleteParcel(parcel.id)
    setDeleteConfirm(null)
  }

  const handleCodeVerify = async () => {
    const { codeModal, setCodeModal } = s.current
    const { parcel, action, code } = codeModal
    if (!code.trim()) { setCodeModal((m: any) => ({ ...m, error: 'Entrez le code.' })); return }
    const agentCode = await getAgentCode(parcel.agentId)
    if (agentCode === null || code.trim() === String(agentCode)) {
      setCodeModal({ open: false, parcel: null, action: 'edit', code: '', error: '' })
      if (action === 'edit')   openEditModal(parcel)
      if (action === 'delete') { const { setDeleteConfirm } = s.current; setDeleteConfirm(parcel) }
    } else {
      setCodeModal((m: any) => ({ ...m, error: 'Code incorrect.' }))
    }
  }

  const handleEditSave = async () => {
    const { editForm, editingParcel, setEditLoading, setEditError, setEditingParcel, setParcels, profile } = s.current
    const statusChanging = editForm.status !== editingParcel.status
    const isReturning    = statusChanging && editForm.status === 'Retourné'
    const canManageStatus = (parcel: any) => {
      if (!profile?.city) return true
      const dest = parcel.destinationCity || parcel.receiver?.city
      return !dest || profile.city === dest
    }

    setEditLoading(true)
    setEditError('')
    try {
      if (isReturning) {
        await markParcelAsReturned(
          editingParcel,
          editForm.note ? { note: editForm.note } : {}
        )
      } else {
        const oldSender   = editingParcel.sender   || {}
        const oldReceiver = editingParcel.receiver || {}
        const nextSender = {
          name:    editForm.senderName,
          nic:     editForm.senderNic || '',
          address: editForm.senderAddress || '',
          tel:     editForm.senderTel,
          city:    editForm.senderCity,
        }
        const nextReceiver = {
          name:    editForm.receiverName,
          address: editForm.receiverAddress || '',
          tel:     editForm.receiverTel,
          city:    editForm.receiverCity,
        }
        const nextWeight         = parsePositiveNumber(editForm.weight)
        const nextNbColis        = parseInt(editForm.nbColis) || 1
        const nextNature         = editForm.natureOfGoods === 'Autres'
          ? (editForm.natureOfGoodsCustom || 'Autres')
          : (editForm.natureOfGoods || '')
        const nextServiceType    = editForm.serviceType || 'oc'
        const nextPrice          = parsePositiveNumber(editForm.price)
        const nextDestinationCity = editForm.receiverCity || editingParcel.destinationCity
        const detailsPatch: any  = {}
        const changedText = (a: any, b: any) => String(a ?? '') !== String(b ?? '')

        if (
          changedText(oldSender.name, nextSender.name) ||
          changedText(oldSender.nic, nextSender.nic) ||
          changedText(oldSender.address, nextSender.address) ||
          changedText(oldSender.tel, nextSender.tel) ||
          changedText(oldSender.city, nextSender.city)
        ) { detailsPatch.sender = nextSender }
        if (
          changedText(oldReceiver.name, nextReceiver.name) ||
          changedText(oldReceiver.address, nextReceiver.address) ||
          changedText(oldReceiver.tel, nextReceiver.tel) ||
          changedText(oldReceiver.city, nextReceiver.city)
        ) { detailsPatch.receiver = nextReceiver }
        if (Number(editingParcel.weight || 0)   !== nextWeight)    detailsPatch.weight = nextWeight
        if (Number(editingParcel.nbColis || 1)  !== nextNbColis)   detailsPatch.nbColis = nextNbColis
        if (changedText(editingParcel.natureOfGoods, nextNature))   detailsPatch.natureOfGoods = nextNature
        if (changedText(editingParcel.serviceType || 'oc', nextServiceType)) detailsPatch.serviceType = nextServiceType
        if (Number(editingParcel.price || 0)     !== nextPrice)     detailsPatch.price = nextPrice
        if (changedText(editingParcel.destinationCity, nextDestinationCity)) detailsPatch.destinationCity = nextDestinationCity

        if ((editingParcel.status === 'Livré' || editingParcel.status === 'Livré') && (Object.keys(detailsPatch).length > 0 || (statusChanging && editForm.status !== editingParcel.status))) {
          throw new Error('Colis deja livre : toute modification doit passer par une demande au chef d agence ou a l admin.')
        }

        if (Object.keys(detailsPatch).length > 0) {
          await updateParcel(editingParcel.id, detailsPatch)
          setParcels((prev: any) => prev.map((p: any) => p.id === editingParcel.id ? { ...p, ...detailsPatch } : p))
        }
        if (statusChanging && canManageStatus(editingParcel)) {
          await updateParcelStatus(
            editingParcel.id,
            editForm.status,
            editForm.note ? { note: editForm.note } : {}
          )
        }
      }
      setEditingParcel(null)
    } catch (e: any) {
      setEditError(`Erreur : ${e?.message || e}`)
    } finally {
      setEditLoading(false)
    }
  }

  const handleCreateReturnParcel = async () => {
    const { returnParcelModal, setReturnParcelModal, profile } = s.current
    if (!returnParcelModal?.parcel) return
    setReturnParcelModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const result = await createReturnParcel(
        returnParcelModal.parcel,
        auth.currentUser?.uid,
        profile?.name || profile?.email || 'Agent'
      )
      setReturnParcelModal((m: any) => ({ ...m, loading: false, result }))
    } catch {
      setReturnParcelModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la création du colis retour.' }))
    }
  }

  const handleReturnDirect = (parcel: any) => {
    const { setReturnReasonModal } = s.current
    setReturnReasonModal({ parcel, reason: '', customReason: '', loading: false })
  }

  const submitReturnWithReason = async () => {
    const { returnReasonModal, setReturnReasonModal, setReturningParcelId } = s.current
    if (!returnReasonModal?.parcel) return
    const note = returnReasonModal.reason === 'Autre raison'
      ? (returnReasonModal.customReason.trim() || 'Autre raison')
      : returnReasonModal.reason
    if (!note) { alert('Veuillez choisir une raison de retour.'); return }
    setReturnReasonModal((m: any) => ({ ...m, loading: true }))
    setReturningParcelId(returnReasonModal.parcel.id)
    try {
      console.log('🔥 TENTATIVE RETOUR:', {
        parcelId: returnReasonModal.parcel.id,
        trackingId: returnReasonModal.parcel.trackingId,
        currentStatus: returnReasonModal.parcel.status,
        note
      })
      await markParcelAsReturned(returnReasonModal.parcel, { note })
      console.log('✅ RETOUR RÉUSSI!')
      setReturnReasonModal(null)
    } catch (e: any) {
      console.error('❌ ERREUR RETOUR:', e)
      alert(`Erreur : ${e?.message || e}`)
      setReturnReasonModal((m: any) => ({ ...m, loading: false }))
    } finally {
      setReturningParcelId(null)
    }
  }

  // ── Aide agent parcel validation ──────────────────────────────────────────

  const handleValidateParcelEntry = async (parcel: any) => {
    const { profile, aideAgents, setValidatingEntryId } = s.current
    const originCity    = parcel.originCity || parcel.sender?.city || ''
    const aideCreator   = aideAgents.find((a: any) => a.id === (parcel.aideAgentId || parcel.agentId))
    const isSameAgencyEntry = originCity === profile?.city || aideCreator?.city === profile?.city
    if (!['chef_agence', 'admin'].includes(profile?.role) || !profile?.city || !isSameAgencyEntry) {
      alert("Vous pouvez valider uniquement les saisies de votre agence.")
      return
    }
    if (!['aide_agent', 'client_portal'].includes(parcel.agentRole) || parcel.validatedByChef !== false) {
      alert("Cette saisie n'est plus en attente de validation.")
      return
    }
    if (!window.confirm(`Valider la saisie de ce colis ?\n${parcel.trackingId}\nCette action est irréversible.`)) return
    const chefId = auth.currentUser?.uid
    if (!chefId) {
      alert('Session expirée. Reconnectez-vous puis réessayez.')
      return
    }
    setValidatingEntryId(parcel.id)
    try {
      await validateParcelEntry(parcel.id, chefId, profile?.name || profile?.email || 'Chef')
    } catch (e: any) {
      const details = {
        code: e?.code || '',
        message: e?.message || String(e),
        error: e,
        parcelId: parcel.id,
        trackingId: parcel.trackingId,
        agentId: parcel.agentId,
        agentRole: parcel.agentRole,
        validatedByChef: parcel.validatedByChef,
        originCity: parcel.originCity,
        senderCity: parcel.sender?.city,
        chefCity: profile?.city,
        chefRole: profile?.role,
        chefId,
      }
      console.error('handleValidateParcelEntry:', details)
      console.error('handleValidateParcelEntry JSON:', JSON.stringify(details, null, 2))
      alert(`Erreur validation : ${details.code || 'error'}\n${details.message}`)
    } finally {
      setValidatingEntryId(null)
    }
  }

  const handleBulkValidateAideEntries = async (candidateParcels: any) => {
    const { selectedAideEntryIds, setSelectedAideEntryIds, setBulkAideValidationError, setBulkAideValidating, profile, aideAgents } = s.current
    const selected = candidateParcels.filter((p: any) => selectedAideEntryIds.includes(p.id))
    if (selected.length === 0) {
      setBulkAideValidationError('Sélectionnez au moins une saisie.')
      return
    }
    if (!window.confirm(`Valider ${selected.length} saisie(s) ?\nCette action est irréversible.`)) return

    const chefId = auth.currentUser?.uid
    if (!chefId) {
      setBulkAideValidationError('Session expirée. Reconnectez-vous puis réessayez.')
      return
    }

    setBulkAideValidationError('')
    setBulkAideValidating(true)
    try {
      for (const parcel of selected) {
        const originCity    = parcel.originCity || parcel.sender?.city || ''
        const aideCreator   = aideAgents.find((a: any) => a.id === (parcel.aideAgentId || parcel.agentId))
        const isSameAgencyEntry = originCity === profile?.city || aideCreator?.city === profile?.city
        if (!isSameAgencyEntry || !['aide_agent', 'client_portal'].includes(parcel.agentRole) || parcel.validatedByChef !== false) continue
        await validateParcelEntry(parcel.id, chefId, profile?.name || profile?.email || 'Chef')
      }
      setSelectedAideEntryIds((ids: any) => ids.filter((id: any) => !selected.some((p: any) => p.id === id)))
    } catch (e: any) {
      console.error('handleBulkValidateAideEntries:', e)
      setBulkAideValidationError(e?.message || 'Erreur lors de la validation groupée.')
    } finally {
      setBulkAideValidating(false)
    }
  }

  // ── Modification requests ─────────────────────────────────────────────────

  const handleResolveModification = async (id: any, status: any) => {
    const { agentNotes, setAgentNotes, profile } = s.current
    const note = (agentNotes[id] || '').trim()
    try {
      await resolveModificationRequest(id, status, profile?.name || profile?.email || 'Chef agence', note)
      setAgentNotes((prev: any) => { const n = { ...prev }; delete n[id]; return n })
    } catch (e: any) {
      alert(`Erreur : ${e?.message || e}`)
    }
  }

  const handleDeleteMod = async (id: any) => {
    if (!window.confirm('Supprimer cette demande ?')) return
    try { await deleteModificationRequest(id) } catch (e: any) { alert(e?.message || 'Erreur') }
  }

  const handleToggleAideParcelAccess = async (parcel: any) => {
    const { isChefAgencyAideParcel, setTogglingAideAccessId, profile } = s.current
    if (!isChefAgencyAideParcel(parcel)) {
      alert("Vous pouvez gérer uniquement les saisies aide agent de votre agence.")
      return
    }
    if (parcel.agentRole !== 'aide_agent' || parcel.validatedByChef !== true) {
      alert("Cette saisie doit d'abord être validée avant de gérer son accès.")
      return
    }

    const nextUnlocked = parcel.aideEditUnlocked !== true
    const action = nextUnlocked ? 'déverrouiller' : 'verrouiller'
    if (!window.confirm(`Voulez-vous ${action} l'accès de l'aide agent à cette saisie ?\n${parcel.trackingId}`)) return

    const chefId = auth.currentUser?.uid
    if (!chefId) {
      alert('Session expirée. Reconnectez-vous puis réessayez.')
      return
    }

    setTogglingAideAccessId(parcel.id)
    try {
      await updateParcel(parcel.id, {
        aideEditUnlocked:         nextUnlocked,
        aideEditLockChangedAt:    new Date().toISOString(),
        aideEditLockChangedBy:    chefId,
        aideEditLockChangedByName: profile?.name || profile?.email || 'Chef',
      })
    } catch (e: any) {
      console.error('handleToggleAideParcelAccess:', e)
      alert(`Erreur accès aide agent : ${e?.message || e}`)
    } finally {
      setTogglingAideAccessId(null)
    }
  }

  // ── Aide agent account management ─────────────────────────────────────────

  const handleCreateAideAgent = async () => {
    const { aideForm, setAideLoading, setAideError, setCreateAideModal, setAideForm, profile } = s.current
    if (!aideForm.name.trim() || !aideForm.email.trim() || !aideForm.password.trim()) {
      setAideError('Nom, email et mot de passe sont obligatoires.')
      return
    }
    setAideLoading(true)
    setAideError('')
    try {
      const cred = await createUserWithEmailAndPassword(authSecondary, aideForm.email.trim(), aideForm.password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        name:      aideForm.name.trim(),
        email:     aideForm.email.trim(),
        tel:       aideForm.tel.trim() || '',
        role:      'aide_agent',
        city:      profile?.city || '',
        blocked:   false,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid,
      })
      await fbSignOut(authSecondary)
      setCreateAideModal(false)
      setAideForm({ name: '', email: '', password: '', tel: '' })
    } catch (e: any) {
      setAideError(e?.message || 'Erreur lors de la création.')
    } finally {
      setAideLoading(false)
    }
  }

  const handleCreatePointeur = async () => {
    const { pointeurForm, setPointeurLoading, setPointeurError, setCreatePointeurModal, setPointeurForm, profile } = s.current
    if (!pointeurForm.name.trim() || !pointeurForm.email.trim() || !pointeurForm.password.trim()) {
      setPointeurError('Nom, email et mot de passe sont obligatoires.')
      return
    }
    setPointeurLoading(true)
    setPointeurError('')
    try {
      const cred = await createUserWithEmailAndPassword(authSecondary, pointeurForm.email.trim(), pointeurForm.password)
      await setDoc(doc(db, 'users', cred.user.uid), {
        name:      pointeurForm.name.trim(),
        email:     pointeurForm.email.trim(),
        tel:       pointeurForm.tel.trim() || '',
        role:      'pointeur_encaisseur',
        city:      profile?.city || '',
        blocked:   false,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser?.uid,
      })
      await fbSignOut(authSecondary)
      setCreatePointeurModal(false)
      setPointeurForm({ name: '', email: '', password: '', tel: '' })
    } catch (e: any) {
      setPointeurError(e?.message || 'Erreur lors de la création.')
    } finally {
      setPointeurLoading(false)
    }
  }

  const handleValiderRapport = async (rapport: any) => {
    const { profile, rapportNotesMap, setRapportNotesMap, setRapportError, setRapportValidating } = s.current
    const { validerRapport } = await import('../../../firebase/firestore')
    const chefId   = auth.currentUser?.uid
    const chefName = profile?.name || ''
    const notes    = rapportNotesMap[rapport.id] || ''
    setRapportError('')
    setRapportValidating(rapport.id + '_valider')
    try {
      await validerRapport(rapport.id, chefId, chefName, notes)
      setRapportValidating(null)
      setRapportNotesMap((m: any) => { const n = { ...m }; delete n[rapport.id]; return n })
    } catch (err: any) {
      setRapportValidating(null)
      setRapportError(err?.message || 'Erreur lors de la validation du rapport.')
    }
  }

  const handleRejeterRapport = async (rapport: any) => {
    const { profile, rapportNotesMap, setRapportNotesMap, setRapportValidating } = s.current
    const { rejeterRapport } = await import('../../../firebase/firestore')
    const chefId   = auth.currentUser?.uid
    const chefName = profile?.name || ''
    const notes    = rapportNotesMap[rapport.id] || ''
    setRapportValidating(rapport.id + '_rejeter')
    try {
      await rejeterRapport(rapport.id, chefId, chefName, notes)
      setRapportValidating(null)
      setRapportNotesMap((m: any) => { const n = { ...m }; delete n[rapport.id]; return n })
    } catch {
      setRapportValidating(null)
    }
  }

  const handleToggleBlockAide = async (aide: any) => {
    const action = aide.blocked ? 'débloquer' : 'bloquer'
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${aide.name} ?`)) return
    await updateDoc(doc(db, 'users', aide.id), { blocked: !aide.blocked })
  }

  const handleDeleteAideAgent = async (aide: any) => {
    if (!window.confirm(`Supprimer définitivement ${aide.name} ?\nSes colis non validés resteront dans le système.`)) return
    await deleteDoc(doc(db, 'users', aide.id))
  }

  // ── Arrivage handlers ─────────────────────────────────────────────────────

  const handleConfirmArrivage = async () => {
    const {
      profile,
      setArrivageConfirming, setArrivageError, setArrivageSuccess,
      setArrivageNotes, setArrivageScan, setColisWithoutBon,
      arrArrivedParcels, arrMissingParcels, arrMissingColisDetail,
      arrComputedType, arrivageNotes,
      colisWithoutBon,
      arrArrived, arrNbColis,
      arrTotalArrived, arrTotalExpected, arrTotalMissing,
    } = s.current
    setArrivageConfirming(true)
    setArrivageError('')
    try {
      const arrivedColisDetail = arrArrivedParcels.map((p: any) => ({
        parcelId:     p.id,
        trackingId:   p.trackingId   || '',
        senderNic:    p.senderNic    || p.sender?.nic || '',
        nexp:         p.senderNic    || p.sender?.nic || '',
        senderName:   p.sender?.name   || '',
        receiverName: p.receiver?.name || '',
        arrived: arrArrived(p),
        total:   arrNbColis(p),
      }))
      const missingParcelIds = arrMissingParcels.map((p: any) => p.id)
      const cwb = colisWithoutBon.map(({ id: _id, ...rest }: any) => rest)
      const result = await createArrivage({
        city:               profile.city,
        arrivedColisDetail,
        missingParcelIds,
        missingColisDetail: arrMissingColisDetail,
        colisWithoutBon:    cwb,
        type:               arrComputedType,
        notes:              arrivageNotes.trim(),
        agentId:            auth.currentUser?.uid,
        agentName:          profile.name || profile.email || 'Agent',
      })
      setArrivageSuccess({
        arrivageRef:          result.arrivageRef,
        arrivedCount:         arrArrivedParcels.length,
        missingCount:         arrMissingParcels.length,
        colisWithoutBonCount: cwb.length,
        totalArrived:         arrTotalArrived,
        totalExpected:        arrTotalExpected,
        totalMissing:         arrTotalMissing,
      })
      setArrivageNotes('')
      setArrivageScan('')
      setColisWithoutBon([])
    } catch {
      setArrivageError("Erreur lors de la confirmation de l'arrivage.")
    } finally {
      setArrivageConfirming(false)
    }
  }

  // ── Historique pointage handlers ──────────────────────────────────────────

  const histGetEdit = (id: any) => s.current.histPointEdits[id] || null

  const histInitEdit = (arr: any) => {
    const { histPointEdits, setHistPointEdits, transitParcels } = s.current
    if (histPointEdits[arr.id]) return
    const arrivedIds      = new Set(arr.arrivedParcelIds || [])
    const existMissingIds = new Set((arr.missingColisDetail || []).map((d: any) => d.parcelId).filter(Boolean))
    const extraMissing = arr.type === 'auto'
      ? transitParcels
          .filter((p: any) => !arrivedIds.has(p.id) && !existMissingIds.has(p.id))
          .map((p: any) => ({
            parcelId:    p.id, trackingId: p.trackingId || '',
            senderNic:   p.senderNic || p.sender?.nic || '',
            nexp:        p.senderNic || p.sender?.nic || '',
            senderName:  p.sender?.name || '', receiverName: p.receiver?.name || '',
            weight:      p.weight || 0, nbColis: p.nbColis || 1,
            serviceType: p.serviceType || '', originCity: p.originCity || '',
            chauffeurName: p.chauffeurName || '', codAmount: p.codAmount || 0,
            total: p.nbColis || 1,
          }))
      : []
    setHistPointEdits((prev: any) => ({
      ...prev,
      [arr.id]: {
        arrived: (arr.arrivedColisDetail || []).map((d: any) => ({ ...d })),
        missing: [...(arr.missingColisDetail || []).map((d: any) => ({ ...d })), ...extraMissing],
        dirty:   false,
      },
    }))
  }

  const histPatch = (arrivageId: any, fn: any) => {
    const { setHistPointEdits } = s.current
    setHistPointEdits((prev: any) => {
      const cur = prev[arrivageId]
      if (!cur) return prev
      return { ...prev, [arrivageId]: { ...cur, arrived: fn(cur.arrived), dirty: true } }
    })
  }

  const histTogglePointed = (arrivageId: any, parcelId: any) =>
    histPatch(arrivageId, (arr: any) => arr.map((d: any) => d.parcelId === parcelId ? { ...d, pointed: !d.pointed } : d))

  const histSetBoxes = (arrivageId: any, parcelId: any, val: any) =>
    histPatch(arrivageId, (arr: any) =>
      arr.map((d: any) => d.parcelId === parcelId
        ? { ...d, arrived: Math.max(0, Math.min(d.total || d.nbColis || 1, val)), pointed: val > 0 }
        : d
      )
    )

  const histRemoveFromArrived = (arrivageId: any, parcelId: any) => {
    const { setHistPointEdits } = s.current
    setHistPointEdits((prev: any) => {
      const cur = prev[arrivageId]; if (!cur) return prev
      const removed = cur.arrived.find((d: any) => d.parcelId === parcelId)
      return { ...prev, [arrivageId]: {
        ...cur,
        arrived: cur.arrived.filter((d: any) => d.parcelId !== parcelId),
        missing: removed ? [...cur.missing, { ...removed, arrived: 0 }] : cur.missing,
        dirty: true,
      }}
    })
  }

  const histRecoverMissing = (arrivageId: any, parcelId: any) => {
    const { setHistPointEdits } = s.current
    setHistPointEdits((prev: any) => {
      const cur = prev[arrivageId]; if (!cur) return prev
      const found = cur.missing.find((d: any) => d.parcelId === parcelId); if (!found) return prev
      const total = found.total || found.nbColis || 1
      return { ...prev, [arrivageId]: {
        ...cur,
        missing: cur.missing.filter((d: any) => d.parcelId !== parcelId),
        arrived: [...cur.arrived, { ...found, arrived: total, total, pointed: true }],
        dirty: true,
      }}
    })
  }

  const histSearchParcel = async () => {
    const { histSearchQ, setHistSearching, setHistSearchErr, setHistSearchRes } = s.current
    if (!histSearchQ.trim()) return
    setHistSearching(true); setHistSearchErr(''); setHistSearchRes(null)
    try {
      const p = await searchParcelByTrackingId(histSearchQ.trim().toUpperCase())
      if (!p) { setHistSearchErr('Colis introuvable.'); return }
      setHistSearchRes(p)
    } catch {
      setHistSearchErr('Erreur de recherche.')
    } finally {
      setHistSearching(false)
    }
  }

  const histAddSearchResult = (arrivageId: any) => {
    const { histSearchRes, setHistSearchQ, setHistSearchRes, setHistSearchErr } = s.current
    if (!histSearchRes) return
    const p     = histSearchRes
    const total = p.nbColis || 1
    const entry = {
      parcelId:    p.id, trackingId: p.trackingId || '',
      senderName:  p.sender?.name || '', receiverName: p.receiver?.name || '',
      weight:      p.weight || 0, nbColis: total,
      serviceType: p.serviceType || '', originCity: p.originCity || '',
      chauffeurName: p.chauffeurName || '', codAmount: p.codAmount || 0,
      arrived: total, total, pointed: true, addedDuringPointage: true,
    }
    histPatch(arrivageId, (arr: any) => arr.some((d: any) => d.parcelId === p.id) ? arr : [...arr, entry])
    setHistSearchQ(''); setHistSearchRes(null); setHistSearchErr('')
  }

  const histSavePointage = async (arrivageId: any, arr: any, markDone: any) => {
    const { histPointEdits, setHistSaving, setHistPointErr, setHistPointEdits, profile } = s.current
    const edit = histPointEdits[arrivageId]; if (!edit) return
    setHistSaving((prev: any) => ({ ...prev, [arrivageId]: true }))
    setHistPointErr((prev: any) => ({ ...prev, [arrivageId]: '' }))
    try {
      await saveArrivagePointage(arrivageId, {
        arrivedColisDetail: edit.arrived,
        missingColisDetail: edit.missing,
        missingParcelIds:   edit.missing.map((d: any) => d.parcelId).filter(Boolean),
        arrivageRef:        arr.arrivageRef,
        markDone,
        pointedById: auth.currentUser?.uid,
        pointedBy:   profile?.name || profile?.email || 'Agent',
      })
      setHistPointEdits((prev: any) => ({ ...prev, [arrivageId]: { ...prev[arrivageId], dirty: false } }))
    } catch (error: any) {
      console.error('❌ Erreur sauvegarde historique pointage:', error)
      const errorMsg = error?.message || error?.toString() || 'Erreur inconnue'
      setHistPointErr((prev: any) => ({ ...prev, [arrivageId]: `Erreur: ${errorMsg}` }))
    } finally {
      setHistSaving((prev: any) => ({ ...prev, [arrivageId]: false }))
    }
  }

  // ── Return all handlers ───────────────────────────────────────────────────

  return {
    // Transport / Assignment
    handleAssignTransport,
    handleBulkLoadTransport,
    handleAssignDelivery,
    handleChefPointParcel,
    // COD Collect
    handleAgentCollectCod,
    handleAgentCollectPort,
    // Caisse
    handleDirectCashierTransfer,
    handleRequestCashRecovery,
    handleAdminTransfer,
    handleDeleteAgentOperations,
    handleDeleteCashierHistory,
    // COD
    patchAllCod,
    handleRemitCod,
    handleSettleCod,
    handleLoadAllCod,
    handleReplyCodRequest,
    handleSettleCodFromRequest,
    handleBatchSettle,
    findSourceReglementForParcel,
    openReceiveModal,
    getCentralDepositEligibleCods,
    handleCentralCodDeposit,
    handleReceptionCod,
    handleReceiveCodFromDriver,
    handleConfirmDriverVersement,
    handleReceivePortDuEspeces,
    handleMarkSentToSource,
    handleSendSelectedCodReglements,  // ⭐ Envoyer règlements COD pointés
    handleValidateCodReport,  // ⭐ Valider rapport pointeur
    handleSendCodToSource,  // ⭐ Envoyer COD à agence source (avec/sans validation)
    handleBankDeposit,
    handleConfirmReceived,
    // Clients
    handleCreateInlineClient,
    handleAgentCreateClient,
    // Print
    handlePrint,
    handlePrintCharge,
    handlePrintTable,
    handlePrintBonRamassage,
    handlePrintTicket,
    // Drivers
    handleCreateDriver,
    handleEditDriver,
    // Scan
    azertyFix,
    needsAzertyFix,
    normalizeScanText,
    normalizeScanLoose,
    findScannedParcel,
    doScan,
    openScanModal,
    // Parcel CRUD
    handleSubmit,
    openEditModal,
    handleEditClick,
    handleDeleteClick,
    confirmDelete,
    handleCodeVerify,
    handleEditSave,
    handleCreateReturnParcel,
    handleReturnDirect,
    submitReturnWithReason,
    // Aide agent validation
    handleValidateParcelEntry,
    handleBulkValidateAideEntries,
    // Modification requests
    handleResolveModification,
    handleDeleteMod,
    handleToggleAideParcelAccess,
    // Aide agent accounts
    handleCreateAideAgent,
    handleCreatePointeur,
    handleValiderRapport,
    handleRejeterRapport,
    handleToggleBlockAide,
    handleDeleteAideAgent,
    // Arrivage
    handleConfirmArrivage,
    // Historique pointage
    histGetEdit,
    histInitEdit,
    histPatch,
    histTogglePointed,
    histSetBoxes,
    histRemoveFromArrived,
    histRecoverMissing,
    histSearchParcel,
    histAddSearchResult,
    histSavePointage,
  }
}
