// 🧾 Encaisseur Central — chèques & traites des retours de fonds :
//  • ChequeEntryModal : formulaire ouvert au POINTAGE d'un colis payé par chèque / traite
//    (type, N°, banque, montant ; plusieurs documents possibles pour un même colis — plus de date d'échéance au pointage) ;
//  • ReceptionSheetModal : « Fiche de réception des chèques et traites » d'un client expéditeur,
//    à imprimer (A4 portrait), joindre aux chèques / traites et faire signer par le client.
import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Printer, Save } from 'lucide-react'
import { codDocTypeOf, codDocPartOf } from '../../utils/codParts'
import type { CodDocument } from '../../firebase/central'
import { groupOperationShares, operationMembers } from './pointageCancel'

const money = (n: any) => (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2 })
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const toDate = (v: any): Date | null => {
  if (!v) return null
  const d = v?.toDate ? v.toDate() : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const fmtD = (v: any) => { const d = toDate(v); return d ? d.toLocaleDateString('fr-MA') : '' }
const fmtYmd = (s: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s || '')
export const nicOf = (p: any) => p?.senderNic || p?.sender?.nic || p?.trackingId || ''
const senderNameOf = (p: any) => String(p?.sender?.name || p?.senderName || p?.clientName || '').trim()
export const clientKeyOf = (p: any) => senderNameOf(p).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

/** Le retour de fonds contient-il un chèque ou une traite (y compris la part document d'un RF mixte) ? */
export const isDocParcel = (p: any): boolean => !!codDocTypeOf(p) && (codDocPartOf(p) > 0 || (parseFloat(p?.codAmount) || 0) > 0)
/** Montant attendu en chèque / traite. */
export const docAmountOf = (p: any): number => codDocPartOf(p) || (parseFloat(p?.codAmount) || 0)
export const docsOf = (p: any): CodDocument[] => (Array.isArray(p?.codDocuments) ? p.codDocuments : [])
export const hasDocData = (p: any): boolean => docsOf(p).some(d => d.numero && d.banque)

// ─────────────────────────────────────────────────────────────────────────────
// Formulaire de saisie (au pointage)
// ─────────────────────────────────────────────────────────────────────────────
interface Row { type: 'cheque' | 'traite'; numero: string; banque: string; montant: string; echeance: string }

/** 🔗 Chèque groupé déjà enregistré sur cette expédition (un seul chèque pour plusieurs expéditions). */
export const groupOf = (p: any): CodDocument | null => docsOf(p).find(d => (d.groupIds || []).length > 1) || null

export function ChequeEntryModal({ parcel, alreadyControlled, loadCandidates, findByNic, onClose, onSave }: {
  parcel: any
  alreadyControlled: boolean
  /** Expéditions chèque / traite du MÊME expéditeur, TOUTES DATES (recherche en base, pour un chèque groupé) */
  loadCandidates?: () => Promise<any[]>
  /** Recherche d'une expédition par N° EXP dans toute la base (renvoie un message si elle ne peut pas être groupée) */
  findByNic?: (nic: string) => Promise<{ parcel?: any; error?: string }>
  onClose: () => void
  /** point = true : enregistrer PUIS pointer ; group = expéditions couvertes par le même chèque (celle-ci comprise) ;
   *  cashRest = le destinataire a payé le reste EN ESPÈCES (chèque reçu < attendu) → signalement à l'admin */
  onSave: (docs: CodDocument[], point: boolean, group?: any[], cashRest?: { cash: number; expected: number; received: number; note: string }) => Promise<void>
}) {
  const expected = docAmountOf(parcel)
  const defType = (codDocTypeOf(parcel) === 'traite' ? 'traite' : 'cheque') as Row['type']
  const existingGroup = groupOf(parcel)
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = docsOf(parcel)
    // 🔗 Opération groupée : TOUS ses chèques / traites (03/11/2026 : plusieurs possibles), montant = celui du chèque
    const groupDocs = existing.filter(d => (d.groupIds || []).length > 1)
    if (groupDocs.length) return groupDocs.map(d => ({ type: d.type, numero: d.numero, banque: d.banque, montant: String(d.groupTotal ?? d.montant ?? ''), echeance: d.echeance || '' }))
    if (existing.length) return existing.map(d => ({ type: d.type, numero: d.numero, banque: d.banque, montant: String(d.montant ?? ''), echeance: d.echeance || '' }))
    return [{ type: defType, numero: '', banque: '', montant: expected ? String(expected) : '', echeance: '' }]
  })
  const [grouped, setGrouped] = useState(!!existingGroup)
  const [picked, setPicked] = useState<Set<string>>(() => new Set((existingGroup?.groupIds || []).filter(id => id !== parcel.id)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [candidates, setCandidates] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [q, setQ] = useState('')
  const [qMsg, setQMsg] = useState('')
  // Recherche lancée dès que « plusieurs expéditions » est coché (les expéditions d'un même chèque peuvent
  // avoir des dates de création différentes : recherche sur toute la base, pas seulement la période affichée)
  useEffect(() => {
    if (!grouped || !loadCandidates || candidates.length) return
    let alive = true
    setSearching(true)
    setLoadFailed(false)
    loadCandidates().then(c => { if (alive) setCandidates(c) }).catch(() => { if (alive) setLoadFailed(true) }).finally(() => alive && setSearching(false))
    return () => { alive = false }
  }, [grouped])

  // Expéditions proposées : même expéditeur, sans chèque saisi, ou déjà dans CE groupe
  const options = useMemo(() => candidates
    .filter(c => c.id !== parcel.id)
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0)), [candidates, parcel.id])
  // 🔎 Filtre de la liste : N° EXP, destinataire, date (jj/mm/aaaa) ou montant
  const qn = q.trim().toLowerCase()
  const shownOptions = !qn ? options : options.filter(c =>
    String(nicOf(c)).toLowerCase().includes(qn) || String(c?.receiver?.name || '').toLowerCase().includes(qn)
    || fmtD(c.createdAt).includes(qn) || String(docAmountOf(c)).includes(qn.replace(',', '.')) || picked.has(c.id))
  // N° EXP absent de la liste : recherche dans toute la base, ajoutée et cochée si elle peut être groupée
  const searchNic = async () => {
    setQMsg('')
    const v = q.trim()
    if (!v || !findByNic) return
    const known = options.find(x => String(nicOf(x)) === v)
    if (known) {
      if (known._blocked) { setQMsg(`${v} : ${known._blocked} — ne peut pas être groupée ici.`); return }
      if (!picked.has(known.id) && !confirmOther(known)) return
      setPicked(s => new Set(s).add(known.id)); setQMsg(`✓ ${v} cochée.`); return
    }
    const r: { parcel?: any; error?: string } = await findByNic(v).catch(e => ({ error: String(e?.message || e) }))
    if (r.error || !r.parcel) { setQMsg(r.error || `N° EXP ${v} introuvable.`); return }
    if (r.parcel.id === parcel.id) { setQMsg(`✓ ${v} est l'expédition en cours : elle est déjà incluse (en tête de liste).`); return }
    if (!confirmOther(r.parcel)) return
    setCandidates(cs => (cs.some(c => c.id === r.parcel.id) ? cs : [r.parcel, ...cs]))
    setPicked(s => new Set(s).add(r.parcel.id))
    setQMsg(`✓ ${v} ajoutée au chèque.`)
  }
  const members = grouped ? [parcel, ...options.filter(c => picked.has(c.id) && !c._blocked)] : [parcel]
  const expectedTotal = members.reduce((s, m) => s + docAmountOf(m), 0)
  const total = rows.reduce((s, r) => s + (parseFloat(String(r.montant).replace(',', '.')) || 0), 0)
  const diff = Math.round((total - expectedTotal) * 100) / 100
  // ⚠️ Chèque reçu INFÉRIEUR au montant attendu (COD pas déjà mixte) : le reste a pu être payé en espèces.
  // 🔗 (27/10/2026) Aussi pour un CHÈQUE GROUPÉ (plusieurs expéditions payées par un chèque + le reste en espèces).
  const canSignalCash = diff <= -0.01 && total > 0 && (grouped || parcel?.codMixed !== true)
  // 🔁 Fenêtre rouverte après enregistrement : le reste en espèces déjà signalé est réaffiché (case, montant, remarque)
  const savedCash = parcel?.codDocMismatch === true && Number(parcel?.codDocMismatchCash) > 0 ? Number(parcel.codDocMismatchCash) : 0
  const [cashRest, setCashRest] = useState(savedCash > 0)
  const [cashNote, setCashNote] = useState(savedCash > 0 ? String(parcel?.codDocMismatchNote || '') : '')
  // 💵 Montant payé en espèces : prérempli avec le reste (attendu − chèque), modifiable
  const [cashInput, setCashInput] = useState(savedCash > 0 ? String(savedCash) : '')
  const cashDefault = Math.round(-diff * 100) / 100
  const cashAmount = cashInput.trim() ? (parseFloat(cashInput.replace(',', '.')) || 0) : cashDefault
  const cashGap = Math.round((total + cashAmount - expectedTotal) * 100) / 100
  // 🔗 Parts de chaque expédition (chèques puis espèces, au prorata de son montant attendu) — même calcul que l'enregistrement
  const isMulti = grouped && members.length > 1
  const amountsOf = () => rows.map(r => parseFloat(String(r.montant).replace(',', '.')) || 0)
  const shares = isMulti ? groupOperationShares(operationMembers(parcel, members), docAmountOf, amountsOf(), canSignalCash && cashRest ? cashAmount : 0) : []
  // ➕ Nouveau chèque / traite : prérempli avec ce qui reste à couvrir
  const addRow = () => setRows(rs => {
    const used = rs.reduce((s, r) => s + (parseFloat(String(r.montant).replace(',', '.')) || 0), 0)
    const rest = Math.round((expectedTotal - used) * 100) / 100
    return [...rs, { type: defType, numero: '', banque: rs[rs.length - 1]?.banque || '', montant: rest > 0 ? String(rest) : '', echeance: '' }]
  })
  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  // 🔗 Expéditeur écrit autrement / différent : confirmation avant de l'ajouter au chèque (plus de refus — 24/10/2026)
  const confirmOther = (c: any) => !c?._otherSender || confirm(
    `${nicOf(c)} : l'expéditeur est « ${c._otherSender} » (et non « ${senderNameOf(parcel) || '—'} »).\n\n` +
    `Même client mal saisi, ou chèque unique du destinataire pour plusieurs expéditeurs ?\nAjouter cette expédition au chèque ?`)
  const togglePick = (id: string) => {
    const c = options.find(x => x.id === id)
    if (!picked.has(id) && !confirmOther(c)) return
    setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const submit = async (point: boolean) => {
    setError('')
    // Liste des expéditions pas encore (ou mal) chargée : un enregistrement maintenant retirerait du chèque
    // groupé les expéditions qui n'apparaissent pas encore
    if (grouped && searching) return setError('Recherche des expéditions de cet expéditeur en cours… patientez.')
    if (grouped && loadFailed && existingGroup) return setError('Impossible de charger les expéditions de ce chèque groupé : fermez puis rouvrez la fenêtre.')
    if (grouped && members.length < 2) return setError('Cochez au moins une autre expédition couverte par ce chèque.')
    for (const [i, r] of rows.entries()) {
      const n = i + 1
      if (!r.numero.trim()) return setError(`Ligne ${n} : saisissez le N° du ${r.type === 'traite' ? 'la traite' : 'chèque'}.`)
      if (!r.banque.trim()) return setError(`Ligne ${n} : saisissez la banque.`)
      if (!(parseFloat(String(r.montant).replace(',', '.')) > 0)) return setError(`Ligne ${n} : montant invalide.`)
    }
    const signal = canSignalCash && cashRest
    if (signal && !(cashAmount > 0)) return setError('Montant payé en espèces invalide.')
    if (expectedTotal > 0 && Math.abs(diff) >= 0.01 && !signal
      && !confirm(`Le total saisi (${money(total)} DH) est différent du montant attendu (${money(expectedTotal)} DH${grouped ? ` pour ${members.length} expéditions` : ''}).\n\nEnregistrer quand même ?`)) return
    if (signal && Math.abs(cashGap) >= 0.01
      && !confirm(`Chèque ${money(total)} DH + espèces ${money(cashAmount)} DH = ${money(total + cashAmount)} DH, différent du montant attendu (${money(expectedTotal)} DH).\n\nEnregistrer quand même ?`)) return
    setSaving(true)
    try {
      await onSave(rows.map(r => ({
        type: r.type, numero: r.numero.trim(), banque: r.banque.trim().toUpperCase(),
        montant: parseFloat(String(r.montant).replace(',', '.')) || 0, echeance: r.echeance,
      })), point, grouped ? members : undefined,
      signal ? { cash: Math.round(cashAmount * 100) / 100, expected: expectedTotal, received: total, note: cashNote.trim() } : undefined)
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de l\'enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  // 🖨️ Résumé de l'opération (tel que saisi à l'écran) : expéditions, chèque(s) / traite(s), espèces, totaux
  const printSummary = () => printChequeOperationSummary({
    members: isMulti ? operationMembers(parcel, members) : members,
    rows: rows.map(r => ({ type: r.type, numero: r.numero.trim(), banque: r.banque.trim().toUpperCase(), montant: parseFloat(String(r.montant).replace(',', '.')) || 0 })),
    grouped: isMulti, expectedTotal, cash: canSignalCash && cashRest ? cashAmount : 0, note: cashRest ? cashNote.trim() : '',
    shares: isMulti ? shares : undefined,
  })

  const inp = 'w-full px-2.5 py-2 rounded-xl border-2 border-slate-200 focus:border-purple-400 focus:outline-none text-sm font-semibold'
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-3" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-slate-800">🧾 Chèques / traites{canSignalCash && cashRest ? ' + espèces' : ''}</h3>
            {/* 🔗 Chèque groupé : TOUS les N° EXP et le montant TOTAL attendu (27/10/2026) */}
            {grouped && members.length > 1 ? (
              <p className="text-xs text-slate-500">
                {members.length} expéditions · N° EXP <b>{members.map(m => nicOf(m)).join(', ')}</b> · {senderNameOf(parcel) || '—'}
                {' '}· montant attendu total <b className="text-emerald-700">{money(expectedTotal)} DH</b>
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                N° EXP <b>{nicOf(parcel)}</b> · {senderNameOf(parcel) || '—'} → {parcel?.receiver?.name || '—'} · montant attendu <b className="text-emerald-700">{money(expected)} DH</b>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* 1️⃣ Chèques / traites reçus (03/11/2026 : plusieurs possibles, même pour plusieurs expéditions) */}
          <p className="text-xs font-black text-slate-500 uppercase tracking-wide">1. Chèques / traites reçus ({rows.length}) · total {money(total)} DH</p>
          {rows.map((r, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 p-3 bg-slate-50/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-black text-slate-500">{r.type === 'traite' ? 'Traite' : 'Chèque'} {i + 1}</span>
                <div className="flex gap-1">
                  {(['cheque', 'traite'] as const).map(t => (
                    <button key={t} type="button" onClick={() => set(i, { type: t })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black border ${r.type === t ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                      {t === 'cheque' ? '📋 Chèque' : '📝 Traite'}
                    </button>
                  ))}
                </div>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows(rs => rs.filter((_, k) => k !== i))} className="ml-auto p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Retirer ce document">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <label className="text-[11px] font-bold text-slate-500">N° {r.type === 'traite' ? 'traite' : 'chèque'} *
                  <input autoFocus={i === 0} className={inp} value={r.numero} onChange={e => set(i, { numero: e.target.value })} placeholder="ex. 0012345" />
                </label>
                <label className="text-[11px] font-bold text-slate-500">Banque *
                  <input className={inp} value={r.banque} onChange={e => set(i, { banque: e.target.value })} placeholder="ex. BMCE, CIH…" list="cc-banques" />
                </label>
                <label className="text-[11px] font-bold text-slate-500">Montant de ce {r.type === 'traite' ? 'document' : 'chèque'} (DH) *
                  <input className={inp} inputMode="decimal" value={r.montant} onChange={e => set(i, { montant: e.target.value })} />
                </label>
              </div>
            </div>
          ))}
          <datalist id="cc-banques">
            {['ATTIJARIWAFA BANK', 'BMCE BANK OF AFRICA', 'BANQUE POPULAIRE', 'CIH BANK', 'SOCIÉTÉ GÉNÉRALE', 'CRÉDIT DU MAROC', 'CRÉDIT AGRICOLE', 'BMCI', 'AL BARID BANK', 'CFG BANK'].map(b => <option key={b} value={b} />)}
          </datalist>
          {/* ➕ Toujours affiché (avant : caché dès que « plusieurs expéditions » était coché) */}
          <button type="button" onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-purple-300 text-xs font-black text-purple-700 hover:bg-purple-50 w-full justify-center">
            <Plus className="w-4 h-4" /> Ajouter un chèque / une traite{isMulti ? ' (pour ces expéditions)' : ''}
          </button>

          {/* 2️⃣ Expéditions payées par ces chèques : celle-ci, puis une ou plusieurs autres */}
          <p className="text-xs font-black text-slate-500 uppercase tracking-wide pt-1">2. Expéditions payées par {rows.length > 1 ? 'ces chèques / traites' : 'ce chèque / cette traite'}</p>
          <div className={`rounded-2xl border p-3 ${grouped ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200'}`}>
            <label className="flex items-center gap-2 text-sm font-black text-indigo-800 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={grouped}
                onChange={e => setGrouped(e.target.checked)} />
              🔗 Ajouter une ou plusieurs autres expéditions (même expéditeur ou même destinataire, toutes dates)
            </label>
            {!grouped && <p className="text-xs text-slate-500 mt-1">Pour l'instant : seulement {nicOf(parcel)} ({money(expected)} DH).</p>}
            {grouped && (
              searching ? <p className="text-xs text-slate-500 mt-2">Recherche des expéditions de cet expéditeur (toutes dates)…</p>
              : options.length === 0 && !findByNic
                ? <p className="text-xs text-slate-500 mt-2">Aucune autre expédition chèque / traite (même expéditeur ou même destinataire) sans données de chèque (toutes dates).</p>
                : (
                  <>
                  <div className="mt-2 flex gap-2">
                    <input value={q} onChange={e => { setQ(e.target.value); setQMsg('') }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchNic() } }}
                      placeholder="Chercher : N° EXP, destinataire, date, montant… (Entrée = chercher le N° EXP partout)"
                      className="flex-1 px-3 py-2 rounded-xl border-2 border-indigo-200 focus:border-indigo-400 focus:outline-none text-xs font-semibold" />
                    {findByNic && <button type="button" onClick={searchNic} className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black">Ajouter</button>}
                  </div>
                  {qMsg && <p className={`text-xs font-bold mt-1 ${qMsg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-700'}`}>{qMsg}</p>}
                  <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-indigo-100 rounded-xl bg-white border border-indigo-100">
                    {shownOptions.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Aucune autre expédition ne correspond. Tapez le N° EXP complet puis Entrée pour la chercher dans toute la base.</p>}
                    {/* Expédition en cours : toujours incluse dans le chèque (cochée d'office, en tête) */}
                    <label className="flex items-center gap-2 px-3 py-1.5 text-xs bg-indigo-50/70">
                      <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked disabled />
                      <span className="font-mono font-bold">{nicOf(parcel)}</span>
                      <span className="text-slate-400">{fmtD(parcel.createdAt)}</span>
                      <span className="flex-1 truncate">→ {parcel?.receiver?.name || '—'} <span className="ml-1 px-1 rounded bg-indigo-600 text-white text-[9px] font-black">EN COURS · incluse</span></span>
                      <b className="text-emerald-700">{money(docAmountOf(parcel))} DH</b>
                    </label>
                    {shownOptions.map(c => (
                      <label key={c.id} className={`flex items-center gap-2 px-3 py-1.5 text-xs ${c._blocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-indigo-50'}`} title={c._blocked || ''}>
                        <input type="checkbox" className="w-4 h-4 accent-indigo-600" disabled={!!c._blocked} checked={picked.has(c.id)} onChange={() => togglePick(c.id)} />
                        <span className="font-mono font-bold">{nicOf(c)}</span>
                        <span className="text-slate-400">{fmtD(c.createdAt)}</span>
                        <span className="flex-1 truncate">→ {c?.receiver?.name || '—'}
                          {c._otherSender && <span className="ml-1 px-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold" title="Expéditeur saisi autrement : confirmation demandée">autre expéditeur : {c._otherSender}</span>}
                          {c._blocked && <span className="ml-1 text-amber-700 font-bold">· {c._blocked}</span>}</span>
                        <b className="text-emerald-700">{money(docAmountOf(c))} DH</b>
                      </label>
                    ))}
                  </div>
                  </>
                )
            )}
            {grouped && <p className="text-xs font-bold text-indigo-800 mt-2">{members.length} expédition(s) · montant attendu : {money(expectedTotal)} DH</p>}
          </div>

          {/* 3️⃣ Totaux : chèques / traites face au montant attendu */}
          <p className="text-xs font-black text-slate-500 uppercase tracking-wide pt-1">3. Totaux</p>
          <div className={`rounded-xl px-3 py-2 text-sm font-bold ${Math.abs(diff) < 0.01 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            {rows.length} chèque(s) / traite(s) : {money(total)} DH · attendu {money(expectedTotal)} DH{isMulti ? ` (${members.length} expéditions)` : ''}
            {' '}{Math.abs(diff) < 0.01 ? '✓ conforme' : `— ${diff < 0 ? 'reste' : 'écart'} ${diff > 0 ? '+' : ''}${money(Math.abs(diff))} DH`}
          </div>
          {/* ⚠️ Chèque reçu inférieur au montant attendu : le destinataire a payé le reste en espèces → signalement à l'admin */}
          {canSignalCash && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5 space-y-2">
              <label className="flex items-start gap-2 text-sm font-bold text-amber-900 cursor-pointer">
                <input type="checkbox" className="mt-0.5 w-4 h-4 accent-amber-600" checked={cashRest} onChange={e => setCashRest(e.target.checked)} />
                <span>💵 Compléter le reste ({money(-diff)} DH) par un montant <u>en espèces</u>{isMulti ? ` pour ces ${members.length} expéditions` : ' payé par le destinataire'} — signalé à l'admin
                  <span className="block text-[11px] font-semibold text-amber-700">Les chèques / traites sont enregistrés pour {money(total)} DH ; {isMulti ? 'la part en espèces de CHAQUE expédition est calculée (au prorata de son montant) et signalée sur chacune' : 'le reste en espèces est signalé'} — l'admin corrige le COD en « chèque + espèces ».</span>
                </span>
              </label>
              {cashRest && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-2 items-end">
                    <label className="text-[11px] font-bold text-amber-900">Montant payé en espèces (DH) *
                      <input className={inp} inputMode="decimal" value={cashInput} placeholder={money(cashDefault)}
                        onChange={e => setCashInput(e.target.value)} />
                    </label>
                    <p className={`text-xs font-bold pb-2 ${Math.abs(cashGap) < 0.01 ? 'text-emerald-700' : 'text-red-700'}`}>
                      Chèque {money(total)} + espèces {money(cashAmount)} = {money(total + cashAmount)} DH
                      {Math.abs(cashGap) < 0.01 ? ' ✓ égal au montant attendu' : ` — écart ${cashGap > 0 ? '+' : ''}${money(cashGap)} DH avec ${money(expectedTotal)} DH attendus`}
                    </p>
                  </div>
                  <input className={inp} value={cashNote} onChange={e => setCashNote(e.target.value)} placeholder="Remarque (facultatif) : qui a reçu les espèces, etc." />
                  {/* 🔗 Part de chaque expédition : chèques / traites + espèces = attendu */}
                  {isMulti && (
                    <table className="w-full text-xs bg-white rounded-lg overflow-hidden border border-amber-200">
                      <thead><tr className="bg-amber-100/70 text-amber-900"><th className="px-2 py-1 text-left">N° EXP</th><th className="px-2 py-1 text-right">Attendu</th><th className="px-2 py-1 text-right">Chèques / traites</th><th className="px-2 py-1 text-right">Espèces</th></tr></thead>
                      <tbody className="divide-y divide-amber-100">
                        {shares.map(s => (
                          <tr key={s.id}><td className="px-2 py-1 font-mono font-bold">{s.nic}</td><td className="px-2 py-1 text-right">{money(s.expected)}</td>
                            <td className="px-2 py-1 text-right">{money(s.cheque)}</td><td className="px-2 py-1 text-right font-black text-amber-800">{money(s.cash)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}
          {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠️ {error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={printSummary} disabled={saving}
            className="mr-auto px-4 py-2.5 rounded-xl bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-black flex items-center gap-2">
            <Printer className="w-4 h-4" /> Imprimer le résumé
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-black">Annuler</button>
          {alreadyControlled && !grouped ? (
            <button type="button" onClick={() => submit(false)} disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-black flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => submit(false)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-white border-2 border-purple-200 hover:bg-purple-50 text-purple-700 text-sm font-black">
                Enregistrer sans pointer
              </button>
              <button type="button" onClick={() => submit(true)} disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-black flex items-center gap-2">
                <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : grouped ? `Enregistrer et pointer les ${members.length}` : 'Enregistrer et pointer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 🖨️ Résumé d'une opération de chèque / traite (simple ou groupé, avec le reste en espèces) — A4 portrait. */
export function printChequeOperationSummary(o: {
  members: any[]
  rows: { type: 'cheque' | 'traite'; numero: string; banque: string; montant: number }[]
  grouped: boolean; expectedTotal: number; cash: number; note: string
  /** 🔗 Part de chaque expédition (même ordre que members) : chèques / traites et espèces */
  shares?: { cheque: number; cash: number }[]
}) {
  const docsTotal = o.rows.reduce((s, r) => s + r.montant, 0)
  const paid = docsTotal + o.cash
  const gap = Math.round((paid - o.expectedTotal) * 100) / 100
  const first = o.members[0] || {}
  const sh = o.shares && o.shares.length === o.members.length ? o.shares : null
  const expRows = o.members.map((m, i) => `<tr><td class="c">${i + 1}</td><td class="b">${esc(nicOf(m))}</td><td>${esc(fmtD(m.createdAt))}</td>
    <td>${esc(senderNameOf(m))}</td><td>${esc(m.receiver?.name || '')}<br><small>${esc(m.destinationCity || m.receiver?.city || '')}</small></td>
    <td class="r b">${money(docAmountOf(m))}</td>${sh ? `<td class="r">${money(sh[i].cheque)}</td><td class="r">${money(sh[i].cash)}</td>` : ''}</tr>`).join('')
  const docRows = o.rows.map(r => `<tr><td>${r.type === 'traite' ? 'Traite' : 'Chèque'}${o.grouped ? ' groupé' : ''}</td><td class="b">${esc(r.numero)}</td><td>${esc(r.banque)}</td><td class="r b">${money(r.montant)}</td></tr>`).join('')
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Résumé opération chèque — ${esc(o.members.map(nicOf).join(', '))}</title><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A4 portrait;margin:12mm}
    body{font-family:Arial,sans-serif;color:#111;font-size:12px;margin:0}
    .brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #4338ca;padding-bottom:6px;margin-bottom:12px}
    .brand b{font-size:17px;color:#4338ca}.brand span{font-size:10px;color:#555}
    h1{font-size:18px;margin:4px 0 10px}h2{font-size:13px;margin:14px 0 6px;color:#4338ca}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px 6px;font-size:11px;vertical-align:top}
    th{background:#eef2ff;text-align:left;font-size:10px;text-transform:uppercase}td small{color:#64748b}
    .r{text-align:right}.c{text-align:center}.b{font-weight:bold}
    tfoot td{font-weight:bold;background:#f8fafc}
    .tot{margin-top:12px;border:2px solid #4338ca;border-radius:6px;padding:8px 10px;font-size:13px;line-height:1.7}
    .ok{color:#047857}.ko{color:#b91c1c}.note{margin-top:8px;font-size:11px;color:#475569}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:22px}.box{border:1px dashed #94a3b8;height:65px;margin-top:4px}
  </style></head><body>
    <div class="brand"><b>BG EXPRESS</b><span>Imprimé le ${new Date().toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
    <h1>Résumé de l'opération — ${o.grouped ? `chèque groupé (${o.members.length} expéditions)` : 'chèque / traite'}${o.cash > 0 ? ' + espèces' : ''}</h1>
    <div>Expéditeur : <b>${esc(senderNameOf(first))}</b> · Agence : <b>${esc(first.originCity || first.sender?.city || '')}</b></div>
    <h2>Expéditions (${o.members.length})</h2>
    <table><thead><tr><th>#</th><th>N° EXP</th><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th class="r">Attendu (DH)</th>${sh ? '<th class="r">Chèques / traites</th><th class="r">Espèces</th>' : ''}</tr></thead>
      <tbody>${expRows}</tbody><tfoot><tr><td colspan="5">TOTAL ATTENDU</td><td class="r">${money(o.expectedTotal)}</td>${sh ? `<td class="r">${money(sh.reduce((s, x) => s + x.cheque, 0))}</td><td class="r">${money(sh.reduce((s, x) => s + x.cash, 0))}</td>` : ''}</tr></tfoot></table>
    <h2>Paiement</h2>
    <table><thead><tr><th>Type</th><th>N°</th><th>Banque</th><th class="r">Montant (DH)</th></tr></thead>
      <tbody>${docRows}<tr><td>Espèces${o.cash > 0 ? ' (reste)' : ''}</td><td>—</td><td>—</td><td class="r b">${money(o.cash)}</td></tr></tbody>
      <tfoot><tr><td colspan="3">TOTAL PAYÉ</td><td class="r">${money(paid)}</td></tr></tfoot></table>
    <div class="tot">
      Chèque${o.rows.length > 1 ? 's / traites' : ''} : <b>${money(docsTotal)} DH</b> &nbsp;+&nbsp; Espèces : <b>${money(o.cash)} DH</b> &nbsp;=&nbsp; <b>${money(paid)} DH</b><br>
      Montant attendu : <b>${money(o.expectedTotal)} DH</b> —
      ${Math.abs(gap) < 0.01 ? '<b class="ok">✓ conforme</b>' : `<b class="ko">écart ${gap > 0 ? '+' : ''}${money(gap)} DH</b>`}
    </div>
    ${o.note ? `<div class="note">Remarque : ${esc(o.note)}</div>` : ''}
    <div class="sign"><div><b>Encaisseur central</b><div class="box"></div></div><div><b>Client / remettant</b><div class="box"></div></div></div>
    <script>window.onload=function(){window.print()}<\/script>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer le résumé.'); return }
  w.document.write(html)
  w.document.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// Fiche de réception des chèques et traites (par client expéditeur)
// ─────────────────────────────────────────────────────────────────────────────
interface DocLine { p: any; d: CodDocument | null }

function linesOf(parcels: any[]): DocLine[] {
  const out: DocLine[] = []
  parcels.forEach(p => {
    const docs = docsOf(p)
    if (docs.length) docs.forEach(d => out.push({ p, d }))
    else out.push({ p, d: null }) // données pas encore saisies : ligne à compléter à la main
  })
  return out
}

export function printReceptionSheet(parcels: any[], profileName: string) {
  const lines = linesOf(parcels)
  const first = parcels[0] || {}
  const client = senderNameOf(first)
  const agence = first.originCity || first.sender?.city || ''
  const dests = [...new Set(parcels.map(p => String(p.receiver?.name || '').trim()).filter(Boolean))]
  const dates = parcels.map(p => toDate(p.createdAt)).filter(Boolean) as Date[]
  const minD = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
  const maxD = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
  const datesTxt = minD && maxD ? (minD.toDateString() === maxD.toDateString() ? fmtD(minD) : `du ${fmtD(minD)} au ${fmtD(maxD)}`) : ''
  const typeOfLine = (l: DocLine) => (l.d?.type || (codDocTypeOf(l.p) === 'traite' ? 'traite' : 'cheque'))
  const nbCheques = lines.filter(l => typeOfLine(l) === 'cheque').length
  const nbTraites = lines.filter(l => typeOfLine(l) === 'traite').length
  const total = lines.reduce((s, l) => s + (l.d ? Number(l.d.montant) || 0 : docAmountOf(l.p)), 0)
  const minRows = 9
  // Échéance : plus saisie au pointage ; colonne gardée seulement si un ancien document en a une
  const withEch = lines.some(l => !!l.d?.echeance)
  const body = lines.map(l => `<tr>
      <td>${typeOfLine(l) === 'traite' ? 'Traite' : 'Chèque'}</td>
      <td class="b">${esc(l.d?.numero || '')}${(l.d?.groupIds || []).length > 1 ? `<div style="font-size:8px;font-weight:normal;color:#4338ca">chèque groupé ${money(l.d?.groupTotal)} DH</div>` : ''}</td>
      <td>${esc(l.d?.banque || '')}</td>
      <td class="r b">${money(l.d ? l.d.montant : docAmountOf(l.p))}</td>
      ${withEch ? `<td>${esc(fmtYmd(l.d?.echeance || ''))}</td>` : ''}
      <td class="s">${esc(nicOf(l.p))}</td>
      <td class="s">${esc(l.p.receiver?.name || '')}</td>
    </tr>`).join('') + Array.from({ length: Math.max(0, minRows - lines.length) }, () => `<tr class="empty">${'<td></td>'.repeat(withEch ? 7 : 6)}</tr>`).join('')
  const plural = lines.length > 1
  // 💵 Reste payé en ESPÈCES signalé à l'encaisseur central (chèque + espèces) — une seule fois par chèque groupé
  const cashSeen = new Set<string>()
  const cashLines: { nics: string; amount: number }[] = []
  parcels.forEach(p => {
    const c = p?.codDocMismatch === true ? Number(p.codDocMismatchCash) || 0 : 0
    if (c <= 0) return
    const nics = Array.isArray(p.codDocMismatchGroupNics) && p.codDocMismatchGroupNics.length > 1 ? p.codDocMismatchGroupNics.join(', ') : nicOf(p)
    if (cashSeen.has(nics)) return
    cashSeen.add(nics)
    cashLines.push({ nics, amount: c })
  })
  const cashTotal = cashLines.reduce((s, c) => s + c.amount, 0)
  const cashHtml = cashLines.length ? `<table style="margin-top:8px"><thead><tr><th>Espèces (reste payé en espèces)</th><th>N° EXP</th><th>Montant (DH)</th></tr></thead>
      <tbody>${cashLines.map(c => `<tr><td>Espèces</td><td class="s">${esc(c.nics)}</td><td class="r b">${money(c.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">TOTAL ESPÈCES — chèques / traites + espèces = ${money(total + cashTotal)} DH</td><td class="r">${money(cashTotal)}</td></tr></tfoot></table>` : ''
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche de réception — ${esc(client)}</title><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    @page{size:A4 portrait;margin:14mm 14mm}
    body{font-family:Georgia,'Times New Roman',serif;color:#111;font-size:12.5px;margin:0}
    .brand{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:14px;font-family:Arial,sans-serif}
    .brand b{font-size:17px;letter-spacing:.5px}.brand span{font-size:10px;color:#555}
    h1{text-align:center;font-size:21px;margin:6px 0 18px}
    .grid{display:grid;grid-template-columns:1.25fr 1fr;gap:9px 24px;margin-bottom:14px}
    .grid div b{font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{border:1.2px solid #111;padding:6px 6px;font-size:11.5px;vertical-align:middle}
    th{font-family:Arial,sans-serif;font-size:10.5px;text-transform:uppercase;background:#f1f1f1}
    td.r{text-align:right}td.b{font-weight:bold}td.s{font-size:10px}
    tr.empty td{height:24px}
    tfoot td{font-weight:bold;background:#f7f7f7}
    .txt{margin:18px 0 6px;line-height:1.6;text-align:justify}.txt p{margin:0 0 7px;text-indent:22px}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:12px;line-height:2.1}
    .box{border:1px dashed #999;height:70px;margin-top:4px}
  </style></head><body>
    <div class="brand"><b>BG EXPRESS</b><span>Imprimé le ${new Date().toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
    <h1>Fiche De Réception Des Chèques Et Traites</h1>
    <div class="grid">
      <div><b>Agence :</b> ${esc(agence)}</div>
      <div><b>Dates :</b> ${esc(datesTxt)}</div>
      <div><b>Expéditeur :</b> ${esc(client)}</div>
      <div><b>Destinataire :</b> ${dests.length === 1 ? esc(dests[0]) : dests.length ? `${dests.length} destinataires (voir tableau)` : ''}</div>
      <div><b>Nombre de chèques :</b> ${nbCheques}</div>
      <div><b>Nombre de traites :</b> ${nbTraites}</div>
    </div>
    <table>
      <thead><tr><th>Type</th><th>N°</th><th>Banque</th><th>Montant (DH)</th>${withEch ? '<th>Échéance</th>' : ''}<th>N° EXP</th><th>Destinataire</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="3">TOTAL — ${lines.length} document${plural ? 's' : ''}</td><td class="r">${money(total)}</td><td colspan="${withEch ? 3 : 2}"></td></tr></tfoot>
    </table>
    ${cashHtml}
    <div class="txt">
      <p>Déclare avoir reçu de la société BGEXPRESS ${plural ? 'les chèques et traites ci-dessus, correspondant aux expéditions mentionnées' : 'le chèque ci-dessus, correspondant à l\'expédition mentionnée'}.</p>
      <p>Je reconnais avoir vérifié les références ${plural ? 'des chèques et traites' : 'du chèque'} et en avoir pris possession en bon état.</p>
      <p>Par la présente, je donne quittance définitive à BGEXPRESS et décharge entièrement la société de toute responsabilité concernant ${plural ? 'ces documents' : 'ce chèque'} après ${plural ? 'leur remise' : 'sa remise'}.</p>
      <p>Réclamation ultérieure relative à la perte, au vol, à la destruction ou à l'utilisation de ${plural ? 'ces documents' : 'ce chèque'} après ${plural ? 'leur remise' : 'sa remise'} ne pourra engager la responsabilité de BGEXPRESS.</p>
    </div>
    <div class="sign">
      <div>
        <b>Fait à :</b> ${esc(agence)}<br/>
        <b>Le :</b> &nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/<br/>
        <b>Nom du bénéficiaire :</b><br/>
        <b>N° CIN :</b><br/>
        <b>Signature et cachet de l'expéditeur :</b>
        <div class="box"></div>
      </div>
      <div>
        <br/><br/><br/>
        <b>Remis par BGEXPRESS :</b> ${esc(profileName || '')}<br/>
        <b>Signature :</b>
        <div class="box"></div>
      </div>
    </div>
    <script>window.onload=function(){window.print()}<\/script>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer la fiche.'); return }
  w.document.write(html)
  w.document.close()
}

export function ReceptionSheetModal({ parcels, profileName, onClose, onEdit }: {
  /** Chèques / traites à remettre aux expéditeurs (agence d'origine), déjà filtrés par la page */
  parcels: any[]
  profileName: string
  onClose: () => void
  onEdit: (p: any) => void
}) {
  const clients = useMemo(() => {
    const m = new Map<string, { key: string; name: string; city: string; list: any[]; total: number }>()
    parcels.forEach(p => {
      const k = clientKeyOf(p)
      if (!k) return
      if (!m.has(k)) m.set(k, { key: k, name: senderNameOf(p), city: p.originCity || p.sender?.city || '', list: [], total: 0 })
      const c = m.get(k)!
      c.list.push(p)
      c.total += docAmountOf(p)
    })
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [parcels])
  const [client, setClient] = useState('')
  const [q, setQ] = useState('')
  const current = clients.find(c => c.key === client) || null
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const picked = current ? current.list.filter(p => !unchecked.has(p.id)) : []
  const missing = picked.filter(p => !hasDocData(p)).length
  const notArrived = picked.filter(p => !p.deliveryControlled).length
  const shownClients = clients.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-lg font-black text-slate-800">🧾 Fiche de réception des chèques et traites</h3>
            <p className="text-xs text-slate-500">Choisissez le client expéditeur : la fiche liste ses chèques / traites, à joindre aux documents et à faire signer.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid sm:grid-cols-[260px_1fr] flex-1 min-h-0">
          <div className="border-r border-slate-100 flex flex-col min-h-0">
            <div className="p-3"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un client…" className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm focus:border-purple-400 focus:outline-none" /></div>
            <div className="overflow-y-auto flex-1 px-2 pb-3 space-y-1 max-h-[55vh]">
              {shownClients.length === 0 && <p className="text-xs text-slate-400 px-2">Aucun chèque / traite à remettre dans la sélection actuelle (expéditions parties de votre agence, filtres de la page).</p>}
              {shownClients.map(c => (
                <button key={c.key} type="button" onClick={() => { setClient(c.key); setUnchecked(new Set()) }}
                  className={`w-full text-left px-3 py-2 rounded-xl border transition ${client === c.key ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white border-slate-200 hover:bg-purple-50'}`}>
                  <p className="text-sm font-black truncate">{c.name}</p>
                  <p className={`text-[11px] ${client === c.key ? 'text-white/80' : 'text-slate-500'}`}>{c.city} · {c.list.length} doc. · {money(c.total)} DH</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            {!current ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-8">← Sélectionnez un client</div>
            ) : (
              <>
                <div className="overflow-y-auto flex-1 max-h-[55vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 sticky top-0">
                      <tr><th className="px-2 py-2 w-8"></th><th className="px-2 py-2 text-left">N° EXP</th><th className="px-2 py-2 text-left">Destinataire</th><th className="px-2 py-2 text-left">Chèque / traite</th><th className="px-2 py-2 text-right">Montant</th><th className="px-2 py-2"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {current.list.map(p => {
                        const docs = docsOf(p)
                        return (
                          <tr key={p.id} className={unchecked.has(p.id) ? 'opacity-40' : ''}>
                            <td className="px-2 py-2"><input type="checkbox" className="w-4 h-4 accent-purple-600" checked={!unchecked.has(p.id)}
                              onChange={() => setUnchecked(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} /></td>
                            <td className="px-2 py-2 font-bold">{nicOf(p)}<div className="text-[10px] text-slate-400">{fmtD(p.createdAt)}</div></td>
                            <td className="px-2 py-2 text-xs">{p.receiver?.name || '—'}
                              <div className={`text-[10px] font-black ${p.deliveryControlled ? 'text-blue-700' : 'text-amber-700'}`}>{p.deliveryControlled ? '✓ Arrivée confirmée' : '⏳ Arrivée non confirmée'}</div></td>
                            <td className="px-2 py-2 text-xs">
                              {hasDocData(p)
                                ? docs.map((d, i) => <div key={i}>{d.type === 'traite' ? '📝' : '📋'} N° {d.numero} · {d.banque}{d.echeance ? ` · éch. ${fmtYmd(d.echeance)}` : ''}</div>)
                                : <span className="text-amber-700 font-bold">⚠️ Données non saisies</span>}
                            </td>
                            <td className="px-2 py-2 text-right font-black text-emerald-700 whitespace-nowrap">{money(docs.length ? docs.reduce((s, d) => s + (Number(d.montant) || 0), 0) : docAmountOf(p))}</td>
                            <td className="px-2 py-2"><button type="button" onClick={() => onEdit(p)} className="text-[11px] font-black text-purple-700 hover:underline">✏️ Saisir</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-slate-700 flex-1">
                    {picked.length} document{picked.length > 1 ? 's' : ''} · {money(picked.reduce((s, p) => s + (docsOf(p).length ? docsOf(p).reduce((a, d) => a + (Number(d.montant) || 0), 0) : docAmountOf(p)), 0))} DH
                    {notArrived > 0 && <span className="block text-[11px] font-bold text-amber-700">⏳ {notArrived} dont l'arrivée n'est pas encore confirmée.</span>}
                    {missing > 0 && <span className="block text-[11px] font-bold text-amber-700">⚠️ {missing} sans données : leurs lignes seront à compléter à la main sur la fiche.</span>}
                  </p>
                  <button type="button" disabled={!picked.length} onClick={() => printReceptionSheet(picked, profileName)}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-black flex items-center gap-2">
                    <Printer className="w-4 h-4" /> Imprimer la fiche
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
