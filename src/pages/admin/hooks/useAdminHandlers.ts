import React from 'react'
import { createUserWithEmailAndPassword, signOut as fbSignOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import { collection, doc, setDoc } from 'firebase/firestore'
import { auth, authSecondary, db } from '../../../firebase/config'
import {
  updateParcel, updateParcelStatus, markParcelAsReturned,
  remitCod, settleCodToSender, batchSettleCods,
  updateUser, deleteUserDoc,
  addDriverPortDuTransaction, deleteDriverPortDuTransaction, updateDriverPortDuTransaction,
  confirmDriverVersement,
  createCaisseEntry,
  createReturnParcel,
  createCaisseRequest, completeRhSalaryCaisseRequest,
} from '../../../firebase/firestore'
import { createParcel } from '../../../firebase/parcels'
import {
  createAgentCodRequest, addAgentCodRequestReply,
} from '../../../firebase/agentCodRequests'
import {
  createClient, updateClient,
  addClientMessageReply, deleteClientMessage,
} from '../../../firebase/clients'
import { deleteBankDeposit } from '../../../firebase/bankDeposits'
import { saveTariffConfig } from '../../../firebase/tariffs'
import {
  updateGlobalSiteLock, updateAgencyLock,
} from '../../../firebase/operationLocks'
import {
  DEFAULT_TARIFF_CONFIG, normalizeTariffConfig,
} from '../../../firebase/constants'

// ── Module-level helpers ──────────────────────────────────────────────────────

export const parsePositiveNumber = (value: any, fallback = 0) => {
  const num = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) && num >= 0 ? num : fallback
}

export const csvEscape = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`

export const currentSalaryMonth = () => new Date().toISOString().slice(0, 7)

export const salaryMonthLabel = (month: any) =>
  month
    ? new Date(`${month}-01T00:00:00`).toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' })
    : 'Mois non précisé'

export const downloadCsv = (name: any, rows: any) => {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row: any) => headers.map((h: any) => csvEscape(row[h])).join(',')),
  ].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const downloadJson = (name: any, data: any) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const copyText = async (text: any) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return true
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.left = '-9999px'
  area.style.top = '0'
  document.body.appendChild(area)
  area.focus()
  area.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(area)
  return ok
}

// ─────────────────────────────────────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminHandlers(s: React.MutableRefObject<Record<string, any>>) {

  const handleDeleteBankDeposit = async (id: any) => {
    const { setBankDeleteConfirm } = s.current
    try { await deleteBankDeposit(id) }
    catch (e: any) { alert('Erreur: ' + e.message) }
    finally { setBankDeleteConfirm(null) }
  }

  const openAdminEdit = (parcel: any) => {
    const { setAdminEditModal } = s.current
    setAdminEditModal({
      parcel,
      form: {
        status:        parcel.status         || 'Initialisé',
        serviceType:   parcel.serviceType    || 'simple',
        senderName:    parcel.sender?.name   || '',
        senderTel:     parcel.sender?.tel    || '',
        senderCity:    parcel.sender?.city   || '',
        receiverName:  parcel.receiver?.name || '',
        receiverTel:   parcel.receiver?.tel  || '',
        receiverCity:  parcel.receiver?.city || '',
        originCity:    parcel.originCity     || '',
        destinationCity: parcel.destinationCity || '',
        weight:        String(parcel.weight  ?? ''),
        nbColis:       String(parcel.nbColis ?? '1'),
        natureOfGoods: parcel.natureOfGoods  || '',
        price:         String(parcel.price   ?? ''),
        portType:      parcel.portType       || '',
        codAmount:     String(parcel.codAmount ?? '0'),
        codStatus:     parcel.codStatus      || 'pending',
        codSentToSource:     !!parcel.codSentToSource,
        codReceivedBySource: !!parcel.codReceivedBySource,
        codSenderPaid:       !!parcel.codSenderPaid,
        returnReason:  parcel.returnReason   || '',
      },
      loading: false,
      error:   '',
    })
  }

  const handleAdminEditSave = async () => {
    const { adminEditModal, setAdminEditModal } = s.current
    if (!adminEditModal) return
    const { parcel, form } = adminEditModal
    const adminEmail = auth.currentUser?.email || 'Admin'
    const now = new Date().toISOString()
    setAdminEditModal((m: any) => ({ ...m, loading: true, error: '' }))

    try {
      const updates: Record<string, any> = {}
      const changes = [...(parcel.adminChanges || [])]

      const track = (fieldLabel: any, oldVal: any, newVal: any, updateKey: any, finalVal: any) => {
        // Normaliser les valeurs vides (null, undefined, '') pour comparaison
        const normalize = (val: any) => (val === null || val === undefined || val === '') ? '' : String(val)
        const oldNorm = normalize(oldVal)
        const newNorm = normalize(newVal)

        if (oldNorm !== newNorm) {
          // Ne pas ajouter undefined - utiliser la valeur finale ou nouvelle
          const valueToUpdate = finalVal !== undefined ? finalVal : newVal
          if (valueToUpdate !== undefined) {
            updates[updateKey] = valueToUpdate
          }
          changes.push({
            field: fieldLabel,
            oldValue: oldNorm,
            newValue: newNorm,
            changedAt: now,
            changedBy: adminEmail
          })
        }
      }

      // Statut & type
      track('Statut',       parcel.status,       form.status,       'status',       form.status)
      track('Type service', parcel.serviceType,   form.serviceType,  'serviceType',  form.serviceType)

      // Expéditeur
      const oldSender = parcel.sender || {}
      if (form.senderName !== (oldSender.name||'') || form.senderTel !== (oldSender.tel||'') || form.senderCity !== (oldSender.city||'')) {
        updates.sender = { ...oldSender, name: form.senderName, tel: form.senderTel, city: form.senderCity }
        if (form.senderName !== (oldSender.name||'')) changes.push({ field: 'Expéditeur — Nom',    oldValue: oldSender.name||'', newValue: form.senderName, changedAt: now, changedBy: adminEmail })
        if (form.senderTel  !== (oldSender.tel||''))  changes.push({ field: 'Expéditeur — Tél',    oldValue: oldSender.tel||'',  newValue: form.senderTel,  changedAt: now, changedBy: adminEmail })
        if (form.senderCity !== (oldSender.city||'')) changes.push({ field: 'Expéditeur — Ville',  oldValue: oldSender.city||'', newValue: form.senderCity, changedAt: now, changedBy: adminEmail })
      }

      // Destinataire
      const oldReceiver = parcel.receiver || {}
      if (form.receiverName !== (oldReceiver.name||'') || form.receiverTel !== (oldReceiver.tel||'') || form.receiverCity !== (oldReceiver.city||'')) {
        updates.receiver = { ...oldReceiver, name: form.receiverName, tel: form.receiverTel, city: form.receiverCity }
        if (form.receiverName !== (oldReceiver.name||'')) changes.push({ field: 'Destinataire — Nom',   oldValue: oldReceiver.name||'', newValue: form.receiverName, changedAt: now, changedBy: adminEmail })
        if (form.receiverTel  !== (oldReceiver.tel||''))  changes.push({ field: 'Destinataire — Tél',   oldValue: oldReceiver.tel||'',  newValue: form.receiverTel,  changedAt: now, changedBy: adminEmail })
        if (form.receiverCity !== (oldReceiver.city||'')) changes.push({ field: 'Destinataire — Ville', oldValue: oldReceiver.city||'', newValue: form.receiverCity, changedAt: now, changedBy: adminEmail })
      }

      // Trajet
      track('Ville origine',      parcel.originCity,      form.originCity,      'originCity',      form.originCity)
      track('Ville destination',  parcel.destinationCity, form.destinationCity, 'destinationCity', form.destinationCity)

      // Colis
      track('Poids (kg)',         String(parcel.weight   ?? ''), form.weight,        'weight',        parsePositiveNumber(form.weight))
      track('Nb colis',           String(parcel.nbColis  ?? ''), form.nbColis,       'nbColis',       parseInt(form.nbColis)    || 1)
      track('Nature marchandise', parcel.natureOfGoods   || '',  form.natureOfGoods, 'natureOfGoods', form.natureOfGoods)
      track('Prix (DH)',          String(parcel.price    ?? ''), form.price,         'price',         parsePositiveNumber(form.price))
      track('Type de port',       parcel.portType        || '',  form.portType,      'portType',      form.portType)
      track('RETOUR FOND (DH)',   String(parcel.codAmount ?? ''), form.codAmount,     'codAmount',     parsePositiveNumber(form.codAmount))

      // Pipeline RETOUR FOND
      track('Statut COD',           parcel.codStatus       || 'pending', form.codStatus,           'codStatus',           form.codStatus)
      track('COD envoyé source',    String(!!parcel.codSentToSource),     String(form.codSentToSource),     'codSentToSource',     form.codSentToSource)
      track('COD re?u source',      String(!!parcel.codReceivedBySource), String(form.codReceivedBySource), 'codReceivedBySource', form.codReceivedBySource)
      track('COD réglé expéditeur', String(!!parcel.codSenderPaid),       String(form.codSenderPaid),       'codSenderPaid',       form.codSenderPaid)

      // Motif retour
      track('Motif retour', parcel.returnReason || '', form.returnReason, 'returnReason', form.returnReason)

      if (Object.keys(updates).length === 0) {
        // Aucune modification → Fermer le modal automatiquement
        setAdminEditModal(null)
        return
      }

      // ✅ ADMIN peut modifier le statut même si le colis est livré
      // if ((parcel.status === 'Livré' || parcel.status === 'Livré') && updates.status && updates.status !== parcel.status) {
      //   setAdminEditModal((m: any) => ({ ...m, loading: false, error: 'Colis déjà livré : son statut est verrouillé.' }))
      //   return
      // }

      // Statut → ajout historique si changé
      if (updates.status) {
        await updateParcelStatus(parcel.id, updates.status, { note: `Modifié par Admin (${adminEmail})`, updatedBy: adminEmail })
        delete updates.status
      }

      updates.adminChanges     = changes
      updates.lastAdminEditAt  = now
      updates.lastAdminEditBy  = adminEmail

      // Nettoyer les valeurs undefined (Firestore ne les accepte pas)
      const cleanUpdates: Record<string, any> = {}
      Object.keys(updates).forEach(key => {
        const value = updates[key]
        if (value !== undefined) {
          cleanUpdates[key] = value
        }
      })

      await updateParcel(parcel.id, cleanUpdates)
      setAdminEditModal(null)
    } catch (err: any) {
      setAdminEditModal((m: any) => ({ ...m, loading: false, error: 'Erreur : ' + (err?.message || 'réessayez') }))
    }
  }

  const handleSaveCodAmount = async () => {
    const { codEditModal, setCodEditModal } = s.current
    const amount = parseFloat(codEditModal.value)
    if (isNaN(amount) || amount < 0) { setCodEditModal((m: any) => ({ ...m, error: 'Montant invalide.' })); return }
    setCodEditModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await updateParcel(codEditModal.parcel.id, { codAmount: amount })
      setCodEditModal(null)
    } catch {
      setCodEditModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la mise à jour.' }))
    }
  }

  const handleSaveNic = async () => {
    const { nicEditModal, setNicEditModal } = s.current
    const nic = nicEditModal.value.trim()
    if (!nic) { setNicEditModal((m: any) => ({ ...m, error: 'N° EXP requis.' })); return }
    setNicEditModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await updateParcel(nicEditModal.parcel.id, { senderNic: nic })
      setNicEditModal(null)
    } catch {
      setNicEditModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la mise à jour.' }))
    }
  }

  const handleCreateParcel = async () => {
    const { newParcelModal, setNewParcelModal } = s.current
    const f = newParcelModal.form

    // Validation
    if (!f.senderName?.trim()) { setNewParcelModal((m: any) => ({ ...m, error: 'Nom expéditeur requis.' })); return }
    if (!f.receiverName?.trim()) { setNewParcelModal((m: any) => ({ ...m, error: 'Nom destinataire requis.' })); return }
    if (!f.receiverCity?.trim()) { setNewParcelModal((m: any) => ({ ...m, error: 'Ville destinataire requise.' })); return }

    setNewParcelModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const adminEmail = auth.currentUser?.email || 'Admin'
      await createParcel({
        senderNic: f.senderNic || '',
        sender: { name: f.senderName, tel: f.senderTel || '', city: f.senderCity || '', address: f.senderAddress || '' },
        receiver: { name: f.receiverName, tel: f.receiverTel || '', city: f.receiverCity, address: f.receiverAddress || '' },
        originCity: f.senderCity || '',
        destinationCity: f.receiverCity,
        weight: parseFloat(f.weight) || 0,
        nbColis: parseInt(f.nbColis) || 1,
        serviceType: f.serviceType || 'simple',
        portType: f.portType || 'port_paye',
        price: parseFloat(f.portPrice) || 0,
        codAmount: parseFloat(f.codAmount) || 0,
        agentId: auth.currentUser?.uid || '',
        agentName: adminEmail,
        status: 'Initialisé',
        createdBy: 'admin',
        createdByEmail: adminEmail,
      })
      setNewParcelModal(null)
    } catch (err: any) {
      setNewParcelModal((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors de la création.' }))
    }
  }

  const handleAddPortDuTx = async () => {
    const { portDuForm, setPortDuForm, setPortDuLoading, setPortDuError, driverPortDuModal } = s.current
    const amt = parseFloat(portDuForm.amount)
    if (!amt || amt <= 0) { setPortDuError('Montant invalide.'); return }
    setPortDuLoading(true); setPortDuError('')
    try {
      const driver = driverPortDuModal.driver
      await addDriverPortDuTransaction({
        driverId:   driver.id,
        driverName: driver.name,
        type:       portDuForm.type,
        amount:     amt,
        note:       portDuForm.note,
        adminId:    auth.currentUser?.uid   || '',
        adminName:  auth.currentUser?.email || '',
      })
      // Versement → créditer caisse ; remise → aucune écriture caisse
      if (portDuForm.type === 'versement') {
        await createCaisseEntry({
          type:        'entree',
          category:    'port_du',
          amount:      amt,
          description: `Versement port dû — ${driver.name}${portDuForm.note ? ' · ' + portDuForm.note : ''}`,
          reference:   driver.name,
          agentId:     driver.id,
          agentName:   driver.name,
          city:        driver.city || '',
          cashierId:   auth.currentUser?.uid   || '',
          cashierName: auth.currentUser?.email || '',
        })
      }
      setPortDuForm({ type: 'versement', amount: '', note: '' })
    } catch { setPortDuError("Erreur lors de l'enregistrement.") }
    finally   { setPortDuLoading(false) }
  }

  const handleDeletePortDuTx = async (tx: any, driver: any) => {
    if (!window.confirm(`Annuler ce ${tx.type === 'versement' ? 'versement' : 'avance'} de ${tx.amount} DH ?`)) return
    try {
      await deleteDriverPortDuTransaction(tx.id)
      if (tx.type === 'versement') {
        await createCaisseEntry({
          type:        'sortie',
          category:    'port_du',
          amount:      tx.amount,
          description: `Annulation versement port dû — ${tx.driverName || driver?.name || ''}`,
          reference:   tx.driverName || driver?.name || '',
          agentId:     auth.currentUser?.uid   || '',
          agentName:   auth.currentUser?.email || '',
          city:        driver?.city || '',
          cashierId:   auth.currentUser?.uid   || '',
          cashierName: auth.currentUser?.email || '',
          skipCheck:   true,
        })
      }
    } catch { alert("Erreur lors de la suppression.") }
  }

  const handleSavePortDuEdit = async (tx: any, driver: any) => {
    const { portDuEditForm, setPortDuEditId } = s.current
    const amt = parseFloat(portDuEditForm.amount)
    if (!amt || amt <= 0) return
    const diff = amt - (tx.amount || 0)
    try {
      await updateDriverPortDuTransaction(tx.id, { amount: amt, note: portDuEditForm.note })
      if (tx.type === 'versement' && diff !== 0) {
        await createCaisseEntry({
          type:        diff > 0 ? 'entree' : 'sortie',
          category:    'port_du',
          amount:      Math.abs(diff),
          description: `Correction versement port dû — ${tx.driverName || driver?.name || ''}`,
          reference:   tx.driverName || driver?.name || '',
          agentId:     auth.currentUser?.uid   || '',
          agentName:   auth.currentUser?.email || '',
          city:        driver?.city || '',
          cashierId:   auth.currentUser?.uid   || '',
          cashierName: auth.currentUser?.email || '',
          skipCheck:   true,
        })
      }
      setPortDuEditId(null)
    } catch { alert("Erreur lors de la modification.") }
  }

  const handleConfirmDriverVersement = async (tx: any, driver: any) => {
    try {
      await confirmDriverVersement(tx.id, {
        confirmedById: auth.currentUser?.uid   || '',
        confirmedBy:   auth.currentUser?.email || 'Admin',
        city:          tx.city || driver?.city || '',
        amount:        tx.amount,
        driverName:    tx.driverName,
        driverId:      tx.driverId,
      })
    } catch { alert("Erreur lors de la confirmation.") }
  }

  const handleStatusUpdate = async () => {
    const { statusModal, setStatusModal } = s.current
    if (!statusModal) return
    // ✅ ADMIN peut modifier le statut même si le colis est livré
    // if ((statusModal.parcel?.status === 'Livré' || statusModal.parcel?.status === 'Livré') && statusModal.status !== statusModal.parcel.status) {
    //   setStatusModal((m: any) => ({ ...m, error: 'Colis deja livre : son statut est verrouille.' }))
    //   return
    // }
    if (statusModal.status === 'Retourné' && !statusModal.returnReason) {
      setStatusModal((m: any) => ({ ...m, error: 'S?lectionnez le motif du retour.' }))
      return
    }
    setStatusModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const { parcel, status, note, returnReason } = statusModal
      const extra = {
        ...(note ? { note } : {}),
        ...(status === 'Retourné' ? { reason: returnReason } : {}),
      }
      if (status === 'Retourné') {
        await markParcelAsReturned(parcel, {
          ...(note ? { note } : {}),
          ...(returnReason ? { reason: returnReason } : {}),
        })
        await updateParcel(parcel.id, { returnReason, returnNote: note || '' })
        setStatusModal(null)
        return
      }

      // Réinitialiser les champs incohérents si le colis n'est plus "Livré"
      if (status !== 'Livré') {
        const reset: Record<string, any> = {}
        if (parcel.portStatus === 'collected') {
          reset.portStatus      = 'pending'
          reset.portCollectedBy  = null
          reset.portCollectedById = null
          reset.portCollectedAt  = null
        }
        if (parcel.signatureConfirmedAt) {
          reset.signatureConfirmedAt = null
          reset.signatureToken       = null
        }
        if (parcel.codStatus === 'collected' && !parcel.codSentToSource && !parcel.codSenderPaid) {
          reset.codStatus       = 'pending'
          reset.codCollectedAt  = null
          reset.codCollectedBy  = null
        }
        if (Object.keys(reset).length > 0) await updateParcel(parcel.id, reset)
      }

      await updateParcelStatus(parcel.id, status, extra)
      setStatusModal(null)
    } catch {
      setStatusModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la mise à jour.' }))
    }
  }

  const handleCreateReturnParcel = async () => {
    const { returnParcelModal, setReturnParcelModal } = s.current
    if (!returnParcelModal?.parcel) return
    setReturnParcelModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      const result = await createReturnParcel(
        returnParcelModal.parcel,
        auth.currentUser?.uid,
        auth.currentUser?.displayName || auth.currentUser?.email || 'Admin'
      )
      setReturnParcelModal((m: any) => ({ ...m, loading: false, result }))
    } catch {
      setReturnParcelModal((m: any) => ({ ...m, loading: false, error: 'Erreur lors de la création du colis retour.' }))
    }
  }

  const handleRemitCod = async (parcel: any) => {
    await remitCod(parcel.id, 'Admin')
  }

  const handleSettleCodAdmin = async (parcel: any) => {
    await settleCodToSender(parcel.id, 'Admin', 'admin')
  }

  const handleBatchSettleAdmin = async (parcels: any) => {
    await batchSettleCods(parcels.map((p: any) => p.id), 'Admin', 'admin')
  }

  const handleReturnSave = async () => {
    const { returnModal, setReturnModal } = s.current
    if (!returnModal?.parcel) return
    setReturnModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await updateParcel(returnModal.parcel.id, {
        returnReason: returnModal.reason,
        returnNote: returnModal.note || '',
        returnedAt: new Date().toISOString(),
      })
      await updateParcelStatus(returnModal.parcel.id, 'Retourné', {
        reason: returnModal.reason,
        note: returnModal.note || `Retour : ${returnModal.reason}`,
      })
      setReturnModal(null)
    } catch {
      setReturnModal((m: any) => ({ ...m, loading: false, error: "Erreur lors de l'enregistrement du retour." }))
    }
  }

  const handleExportBackup = async () => {
    const { setBackupBusy, setBackupMessage } = s.current
    setBackupBusy(true)
    setBackupMessage(null)
    try {
      const { exportSiteBackup } = await import('../../../firebase/backup')
      const backup = await exportSiteBackup()
      downloadJson('bg-express-sauvegarde-complete', backup)
      setBackupMessage({ type: 'success', text: `Sauvegarde exportee : ${(Object.values(backup.counts) as any[]).reduce((sum: any, n: any) => sum + n, 0)} document(s).` })
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err?.message || "Erreur pendant l'export de la sauvegarde." })
    } finally {
      setBackupBusy(false)
    }
  }

  const handleBackupFile = async (e: any) => {
    const { setBackupMessage, setImportPreview } = s.current
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBackupMessage(null)
    try {
      const text = await file.text()
      const backup = JSON.parse(text)
      if (backup?.schema !== 'firestore-backup-v1' || !backup.collections) {
        throw new Error('Fichier de sauvegarde invalide.')
      }
      setImportPreview({
        fileName: file.name,
        backup,
        counts: backup.counts || Object.fromEntries(
          Object.entries(backup.collections).map(([name, docs]) => [name, Array.isArray(docs) ? docs.length : 0])
        ),
      })
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err?.message || 'Impossible de lire ce fichier JSON.' })
    }
  }

  const handleConfirmImportBackup = async () => {
    const { importPreview, setImportPreview, setBackupBusy, setBackupMessage } = s.current
    if (!importPreview) return
    setBackupBusy(true)
    setBackupMessage(null)
    try {
      const { importSiteBackup } = await import('../../../firebase/backup')
      const summary = await importSiteBackup(importPreview.backup, auth.currentUser?.email || 'Admin')
      setBackupMessage({ type: 'success', text: `Import termine : ${summary.total} document(s) fusionne(s).` })
      setImportPreview(null)
    } catch (err: any) {
      setBackupMessage({ type: 'error', text: err?.message || "Erreur pendant l'import de la sauvegarde." })
    } finally {
      setBackupBusy(false)
    }
  }

  const makeClientPortalLink = (clientId: any) => {
    if (!clientId) return ''
    return `${window.location.origin}/client/${clientId}`
  }

  const handleCopyClientPortalLink = async (linkOrClientId: any, clientData: any = null) => {
    const { setCopyMessage } = s.current
    let link = String(linkOrClientId || '').startsWith('http')
      ? String(linkOrClientId).split('?')[0]
      : ''
    if (!link) {
      const clientId = clientData?.id || (String(linkOrClientId || '').startsWith('http') ? '' : linkOrClientId)
      if (!clientId) return
      link = makeClientPortalLink(clientId)
      if (clientData?.userId) {
        updateUser(clientData.userId, { portalToken: '', portalPath: `/client/${clientId}`, portalLink: link } as any).catch(() => {})
      }
    }
    if (!link) return
    try {
      const copied = await copyText(link)
      setCopyMessage({
        type: copied ? 'success' : 'error',
        text: copied
          ? 'Lien client copie. Envoyez-le uniquement au client concerne.'
          : `Copie bloquee par le navigateur. Lien : ${link}`,
        link,
      })
    } catch {
      setCopyMessage({ type: 'error', text: `Copie bloquee par le navigateur. Lien : ${link}`, link })
    }
  }

  const handleToggleGlobalLock = async () => {
    const { setLockBusy, operationLocks } = s.current
    const adminEmail = auth.currentUser?.email || 'Admin'
    setLockBusy('global')
    try {
      await updateGlobalSiteLock(!operationLocks.globalStopped, adminEmail)
    } finally {
      setLockBusy('')
    }
  }

  const handleToggleAgencyLock = async (city: any) => {
    const { setLockBusy, operationLocks } = s.current
    const adminEmail = auth.currentUser?.email || 'Admin'
    setLockBusy(city)
    try {
      await updateAgencyLock(city, !(operationLocks.agencies as any)?.[city]?.locked, adminEmail)
    } finally {
      setLockBusy('')
    }
  }

  const updateTariffCityPrice = (city: any, value: any) => {
    const { setTariffDraft } = s.current
    setTariffDraft((prev: any) => normalizeTariffConfig({
      ...prev,
      cityPrices: { ...(prev.cityPrices || {}), [city]: Number(value) || 0 },
    }))
  }

  const updateTariffWeightRule = (idx: any, field: any, value: any) => {
    const { setTariffDraft } = s.current
    setTariffDraft((prev: any) => {
      const rules = (prev.weightRules || []).map((rule: any, i: any) =>
        i === idx
          ? {
              ...rule,
              [field]: field === 'label' ? value : (value === '' ? null : Number(value)),
            }
          : rule
      )
      return normalizeTariffConfig({ ...prev, weightRules: rules })
    })
  }

  const handleSaveTariffs = async () => {
    const { tariffDraft, setTariffSaving, setTariffMessage } = s.current
    const adminEmail = auth.currentUser?.email || 'Admin'
    setTariffSaving(true)
    setTariffMessage(null)
    try {
      await saveTariffConfig(tariffDraft, adminEmail)
      setTariffMessage({ type: 'success', text: 'Tarifs enregistrés. Les nouveaux colis utiliseront ces prix.' })
    } catch (err: any) {
      setTariffMessage({ type: 'error', text: err?.message || "Impossible d'enregistrer les tarifs." })
    } finally {
      setTariffSaving(false)
    }
  }

  const handleResetTariffs = () => {
    const { setTariffDraft, setTariffMessage } = s.current
    setTariffDraft(normalizeTariffConfig(DEFAULT_TARIFF_CONFIG))
    setTariffMessage({ type: 'info', text: 'Valeurs par défaut chargées. Cliquez sur Enregistrer pour les appliquer.' })
  }

  const handleReplyClientMessage = async (messageId: any) => {
    const { clientReplyDrafts, setClientReplyDrafts } = s.current
    const text = (clientReplyDrafts[messageId] || '').trim()
    if (!text) return
    await addClientMessageReply(messageId, {
      message: text,
      authorName: auth.currentUser?.email || 'Admin',
      authorEmail: auth.currentUser?.email || '',
      authorRole: 'admin',
    })
    setClientReplyDrafts((d: any) => ({ ...d, [messageId]: '' }))
  }

  const handleDeleteClientMessage = async (messageId: any) => {
    if (!window.confirm('Supprimer definitivement cette conversation client ?')) return
    await deleteClientMessage(messageId)
  }

  const handleSendCodRequest = async (parcel: any) => {
    const { users, codRequestDrafts, setCodRequestDrafts, setCodRequestBusy, setCodRequestMsg } = s.current
    const agent = users.find((u: any) => u.id === parcel.agentId)
    const message = (codRequestDrafts[parcel.id] || '').trim()
      || `Merci de régler le RETOUR FOND ${parcel.trackingId} avec l'expéditeur ${parcel.sender?.name || ''}.`
    if (!parcel.agentId) {
      setCodRequestMsg({ type: 'error', text: 'Impossible: agent expéditeur introuvable pour ce RETOUR FOND.' })
      return
    }
    setCodRequestBusy(parcel.id)
    setCodRequestMsg(null)
    try {
      await createAgentCodRequest({
        parcelId: parcel.id,
        trackingId: parcel.trackingId,
        agentId: parcel.agentId,
        agentName: parcel.agentName || agent?.name || '',
        agentCity: parcel.sender?.city || agent?.city || '',
        codAmount: parcel.codAmount,
        codStatus: parcel.codStatus || '',
        senderName: parcel.sender?.name || '',
        receiverName: parcel.receiver?.name || '',
        message,
        createdBy: auth.currentUser?.email || 'Admin',
        createdById: auth.currentUser?.uid || 'admin',
      })
      setCodRequestDrafts((d: any) => ({ ...d, [parcel.id]: '' }))
      setCodRequestMsg({ type: 'success', text: `Demande RETOUR FOND envoyée à ${parcel.agentName || agent?.name || 'l agent'}.` })
    } catch (err: any) {
      setCodRequestMsg({ type: 'error', text: err?.message || "Erreur lors de l'envoi de la demande RETOUR FOND." })
    } finally {
      setCodRequestBusy('')
    }
  }

  const handleReplyAgentCodRequest = async (req: any) => {
    const { codRequestDrafts, setCodRequestDrafts, setCodRequestBusy } = s.current
    const key = `reply_${req.id}`
    const message = (codRequestDrafts[key] || '').trim()
    if (!message) return
    setCodRequestBusy(req.id)
    try {
      await addAgentCodRequestReply(req.id, {
        message,
        authorName: auth.currentUser?.email || 'Admin',
        authorRole: 'admin',
      })
      setCodRequestDrafts((d: any) => ({ ...d, [key]: '' }))
    } finally {
      setCodRequestBusy('')
    }
  }

  const handleSaveUser = async () => {
    const { userEdit, setUserEdit } = s.current
    if (!userEdit) return
    const { id, ...data } = userEdit
    await updateUser(id, {
      name: data.name, role: data.role, city: data.city, code: data.code, tel: data.tel || '',
      matricule:     data.role === 'chauffeur' ? (data.matricule || '') : '',
      chauffeurType: data.role === 'chauffeur' ? 'transport' : (data.role === 'livreur' ? 'livreur' : ''),
      sectorId:      data.role === 'livreur' ? (data.sectorId || '') : '',
      directorPermissions: data.role === 'directeur' ? (data.directorPermissions || []) : [],
      cin: data.cin || '', cnss: data.cnss || '', assurance: data.assurance || '',
      dateEmbauche: data.dateEmbauche || '', dateSortie: data.dateSortie || '',
      dateNaissance: data.dateNaissance || '', salaire: data.salaire || '',
      adresse: data.adresse || '', situationFamiliale: data.situationFamiliale || '',
      contactUrgence: data.contactUrgence || '', noteRH: data.noteRH || '',
    } as any)
    setUserEdit(null)
  }

  const openContractModal = (employee: any) => {
    const { setContractModal } = s.current
    const roleLabels: Record<string, string> = { agent: 'Agent de Transit', chauffeur: 'Chauffeur Transport', livreur: 'Livreur Local', caissier: 'Caissier(ère)', salarie: 'Employé(e)', directeur: 'Directeur d\'Agence' }
    const trialPeriods: Record<string, string> = { agent: '45 jours', chauffeur: '15 jours', livreur: '15 jours', caissier: '45 jours', salarie: '45 jours', directeur: '3 mois' }
    setContractModal({
      employee,
      form: {
        typeContrat:      'CDI',
        dateDebut:        employee.dateEmbauche || '',
        dateFin:          '',
        poste:            roleLabels[employee.role] || employee.role || '',
        departement:      'Exploitation',
        lieuTravail:      employee.city || '',
        horaire:          '08h00 – 17h00 du Lundi au Vendredi (44h/semaine)',
        salaireBrut:      employee.salaire || '',
        avantages:        '',
        nationalite:      'Marocaine',
        lieuNaissance:    '',
        periodeEssai:     trialPeriods[employee.role] || '45 jours',
        conventionColl:   'Pas de convention collective applicable',
      }
    })
  }

  const handleChangePassword = async (e: any) => {
    const { pwdForm, setPwdForm } = s.current
    e.preventDefault()
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdForm((f: any) => ({ ...f, error: 'Les mots de passe ne correspondent pas.', success: '' }))
      return
    }
    if (pwdForm.next.length < 6) {
      setPwdForm((f: any) => ({ ...f, error: 'Le mot de passe doit contenir au moins 6 caractères.', success: '' }))
      return
    }
    setPwdForm((f: any) => ({ ...f, loading: true, error: '', success: '' }))
    try {
      const user = auth.currentUser!
      const credential = EmailAuthProvider.credential(user.email!, pwdForm.current)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, pwdForm.next)
      setPwdForm({ current: '', next: '', confirm: '', loading: false, error: '', success: 'Mot de passe mis à jour avec succès !' })
    } catch (err: any) {
      const msg = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Mot de passe actuel incorrect.'
        : 'Erreur lors du changement de mot de passe.'
      setPwdForm((f: any) => ({ ...f, loading: false, error: msg, success: '' }))
    }
  }

  const handleToggleBlock = async (u: any) => {
    await updateUser(u.id, { blocked: !u.blocked } as any)
  }

  const handleDeleteUser = async () => {
    const { deleteConfirmUser, setDeleteConfirmUser } = s.current
    if (!deleteConfirmUser) return
    await deleteUserDoc(deleteConfirmUser.id)
    setDeleteConfirmUser(null)
  }

  const handleCreateUser = async (e: any) => {
    const {
      createModal, setCreateModal, setCreateError, setCreateLoading,
    } = s.current
    e.preventDefault()
    setCreateError('')
    const isEmployeeOnly = createModal.role === 'salarie'
    if (!createModal.name.trim()) { setCreateError('Le nom complet est obligatoire.'); return }
    if (!isEmployeeOnly && !createModal.email.trim()) { setCreateError("L'email est obligatoire pour un compte avec accès."); return }
    if (!isEmployeeOnly && createModal.password.length < 6) { setCreateError('Mot de passe : 6 caractères minimum.'); return }
    setCreateLoading(true)
    try {
      if (isEmployeeOnly) {
        const employeeRef = doc(collection(db, 'users'))
        await setDoc(employeeRef, {
          name:                createModal.name,
          email:               createModal.email.trim().toLowerCase(),
          role:                'salarie',
          city:                createModal.city,
          code:                createModal.code,
          tel:                 createModal.tel || '',
          matricule:           '',
          employeeOnly:        true,
          directorPermissions: [],
          cin:                 createModal.cin || '',
          cnss:                createModal.cnss || '',
          assurance:           createModal.assurance || '',
          dateEmbauche:        createModal.dateEmbauche || '',
          dateSortie:          createModal.dateSortie || '',
          dateNaissance:       createModal.dateNaissance || '',
          salaire:             createModal.salaire || '',
          adresse:             createModal.adresse || '',
          situationFamiliale:  createModal.situationFamiliale || '',
          contactUrgence:      createModal.contactUrgence || '',
          noteRH:              createModal.noteRH || '',
          createdAt:           new Date().toISOString()
        })
        setCreateModal(null)
        setCreateError('')
        return
      }
      const cred = await createUserWithEmailAndPassword(authSecondary, createModal.email, createModal.password)
      let clientId: any = null
      let clientPortalLink = ''
      if (createModal.role === 'client') {
        clientId = await createClient({
          name:          createModal.name,
          email:         createModal.email.trim().toLowerCase(),
          tel:           createModal.tel || '',
          city:          createModal.city || '',
          address:       createModal.adresse || '',
          accountType:   'compte',
          portalUid:     cred.user.uid,
          portalEmail:   createModal.email.trim().toLowerCase(),
          createdBy:     auth.currentUser?.uid,
          createdByName: auth.currentUser?.email || 'Admin',
          createdByRole: 'admin',
          notes:         'Portail client cree par Admin.',
        })
        clientPortalLink = makeClientPortalLink(clientId)
        await updateClient(clientId, {
          portalPath: `/client/${clientId}`,
          portalLink: clientPortalLink,
        })
      }
      await setDoc(doc(db, 'users', cred.user.uid), {
        name:                createModal.name,
        email:               createModal.email.trim().toLowerCase(),
        role:                createModal.role,
        city:                createModal.city,
        code:                createModal.role === 'client' ? '' : createModal.code,
        tel:                 createModal.tel || '',
        matricule:           createModal.role === 'chauffeur' ? (createModal.matricule || '') : '',
        chauffeurType:       createModal.role === 'chauffeur' ? 'transport' : (createModal.role === 'livreur' ? 'livreur' : ''),
        sectorId:            createModal.role === 'livreur' ? (createModal.sectorId || '') : '',
        ...(clientId ? { clientId } : {}),
        ...(clientPortalLink ? { portalPath: `/client/${clientId}`, portalLink: clientPortalLink, portalToken: '' } : {}),
        directorPermissions: createModal.role === 'directeur' ? (createModal.directorPermissions || []) : [],
        cin:                 createModal.cin || '',
        cnss:                createModal.cnss || '',
        assurance:           createModal.assurance || '',
        dateEmbauche:        createModal.dateEmbauche || '',
        dateSortie:          createModal.dateSortie || '',
        dateNaissance:       createModal.dateNaissance || '',
        salaire:             createModal.salaire || '',
        adresse:             createModal.adresse || '',
        situationFamiliale:  createModal.situationFamiliale || '',
        contactUrgence:      createModal.contactUrgence || '',
        noteRH:              createModal.noteRH || '',
        createdAt:           new Date().toISOString()
      })
      await fbSignOut(authSecondary)
      setCreateModal(null)
      setCreateError('')
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') setCreateError('Cet email est déjà utilisé.')
      else setCreateError("Erreur lors de la création du compte.")
    } finally {
      setCreateLoading(false)
    }
  }

  const openSalaryPayment = (employee: any, category = 'salaire') => {
    const { caisseEntries, allRhRequests, setSalaryModal } = s.current
    const month = currentSalaryMonth()
    const baseSalary = parseFloat(employee.salaire || 0) || 0
    const alreadyPaid = caisseEntries
      .filter((e: any) => e.category === 'salaire'
        && e.salaryMonth === month
        && (e.staffId === employee.id || (!e.staffId && e.staffName === employee.name)))
      .reduce((sum: any, e: any) => sum + (parseFloat(e.amount || 0) || 0), 0)
    const alreadyAdvanced = caisseEntries
      .filter((e: any) => e.category === 'avance'
        && e.salaryMonth === month
        && (e.staffId === employee.id || (!e.staffId && e.staffName === employee.name)))
      .reduce((sum: any, e: any) => sum + (parseFloat(e.amount || 0) || 0), 0)
    const pendingAdvances = allRhRequests
      .filter((r: any) => r.source === 'rh' && r.status === 'pending'
        && r.paymentKind === 'avance'
        && r.salaryMonth === month
        && (r.staffId === employee.id || r.staffName === employee.name))
      .reduce((sum: any, r: any) => sum + (parseFloat(r.amount || 0) || 0), 0)
    const remaining = Math.max(0, baseSalary - alreadyPaid - alreadyAdvanced - pendingAdvances)
    setSalaryModal({
      employee,
      category,
      month,
      amount: String(category === 'salaire' ? (remaining || baseSalary || '') : ''),
      reference: '',
      note: '',
      loading: false,
      error: '',
      pendingAmount: pendingAdvances,
    })
  }

  const handleSalaryPayment = async () => {
    const { salaryModal, setSalaryModal } = s.current
    if (!salaryModal?.employee) return
    const employee = salaryModal.employee
    const amount = parseFloat(salaryModal.amount || 0)
    if (!amount || amount <= 0) {
      setSalaryModal((m: any) => ({ ...m, error: 'Le montant doit être supérieur à 0.' }))
      return
    }
    if (!employee.city) {
      setSalaryModal((m: any) => ({ ...m, error: "La ville/agence de l'employé est obligatoire pour payer depuis la caisse." }))
      return
    }
    setSalaryModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await createCaisseRequest({
        source: 'rh',
        type: salaryModal.category === 'salaire' ? 'rh_salaire' : 'rh_avance',
        category: salaryModal.category,
        amount,
        description: `${salaryModal.category === 'salaire' ? 'Salaire' : 'Avance salaire'} ${employee.name} — ${salaryMonthLabel(salaryModal.month)}`,
        reference: salaryModal.reference,
        staffId: employee.id,
        staffName: employee.name || '',
        staffRole: employee.role || '',
        salaryMonth: salaryModal.month,
        paymentKind: salaryModal.category,
        city: employee.city,
        requestedById: auth.currentUser?.uid || null,
        requestedBy: auth.currentUser?.email || 'RH',
        note: salaryModal.note,
      })
      setSalaryModal(null)
    } catch (err: any) {
      setSalaryModal((m: any) => ({ ...m, loading: false, error: err?.message || "Erreur lors de l'envoi de la demande RH." }))
    }
  }

  const handleCompleteRhRequest = async (req: any) => {
    try {
      await completeRhSalaryCaisseRequest(req.id, {
        city: req.city,
        cashierName: auth.currentUser?.email || 'Admin',
        cashierId: auth.currentUser?.uid || '',
      })
    } catch (err: any) {
      alert(err?.message || 'Erreur lors du paiement RH.')
    }
  }

  const openArchiveModal = () => {
    const { cityFilter, setArchiveProgress, setArchiveModal } = s.current
    setArchiveProgress({ done: 0, total: 0 })
    setArchiveModal({
      city: cityFilter || 'Toutes',
      statuses: ['Livré', 'Retourné'],
      days: 90,
      customDays: '',
      loading: false,
      result: null,
      error: '',
    })
  }

  const toggleArchiveStatus = (status: any) => {
    const { setArchiveModal } = s.current
    setArchiveModal((m: any) => {
      if (!m) return m
      const exists = m.statuses.includes(status)
      return { ...m, statuses: exists ? m.statuses.filter((s: any) => s !== status) : [...m.statuses, status], result: null, error: '' }
    })
  }

  const downloadLocalArchiveFile = (archivePayload: any, filename: any) => {
    const blob = new Blob([JSON.stringify(archivePayload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleArchiveParcels = async () => {
    const { archiveModal, setArchiveModal, setArchiveProgress, allParcels } = s.current

    const getArchiveDays = (modal: any) => modal?.days === 'custom' ? parseInt(modal.customDays, 10) : Number(modal?.days || 0)

    const parcelDate = (p: any) => {
      if (p.createdAt?.toDate) return p.createdAt.toDate()
      if (p.history?.[0]?.timestamp) return new Date(p.history[0].timestamp)
      return new Date(0)
    }

    const getLocalArchiveParcels = (modal: any) => {
      if (!modal) return []
      const days = getArchiveDays(modal)
      if (!days || !modal.statuses?.length) return []
      if (!Array.isArray(allParcels)) return []
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      return (allParcels as any[]).filter(p => {
        if (!modal.statuses.includes(p.status)) return false
        if (modal.city && modal.city !== 'Toutes' && p.originCity !== modal.city && p.destinationCity !== modal.city) return false
        return parcelDate(p) < cutoff
      })
    }

    if (!archiveModal || archiveModal.loading) return
    const days = getArchiveDays(archiveModal)
    if (!days || days <= 0) {
      setArchiveModal((m: any) => ({ ...m, error: 'Choisissez une periode valide.' }))
      return
    }
    if (!archiveModal.statuses?.length) {
      setArchiveModal((m: any) => ({ ...m, error: 'Choisissez au moins un statut.' }))
      return
    }
    const statusLabel = archiveModal.statuses.join(', ')
    const cityLabel = archiveModal.city === 'Toutes' ? 'toutes les villes' : archiveModal.city
    const rows = getLocalArchiveParcels(archiveModal)
    if (!window.confirm(`Creer une archive locale pour les expeditions avec statut: ${statusLabel}, plus anciennes que ${days} jours, pour ${cityLabel} ?\n\nAucune donnee cloud ne sera modifiee.`)) return

    setArchiveProgress({ done: 0, total: rows.length })
    setArchiveModal((m: any) => ({ ...m, loading: true, error: '', result: null }))
    try {
      const createdAt = new Date().toISOString()
      const payload = {
        type: 'local_parcels_archive',
        createdAt,
        criteria: {
          city: archiveModal.city || 'Toutes',
          statuses: archiveModal.statuses,
          olderThanDays: days,
        },
        count: rows.length,
        parcels: rows,
      }
      const previous = JSON.parse(localStorage.getItem('local_parcels_archives') || '[]')
      localStorage.setItem('local_parcels_archives', JSON.stringify([
        { id: createdAt, createdAt, criteria: payload.criteria, count: rows.length, parcels: rows },
        ...previous,
      ].slice(0, 20)))
      setArchiveProgress({ done: rows.length, total: rows.length })
      downloadLocalArchiveFile(payload, `archive-expeditions-${createdAt.slice(0, 10)}.json`)
      setArchiveModal((m: any) => ({ ...m, loading: false, result: rows.length, error: '' }))
    } catch (err: any) {
      setArchiveModal((m: any) => ({ ...m, loading: false, error: err?.message || "Erreur pendant l'archivage local." }))
    }
  }

  return {
    handleDeleteBankDeposit,
    openAdminEdit,
    handleAdminEditSave,
    handleSaveCodAmount,
    handleSaveNic,
    handleCreateParcel,
    handleAddPortDuTx,
    handleDeletePortDuTx,
    handleSavePortDuEdit,
    handleConfirmDriverVersement,
    handleStatusUpdate,
    handleCreateReturnParcel,
    handleRemitCod,
    handleSettleCodAdmin,
    handleBatchSettleAdmin,
    handleReturnSave,
    downloadCsv,
    downloadJson,
    handleExportBackup,
    handleBackupFile,
    handleConfirmImportBackup,
    makeClientPortalLink,
    copyText,
    handleCopyClientPortalLink,
    handleToggleGlobalLock,
    handleToggleAgencyLock,
    updateTariffCityPrice,
    updateTariffWeightRule,
    handleSaveTariffs,
    handleResetTariffs,
    handleReplyClientMessage,
    handleDeleteClientMessage,
    handleSendCodRequest,
    handleReplyAgentCodRequest,
    handleSaveUser,
    openContractModal,
    handleChangePassword,
    handleToggleBlock,
    handleDeleteUser,
    handleCreateUser,
    openSalaryPayment,
    handleSalaryPayment,
    handleCompleteRhRequest,
    openArchiveModal,
    toggleArchiveStatus,
    downloadLocalArchiveFile,
    handleArchiveParcels,
  }
}
