/**
 * 🖨️ « Résumé de caisse — Ports par agence » (Admin › Port par agence, mode Caisse) avec ACCUSÉ DE RÉCEPTION.
 * Deux exemplaires identiques sur UNE page A4 portrait (exemplaire agence / exemplaire administration), séparés par
 * une ligne de découpe : l'agence (chef d'agence ou chef d'exploitation) signe et garde un exemplaire.
 */
const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => HTML_ESC[c])
const dh = (n: number) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DH`

export interface PortCaisseRow {
  city: string; nbExpeditions: number; nbUnique?: number
  portPaye: number; portDu: number; portDuCheque: number
}

export function printPortCaisseReceipt(opts: {
  rows: PortCaisseRow[]
  /** Ville affichée (« Toutes les agences » si plusieurs) */
  cityLabel: string
  periodText: string
  expeditionsCount: number
  printedBy?: string
}) {
  const { rows, cityLabel, periodText, expeditionsCount, printedBy } = opts
  const tot = rows.reduce((t, r) => ({
    exp: t.exp + (r.nbUnique ?? r.nbExpeditions), paye: t.paye + r.portPaye, du: t.du + r.portDu, cheque: t.cheque + r.portDuCheque,
  }), { exp: 0, paye: 0, du: 0, cheque: 0 })
  const total = tot.paye + tot.du + tot.cheque
  const now = new Date()
  const printedAt = `${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  const logo = window.location.origin + '/LOGO.jpg'
  const agency = rows.length === 1 ? rows[0].city : cityLabel

  const body = rows.map(r => `<tr>
      <td class="b">${esc(r.city)}</td>
      <td class="r">${r.nbUnique ?? r.nbExpeditions}</td>
      <td class="r">${dh(r.portPaye)}</td>
      <td class="r">${dh(r.portDu)}</td>
      <td class="r">${dh(r.portDuCheque)}</td>
      <td class="r b">${dh(r.portPaye + r.portDu + r.portDuCheque)}</td>
    </tr>`).join('')

  const copy = (label: string) => `
  <section class="copy">
    <div class="top">
      <div class="brand"><img src="${logo}" onerror="this.style.display='none'"><div><b>BG EXPRESS</b><span>${esc(label)}</span></div></div>
      <div class="ttl"><h1>Résumé de caisse — Ports par agence</h1><div class="ag">Agence : <b>${esc(agency)}</b></div></div>
      <div class="when">Imprimé le<br><b>${esc(printedAt)}</b>${printedBy ? `<br>par ${esc(printedBy)}` : ''}</div>
    </div>
    <div class="meta">Période : <b>${esc(periodText)}</b> · ${expeditionsCount} expédition${expeditionsCount > 1 ? 's' : ''} · argent réellement encaissé (ports dus collectés à destination, ports payés encaissés à l'origine)</div>
    <table>
      <thead><tr><th>Agence</th><th class="r">Expéditions</th><th class="r">Port payé</th><th class="r">Port dû (espèces)</th><th class="r">Port dû chèque</th><th class="r">Total encaissé</th></tr></thead>
      <tbody>${body}</tbody>
      ${rows.length > 1 ? `<tfoot><tr><td>TOTAL</td><td class="r">${tot.exp}</td><td class="r">${dh(tot.paye)}</td><td class="r">${dh(tot.du)}</td><td class="r">${dh(tot.cheque)}</td><td class="r">${dh(total)}</td></tr></tfoot>` : ''}
    </table>
    <div class="total">Total à remettre : <b>${dh(total)}</b></div>
    <div class="ack">
      <p><b>ACCUSÉ DE RÉCEPTION</b> — Je soussigné(e), &nbsp;☐ Chef d'agence &nbsp;☐ Chef d'exploitation de l'agence de <b>${esc(agency)}</b>,
      reconnais avoir reçu le présent résumé de caisse et en confirme les montants pour la période indiquée.</p>
      <div class="sig">
        <div>Nom et prénom :<span class="line"></span></div>
        <div>Reçu le : <span class="line short"></span> à <span class="line xs"></span></div>
        <div class="box">Signature et cachet de l'agence</div>
        <div class="box">Signature — Administration</div>
      </div>
    </div>
  </section>`

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Résumé de caisse — ${esc(agency)}</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:8mm}
body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;margin:0;font-size:10px}
.copy{height:136mm;padding:4mm 2mm;display:flex;flex-direction:column;gap:3mm;overflow:hidden}
.cut{border-top:1.5px dashed #94a3b8;margin:1.5mm 0;position:relative;text-align:center}
.cut span{position:relative;top:-7px;background:#fff;padding:0 6px;color:#64748b;font-size:9px}
.top{display:flex;align-items:center;gap:8px;border-bottom:2px solid #1e40af;padding-bottom:3px}
.brand{display:flex;align-items:center;gap:6px;width:28%}.brand img{height:24px}
.brand b{display:block;color:#1e40af;font-size:12px}.brand span{font-size:8.5px;color:#64748b;font-weight:700;text-transform:uppercase}
.ttl{flex:1;text-align:center}.ttl h1{margin:0;font-size:14px}.ag{font-size:11px;color:#1e3a8a}
.when{width:24%;text-align:right;font-size:9px;color:#475569}
.meta{font-size:9px;color:#475569}
table{width:100%;border-collapse:collapse}
th{background:#1e40af;color:#fff;font-size:8.5px;text-transform:uppercase;padding:4px;text-align:left}
td{border-bottom:1px solid #e2e8f0;padding:4px;font-size:10px}
.r{text-align:right}.b{font-weight:800}
tfoot td{font-weight:800;background:#eff6ff;border-top:2px solid #1e40af}
.total{text-align:right;font-size:12px;color:#065f46}
.ack{border:1.5px solid #1e40af;border-radius:6px;padding:3mm;margin-top:auto}
.ack p{margin:0 0 2mm;font-size:9.5px;line-height:1.35}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:2mm 6mm;font-size:9.5px}
.line{display:inline-block;border-bottom:1px dotted #111;width:55%;height:10px;vertical-align:bottom}.line.short{width:28%}.line.xs{width:14%}
.box{border:1px dashed #94a3b8;border-radius:4px;height:15mm;padding:1mm 2mm;color:#64748b;font-size:8.5px}
</style></head><body>
${copy('Exemplaire agence')}
<div class="cut"><span>✂ découper ici</span></div>
${copy('Exemplaire administration')}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) { alert("Autorisez les fenêtres pop-up pour imprimer."); return }
  w.document.write(html)
  w.document.close()
}
