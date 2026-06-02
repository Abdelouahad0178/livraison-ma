import { useState, useEffect } from 'react'
import { Search, X, Check, MessageCircle } from 'lucide-react'
import { COD_PAYMENT_TYPES, COD_STATUS } from '../../../firebase/constants'
import DateFilter from '../DateFilter'
import { useAgentCtx } from '../AgentCtx'
import { parcelDate, filterByDate } from '../../../utils/dateFilter'
import { fmt, fmtFixed as fmtAmt } from '../../../utils/formatNumber'

// ── Module-level helpers ────────────────────────────────────────────────────

const SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

const normalizeSearch = (value: any) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const matchesSearch = (values: any, query: any) => {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  const compactQ = normalizeSearch(q)
  return values.some((v: any) => {
    const raw = String(v ?? '').toLowerCase()
    return raw.includes(q) || normalizeSearch(raw).includes(compactQ)
  })
}

function useDebounce(value: any, delay = 280) {
  const [d, setD] = useState(value)
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t) }, [value, delay])
  return d
}

// ── Component ───────────────────────────────────────────────────────────────

export default function CodTab() {
  const {
    uid,
    profile,
    parcels,
    sameCity,
    // COD state
    agentCodRequests,
    centralDepositSelectedIds, setCentralDepositSelectedIds,
    centralDepositState,      setCentralDepositState,
    codConfirming,
    codReceptioning,
    codRequestBusy,
    codRequestDrafts,         setCodRequestDrafts,
    handleRejeterRapport,
    handleValiderRapport,
    pointeurRapports,
    pointeurReglements,
    rapportError,             setRapportError,
    rapportNotesMap,          setRapportNotesMap,
    rapportValidating,
    receptionCodError,
    codDatePreset,   setCodDatePreset,
    codDateFrom,     setCodDateFrom,
    codDateTo,       setCodDateTo,
    codSearch,       setCodSearch,
    codSending,      setCodSending,
    setCodConfirming,
    setCodReceptioning,       setReceptionCodError,
    receiveModal,    setReceiveModal,
    codSettling,     setCodSettling,
    allCodParcels,
    codLoadingAll,
    batchSettling,   setBatchSettling,
    setCodRequestBusy,
    bankDeposits,
    bankDepositModal,  setBankDepositModal,
    bankDepositPrinting,
    setCodCollectModal,
    setPortCollectModal,
    setRapportValidating,
    setRapportChefNotes,
    drivers,
    // Handlers passed via context
    handleLoadAllCod,
    handleCentralCodDeposit,
    handleReceptionCod,
    handleMarkSentToSource,
    handleSendSelectedCodReglements,  // ⭐ Envoyer règlements COD pointés
    handleSettleCod,
    handleBatchSettle,
    handleSettleCodFromRequest,
    handleReplyCodRequest,
    openReceiveModal,
    isRetourFondValue,
    isCash,
    getCentralDepositEligibleCods,
  } = useAgentCtx()

  const debouncedCodSearch = useDebounce(codSearch)
  const [codDocListMode, setCodDocListMode] = useState('all')
  const [selectedCodDocumentIds, setSelectedCodDocumentIds] = useState<string[]>([])

  // ⭐ États pour l'historique
  const [showHistorySrc, setShowHistorySrc] = useState(20)  // Nombre à afficher pour l'historique source
  const [showHistoryDst, setShowHistoryDst] = useState(20)  // Nombre à afficher pour l'historique destination

  const fmtDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('fr-MA', { day:'2-digit', month:'short', year:'2-digit' }) : '—'
  const stMap   = Object.fromEntries(SERVICE_TYPES.map(s => [s.key, s]))
  const cptMap  = Object.fromEntries(COD_PAYMENT_TYPES.map(c => [c.key, c]))

  const handlePrintCodDocumentList = (documents: any[], title = 'Liste cheques / traites COD') => {
    if (!documents.length) return
    const total = documents.reduce((s, d) => s + (parseFloat(d.montant || 0) || 0), 0)
    const chequeCount = documents.filter(d => d.modeReglement === 'cheque').length
    const traiteCount = documents.filter(d => d.modeReglement === 'traite').length
    const rows = documents.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="font-family:monospace">${d.trackingNumber || '-'}</td>
        <td>${d.expediteur || '-'}</td>
        <td>${d.destinataire || '-'}</td>
        <td>${d.modeReglement === 'traite' ? 'Traite' : 'Cheque'}</td>
        <td>${d.banque || '-'}</td>
        <td>${d.numeroPiece || '-'}</td>
        <td>${d.dateEmission || '-'}</td>
        <td>${d.dateEcheance || '-'}</td>
        <td>${d.pointeurName || '-'}</td>
        <td>${d.status || '-'}</td>
        <td style="text-align:right;font-weight:bold">${Number(d.montant || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH</td>
      </tr>
    `).join('')
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: Arial, sans-serif; margin: 18px; font-size: 11px; color: #111827; }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; }
  .meta { display:flex; justify-content:space-between; gap:12px; margin: 12px 0 14px; color:#374151; font-size:10px; }
  .box { border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; background:#f9fafb; }
  table { width:100%; border-collapse:collapse; }
  th { background:#1d4ed8; color:white; padding:6px 5px; text-align:left; font-size:9px; }
  td { padding:5px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
  tr:nth-child(even) td { background:#f9fafb; }
  .total { margin-top:12px; text-align:right; font-size:14px; font-weight:bold; }
  .sigs { display:grid; grid-template-columns:1fr 1fr 1fr; gap:36px; margin-top:46px; }
  .sig { border-top:1px solid #111827; padding-top:8px; text-align:center; font-size:10px; min-height:58px; }
  @media print { button { display:none; } @page { margin: 12mm; } }
</style></head><body>
<h1>${title}</h1>
<div class="meta">
  <div class="box"><strong>Agence :</strong> ${profile?.city || '-'}</div>
  <div class="box"><strong>Prepare par :</strong> ${profile?.name || 'Chef agence'}</div>
  <div class="box"><strong>Date :</strong> ${new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'long', year:'numeric' })}</div>
  <div class="box"><strong>Documents :</strong> ${documents.length} (${chequeCount} cheques, ${traiteCount} traites)</div>
</div>
<table>
  <thead><tr>
    <th>N</th><th>Tracking</th><th>Expediteur</th><th>Destinataire</th><th>Type</th><th>Banque</th><th>N piece</th><th>Emission</th><th>Echeance</th><th>Pointeur</th><th>Statut</th><th>Montant</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="total">Total : ${total.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} DH</div>
<div class="sigs">
  <div class="sig">Chef d'agence<br/><br/>${profile?.name || ''}</div>
  <div class="sig">Pointeur-Encaisseur</div>
  <div class="sig">Cachet agence</div>
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
  }

  const handlePrintBankDeposits = (deposits: any) => {
    const total = deposits.reduce((s: number, d: any) => s + parseFloat(d.amount || 0), 0)
    const rows = deposits.map((dep: any) => `
      <tr>
        <td>${dep.trackingId || '—'}</td>
        <td>${dep.senderName || '—'}</td>
        <td>${dep.receiverName || '—'}</td>
        <td>${dep.bankName || '—'}</td>
        <td>${dep.refNum || '—'}</td>
        <td>${dep.depositDate || '—'}</td>
        <td style="text-align:right;font-weight:bold">${Number(dep.amount||0).toLocaleString('fr-MA')} DH</td>
      </tr>
    `).join('')
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>État des versements — ${profile?.city || ''}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  p.subtitle { color:#666; margin-bottom:16px; font-size:11px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#1d4ed8; color:white; padding:6px 8px; text-align:left; font-size:11px; }
  td { padding:5px 8px; border-bottom:1px solid #e5e7eb; }
  tr:nth-child(even) td { background:#f9fafb; }
  .total { margin-top:12px; font-size:14px; font-weight:bold; text-align:right; }
  @media print { @page { margin:15mm; } }
</style></head><body>
<h1>🏦 État des versements à la banque</h1>
<p class="subtitle">Agence ${profile?.city || ''} — Imprimé le ${new Date().toLocaleDateString('fr-MA', {day:'2-digit',month:'long',year:'numeric'})}</p>
<table>
  <thead><tr>
    <th>N° Tracking</th><th>Expéditeur</th><th>Destinataire</th><th>Banque</th><th>N° Bordereau</th><th>Date versement</th><th>Montant</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="total">Total : ${total.toLocaleString('fr-MA')} DH</p>
</body></html>`
    const w = window.open('', '_blank')!
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  // Fusion données temps réel + historique
  const isChefAgencyCodSource = (p: any) =>
    profile?.role === 'chef_agence' && sameCity(p.originCity || p.sender?.city, profile?.city)
  const isChefAgencyCodDestination = (p: any) =>
    profile?.role === 'chef_agence' && sameCity(p.destinationCity || p.receiver?.city, profile?.city)
  const liveParcels = (parcels as any[]).filter((p: any) =>
    (p.agentId === uid || p.destinationAgentId === uid || isChefAgencyCodSource(p) || isChefAgencyCodDestination(p)) && isRetourFondValue(p)
  )
  const merged = allCodParcels
    ? (() => {
        const liveIds = new Set(liveParcels.map((p: any) => p.id))
        return [...liveParcels, ...(allCodParcels as any[]).filter((p: any) => !liveIds.has(p.id))]
      })()
    : liveParcels
  const dateFilteredCodParcels = filterByDate(merged, codDatePreset, codDateFrom, codDateTo) as any[]
  const codQuery = debouncedCodSearch.trim().toLowerCase()
  const filteredCodParcels = !codQuery ? dateFilteredCodParcels : dateFilteredCodParcels.filter((p: any) => {
    const st = stMap[p.serviceType]
    const cpt = cptMap[p.codPaymentType]
    const cs = COD_STATUS[p.codStatus || 'pending']
    const values = [
      p.id,
      p.trackingId,
      p.senderNic,
      p.sender?.name,
      p.sender?.nic,
      p.sender?.tel,
      p.sender?.city,
      p.receiver?.name,
      p.receiver?.tel,
      p.receiver?.city,
      p.destinationCity,
      p.agentName,
      p.destinationAgentName,
      p.codAmount,
      st?.label,
      cpt?.label,
      cs?.label,
      p.codStatus,
    ]
    return matchesSearch(values, codQuery)
  })

  // ── Perspective AGENT SOURCE (j'ai créé le colis) ──
  const src = filteredCodParcels.filter(p => p.agentId === uid || isChefAgencyCodSource(p))
  const src_enCours    = src.filter(p => ['pending','collected'].includes(p.codStatus || 'pending') && !['Livré', 'Retourné à l\'expéditeur'].includes(p.status))
  const src_collected  = src.filter(p => p.codStatus === 'collected' && ['Livré', 'Retourné à l\'expéditeur'].includes(p.status) && !p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)
  const src_remisAgent = src.filter(p => p.codStatus === 'remis' && !p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid && !p.centralDeposited && !isCash(p) && !['Livré', 'Retourné à l\'expéditeur'].includes(p.status))
  const src_enRoute    = src.filter(p => p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)
  const src_aConfirmer = src.filter(p => p.codReceivedBySource && !p.codSenderPaid)
  const src_regle      = src.filter(p => p.codSenderPaid)

  // ── Perspective AGENT DESTINATION (j'ai livré le colis) ──
  const dst = filteredCodParcels.filter(p => p.destinationAgentId === uid || isChefAgencyCodDestination(p))
  // Étape 2b : livreur a collecté → chef d'agence doit valider client par client
  const dst_collected  = dst.filter(p => p.codStatus === 'collected' && !p.codSenderPaid)
  // ⭐ Étape 3.5 : COD envoyés par le pointeur au chef (en attente de validation + envoi)
  const dst_fromPointeur = dst.filter(p => p.codSentToChef && !p.codSentToSource && !p.codSenderPaid && !isCash(p))
  // Étape 3 → 4 : réceptionné, doit envoyer à agence source
  const dst_aEnvoyer   = dst.filter(p => p.codStatus === 'remis' && !p.codSentToSource && !p.codSenderPaid && !p.centralDeposited && !isCash(p))
  // Étape 4 : envoyé, en attente de confirmation source
  const dst_envoye     = dst.filter(p => p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)
  // ⭐ SUIVI PAIEMENT CLIENT : TOUS les COD collectés dans cette ville, peu importe leur traitement
  // En attente de paiement au client/expéditeur (peu importe si versé au central, admin, etc.)
  const dst_attentePaiementClient = dst.filter(p =>
    (p.codStatus === 'collected' || p.codStatus === 'remis' || p.centralDeposited || p.adminTransferred) && !p.codSenderPaid
  )
  // COD collectés et client déjà payé par l'agence source
  const dst_clientPaye = dst.filter(p => p.codSenderPaid === true)
  const centralDepositEligible = (profile?.role === 'chef_agence'
    ? getCentralDepositEligibleCods(filteredCodParcels)
    : []) as any[]
  const centralDepositTotal = centralDepositEligible.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const centralDepositSelected = centralDepositEligible.filter(p => centralDepositSelectedIds.includes(p.id))
  const centralDepositSelectedTotal = centralDepositSelected.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const centralDepositAllSelected = centralDepositEligible.length > 0 && centralDepositSelected.length === centralDepositEligible.length
  const centralPending = filteredCodParcels.filter(p => p.centralDeposited && !p.codSenderPaid)

  const dstHasData = dst_collected.length > 0 || dst_fromPointeur.length > 0 || dst_aEnvoyer.length > 0 || dst_envoye.length > 0

  // Totaux résumé
  const totSrcPending  = src_enCours.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const totSrcCollected = src_collected.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const totSrcRemis    = src_remisAgent.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const totSrcEnRoute  = src_enRoute.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const totSrcAConf    = src_aConfirmer.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const totDstCollect  = dst_collected.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const totDstEnvoy    = dst_aEnvoyer.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  // ⭐ Totaux pour le suivi paiement client (destination)
  const totDstAttentePaiement = dst_attentePaiementClient.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
  const totDstClientPaye = dst_clientPaye.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)

  const spinner = <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />

  // ── Helpers visuels ──
  const PRow = ({ p, badge, action }: { p: any; badge: any; action: any }) => {
    const st  = stMap[p.serviceType]
    const cpt = cptMap[p.codPaymentType]
    return (
      <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">{p.trackingId}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-100">
              {cpt?.emoji || st?.emoji || '💵'} {cpt?.label || st?.label || 'Espèces'}
            </span>
            {badge}
          </div>
          <p className="text-sm font-bold text-gray-800 truncate">{p.sender?.name || '—'}</p>
          <p className="text-[11px] text-gray-400 truncate">
            {[p.sender?.tel, p.receiver?.city && `→ ${p.receiver.city}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <p className="text-base font-black text-amber-600">{fmtAmt(p.codAmount)} DH</p>
          {action}
        </div>
      </div>
    )
  }

  const SectionCard = ({ icon, title, count, total, accent, children }: { icon: any; title: any; count: number; total: number; accent?: string; children: any }) => count === 0 ? null : (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 border-l-4 ${accent || 'border-l-gray-300'}`}>
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-gray-50/80">
        <span className="text-base leading-none">{icon}</span>
        <h3 className="font-bold text-sm text-gray-800 flex-1 min-w-0">{title}</h3>
        <span className="bg-gray-100 text-gray-600 text-xs font-black px-2.5 py-1 rounded-full shrink-0">{count}</span>
        {total > 0 && <span className="text-sm font-black text-amber-600 shrink-0">{fmt(total)} DH</span>}
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  )

  // Totaux globaux pour header
  const totalPending = [...src_enCours, ...src_remisAgent, ...src_enRoute, ...dst_collected, ...dst_aEnvoyer, ...dst_envoye]
    .reduce((s, p) => s + parseFloat(p.codAmount || 0), 0)
  const totalARegler = src_aConfirmer.reduce((s, p) => s + parseFloat(p.codAmount || 0), 0)
  const totalRegle   = src_regle.reduce((s, p) => s + parseFloat(p.codAmount || 0), 0)
  const totalAll     = filteredCodParcels.reduce((s, p) => s + parseFloat(p.codAmount || 0), 0)

  return (
    <div className="mt-4 space-y-5">

      {/* ═══ HEADER ═══ */}
      <div className="bg-gradient-to-br from-amber-500 to-yellow-600 rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-amber-100 text-xs font-semibold uppercase tracking-wider">Agence {profile?.city}</p>
            <h2 className="text-xl font-black mt-0.5">💰 Retour Fond Clients</h2>
          </div>
          <div className="text-right">
            <p className="text-amber-100 text-xs">Volume total</p>
            <p className="text-2xl font-black">{fmt(totalAll)} DH</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/15 rounded-2xl px-3 py-2.5 text-center">
            <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">En cours</p>
            <p className="text-white font-black text-lg leading-tight">{fmt(totalPending)} DH</p>
          </div>
          <div className="bg-white/15 rounded-2xl px-3 py-2.5 text-center">
            <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">À régler</p>
            <p className="text-white font-black text-lg leading-tight">{fmt(totalARegler)} DH</p>
          </div>
          <div className="bg-white/20 rounded-2xl px-3 py-2.5 text-center border border-white/30">
            <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wider">Réglés</p>
            <p className="text-white font-black text-lg leading-tight">{fmt(totalRegle)} DH</p>
          </div>
        </div>
      </div>

      {/* ═══ PIPELINE ═══ */}
      {(dstHasData || src.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Pipeline</p>
          <div className="flex items-center gap-1.5 min-w-max">
            {[
              ...(dstHasData ? [
                { label: 'À valider',  count: dst_collected.length, bg: 'bg-red-500',    dot: 'bg-red-400'    },
                { label: 'À envoyer',  count: dst_aEnvoyer.length,  bg: 'bg-orange-500', dot: 'bg-orange-400' },
                { label: 'Envoyé',     count: dst_envoye.length,    bg: 'bg-sky-500',    dot: 'bg-sky-400'    },
              ] : []),
              ...(src.length > 0 ? [
                { label: 'Collecte',   count: src_enCours.length,   bg: 'bg-yellow-500', dot: 'bg-yellow-400' },
                { label: 'Collecté',   count: src_collected.length, bg: 'bg-lime-500',   dot: 'bg-lime-400'   },
                { label: 'Chez dest.', count: src_remisAgent.length, bg: 'bg-orange-500', dot: 'bg-orange-400' },
                { label: 'En route',   count: src_enRoute.length,   bg: 'bg-blue-500',   dot: 'bg-blue-400'   },
                { label: 'À confirmer',count: src_aConfirmer.length, bg: 'bg-purple-500', dot: 'bg-purple-400' },
                { label: 'Réglé',      count: src_regle.length,     bg: 'bg-green-500',  dot: 'bg-green-400'  },
              ] : []),
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300 text-sm font-bold">›</span>}
                <div className={`${s.count > 0 ? s.bg : 'bg-gray-200'} rounded-xl px-3 py-2 text-center min-w-[68px] transition-all`}>
                  <p className="text-white font-black text-xl leading-none">{s.count}</p>
                  <p className="text-white/80 text-[9px] font-semibold mt-0.5 uppercase tracking-wide">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FILTRES ═══ */}
      <div className="space-y-2">
        <DateFilter
          value={codDatePreset}
          onChange={setCodDatePreset}
          from={codDateFrom}
          onFromChange={setCodDateFrom}
          to={codDateTo}
          onToChange={setCodDateTo}
          tone="amber"
        />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={codSearch}
            onChange={e => setCodSearch(e.target.value)}
            placeholder="Rechercher : code, client, téléphone, ville…"
            className="w-full bg-white border border-gray-200 pl-9 pr-10 py-2.5 rounded-xl text-sm focus:border-amber-400 focus:outline-none shadow-sm"
          />
          {codSearch && (
            <button onClick={() => setCodSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {(codSearch || filteredCodParcels.length > 0) && (
          <p className="text-[11px] text-gray-400 px-1">
            {filteredCodParcels.length} colis{codSearch ? ` trouvé(s) sur ${dateFilteredCodParcels.length}` : ''}
          </p>
        )}
      </div>

      {/* ═══ HISTORIQUE ═══ */}
      {!allCodParcels && (
        <button onClick={handleLoadAllCod} disabled={codLoadingAll}
          className="w-full flex items-center justify-center gap-2 bg-white border border-dashed border-amber-300 hover:bg-amber-50 disabled:opacity-50 text-amber-700 text-sm font-bold px-4 py-3 rounded-2xl transition">
          {codLoadingAll ? <>{spinner} Chargement…</> : <><span>📂</span> Charger tout l'historique</>}
        </button>
      )}

      {/* ═══ VERSEMENT SOCIÉTÉ (chef agence) ═══ */}
      {profile?.role === 'chef_agence' && centralDepositEligible.length > 0 && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-100 flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm font-black shrink-0">DH</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-emerald-900 text-sm">Versement au compte société</h3>
              <p className="text-xs text-emerald-600 mt-0.5">
                {centralDepositEligible.length} prêt(s) · {fmtAmt(centralDepositTotal)} DH
                {centralDepositSelected.length > 0 && ` · sélection : ${fmtAmt(centralDepositSelectedTotal)} DH`}
              </p>
            </div>
            <button
              onClick={() => { setCentralDepositState({ loading: false, error: '', success: '' }); setCentralDepositSelectedIds(centralDepositAllSelected ? [] : centralDepositEligible.map(p => p.id)) }}
              disabled={centralDepositState.loading || centralDepositEligible.length === 0}
              className="shrink-0 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 text-xs font-bold px-3 py-1.5 rounded-xl transition">
              {centralDepositAllSelected ? 'Désélectionner' : 'Tout sélectionner'}
            </button>
            <button
              onClick={() => handleCentralCodDeposit(centralDepositSelected)}
              disabled={centralDepositState.loading || centralDepositSelected.length === 0}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded-xl transition flex items-center gap-1.5">
              {centralDepositState.loading ? <>{spinner} ...</> : 'Verser sélection'}
            </button>
            <button
              onClick={() => handleCentralCodDeposit(centralDepositEligible)}
              disabled={centralDepositState.loading || centralDepositEligible.length === 0}
              className="shrink-0 bg-emerald-900 hover:bg-emerald-950 disabled:opacity-50 text-white text-xs font-bold px-4 py-1.5 rounded-xl transition">
              Tout verser
            </button>
          </div>
          {(centralDepositState.error || centralDepositState.success) && (
            <div className={`px-4 py-2 text-xs font-semibold ${centralDepositState.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {centralDepositState.error || centralDepositState.success}
            </div>
          )}
          <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
            {centralDepositEligible.map(p => {
              const selected = centralDepositSelectedIds.includes(p.id)
              return (
                <div key={p.id} className={`px-4 py-2.5 flex items-center gap-3 text-xs transition-colors ${selected ? 'bg-emerald-50/60' : ''}`}>
                  <input type="checkbox" checked={selected}
                    onChange={e => {
                      setCentralDepositState({ loading: false, error: '', success: '' })
                      setCentralDepositSelectedIds((ids: any) => e.target.checked ? [...new Set([...ids, p.id])] : (ids as any[]).filter((id: any) => id !== p.id))
                    }}
                    className="w-4 h-4 accent-emerald-600 shrink-0"
                  />
                  <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">{p.trackingId}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-700">{p.sender?.name || '—'} → {p.receiver?.name || '—'}</span>
                  <span className="font-black text-emerald-700 shrink-0">{fmtAmt(p.codAmount)} DH</span>
                  <button onClick={() => handleCentralCodDeposit([p])} disabled={centralDepositState.loading}
                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg font-bold transition">
                    Verser
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Versés au compte société — en attente chèque central */}
      {centralPending.length > 0 && (
        <SectionCard icon="🏦" title="Versés — en attente chèque central" count={centralPending.length}
          total={centralPending.reduce((s,p)=>s+parseFloat(p.codAmount||0),0)} accent="border-l-emerald-500">
          {centralPending.slice(0, 12).map(p => (
            <PRow key={p.id} p={p}
              badge={<span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">Versé société</span>}
              action={null}
            />
          ))}
        </SectionCard>
      )}

      {/* ═══ RETOUR FOND via Pointeur-Encaisseur ═══ */}
      {profile?.role === 'chef_agence' && (() => {
        const fmtAmt2 = (n: any) => Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 })
        const fmtD2 = (iso: any) => { try { return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return iso } }
        const codParcelIds = new Set((parcels as any[]).filter((p: any) => parseFloat(p.codAmount) > 0).map((p: any) => p.id))
        const isDocumentReglement = (r: any) => ['cheque', 'traite'].includes(r.modeReglement)
        const isKnownCodReglement = (r: any) => r.parcelId && codParcelIds.has(r.parcelId)
        const codReglements = (pointeurReglements as any[]).filter((r: any) => isKnownCodReglement(r) || isDocumentReglement(r))
        const grouped: Record<string, any[]> = {}
        codReglements.forEach((r: any) => {
          const key = r.rapportId || '__none__'
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(r)
        })
        const pendingCodRapports = (pointeurRapports as any[]).filter((r: any) => r.status === 'soumis' && grouped[r.id])
        const valideCodRapports  = (pointeurRapports as any[]).filter((r: any) => r.status === 'valide'  && grouped[r.id]).slice(0, 3)
        const enAttenteCod = (grouped['__none__'] || []) as any[]
        const totalCod = codReglements.reduce((s: number, r: any) => s + (r.montant || 0), 0)
        const codDocuments = codReglements
          .filter((r: any) => ['cheque', 'traite'].includes(r.modeReglement))
          .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        const displayedCodDocuments = codDocuments.filter((r: any) => codDocListMode === 'all' || r.modeReglement === codDocListMode)
        const selectedCodDocuments = displayedCodDocuments.filter((r: any) => selectedCodDocumentIds.includes(r.id))
        const toggleCodDocument = (id: string) => {
          setSelectedCodDocumentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
        }
        const selectAllDisplayedCodDocuments = () => {
          const ids = displayedCodDocuments.map((d: any) => d.id)
          const allSelected = ids.length > 0 && ids.every((id: string) => selectedCodDocumentIds.includes(id))
          setSelectedCodDocumentIds(prev => allSelected ? prev.filter(id => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])))
        }
        return (
          <div className="bg-white rounded-2xl border border-l-4 border-gray-100 border-l-amber-400 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2.5">
              <span className="text-lg leading-none">💰</span>
              <h3 className="font-bold text-gray-800 text-sm flex-1">Collecté par Pointeur-Encaisseur</h3>
              {pendingCodRapports.length > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">{pendingCodRapports.length} à valider</span>
              )}
              <span className="text-sm font-black text-amber-600">{fmtAmt2(totalCod)} DH</span>
            </div>

            {rapportError && (
              <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <span>{rapportError}</span>
                <button onClick={() => setRapportError('')} className="ml-auto text-red-400 hover:text-red-700 font-bold">✕</button>
              </div>
            )}

            <div className="px-4 py-3 border-b border-blue-50 bg-blue-50/30">
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-gray-800">Liste cheques / traites COD</p>
                    <p className="text-xs text-gray-500">
                      {displayedCodDocuments.length} document(s) affiche(s) - {fmtAmt2(displayedCodDocuments.reduce((s, d) => s + (d.montant || 0), 0))} DH
                    </p>
                  </div>
                  {[
                    { key: 'all', label: 'Tous' },
                    { key: 'cheque', label: 'Cheques' },
                    { key: 'traite', label: 'Traites' },
                  ].map(m => (
                    <button key={m.key} onClick={() => setCodDocListMode(m.key)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${codDocListMode === m.key ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-100 text-blue-700 hover:bg-blue-50'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {codDocuments.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                  <button onClick={selectAllDisplayedCodDocuments} className="px-3 py-1.5 rounded-lg bg-white border border-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-50 transition">
                    {displayedCodDocuments.length > 0 && displayedCodDocuments.every((d: any) => selectedCodDocumentIds.includes(d.id)) ? 'Desselectionner' : 'Selectionner tout'}
                  </button>
                  <button onClick={() => handleSendSelectedCodReglements(selectedCodDocuments)}
                    disabled={selectedCodDocuments.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5">
                    📤 Envoyer sélection à agence source ({selectedCodDocuments.length})
                  </button>
                  <button onClick={() => handlePrintCodDocumentList(selectedCodDocuments, 'Liste selectionnee cheques / traites COD')}
                    disabled={selectedCodDocuments.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition">
                    Imprimer selection ({selectedCodDocuments.length})
                  </button>
                  <button onClick={() => handlePrintCodDocumentList(displayedCodDocuments, 'Liste cheques / traites COD')}
                    disabled={displayedCodDocuments.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-xs font-bold transition">
                    Imprimer liste
                  </button>
                  </div>

                  <div className="bg-white border border-blue-100 rounded-xl overflow-hidden">
                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                    {displayedCodDocuments.map((d: any) => (
                      <label key={d.id} className="flex items-start gap-3 px-3 py-2.5 text-xs hover:bg-blue-50/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCodDocumentIds.includes(d.id)}
                          onChange={() => toggleCodDocument(d.id)}
                          className="mt-1 w-4 h-4 accent-blue-600 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full font-bold ${d.modeReglement === 'traite' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                              {d.modeReglement === 'traite' ? 'Traite' : 'Cheque'}
                            </span>
                            <span className="font-mono text-blue-700">{d.trackingNumber || '-'}</span>
                            <span className="font-black text-gray-800">{fmtAmt2(d.montant)} DH</span>
                          </div>
                          <p className="text-gray-700 mt-1 truncate">{d.expediteur || '-'} {'->'} {d.destinataire || '-'}</p>
                          <p className="text-gray-400 mt-0.5 truncate">
                            {d.banque || 'Banque -'} - N {d.numeroPiece || '-'}{d.dateEcheance ? ` - Ech. ${fmtD2(d.dateEcheance)}` : ''} - {d.pointeurName || 'Pointeur -'} - {d.status || '-'}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  </div>
                </>
                ) : (
                  <div className="bg-white border border-blue-100 rounded-xl px-3 py-4 text-center">
                    <p className="text-sm font-bold text-gray-500">Aucun cheque ou traite COD pour le moment</p>
                    <p className="text-xs text-gray-400 mt-1">Les documents saisis par le pointeur-encaisseur apparaitront ici.</p>
                  </div>
                )}
              </div>

            {/* Reglements pas encore groupés en rapport */}
            {enAttenteCod.length > 0 && (
              <div className="px-4 py-3 border-b border-yellow-50">
                <p className="text-xs font-semibold text-amber-600 mb-2">🕐 Encaissés — en attente de rapport ({enAttenteCod.length})</p>
                <div className="space-y-1">
                  {enAttenteCod.map(e => (
                    <div key={e.id} className="flex items-center gap-2 text-xs py-1">
                      <span className="text-gray-400">💵</span>
                      <span className="flex-1 text-gray-700 truncate">{e.expediteur || '—'}{e.trackingNumber ? ` — #${e.trackingNumber}` : ''}</span>
                      <span className="font-bold text-amber-700 shrink-0">{fmtAmt2(e.montant)} DH</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rapports soumis contenant des RETOUR FOND */}
            {pendingCodRapports.map(rapport => {
              const isBusy = rapportValidating?.startsWith(rapport.id)
              const rEntries = grouped[rapport.id] || []
              const totalR = rEntries.reduce((s, e) => s + (e.montant || 0), 0)
              return (
                <div key={rapport.id} className="p-4 space-y-2 bg-amber-50/40 border-b border-amber-100">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">⏳ Rapport soumis</span>
                      </div>
                      <p className="font-bold text-gray-800 mt-1">{rapport.pointeurName}</p>
                      <p className="text-xs text-gray-400">{fmtD2(rapport.submittedAt)} · {rEntries.length} RETOUR FOND</p>
                    </div>
                    <p className="text-base font-black text-amber-700 shrink-0">{fmtAmt2(totalR)} DH</p>
                  </div>
                  <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
                    <div className="divide-y divide-gray-50">
                      {rEntries.map(e => (
                        <div key={e.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                          <span>💵</span>
                          <span className="flex-1 text-gray-700 truncate">{e.expediteur}{e.trackingNumber ? ` — #${e.trackingNumber}` : ''}</span>
                          <span className="font-bold text-gray-700">{fmtAmt2(e.montant)} DH</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={rapportNotesMap[rapport.id] || ''}
                    onChange={e => setRapportNotesMap((m: any) => ({ ...m, [rapport.id]: e.target.value }))}
                    rows={1} placeholder="Note chef d'agence (optionnel)..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:border-amber-400 focus:outline-none resize-none bg-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleRejeterRapport(rapport)} disabled={!!isBusy}
                      className="py-2 rounded-xl bg-red-100 text-red-700 font-bold text-xs hover:bg-red-200 disabled:opacity-50 transition flex items-center justify-center gap-1">
                      {rapportValidating === rapport.id + '_rejeter'
                        ? <><div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /> ...</>
                        : <><X className="w-3.5 h-3.5" /> Rejeter</>}
                    </button>
                    <button onClick={() => handleValiderRapport(rapport)} disabled={!!isBusy}
                      className="py-2 rounded-xl bg-green-600 text-white font-bold text-xs hover:bg-green-700 disabled:opacity-50 transition flex items-center justify-center gap-1">
                      {rapportValidating === rapport.id + '_valider'
                        ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> ...</>
                        : <><Check className="w-3.5 h-3.5" /> Valider</>}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Rapports RETOUR FOND validés */}
            {valideCodRapports.length > 0 && (
              <div className="divide-y divide-gray-50">
                <div className="px-4 py-2 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Validés récemment</p>
                </div>
                {valideCodRapports.map(rapport => (
                  <div key={rapport.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-700">{rapport.pointeurName}</p>
                      <p className="text-xs text-gray-400">{fmtD2(rapport.validatedAt)} · {(grouped[rapport.id] || []).length} RETOUR FOND</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Validé</span>
                      <p className="text-xs font-bold text-gray-700 mt-1">{fmtAmt2((grouped[rapport.id] || []).reduce((s, e) => s + e.montant, 0))} DH</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* ════ RÔLE : AGENT DESTINATAIRE ════ */}
      {(() => {
        const openRequests = (agentCodRequests as any[]).filter((r: any) => r.status !== 'resolved')
        if (openRequests.length === 0) return null
        return (
          <div className="bg-white rounded-2xl border border-l-4 border-amber-200 border-l-amber-500 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-800 text-sm flex-1">Demandes Admin — Règlement</h3>
              <span className="bg-amber-500 text-white text-xs font-black px-2.5 py-1 rounded-full">{openRequests.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {openRequests.map(req => {
                const parcel = merged.find(p => p.id === req.parcelId || p.trackingId === req.trackingId)
                const isBusy = codRequestBusy === req.id
                return (
                  <div key={req.id} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">{req.trackingId}</span>
                          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-100">{fmtAmt(req.codAmount)} DH</span>
                        </div>
                        <p className="text-sm font-bold text-gray-800">{req.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{req.senderName || '—'} → {req.receiverName || '—'}</p>
                        {((req.replies || []) as any[]).map((rep: any, idx: number) => (
                          <p key={idx} className="text-xs mt-2 bg-gray-50 rounded-xl px-3 py-2 text-gray-700 border border-gray-100">
                            <span className="font-bold text-gray-500">{rep.authorRole === 'admin' ? 'Admin' : 'Moi'} :</span> {rep.message}
                          </p>
                        ))}
                      </div>
                      <div className="shrink-0">
                        {parcel?.codSenderPaid ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1.5 rounded-xl font-bold">✓ Réglé</span>
                        ) : parcel ? (
                          <button onClick={() => handleSettleCodFromRequest(req, parcel)} disabled={isBusy}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                            {isBusy ? 'Traitement…' : '✓ Régler'}
                          </button>
                        ) : (
                          <button onClick={handleLoadAllCod} disabled={codLoadingAll}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                            Charger
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={codRequestDrafts[req.id] || ''}
                        onChange={e => setCodRequestDrafts((d: any) => ({ ...d, [req.id]: e.target.value }))}
                        placeholder="Répondre à l'Admin…"
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-xs focus:border-amber-400 focus:outline-none bg-gray-50"
                      />
                      <button onClick={() => handleReplyCodRequest(req)} disabled={isBusy}
                        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                        Envoyer
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {dstHasData && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 bg-gray-50 rounded-full py-1">Agence destinataire</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          <SectionCard icon="🤝" title="À valider — valeurs livreur" count={dst_collected.length} total={totDstCollect} accent="border-l-red-500">
            {receptionCodError && (
              <div className="mx-4 my-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                {receptionCodError}
              </div>
            )}
            {dst_collected.map(p => {
              const isReceptioning = codReceptioning === p.id
              return (
                <PRow key={p.id} p={p}
                  badge={<span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Collecté par livreur</span>}
                  action={
                    <button onClick={() => handleReceptionCod(p)} disabled={isReceptioning}
                      className="mt-1 flex items-center gap-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                      {isReceptioning ? <>{spinner} …</> : <>🤝 Réceptionner</>}
                    </button>
                  }
                />
              )
            })}
          </SectionCard>

          {/* ⭐ COD ENVOYÉS PAR LE POINTEUR AU CHEF */}
          <SectionCard icon="📋" title="Envoyés par le Pointeur — à valider et envoyer" count={dst_fromPointeur.length} total={dst_fromPointeur.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)} accent="border-l-indigo-500">
            {dst_fromPointeur.map(p => {
              const isValidated = p.codValidatedByChef === true
              return (
                <PRow key={p.id} p={p}
                  badge={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                        Envoyé par {p.codSentToChefBy || 'Pointeur'}
                      </span>
                      {isValidated && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                          ✅ Validé
                        </span>
                      )}
                    </div>
                  }
                  action={
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {/* TODO: Implémenter handleValidateCodReport et handleSendCodToSource */}
                    </div>
                  }
                />
              )
            })}
          </SectionCard>

          <SectionCard icon="📤" title="Réceptionnés — à envoyer agence source" count={dst_aEnvoyer.length} total={totDstEnvoy} accent="border-l-orange-500">
            {dst_aEnvoyer.map(p => {
              const isSending = codSending === p.id
              return (
                <PRow key={p.id} p={p}
                  badge={<span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">Réceptionné ✓</span>}
                  action={
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <button onClick={() => handleMarkSentToSource(p)} disabled={isSending}
                        className="flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                        {isSending ? <>{spinner} …</> : <>📤 Envoyé à l'agence source</>}
                      </button>
                    </div>
                  }
                />
              )
            })}
          </SectionCard>

          <SectionCard icon="🔄" title="Envoyés — en attente de confirmation" count={dst_envoye.length} total={0} accent="border-l-sky-500">
            {dst_envoye.map(p => (
              <PRow key={p.id} p={p}
                badge={
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                    Envoyé le {fmtDate(p.codSentToSourceAt)}
                    {p.codSentToSourceBy && <span className="ml-1">par {p.codSentToSourceBy}</span>}
                  </span>
                }
                action={null}
              />
            ))}
          </SectionCard>

          {/* ⭐ SUIVI PAIEMENT CLIENT */}
          {dst_attentePaiementClient.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest px-2 bg-purple-50 rounded-full py-1">💰 Suivi paiement clients</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>

              <SectionCard icon="⏳" title="En attente de paiement au client" count={dst_attentePaiementClient.length} total={totDstAttentePaiement} accent="border-l-purple-500">
                <div className="px-4 py-2 bg-purple-50/30 border-b border-purple-100/50">
                  <p className="text-xs text-purple-700 font-semibold">
                    💡 Ces COD ont été collectés dans votre ville. Le paiement au client/expéditeur sera effectué par l'agence source.
                  </p>
                </div>
                {dst_attentePaiementClient.map(p => (
                  <PRow key={p.id} p={p}
                    badge={<span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">⏳ Client non payé</span>}
                    action={null}
                  />
                ))}
              </SectionCard>
            </div>
          )}

          {dst_clientPaye.length > 0 && (
            <SectionCard icon="📜" title="Historique - Clients payés par agence source" count={dst_clientPaye.length} total={totDstClientPaye} accent="border-l-green-500">
              <div className="px-4 py-2 bg-green-50/30 border-b border-green-100/50">
                <p className="text-xs text-green-700 font-semibold">
                  ✅ Ces clients ont été payés par l'agence source. Cycle complet terminé.
                </p>
              </div>
              <div className="max-h-96 overflow-y-auto">
              {dst_clientPaye.slice(0, showHistoryDst).map(p => {
                const st = SERVICE_TYPES.find(s => s.key === p.serviceType)
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[11px] font-bold text-gray-400">{p.trackingId}</span>
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.sender?.name || '—'}</p>
                      <p className="text-[11px] text-gray-400">
                        {st?.emoji || '💵'} {st?.label || ''} · Payé le {fmtDate(p.codSenderPaidAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-green-600">{fmtAmt(p.codAmount)} DH</p>
                      <span className="text-[10px] text-green-500 font-semibold">✓ Réglé</span>
                    </div>
                  </div>
                )
              })}
              </div>
              {/* ⭐ Bouton "Voir plus" */}
              {dst_clientPaye.length > showHistoryDst && (
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                  <button
                    onClick={() => setShowHistoryDst(prev => prev + 20)}
                    className="w-full py-2 text-xs font-bold text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition">
                    Voir plus ({dst_clientPaye.length - showHistoryDst} restant{dst_clientPaye.length - showHistoryDst > 1 ? 's' : ''})
                  </button>
                </div>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {/* ════ RÔLE : AGENT EXPÉDITEUR ════ */}
      {src.length > 0 && (
      <div className="space-y-3">
        {dstHasData && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 bg-gray-50 rounded-full py-1">Agence expéditeur</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>
        )}

        <SectionCard icon="🚚" title="En cours de collecte" count={src_enCours.length} total={totSrcPending} accent="border-l-yellow-500">
          {src_enCours.map(p => {
            const cs = COD_STATUS[p.codStatus || 'pending']
            return (
              <PRow key={p.id} p={p}
                badge={<span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cs.bg} ${cs.text}`}>{cs.label}</span>}
                action={null}
              />
            )
          })}
        </SectionCard>

        <SectionCard icon="✅" title="COD Collecté par livreur" count={src_collected.length} total={totSrcCollected} accent="border-l-lime-500">
          {src_collected.map(p => (
            <PRow key={p.id} p={p}
              badge={<span className="text-[10px] px-2 py-0.5 rounded-full bg-lime-50 text-lime-700 font-semibold border border-lime-100">✓ Collecté</span>}
              action={null}
            />
          ))}
        </SectionCard>

        <SectionCard icon="⏳" title="Chez agence destinataire" count={src_remisAgent.length} total={totSrcRemis} accent="border-l-orange-500">
          {src_remisAgent.map(p => (
            <PRow key={p.id} p={p}
              badge={<span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-semibold border border-orange-100">Remis agence dest.</span>}
              action={null}
            />
          ))}
        </SectionCard>

        <SectionCard icon="📥" title="En route — confirmer réception" count={src_enRoute.length} total={totSrcEnRoute} accent="border-l-blue-500">
          {src_enRoute.map(p => {
            const isConfirming = codConfirming === p.id
            return (
              <PRow key={p.id} p={p}
                badge={<span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-100">Envoyé le {fmtDate(p.codSentToSourceAt)}</span>}
                action={
                  <button onClick={() => openReceiveModal(p)} disabled={isConfirming}
                    className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                    {isConfirming ? <>{spinner} …</> : <>📥 Reçu</>}
                  </button>
                }
              />
            )
          })}
        </SectionCard>

        <SectionCard icon="💵" title="Reçu — à régler avec l'expéditeur" count={src_aConfirmer.length} total={totSrcAConf} accent="border-l-green-500">
          {src_aConfirmer.length > 1 && (
            <div className="px-4 py-2.5 bg-green-50/60 border-b border-green-100 flex items-center justify-between">
              <span className="text-xs text-green-700 font-bold">{src_aConfirmer.length} colis · {fmt(totSrcAConf)} DH</span>
              <button onClick={() => handleBatchSettle(src_aConfirmer)} disabled={batchSettling}
                className="flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl font-bold transition">
                {batchSettling ? <>{spinner} …</> : '✅ Tout régler'}
              </button>
            </div>
          )}
          {src_aConfirmer.map(p => {
            const isSettling = codSettling === p.id
            return (
              <PRow key={p.id} p={p}
                badge={<span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Valeurs reçues ✓</span>}
                action={
                  <button onClick={() => handleSettleCod(p)} disabled={isSettling}
                    className="mt-1 flex items-center gap-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-xl font-bold transition">
                    {isSettling ? <>{spinner} …</> : <><Check className="w-3 h-3" /> Régler</>}
                  </button>
                }
              />
            )
          })}
        </SectionCard>

        {(() => {
          const oldRemis = src.filter(p => p.codStatus === 'remis' && !p.codSentToSource && !p.codReceivedBySource && !p.codSenderPaid)
          if (oldRemis.length <= 1) return null
          const total = oldRemis.reduce((s,p) => s + parseFloat(p.codAmount||0), 0)
          return (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">🗂️ Données existantes</p>
                <p className="text-xs text-amber-600 mt-0.5">{oldRemis.length} colis · {fmt(total)} DH</p>
              </div>
              <button onClick={() => handleBatchSettle(oldRemis)} disabled={batchSettling}
                className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
                {batchSettling ? <>{spinner} …</> : '✅ Tout marquer réglé'}
              </button>
            </div>
          )
        })()}

        {src_regle.length > 0 && (
          <div className="bg-white rounded-2xl border border-l-4 border-gray-100 border-l-green-400 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2.5">
              <span className="text-base leading-none">✅</span>
              <h3 className="font-bold text-gray-800 text-sm flex-1">📜 Historique - Réglés avec expéditeur</h3>
              <span className="bg-gray-100 text-gray-600 text-xs font-black px-2.5 py-1 rounded-full">{src_regle.length}</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {src_regle.slice(0, showHistorySrc).map(p => {
                const st = stMap[p.serviceType]
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[11px] font-bold text-gray-400">{p.trackingId}</span>
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.sender?.name || '—'}</p>
                      <p className="text-[11px] text-gray-400">{st?.emoji || '💵'} {st?.label || ''} · réglé le {fmtDate(p.codSenderPaidAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-green-600">{fmtAmt(p.codAmount)} DH</p>
                      <span className="text-[10px] text-green-500 font-semibold">✓ Réglé</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* ⭐ Bouton "Voir plus" */}
            {src_regle.length > showHistorySrc && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <button
                  onClick={() => setShowHistorySrc(prev => prev + 20)}
                  className="w-full py-2 text-xs font-bold text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition">
                  Voir plus ({src_regle.length - showHistorySrc} restant{src_regle.length - showHistorySrc > 1 ? 's' : ''})
                </button>
              </div>
            )}
          </div>
        )}

      </div>
      )}

      {/* ════ Versements à la banque ════ */}
      {bankDeposits.length > 0 && (
        <div className="bg-white rounded-2xl border border-l-4 border-gray-100 border-l-blue-500 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2.5">
            <span className="text-lg leading-none">🏦</span>
            <h3 className="font-bold text-gray-800 text-sm flex-1">Versements à la banque</h3>
            <span className="bg-gray-100 text-gray-600 text-xs font-black px-2.5 py-1 rounded-full">{bankDeposits.length}</span>
            <span className="text-sm font-black text-blue-700">
              {fmtAmt((bankDeposits as any[]).reduce((s: number,d: any)=>s+Number.parseFloat(d.amount||0),0))} DH
            </span>
            <button onClick={() => handlePrintBankDeposits(bankDeposits)}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl font-semibold transition">
              🖨️ Imprimer
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {(bankDeposits as any[]).map((dep: any) => (
              <div key={dep.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-base shrink-0">🏦</div>
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-[11px] font-bold text-gray-400">{dep.trackingId}</span>
                  <p className="text-sm font-semibold text-gray-800 truncate">{dep.senderName} → {dep.receiverName}</p>
                  <p className="text-[11px] text-gray-400">
                    {dep.bankName}{dep.refNum ? ` · N° ${dep.refNum}` : ''}{dep.depositDate ? ` · ${dep.depositDate}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-blue-700">{fmtAmt(dep.amount)} DH</p>
                  <span className="text-[10px] text-blue-500 font-semibold">✓ Versé</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredCodParcels.length === 0 && !codLoadingAll && bankDeposits.length === 0 && (
        <div className="text-center py-20 text-gray-300">
          <div className="text-5xl mb-3">💰</div>
          <p className="text-sm font-semibold text-gray-400">Aucun colis RETOUR FOND</p>
          <p className="text-xs mt-1">Chargez l'historique pour les anciens colis.</p>
        </div>
      )}
    </div>
  )
}
