// 🧾 Encaisseur Central — chèques & traites des retours de fonds :
//  • ChequeEntryModal : formulaire ouvert au POINTAGE d'un colis payé par chèque / traite
//    (type, N°, banque, montant ; plusieurs documents possibles pour un même colis — plus de date d'échéance au pointage) ;
//  • ReceptionSheetModal : « Fiche de réception des chèques et traites » d'un client expéditeur,
//    à imprimer (A4 portrait), joindre aux chèques / traites et faire signer par le client.
import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Printer, Save } from 'lucide-react'
import { codDocTypeOf, codDocPartOf } from '../../utils/codParts'
import type { CodDocument } from '../../firebase/central'

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
  /** point = true : enregistrer PUIS pointer ; group = expéditions couvertes par le même chèque (celle-ci comprise) */
  onSave: (docs: CodDocument[], point: boolean, group?: any[]) => Promise<void>
}) {
  const expected = docAmountOf(parcel)
  const defType = (codDocTypeOf(parcel) === 'traite' ? 'traite' : 'cheque') as Row['type']
  const existingGroup = groupOf(parcel)
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = docsOf(parcel)
    // Chèque groupé : une seule ligne, montant = TOTAL du chèque
    if (existingGroup) return [{ type: existingGroup.type, numero: existingGroup.numero, banque: existingGroup.banque, montant: String(existingGroup.groupTotal ?? existingGroup.montant ?? ''), echeance: existingGroup.echeance || '' }]
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
      setPicked(s => new Set(s).add(known.id)); setQMsg(`✓ ${v} cochée.`); return
    }
    const r: { parcel?: any; error?: string } = await findByNic(v).catch(e => ({ error: String(e?.message || e) }))
    if (r.error || !r.parcel) { setQMsg(r.error || `N° EXP ${v} introuvable.`); return }
    if (r.parcel.id === parcel.id) { setQMsg(`✓ ${v} est l'expédition en cours : elle est déjà incluse (en tête de liste).`); return }
    setCandidates(cs => (cs.some(c => c.id === r.parcel.id) ? cs : [r.parcel, ...cs]))
    setPicked(s => new Set(s).add(r.parcel.id))
    setQMsg(`✓ ${v} ajoutée au chèque.`)
  }
  const members = grouped ? [parcel, ...options.filter(c => picked.has(c.id) && !c._blocked)] : [parcel]
  const expectedTotal = members.reduce((s, m) => s + docAmountOf(m), 0)
  const total = rows.reduce((s, r) => s + (parseFloat(String(r.montant).replace(',', '.')) || 0), 0)
  const diff = Math.round((total - expectedTotal) * 100) / 100
  const set = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const togglePick = (id: string) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

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
    if (expectedTotal > 0 && Math.abs(diff) >= 0.01
      && !confirm(`Le total saisi (${money(total)} DH) est différent du montant attendu (${money(expectedTotal)} DH${grouped ? ` pour ${members.length} expéditions` : ''}).\n\nEnregistrer quand même ?`)) return
    setSaving(true)
    try {
      await onSave(rows.map(r => ({
        type: r.type, numero: r.numero.trim(), banque: r.banque.trim().toUpperCase(),
        montant: parseFloat(String(r.montant).replace(',', '.')) || 0, echeance: r.echeance,
      })), point, grouped ? members : undefined)
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de l\'enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full px-2.5 py-2 rounded-xl border-2 border-slate-200 focus:border-purple-400 focus:outline-none text-sm font-semibold'
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-3" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-slate-800">🧾 Données du chèque / de la traite</h3>
            <p className="text-xs text-slate-500">
              N° EXP <b>{nicOf(parcel)}</b> · {senderNameOf(parcel) || '—'} → {parcel?.receiver?.name || '—'} · montant attendu <b className="text-emerald-700">{money(expected)} DH</b>
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* 🔗 Un seul chèque pour plusieurs expéditions du même expéditeur */}
          <div className={`rounded-2xl border p-3 ${grouped ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200'}`}>
            <label className="flex items-center gap-2 text-sm font-black text-indigo-800 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={grouped}
                onChange={e => { setGrouped(e.target.checked); if (e.target.checked) setRows(rs => [rs[0]]) }} />
              🔗 Ce chèque couvre plusieurs expéditions de {senderNameOf(parcel) || 'cet expéditeur'}
            </label>
            {grouped && (
              searching ? <p className="text-xs text-slate-500 mt-2">Recherche des expéditions de cet expéditeur (toutes dates)…</p>
              : options.length === 0 && !findByNic
                ? <p className="text-xs text-slate-500 mt-2">Aucune autre expédition chèque / traite de cet expéditeur sans données de chèque (toutes dates).</p>
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
                        <span className="flex-1 truncate">→ {c?.receiver?.name || '—'}{c._blocked && <span className="ml-1 text-amber-700 font-bold">· {c._blocked}</span>}</span>
                        <b className="text-emerald-700">{money(docAmountOf(c))} DH</b>
                      </label>
                    ))}
                  </div>
                  </>
                )
            )}
            {grouped && <p className="text-xs font-bold text-indigo-800 mt-2">{members.length} expédition(s) · montant attendu du chèque : {money(expectedTotal)} DH</p>}
          </div>

          {rows.map((r, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 p-3 bg-slate-50/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-black text-slate-500">{grouped ? 'Chèque groupé' : `Document ${i + 1}`}</span>
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
                <label className="text-[11px] font-bold text-slate-500">{grouped ? 'Montant TOTAL du chèque (DH) *' : 'Montant (DH) *'}
                  <input className={inp} inputMode="decimal" value={r.montant} onChange={e => set(i, { montant: e.target.value })} />
                </label>
              </div>
            </div>
          ))}
          <datalist id="cc-banques">
            {['ATTIJARIWAFA BANK', 'BMCE BANK OF AFRICA', 'BANQUE POPULAIRE', 'CIH BANK', 'SOCIÉTÉ GÉNÉRALE', 'CRÉDIT DU MAROC', 'CRÉDIT AGRICOLE', 'BMCI', 'AL BARID BANK', 'CFG BANK'].map(b => <option key={b} value={b} />)}
          </datalist>

          {!grouped && (
            <button type="button" onClick={() => setRows(rs => [...rs, { type: defType, numero: '', banque: rs[rs.length - 1]?.banque || '', montant: '', echeance: '' }])}
              className="flex items-center gap-1.5 text-xs font-black text-purple-700 hover:underline">
              <Plus className="w-4 h-4" /> Ajouter un autre chèque / traite pour ce colis
            </button>
          )}

          <div className={`rounded-xl px-3 py-2 text-sm font-bold ${Math.abs(diff) < 0.01 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
            Total saisi : {money(total)} DH {Math.abs(diff) < 0.01 ? '✓ conforme' : `— écart ${diff > 0 ? '+' : ''}${money(diff)} DH avec le montant attendu`}
          </div>
          {error && <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">⚠️ {error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
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
