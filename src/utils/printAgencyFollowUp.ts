/**
 * 🖨️ « Suivi de l'agence — Ports » (Admin › Port par agence, une agence sélectionnée) : A4 portrait, date
 * d'impression en haut, mêmes styles que le Résumé de caisse (utils/printPortCaisseReceipt).
 * Les 4 parties avec leurs totaux ET le détail des lignes.
 */
import {
  fmtDateTime, EXP_STATE_LABEL, RECEIPT_SOURCE_LABEL, TRANSFER_STATUS_LABEL,
  type ExploitationFollowUp, type ChefAgenceFollowUp, type CaisseSituation, type EnCompteFollowUp, type ResteLine,
} from './agencyFollowUp'

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => HTML_ESC[c])
const dh = (n: number) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DH`

const PORT_KIND_LABEL: Record<string, string> = { port_du: 'Port dû', port_du_cheque: 'Port dû chèque', port_paye: 'Port payé', autre: 'Autre' }
const fmtD = (v: any) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '' }

/** 🖨️ Détail du « Reste à encaisser » d'une agence : les expéditions dont le port attendu n'est pas encore encaissé. */
export function printResteAEncaisser(opts: { city: string; periodText: string; lines: ResteLine[]; kindLabels?: Record<string, string>; subject?: string; focus?: 'reste' | 'attendu' | 'encaisse' }) {
  const { city, periodText, lines, kindLabels = PORT_KIND_LABEL, subject = 'Ports', focus = 'reste' } = opts
  const FOCUS_TITLE = { reste: 'Reste à encaisser', attendu: 'Attendu (vue théorique)', encaisse: 'Encaissé (situation caisse)' }
  const now = new Date()
  const printedAt = `${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  const logo = window.location.origin + '/LOGO.jpg'
  const total = lines.reduce((s, l) => s + l[focus], 0)
  const byKind = new Map<string, { n: number; m: number }>()
  lines.forEach(l => { const c = byKind.get(l.kind) || { n: 0, m: 0 }; c.n++; c.m += l[focus]; byKind.set(l.kind, c) })
  const rows = lines.map((l, i) => { const p = l.p; return `<tr${l.reste < 0 ? ' class="neg"' : ''}>
    <td class="c">${i + 1}</td><td class="b">${esc(p.senderNic || p.sender?.nic || p.trackingId || '')}</td><td>${esc(fmtD(p.createdAt))}</td>
    <td>${esc(p.sender?.name || '')}<br><small>${esc(p.originCity || '')}</small></td><td>${esc(p.receiver?.name || '')}<br><small>${esc(p.destinationCity || '')}</small></td>
    <td>${esc(kindLabels[l.kind] || l.kind)}</td><td>${esc(p.status || '')}<br><small>${p.deliveryDriverName ? `livreur : ${esc(p.deliveryDriverName)}` : 'sans livreur (retrait agence)'}${(p.portCollectedBy || p.codCollectedBy) ? ` · encaissé par ${esc(p.portCollectedBy || p.codCollectedBy)}` : ''}</small></td>
    <td class="r">${dh(l.attendu)}</td><td class="r">${dh(l.encaisse)}</td><td class="r b">${dh(l.reste)}</td></tr>` }).join('')
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${FOCUS_TITLE[focus]} — ${esc(city)}</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 landscape;margin:8mm}
body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;margin:0;font-size:10px}
.top{display:flex;align-items:center;gap:8px;border-bottom:2px solid #b45309;padding-bottom:4px;margin-bottom:4px}
.brand{display:flex;align-items:center;gap:6px;width:25%}.brand img{height:24px}
.brand b{display:block;color:#b45309;font-size:12px}.brand span{font-size:8.5px;color:#64748b;font-weight:700;text-transform:uppercase}
.ttl{flex:1;text-align:center}.ttl h1{margin:0;font-size:15px}.ag{font-size:11px;color:#92400e}
.when{width:25%;text-align:right;font-size:9px;color:#475569}
.meta{font-size:9px;color:#475569;margin-bottom:6px}
.kpis{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.kpi{border:1px solid #cbd5e1;border-radius:5px;padding:3px 8px}
.kpi span{display:block;font-size:8.5px;color:#64748b;text-transform:uppercase}.kpi b{font-size:12px}.kpi.main{border-color:#b45309;background:#fffbeb}
table{width:100%;border-collapse:collapse}
th{background:#b45309;color:#fff;font-size:8.5px;text-transform:uppercase;padding:3px 4px;text-align:left}
td{border-bottom:1px solid #e2e8f0;padding:3px 4px;font-size:9.5px;vertical-align:top}td small{color:#64748b}
tr{page-break-inside:avoid}thead{display:table-header-group}tr.neg td{color:#64748b;font-style:italic}
tfoot td{font-weight:800;background:#fffbeb;border-top:2px solid #b45309}
.r{text-align:right}.c{text-align:center}.b{font-weight:800}
.note{font-size:8.5px;color:#64748b;margin-top:4px}
</style></head><body>
<div class="top">
  <div class="brand"><img src="${logo}" onerror="this.style.display='none'"><div><b>BG EXPRESS</b><span>Administration</span></div></div>
  <div class="ttl"><h1>${FOCUS_TITLE[focus]} — ${esc(subject)}</h1><div class="ag">Agence : <b>${esc(city)}</b></div></div>
  <div class="when">Imprimé le<br><b>${esc(printedAt)}</b></div>
</div>
<div class="meta">Période : <b>${esc(periodText)}</b> · ${lines.length} expédition(s) · ${subject === 'Ports' ? 'ports attendus non encore encaissés (en compte exclus)' : 'valeurs (COD) attendues non encore encaissées'}</div>
<div class="kpis">
  ${[...byKind.entries()].map(([k, v]) => `<div class="kpi"><span>${esc(kindLabels[k] || k)} (${v.n})</span><b>${dh(v.m)}</b></div>`).join('')}
  <div class="kpi main"><span>Total ${FOCUS_TITLE[focus].toLowerCase()}</span><b>${dh(total)}</b></div>
</div>
<table><thead><tr><th>#</th><th>N° EXP</th><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th>${subject === "Ports" ? "Port" : "Valeur"}</th><th>Statut / livreur</th><th class="r">Attendu</th><th class="r">Encaissé</th><th class="r">Reste</th></tr></thead>
<tbody>${rows || '<tr><td colspan="10" class="c">Aucune expédition</td></tr>'}</tbody>
<tfoot><tr><td colspan="9">TOTAL — ${lines.length} expédition(s)</td><td class="r">${dh(total)}</td></tr></tfoot></table>
${lines.some(l => l.reste < 0) ? '<div class="note">Lignes en italique : port encaissé par l\'agence sans être attendu dans la période (ex. expédition d\'une autre période) — elles diminuent le reste.</div>' : ''}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`
  const w = window.open('', '_blank', 'width=1100,height=800')
  if (!w) { alert('Autorisez les fenêtres pop-up pour imprimer.'); return }
  w.document.write(html)
  w.document.close()
}

export function printAgencyFollowUp(opts: {
  city: string
  periodText: string
  windowNote?: string
  exp: ExploitationFollowUp
  chef: ChefAgenceFollowUp
  situation: CaisseSituation
  enCompte: EnCompteFollowUp
}) {
  const { city, periodText, windowNote, exp, chef, situation: s, enCompte } = opts
  const now = new Date()
  const printedAt = `${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  const logo = window.location.origin + '/LOGO.jpg'
  const empty = (cols: number) => `<tr><td colspan="${cols}" class="muted">Aucune ligne</td></tr>`

  const expRows = exp.lines.map(l => `<tr>
    <td>${esc(fmtDateTime(l.receivedAtMs))}</td><td class="b">${esc(l.nic)}</td>
    <td>${l.kind === 'port_du' ? 'Port dû' : 'Port payé ramassé'}${l.method === 'cheque' ? ' (chèque)' : ''}</td>
    <td>${esc(l.receivedBy)}</td><td class="r b">${dh(l.amount)}</td>
    <td>${esc(EXP_STATE_LABEL[l.state])}${l.state === 'valide' ? ` — ${esc(fmtDateTime(l.validatedAtMs))}${l.validatedBy ? ` (${esc(l.validatedBy)})` : ''}` : ''}</td>
  </tr>`).join('') || empty(6)

  const recRows = chef.receipts.map(r => `<tr>
    <td>${esc(fmtDateTime(r.atMs))}</td><td>${r.category === 'port_du' ? 'Port dû' : 'Port payé'}</td>
    <td>${esc(RECEIPT_SOURCE_LABEL[r.source])}</td><td>${esc(r.who)}</td><td class="r b">${dh(r.amount)}</td>
  </tr>`).join('') || empty(5)

  const versRows = chef.versements.map(v => `<tr class="${v.counted ? '' : 'grey'}">
    <td>${esc(fmtDateTime(v.atMs))}</td><td>${esc(v.label)}${v.paymentType ? ` (${esc(v.paymentType)})` : ''}</td>
    <td>${esc(v.who)}</td><td>${v.status ? esc(TRANSFER_STATUS_LABEL[v.status]) : '—'}</td>
    <td>${esc(v.note)}${v.reason ? ` <i>[${esc(v.reason)}]</i>` : ''}</td><td class="r b">${dh(v.amount)}</td>
  </tr>`).join('') || empty(6)

  const ecRows = enCompte.lines.map(l => `<tr>
    <td>${esc(fmtDateTime(l.dateMs))}</td><td class="b">${esc(l.nic)}</td>
    <td>${l.kind === 'exp' ? 'En compte expéditeur' : 'En compte destinataire'}</td>
    <td>${esc(l.client)}</td><td>${esc(l.otherCity)}</td>
    <td>${l.invoiced ? `Facturé${l.invoiceNumber && l.invoiceNumber !== 'Facturée' ? ` (${esc(l.invoiceNumber)})` : ''}` : '<b>Non facturé</b>'}</td>
    <td class="r b">${dh(l.amount)}</td>
  </tr>`).join('') || empty(7)

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Suivi de l'agence — ${esc(city)}</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:10mm}
body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;margin:0;font-size:10px}
.top{display:flex;align-items:center;gap:8px;border-bottom:2px solid #1e40af;padding-bottom:4px;margin-bottom:4px}
.brand{display:flex;align-items:center;gap:6px;width:28%}.brand img{height:24px}
.brand b{display:block;color:#1e40af;font-size:12px}.brand span{font-size:8.5px;color:#64748b;font-weight:700;text-transform:uppercase}
.ttl{flex:1;text-align:center}.ttl h1{margin:0;font-size:15px}.ag{font-size:11px;color:#1e3a8a}
.when{width:26%;text-align:right;font-size:9px;color:#475569}
.meta{font-size:9px;color:#475569;margin-bottom:6px}
h2{font-size:12px;color:#1e3a8a;margin:10px 0 4px;border-left:4px solid #1e40af;padding-left:6px}
.kpis{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px}
.kpi{border:1px solid #cbd5e1;border-radius:5px;padding:3px 8px;min-width:24%}
.kpi span{display:block;font-size:8.5px;color:#64748b;text-transform:uppercase}.kpi b{font-size:12px}
.kpi.main{border-color:#1e40af;background:#eff6ff}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
th{background:#1e40af;color:#fff;font-size:8.5px;text-transform:uppercase;padding:3px 4px;text-align:left}
td{border-bottom:1px solid #e2e8f0;padding:3px 4px;font-size:9.5px;vertical-align:top}
tr{page-break-inside:avoid}thead{display:table-header-group}
.r{text-align:right}.b{font-weight:800}.muted{color:#94a3b8;text-align:center}
tr.grey td{color:#94a3b8}
.note{font-size:8.5px;color:#64748b;margin:2px 0 4px}
</style></head><body>
<div class="top">
  <div class="brand"><img src="${logo}" onerror="this.style.display='none'"><div><b>BG EXPRESS</b><span>Administration</span></div></div>
  <div class="ttl"><h1>Suivi de l'agence — Ports</h1><div class="ag">Agence : <b>${esc(city)}</b></div></div>
  <div class="when">Imprimé le<br><b>${esc(printedAt)}</b></div>
</div>
<div class="meta">Période : <b>${esc(periodText)}</b> · ports uniquement (aucun COD)${windowNote ? ` · ${esc(windowNote)}` : ''}</div>

<h2>1. Chef d'agence</h2>
<div class="kpis">
  <div class="kpi"><span>Ports reçus en caisse</span><b>${dh(chef.recu.amount)}</b> (${chef.recu.n})</div>
  <div class="kpi"><span>Versements (ports)</span><b>${dh(chef.verse.amount)}</b> (${chef.verse.n})</div>
  <div class="kpi main"><span>Solde (reçu − versé)</span><b>${dh(chef.solde)}</b></div>
</div>
<div class="note">Reçu : envois validés ${dh(chef.recu.envoi)} · réceptions directes ${dh(chef.recu.direct)} · autres ${dh(chef.recu.autre)}. Versements écartés (COD, en compte, rejetés, internes) : ${dh(chef.ecarte.amount)} (${chef.ecarte.n}).</div>
<table><thead><tr><th>Date</th><th>Port</th><th>Origine</th><th>Par</th><th class="r">Montant</th></tr></thead><tbody>${recRows}</tbody></table>
<table><thead><tr><th>Date</th><th>Versement</th><th>Par</th><th>Statut</th><th>Note</th><th class="r">Montant</th></tr></thead><tbody>${versRows}</tbody></table>

<h2>2. Solde caisse et solde théorique</h2>
<table><thead><tr><th></th><th class="r">Port payé</th><th class="r">Port dû</th><th class="r">Port dû chèque</th><th class="r">Total</th><th class="r">Versements</th><th class="r">Solde</th></tr></thead><tbody>
<tr><td class="b">Caisse (réellement encaissé)</td><td class="r">${dh(s.encaisse.portPaye)}</td><td class="r">${dh(s.encaisse.portDu)}</td><td class="r">${dh(s.encaisse.portDuCheque)}</td><td class="r b">${dh(s.encaisse.total)}</td><td class="r">${dh(s.versements)}</td><td class="r b">${dh(s.soldeCaisse)}</td></tr>
<tr><td class="b">Théorique (hors en compte)</td><td class="r">${dh(s.theorique.portPaye)}</td><td class="r">${dh(s.theorique.portDu)}</td><td class="r">${dh(s.theorique.portDuCheque)}</td><td class="r b">${dh(s.theorique.total)}</td><td class="r">${dh(s.versements)}</td><td class="r b">${dh(s.soldeTheorique)}</td></tr>
</tbody></table>
<div class="kpis"><div class="kpi main"><span>Écart = reste à encaisser (théorique − caisse)</span><b>${dh(s.ecart)}</b></div></div>

<h2>3. Ports en compte</h2>
<div class="kpis">
  <div class="kpi"><span>En compte expéditeur</span><b>${dh(enCompte.exp.total.amount)}</b> (${enCompte.exp.total.n}) — facturé ${dh(enCompte.exp.facture.amount)} (${enCompte.exp.facture.n}) · non facturé ${dh(enCompte.exp.nonFacture.amount)} (${enCompte.exp.nonFacture.n})</div>
  <div class="kpi"><span>En compte destinataire</span><b>${dh(enCompte.dest.total.amount)}</b> (${enCompte.dest.total.n}) — facturé ${dh(enCompte.dest.facture.amount)} (${enCompte.dest.facture.n}) · non facturé ${dh(enCompte.dest.nonFacture.amount)} (${enCompte.dest.nonFacture.n})</div>
</div>
<table><thead><tr><th>Date</th><th>N° EXP</th><th>Type</th><th>Client</th><th>Autre ville</th><th>Facturation</th><th class="r">Montant</th></tr></thead><tbody>${ecRows}</tbody></table>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) { alert("Autorisez les fenêtres pop-up pour imprimer."); return }
  w.document.write(html)
  w.document.close()
}
