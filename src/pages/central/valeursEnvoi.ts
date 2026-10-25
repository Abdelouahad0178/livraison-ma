/**
 * 📦 Envoi des valeurs (encaisseur central / analyseur chèques) : expéditions POINTÉES, regroupées par agence qui
 * doit RECEVOIR la valeur (ville d'origine = agence de l'expéditeur), + bordereau imprimable à joindre aux
 * chèques / traites / espèces envoyés dans un colis. Lecture seule : rien n'est écrit sur les expéditions.
 */
import { caisseCodAmountOfType } from '../../utils/agencyCaisseRules'
import { docsOf, nicOf } from './ChequeReception'

export const VALUE_TYPES = [
  { key: 'especes', label: 'Espèces', emoji: '💵' },
  { key: 'cheque', label: 'Chèque', emoji: '📋' },
  { key: 'traite', label: 'Traite', emoji: '📝' },
] as const
export type ValueType = typeof VALUE_TYPES[number]['key']

export interface ValueRow {
  p: any
  id: string
  nic: string
  /** Ville qui a pointé (ville du compte qui a pointé ; sinon ville d'encaissement = destination) */
  pointCity: string
  /** Ville qui doit recevoir la valeur (origine de l'expédition) */
  toCity: string
  amounts: Record<ValueType, number>
  total: number
  /** Chèques / traites saisis au pointage : « N° 123 · BMCE » */
  docs: string[]
}

const toDate = (v: any): Date | null => {
  if (!v) return null
  const d = v?.toDate ? v.toDate() : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
export const fmtD = (v: any) => toDate(v)?.toLocaleDateString('fr-FR') || ''
export const fmtDT = (v: any) => { const d = toDate(v); return d ? `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '' }

export function toValueRow(p: any, staffCities: Map<string, string>, docOnly: boolean): ValueRow | null {
  const amounts = Object.fromEntries(VALUE_TYPES.map(t => [t.key, docOnly && t.key === 'especes' ? 0 : caisseCodAmountOfType(p, t.key)])) as Record<ValueType, number>
  const total = amounts.especes + amounts.cheque + amounts.traite
  if (total <= 0) return null
  return {
    p, id: p.id, nic: nicOf(p),
    pointCity: (p.controlledById && staffCities.get(p.controlledById)) || p.destinationCity || p.receiver?.city || 'Ville inconnue',
    toCity: p.originCity || p.sender?.city || 'Ville inconnue',
    amounts, total,
    docs: docsOf(p).filter(d => d.numero || d.banque).map(d =>
      `${d.type === 'traite' ? 'Traite' : 'Chèque'} N° ${d.numero || '?'}${d.banque ? ` · ${d.banque}` : ''}${(d.groupIds || []).length > 1 ? ` (groupé ${d.groupTotal ?? ''} DH ×${d.groupIds!.length})` : ''}`),
  }
}

export function sumRows(rows: ValueRow[]) {
  const t = { especes: 0, cheque: 0, traite: 0, total: 0 }
  rows.forEach(r => { t.especes += r.amounts.especes; t.cheque += r.amounts.cheque; t.traite += r.amounts.traite; t.total += r.total })
  return t
}

/** Nombre de documents PHYSIQUES (un chèque groupé couvrant 3 expéditions = 1 chèque). */
export function physicalDocs(rows: ValueRow[]) {
  const seen = new Set<string>()
  let cheques = 0, traites = 0
  rows.forEach(r => {
    const docs = docsOf(r.p).filter(d => d.numero || d.banque)
    if (!docs.length) {
      // Pas encore saisi : 1 document par type présent
      if (r.amounts.cheque > 0) cheques++
      if (r.amounts.traite > 0) traites++
      return
    }
    docs.forEach(d => {
      const k = d.groupId || `${d.type}|${d.numero}|${d.banque}|${r.id}`
      if (seen.has(k)) return
      seen.add(k)
      if (d.type === 'traite') traites++; else cheques++
    })
  })
  return { cheques, traites }
}

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => HTML_ESC[c])
const dh = (n: number) => `${(Math.round((n || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`

/** Regroupe des lignes par client EXPÉDITEUR (celui à qui la valeur est remise). */
export function groupBySender<T extends { p: any }>(rows: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  rows.forEach(r => { const k = String(r.p?.sender?.name || r.p?.senderName || 'Client inconnu').trim(); const l = m.get(k) || []; l.push(r); m.set(k, l) })
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/**
 * 🧾 Accusé de réception du CLIENT (expéditeur) : il reconnaît avoir reçu ses valeurs (espèces, chèques, traites).
 * Une page A4 par client, deux exemplaires sur la page (client / agence), à faire signer à la remise.
 */
export function clientReceiptHtml(opts: { clients: [string, ValueRow[]][]; city: string; by: string; lotNumber?: string }) {
  const { clients, city, by, lotNumber } = opts
  const now = new Date()
  const today = now.toLocaleDateString('fr-FR')
  const logo = window.location.origin + '/LOGO.jpg'
  const page = (client: string, rows: ValueRow[]) => {
    const t = sumRows(rows)
    const body = rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="b">${esc(r.nic)}</td><td>${esc(fmtD(r.p.createdAt))}</td><td>${esc(r.p.receiver?.name || '')}</td>
      <td>${VALUE_TYPES.filter(v => r.amounts[v.key] > 0).map(v => `${v.label}${r.amounts[v.key] !== r.total ? ` ${dh(r.amounts[v.key])}` : ''}`).join('<br>')}</td>
      <td class="sm">${r.docs.map(esc).join('<br>') || '—'}</td><td class="r b">${dh(r.total)}</td></tr>`).join('')
    const copy = (label: string) => `<div class="copy">
  <div class="top"><div class="brand"><img src="${logo}" onerror="this.style.display='none'"><div><b>BG EXPRESS</b><span>Agence de ${esc(city)}</span></div></div>
    <div class="ttl"><h1>Accusé de réception des valeurs</h1><div class="cl">Client : <b>${esc(client)}</b></div></div>
    <div class="when">Le ${esc(today)}${lotNumber ? `<br>Lot ${esc(lotNumber)}` : ''}<br><span class="ex">${esc(label)}</span></div></div>
  <table><thead><tr><th>#</th><th>N° EXP</th><th>Date EXP</th><th>Destinataire</th><th>Type</th><th>Chèque / traite</th><th class="r">Montant</th></tr></thead><tbody>${body}</tbody></table>
  <div class="tot">${t.especes > 0 ? `<span>💵 Espèces : <b>${dh(t.especes)}</b></span>` : ''}${t.cheque > 0 ? `<span>📋 Chèques : <b>${dh(t.cheque)}</b></span>` : ''}${t.traite > 0 ? `<span>📝 Traites : <b>${dh(t.traite)}</b></span>` : ''}<span class="main">Total reçu : <b>${dh(t.total)}</b></span></div>
  <p class="txt">Je soussigné(e), représentant de <b>${esc(client)}</b>, reconnais avoir reçu de BG Express — agence de ${esc(city)} — les valeurs ci-dessus (${rows.length} expédition(s)), pour un montant total de <b>${dh(t.total)}</b>.</p>
  <div class="sign"><div><b>Le client</b><small>Nom, CIN :</small><span>Date et signature</span></div><div><b>Remis par</b><small>${esc(by)}</small><span>Signature et cachet de l'agence</span></div></div>
</div>`
    return `<section class="page">${copy('Exemplaire client')}<div class="cut">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>${copy("Exemplaire agence")}</section>`
  }
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Accusé de réception — ${esc(clients.map(c => c[0]).join(', ').slice(0, 80))}</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:8mm}
body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;margin:0;font-size:9.5px}
.page{page-break-after:always}.page:last-child{page-break-after:auto}
.copy{min-height:136mm;display:flex;flex-direction:column}
.cut{text-align:center;color:#94a3b8;margin:3mm 0;font-size:9px;white-space:nowrap;overflow:hidden}
.top{display:flex;align-items:center;gap:8px;border-bottom:2px solid #047857;padding-bottom:3px;margin-bottom:5px}
.brand{display:flex;align-items:center;gap:6px;width:26%}.brand img{height:24px}
.brand b{display:block;color:#047857;font-size:11px}.brand span{font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase}
.ttl{flex:1;text-align:center}.ttl h1{margin:0;font-size:13px;text-transform:uppercase}.cl{font-size:11px}
.when{width:24%;text-align:right;font-size:8.5px;color:#475569}.ex{display:inline-block;margin-top:2px;padding:1px 6px;border:1px solid #047857;border-radius:8px;color:#047857;font-weight:800}
table{width:100%;border-collapse:collapse}
th{background:#047857;color:#fff;font-size:8px;text-transform:uppercase;padding:2px 4px;text-align:left}
td{border-bottom:1px solid #e2e8f0;padding:2px 4px;font-size:9px;vertical-align:top}
.r{text-align:right}.c{text-align:center}.b{font-weight:800}.sm{font-size:8px}
.tot{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:4px;font-size:10px}.tot .main{border:1px solid #047857;background:#ecfdf5;padding:2px 8px;border-radius:5px}
.txt{font-size:9.5px;margin:6px 0}
.sign{display:flex;gap:10px;margin-top:auto}.sign div{flex:1;border:1px solid #94a3b8;border-radius:5px;padding:5px;height:58px;display:flex;flex-direction:column}
.sign small{color:#475569}.sign span{margin-top:auto;font-size:8px;color:#94a3b8}
</style></head><body>
${clients.map(([c, rows]) => page(c, rows)).join('')}
</body></html>`
}

/** Bordereau A4 portrait en DEUX exemplaires (un dans le colis, un gardé par l'agence qui envoie). */
export function bordereauHtml(opts: {
  rows: ValueRow[]; fromCity: string; toCity: string; periodText: string; preparedBy: string; number: string
}) {
  const { rows, fromCity, toCity, periodText, preparedBy, number } = opts
  const t = sumRows(rows)
  const docs = physicalDocs(rows)
  const now = new Date()
  const printedAt = `${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  const logo = window.location.origin + '/LOGO.jpg'
  // Une SEULE ligne par expédition (texte coupé proprement si trop long) : ≈ 50 expéditions par page A4
  const typeCell = (r: ValueRow) => VALUE_TYPES.filter(v => r.amounts[v.key] > 0).map(v => `${v.label}${r.amounts[v.key] !== r.total ? ` ${dh(r.amounts[v.key])}` : ''}`).join(' + ')
  const docCell = (r: ValueRow) => r.docs.map(d => d.replace(/^(Chèque|Traite) /, '')).map(esc).join(' / ') || (r.amounts.cheque + r.amounts.traite > 0 ? '<i>non saisi</i>' : '—')
  const body = rows.map((r, i) => `<tr${i % 2 ? ' class="z"' : ''}>
    <td class="c n">${i + 1}</td><td class="b">${esc(r.nic)}</td><td>${esc(fmtD(r.p.createdAt))}</td>
    <td>${esc(r.p.sender?.name || r.p.senderName || '')}</td><td>${esc(r.p.receiver?.name || r.p.receiverName || '')}</td>
    <td>${typeCell(r)}</td><td class="sm">${docCell(r)}</td>
    <td class="r b">${dh(r.total)}</td><td class="c box">☐</td></tr>`).join('')
  const copy = (label: string) => `<section class="page">
<div class="top">
  <div class="brand"><img src="${logo}" onerror="this.style.display='none'"><b>BG EXPRESS</b></div>
  <div class="ttl"><h1>Bordereau d'envoi des valeurs</h1><div class="ag">De <b>${esc(fromCity)}</b> → vers <b>${esc(toCity)}</b> · ${rows.length} expédition(s) · <b>${dh(t.total)}</b></div></div>
  <div class="when">N° <b>${esc(number)}</b><br>${esc(printedAt)} · <span class="ex">${esc(label)}</span></div>
</div>
<div class="meta">Valeurs pointées · ${esc(periodText)} · Préparé par <b>${esc(preparedBy)}</b></div>
<table>
<colgroup><col style="width:4%"><col style="width:9%"><col style="width:8.5%"><col style="width:20%"><col style="width:17%"><col style="width:9.5%"><col style="width:16%"><col style="width:11.5%"><col style="width:4.5%"></colgroup>
<thead><tr><th>#</th><th>N° EXP</th><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th>Type</th><th>N° chèque / traite</th><th class="r">Montant</th><th class="c">Joint</th></tr></thead>
<tbody>${body || '<tr><td colspan="9" class="c muted">Aucune valeur</td></tr>'}</tbody></table>
<div class="end">
  <div class="tot">
    <div><span>Espèces</span><b>${dh(t.especes)}</b></div>
    <div><span>Chèques (${docs.cheques})</span><b>${dh(t.cheque)}</b></div>
    <div><span>Traites (${docs.traites})</span><b>${dh(t.traite)}</b></div>
    <div class="main"><span>Total (${rows.length} exp.)</span><b>${dh(t.total)}</b></div>
  </div>
  <div class="check">Contenu du colis : ${docs.cheques} chèque(s) · ${docs.traites} traite(s) · espèces ${dh(t.especes)} — N° du colis d'envoi : ______________________</div>
  <div class="sign">
    <div><b>Préparé et emballé par</b><small>${esc(preparedBy)} — ${esc(fromCity)}</small><span>Date et signature</span></div>
    <div><b>Transporteur / chauffeur</b><small>Nom :</small><span>Date et signature</span></div>
    <div><b>Reçu par l'agence de ${esc(toCity)}</b><small>Nom :</small><span>Date, signature et cachet</span></div>
  </div>
</div>
</section>`
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Bordereau ${esc(number)} — ${esc(fromCity)} → ${esc(toCity)}</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:7mm 7mm 8mm}
body{font-family:Arial,'Segoe UI',sans-serif;color:#111827;margin:0;font-size:9px}
.page{page-break-after:always}.page:last-child{page-break-after:auto}
.top{display:flex;align-items:center;gap:6px;border-bottom:1.5px solid #6d28d9;padding-bottom:2px;margin-bottom:2px}
.brand{display:flex;align-items:center;gap:4px;width:18%}.brand img{height:18px}.brand b{color:#6d28d9;font-size:10px}
.ttl{flex:1;text-align:center}.ttl h1{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.3px}.ag{font-size:9.5px;color:#4c1d95}
.when{width:26%;text-align:right;font-size:8px;color:#475569;line-height:1.3}.ex{padding:0 4px;border:1px solid #6d28d9;border-radius:6px;color:#6d28d9;font-weight:700}
.meta{font-size:8px;color:#475569;margin-bottom:3px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th{background:#6d28d9;color:#fff;font-size:7.5px;text-transform:uppercase;padding:2px 3px;text-align:left;white-space:nowrap}
td{border-bottom:.5px solid #cbd5e1;padding:1.5px 3px;font-size:8.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
tr.z td{background:#f8fafc}
tr{page-break-inside:avoid}thead{display:table-header-group}
.r{text-align:right}.c{text-align:center}.b{font-weight:700}.sm{font-size:7.5px}.n{color:#64748b}.muted{color:#94a3b8}.box{font-size:10px;line-height:1}
/* Totaux + signatures : toujours ensemble, en bas, jamais coupés */
.end{page-break-inside:avoid;break-inside:avoid;margin-top:5px}
.tot{display:flex;gap:4px}.tot div{flex:1;border:1px solid #cbd5e1;border-radius:4px;padding:2px 6px}
.tot span{display:block;font-size:7px;color:#64748b;text-transform:uppercase}.tot b{font-size:10.5px}
.tot .main{border-color:#6d28d9;background:#f5f3ff}
.check{margin-top:4px;font-size:8.5px;font-weight:700}
.sign{display:flex;gap:6px;margin-top:5px}.sign div{flex:1;border:1px solid #94a3b8;border-radius:4px;padding:4px 6px;height:24mm;display:flex;flex-direction:column}
.sign b{font-size:8.5px}.sign small{color:#475569;margin-top:1px}.sign span{margin-top:auto;font-size:7.5px;color:#94a3b8}
</style></head><body>
${copy('Exemplaire joint au colis')}
${copy("Exemplaire de l'agence qui envoie")}
</body></html>`
}
