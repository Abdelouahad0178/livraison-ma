import { codPaymentTypeOf } from '../firebase/constants'
import { fmt } from './formatNumber'
import { parcelDate } from './dateFilter'

/**
 * 🖨️ Feuille de charge d'un livreur (A4 portrait) — utilisée par la page Chef d'exploitation ET
 * la page Chef d'agence (impression des expéditions assignées à un livreur).
 */
const nic = (p: any) => p.senderNic || p.sender?.nic || p.trackingId || '—'
const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => HTML_ESC[c])
const safeParseAmount = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function printFeuilleDeCharge(driverName: string, city: string, parcels: any[], preparedBy = '', periodLabel = '', statusLabel = '') {
  const isDu = (p: any) => p.portType === 'port_du' && !p.portPayeMethod
  const isPaye = (p: any) => p.portType === 'port_paye' && !p.portPayeMethod
  const isCompte = (p: any) => String(p.portType || '').startsWith('port_en_compte')
  const amt = (p: any) => safeParseAmount(p.price)
  const codOf = (p: any) => parseFloat(p.codAmount) || 0
  const TYPE_LABEL: Record<string, string> = { especes: 'Espèces', cheque: 'Chèque', traite: 'Traite', bon_livraison: 'BL' }

  // Tri : port dû d'abord (à encaisser), puis payé, puis en compte, puis par N° EXP
  const rank = (p: any) => (isDu(p) ? 0 : isPaye(p) ? 1 : isCompte(p) ? 2 : 3)
  const sorted = [...parcels].sort((a, b) => rank(a) - rank(b) || String(nic(a)).localeCompare(String(nic(b)), undefined, { numeric: true }))

  // 📄 À partir de 20 expéditions : mode compact (une feuille de 20 tient sur une page A4 portrait) —
  // chaque ligne tient sur UNE SEULE ligne (montant + étiquette côte à côte, pas l'un sous l'autre),
  // avec des lignes plus basses pour réduire les écarts entre expéditions.
  const compact = parcels.length >= 20
  // Entre 20 et 45 expéditions, on garde un peu plus d'air entre les lignes (la page n'est pas pleine)
  const roomy = compact && parcels.length <= 45
  const totalColis = sorted.reduce((n, p) => n + (Number(p.nbColis) || 1), 0)
  const dus = sorted.filter(isDu)
  const payes = sorted.filter(isPaye)
  const comptes = sorted.filter(isCompte)
  const totalDu = dus.reduce((n, p) => n + amt(p), 0)
  const codByType: Record<string, { n: number; amount: number }> = {}
  sorted.filter(p => codOf(p) > 0).forEach(p => {
    const t = codPaymentTypeOf(p) || 'especes'
    codByType[t] = codByType[t] || { n: 0, amount: 0 }
    codByType[t].n++
    codByType[t].amount += codOf(p)
  })
  const totalCod = Object.values(codByType).reduce((n, v) => n + v.amount, 0)

  const portCell = (p: any) => {
    const sep = compact ? ' ' : ''
    if (isDu(p)) return `<span class="amt">${fmt(amt(p))} DH</span>${sep}<span class="tag due">À ENCAISSER</span>`
    if (isPaye(p)) return `<span class="tag paid" style="margin-top:0">PAYÉ</span>`
    if (isCompte(p)) return `<span class="tag acct" style="margin-top:0">EN COMPTE${p.portType === 'port_en_compte_destinataire' ? ' DEST.' : p.portType === 'port_en_compte_expediteur' ? ' EXP.' : ''}</span>`
    return '<span class="muted">—</span>'
  }
  const codCell = (p: any) => {
    const c = codOf(p)
    if (c <= 0) return '<span class="muted">—</span>'
    const t = codPaymentTypeOf(p) || 'especes'
    const sep = compact ? ' ' : ''
    return `<span class="amt cod">${fmt(c)} DH</span>${sep}<span class="tag cod-${t}">${esc(TYPE_LABEL[t] || t)}</span>`
  }

  const senderSub = (p: any) => compact
    ? (p.sender?.city || p.originCity || '')
    : ((p.sender?.city || p.originCity) ? `<div class="sub2">${esc(p.sender?.city || p.originCity)}${p.sender?.tel ? ' · ' + esc(p.sender.tel) : ''}</div>` : (p.sender?.tel ? `<div class="sub2">${esc(p.sender.tel)}</div>` : ''))
  const rows = sorted.map((p, i) => compact ? `<tr>
    <td class="c">${i + 1}</td>
    <td class="nic">${esc(nic(p))}</td>
    <td><b>${esc(p.sender?.name || '—')}</b>${senderSub(p) ? ` <span class="sub2">· ${esc(senderSub(p))}</span>` : ''}</td>
    <td><b>${esc(p.receiver?.name || '—')}</b>${p.receiver?.tel ? ` <span class="sub2">· ${esc(p.receiver.tel)}</span>` : ''}</td>
    <td>${esc(p.receiver?.address || '—')}</td>
    <td class="c"><span class="pill">${esc(p.nbColis || 1)}</span></td>
    <td class="r nowrap1">${portCell(p)}</td>
    <td class="r nowrap1">${codCell(p)}</td>
    <td class="sig"></td>
  </tr>` : `<tr>
    <td class="c">${i + 1}</td>
    <td class="nic">${esc(nic(p))}</td>
    <td><b>${esc(p.sender?.name || '—')}</b>${senderSub(p)}</td>
    <td><b>${esc(p.receiver?.name || '—')}</b>${p.receiver?.tel ? `<div class="sub2">${esc(p.receiver.tel)}</div>` : ''}</td>
    <td>${esc(p.receiver?.address || '—')}</td>
    <td class="c"><span class="pill">${esc(p.nbColis || 1)}</span></td>
    <td class="r">${portCell(p)}</td>
    <td class="r">${codCell(p)}</td>
    <td class="sig"></td>
  </tr>`).join('')

  const codBoxes = Object.entries(codByType).map(([t, v]) => `<div class="kpi"><div class="k">COD ${esc(TYPE_LABEL[t] || t)}</div><div class="v">${fmt(v.amount)} DH</div><div class="s">${v.n} valeur(s)</div></div>`).join('')
  // 🗓️ J. opération = date de CRÉATION des expéditions imprimées (workDate), pas la date d'impression
  const fmtDay = (d: Date) => d.toLocaleDateString('fr-FR')
  const days = [...new Set(parcels.map(p => { try { return fmtDay(parcelDate(p)) } catch { return '' } }).filter(Boolean))]
    .sort((x, y) => x.split('/').reverse().join('').localeCompare(y.split('/').reverse().join('')))
  const opDayLabel = days.length === 0 ? '—' : days.length === 1 ? days[0] : `du ${days[0]} au ${days[days.length - 1]}`
  const logoUrl = window.location.origin + '/LOGO.jpg'
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Feuille de charge - ${esc(driverName)}</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:8mm 8mm}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:9.5px;color:#1f2937;margin:0;padding:4mm;max-width:210mm;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-bottom:5px;border-bottom:2px solid #1e40af}
.brand{display:flex;align-items:center;gap:10px}.brand img{height:28px;object-fit:contain}
.brand b{font-size:12px;color:#1e40af;letter-spacing:.4px;display:block}.brand span{font-size:9px;color:#6b7280}
.title{text-align:right}.center{flex:1;text-align:center}.center h1{margin:0;font-size:15px;color:#111827;letter-spacing:.3px}.title h1{margin:0;font-size:14px;color:#111827;letter-spacing:.3px}
.title .opday{display:inline-block;margin-top:2px;padding:1px 8px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:9px;font-weight:800;text-transform:capitalize}.title .opday small{font-weight:600;color:#64748b;text-transform:none}
.title .who{font-size:11px;font-weight:700;color:#1e40af;margin-top:2px}.title .when{font-size:10px;color:#6b7280;text-transform:capitalize}
.kpis{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
.kpi{flex:1 1 60px;border:1px solid #dbe4f5;background:#f5f8ff;border-radius:5px;padding:2px 6px}
.kpi .k{font-size:6px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;font-weight:700}
.kpi .v{font-size:9.5px;font-weight:800;color:#1e3a8a;margin-top:0;line-height:1.15}.kpi .s{font-size:6.5px;color:#94a3b8;line-height:1.1}
.kpi.due{background:#fff7ed;border-color:#fed7aa}.kpi.due .v{color:#c2410c}
.kpi.cod{background:#f0fdf4;border-color:#bbf7d0}.kpi.cod .v{color:#15803d}
table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
thead th{background:#1e40af;color:#fff;font-size:8px;text-transform:uppercase;letter-spacing:.3px;padding:6px 5px;text-align:left}
thead th.c{text-align:center}thead th.r{text-align:right}
tbody td{padding:4px 5px;border-bottom:1px solid #e5e7eb;vertical-align:middle}
tbody tr:nth-child(even) td{background:#f8fafc}tbody tr{page-break-inside:avoid}
td.c{text-align:center}td.r{text-align:right;white-space:nowrap}
td.nic{font-family:Consolas,monospace;font-weight:800;color:#1d4ed8;font-size:10px;white-space:nowrap}
.sub2{font-size:9px;color:#94a3b8;margin-top:1px}
.pill{display:inline-block;min-width:20px;padding:1px 6px;border-radius:10px;background:#e0e7ff;color:#3730a3;font-weight:800}
.amt{font-weight:800;font-size:10px;color:#111827}.amt.cod{color:#15803d}.muted{color:#cbd5e1}
.tag{display:block;font-size:7.5px;font-weight:800;letter-spacing:.4px;margin-top:2px;padding:1px 6px;border-radius:8px;width:max-content;margin-left:auto}
.tag.due{background:#ffedd5;color:#c2410c}.tag.paid{background:#dcfce7;color:#15803d}.tag.acct{background:#ede9fe;color:#6d28d9}
.tag.cod-especes{background:#dcfce7;color:#15803d}.tag.cod-cheque{background:#dbeafe;color:#1d4ed8}.tag.cod-traite{background:#e0e7ff;color:#4338ca}.tag.cod-bon_livraison{background:#f1f5f9;color:#475569}
td.sig{width:62px;border-left:1px dashed #cbd5e1}
tfoot td{background:#eff6ff;font-weight:800;padding:8px;border-top:2px solid #1e40af;color:#1e3a8a}
.signs{display:flex;gap:24px;margin-top:22px;page-break-inside:avoid}
.signs div{flex:1;border-top:1px solid #111827;padding-top:6px;text-align:center;font-size:9.5px;color:#374151;min-height:60px}
.foot{margin-top:10px;text-align:center;font-size:8.5px;color:#94a3b8}
${compact ? `
/* Mode compact (>= 20 expéditions) : une seule ligne par expédition, écarts minimisés */
body{font-size:8.3px}
.kpis{margin:4px 0}
table{border-radius:5px}
thead th{padding:4px 4px;font-size:7px}
tbody td{padding:1.5px 4px;line-height:1.25}
tbody tr:nth-child(even) td{background:#f8fafc}
td.nic{font-size:8.5px}
.amt{font-size:8.3px}
.tag{display:inline-block;margin-top:0;margin-left:4px;padding:0.5px 5px;font-size:6.5px;white-space:nowrap}
.sub2{font-size:7.5px;color:#94a3b8}
td.sig{width:40px}
.nowrap1{white-space:nowrap}
${roomy ? 'tbody td{padding:3px 4px}' : ''}
` : ''}
</style></head><body>
<div class="top">
  <div class="brand"><img src="${logoUrl}" onerror="this.style.display='none'"><div><b>BG EXPRESS</b><span>Agence de ${esc(city)}</span></div></div>
  <div class="center"><h1>Feuille de charge</h1><div class="opday">J. opération : ${esc(opDayLabel)}</div></div>
  <div class="title"><div class="who">🚚 ${esc(driverName)}</div><div class="when">${periodLabel ? `Période : ${esc(periodLabel)}${statusLabel && statusLabel !== 'Tous statuts' ? ` · ${esc(statusLabel)}` : ''} · imprimé le ${esc(new Date().toLocaleDateString('fr-FR'))}` : esc(today)}</div></div>
</div>
<div class="kpis">
  <div class="kpi"><div class="k">Expéditions</div><div class="v">${sorted.length}</div><div class="s">${totalColis} colis</div></div>
  <div class="kpi due"><div class="k">Ports dus à encaisser</div><div class="v">${fmt(totalDu)} DH</div><div class="s">${dus.length} expédition(s)</div></div>
  <div class="kpi"><div class="k">Ports payés</div><div class="v">${payes.length}</div><div class="s">déjà réglés</div></div>
  <div class="kpi"><div class="k">Ports en compte</div><div class="v">${comptes.length}</div><div class="s">facturés au client</div></div>
  <div class="kpi cod"><div class="k">COD total</div><div class="v">${fmt(totalCod)} DH</div><div class="s">${Object.values(codByType).reduce((n, v) => n + v.n, 0)} valeur(s)</div></div>
  ${codBoxes}
</div>
<table>
<thead><tr><th class="c">#</th><th>N° EXP</th><th>Expéditeur</th><th>Destinataire</th><th>Adresse</th><th class="c">Colis</th><th class="r">Port</th><th class="r">COD</th><th>Signature</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="5">TOTAL — ${sorted.length} expédition(s)</td><td class="c">${totalColis}</td><td class="r">${fmt(totalDu)} DH <span style="font-size:8px;font-weight:600">à encaisser</span></td><td class="r">${fmt(totalCod)} DH</td><td></td></tr></tfoot>
</table>
<div class="signs"><div>Livreur : ${esc(driverName)}<br><small>Signature</small></div><div>Chef d'exploitation${preparedBy ? ' : ' + esc(preparedBy) : ''}<br><small>Signature</small></div><div>Cachet de l'agence</div></div>
<div class="foot">BG EXPRESS — Feuille de charge générée le ${new Date().toLocaleString('fr-FR')}</div>
<script>window.onload=function(){window.print()}<\/script></body></html>`
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (w) { w.document.write(html); w.document.close() }
}
