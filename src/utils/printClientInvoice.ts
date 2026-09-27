// 🧾 Impression d'une facture client (A4 PORTRAIT) — interface Facturier

export interface ClientInvoiceLine {
  date: string          // date d'opération déjà formatée (JJ/MM/AAAA)
  nic: string
  receiverName: string
  receiverCity: string
  originCity: string
  nbColis: number
  portLabel: string
  amount: number
  codAmount: number
}

export interface ClientInvoicePrintData {
  invoiceNumber: string
  invoiceDate: string   // JJ/MM/AAAA
  clientName: string
  clientTel?: string
  agencyCity: string
  periodLabel: string
  dueDate?: string      // JJ/MM/AAAA
  notes?: string
  lines: ClientInvoiceLine[]
  totals: {
    count: number
    nbColis: number
    portPaye: number
    portDu: number
    portEnCompte: number
    cod: number
    total: number
  }
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const money = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Nombre → lettres (français), identique à la facture de l'onglet Factures
export function numberToWordsFr(num: number): string {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix']
  if (num === 0) return 'zéro'
  const convert = (n: number): string => {
    if (n < 10) return units[n]
    if (n < 20) return teens[n - 10]
    if (n < 100) {
      const ten = Math.floor(n / 10)
      const unit = n % 10
      if (ten === 7 || ten === 9) return tens[ten - 1] + '-' + teens[unit]
      return tens[ten] + (unit ? '-' + units[unit] : '')
    }
    if (n < 1000) {
      const hundred = Math.floor(n / 100)
      const rest = n % 100
      return (hundred > 1 ? units[hundred] + ' ' : '') + 'cent' + (hundred > 1 && rest === 0 ? 's' : '') + (rest ? ' ' + convert(rest) : '')
    }
    if (n < 1000000) {
      const thousand = Math.floor(n / 1000)
      const rest = n % 1000
      return (thousand > 1 ? convert(thousand) + ' ' : '') + 'mille' + (rest ? ' ' + convert(rest) : '')
    }
    if (n < 1000000000) {
      const million = Math.floor(n / 1000000)
      const rest = n % 1000000
      return convert(million) + ' million' + (million > 1 ? 's' : '') + (rest ? ' ' + convert(rest) : '')
    }
    return n.toString()
  }
  const integerPart = Math.floor(num)
  const decimalPart = Math.round((num - integerPart) * 100)
  let result = convert(integerPart) + ' dirhams'
  if (decimalPart > 0) result += ' et ' + convert(decimalPart) + ' centimes'
  return result
}

/**
 * @param opts.summary  true = FACTURE RÉSUMÉE : pas de liste d'expéditions, une ligne de désignation
 *                      par type de port (quantité d'expéditions, colis, montant) — la « vraie » facture.
 */
export function printClientInvoice(data: ClientInvoicePrintData, opts: { summary?: boolean } = {}) {
  const summary = !!opts.summary
  const logoUrl = window.location.origin + '/LOGO.jpg'
  const totalTTC = data.totals.total
  const totalHT = totalTTC / 1.10
  const totalTVA = totalTTC - totalHT
  const showCod = data.lines.some(l => l.codAmount > 0)

  const rows = data.lines.map((l, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(l.date)}</td>
        <td class="b">${esc(l.nic)}</td>
        <td>${esc(l.receiverName)}</td>
        <td>${esc(l.receiverCity)}</td>
        <td class="c">${l.nbColis}</td>
        <td>${esc(l.portLabel)}</td>
        ${showCod ? `<td class="r">${l.codAmount ? money(l.codAmount) : '-'}</td>` : ''}
        <td class="r b">${money(l.amount)}</td>
      </tr>`).join('')

  // Désignations regroupées par type de port (facture résumée)
  const groups = new Map<string, { count: number; colis: number; amount: number }>()
  data.lines.forEach(l => {
    const k = l.portLabel || 'Transport'
    const g = groups.get(k) || { count: 0, colis: 0, amount: 0 }
    g.count++; g.colis += Number(l.nbColis) || 0; g.amount += Number(l.amount) || 0
    groups.set(k, g)
  })
  const summaryRows = [...groups.entries()].map(([label, g], i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td><b>Prestations de transport et de messagerie</b> — ${esc(label)}<br><span style="color:#6b7280;font-size:7.5pt">Période : ${esc(data.periodLabel)}</span></td>
        <td class="c">${g.count}</td>
        <td class="c">${g.colis}</td>
        <td class="r">${money(g.amount / 1.10)}</td>
        <td class="r b">${money(g.amount)}</td>
      </tr>`).join('')

  const portRows = [
    ['Port payé', data.totals.portPaye],
    ['Port dû', data.totals.portDu],
    ['Port en compte', data.totals.portEnCompte],
  ].filter(([, v]) => (v as number) > 0)
    .map(([k, v]) => `<tr><td>${k}</td><td class="r">${money(v as number)} DH</td></tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Facture ${esc(data.invoiceNumber)} - ${esc(data.clientName)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 12mm 16mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 100%; max-width: 186mm; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 10px; border-bottom: 2px solid #1e3a8a; }
    .company img { height: 52px; object-fit: contain; margin-bottom: 4px; }
    .company div { font-size: 7.5pt; line-height: 1.4; }
    .title { text-align: right; }
    .title h1 { color: #1e3a8a; font-size: 22pt; letter-spacing: 1px; }
    .title .meta { margin-top: 4px; font-size: 9pt; line-height: 1.5; }
    .headline { margin: 12px 0 10px; padding: 8px 10px; background: #eef2ff; border-left: 4px solid #1e3a8a; border-radius: 3px; }
    .headline .client { font-size: 13pt; font-weight: bold; color: #1e3a8a; }
    .headline .period { font-size: 9.5pt; margin-top: 2px; }
    .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px; }
    .box { border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 8px; }
    .box .l { font-size: 7pt; color: #6b7280; text-transform: uppercase; margin-bottom: 2px; }
    .box .v { font-weight: bold; font-size: 9.5pt; }
    table.lines { width: 100%; border-collapse: collapse; margin-top: 4px; }
    table.lines thead { display: table-header-group; }
    table.lines th { background: #1e3a8a; color: #fff; padding: 5px 4px; font-size: 7.5pt; text-align: left; }
    table.lines td { padding: 4px; border-bottom: 1px solid #e5e7eb; font-size: 8pt; vertical-align: top; }
    table.lines tr { page-break-inside: avoid; }
    table.lines tfoot td { background: #f3f4f6; font-weight: bold; border-top: 2px solid #1e3a8a; font-size: 8.5pt; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    .summary { display: flex; justify-content: space-between; gap: 14px; margin-top: 14px; page-break-inside: avoid; }
    .summary table { border-collapse: collapse; }
    .summary td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; font-size: 9pt; }
    .recap { flex: 1; }
    .recap h3, .totals h3 { font-size: 9pt; color: #1e3a8a; margin-bottom: 4px; text-transform: uppercase; }
    .totals { width: 80mm; }
    .totals table { width: 100%; }
    .totals .ttc td { background: #1e3a8a; color: #fff; font-weight: bold; font-size: 11pt; }
    .words { margin-top: 12px; padding: 8px 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; font-weight: bold; font-size: 9pt; page-break-inside: avoid; }
    .notes { margin-top: 10px; font-size: 8.5pt; page-break-inside: avoid; }
    /* Signatures : juste sous la dernière écriture de la facture, avec la place pour le cachet */
    .sign { display: flex; justify-content: space-between; margin-top: 14px; font-size: 8.5pt; page-break-inside: avoid; }
    .sign div { width: 45%; border: 1px dashed #9ca3af; border-radius: 4px; padding: 4px 6px 60px; text-align: center; color: #4b5563; }
    /* Pied légal : TOUJOURS en bas de la page (répété sur chaque page) ; l'espace est réservé par
       le <tfoot> de .layout pour que le contenu ne passe jamais dessous. */
    .footer { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; padding-top: 6px; border-top: 1px solid #d1d5db; text-align: center; font-size: 7.5pt; color: #4b5563; }
    table.layout { width: 100%; border-collapse: collapse; }
    table.layout > tbody > tr > td, table.layout > tfoot > tr > td { padding: 0; }
    .footer-space { height: 12mm; }
    @media screen { .footer { position: static; margin-top: 18px; } .footer-space { display: none; } }
    .footer span { margin: 0 8px; }
  </style>
</head>
<body>
<table class="layout"><tbody><tr><td>
<div class="page">
  <div class="header">
    <div class="company">
      <img src="${logoUrl}" alt="BG Express">
      <div><b>Bloc H Rue 2 N°982 Agdal - Ait Melloul</b></div>
      <div>Tél : 05 28 30 68 58 — Gsm : 06 61 20 35 18 / 06 61 29 99 42</div>
      <div>E-mail : bgexpress2019@gmail.com</div>
    </div>
    <div class="title">
      <h1>FACTURE</h1>
      <div class="meta">
        <div>N° <b>${esc(data.invoiceNumber)}</b></div>
        <div>Date : <b>${esc(data.invoiceDate)}</b></div>
        ${data.dueDate ? `<div>Échéance : <b>${esc(data.dueDate)}</b></div>` : ''}
      </div>
    </div>
  </div>

  <div class="headline">
    <div class="client">Client : ${esc(data.clientName)}</div>
    <div class="period">Période facturée : <b>${esc(data.periodLabel)}</b></div>
  </div>

  <div class="info">
    <div class="box"><div class="l">Client</div><div class="v">${esc(data.clientName)}${data.clientTel ? `<br><span style="font-weight:normal;font-size:8pt">${esc(data.clientTel)}</span>` : ''}</div></div>
    <div class="box"><div class="l">Agence</div><div class="v">${esc(data.agencyCity || '-')}</div></div>
    <div class="box"><div class="l">Expéditions / Colis</div><div class="v">${data.totals.count} exp. — ${data.totals.nbColis} colis</div></div>
  </div>

  ${summary ? `
  <table class="lines">
    <thead>
      <tr>
        <th class="c" style="width:22px">#</th>
        <th>Désignation</th>
        <th class="c" style="width:70px">Expéditions</th>
        <th class="c" style="width:50px">Colis</th>
        <th class="r" style="width:80px">Montant HT (DH)</th>
        <th class="r" style="width:85px">Montant TTC (DH)</th>
      </tr>
    </thead>
    <tbody>${summaryRows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">TOTAL</td>
        <td class="c">${data.totals.count}</td>
        <td class="c">${data.totals.nbColis}</td>
        <td class="r">${money(totalHT)}</td>
        <td class="r">${money(totalTTC)}</td>
      </tr>
    </tfoot>
  </table>
  <div style="margin-top:4px;font-size:7.5pt;color:#6b7280">Le détail des expéditions (relevé) est disponible sur demande.</div>
  ` : `
  <table class="lines">
    <thead>
      <tr>
        <th class="c" style="width:22px">#</th>
        <th style="width:62px">Date</th>
        <th>N° EXP</th>
        <th>Destinataire</th>
        <th>Ville dest.</th>
        <th class="c" style="width:36px">Colis</th>
        <th>Type port</th>
        ${showCod ? '<th class="r">CRBT (DH)</th>' : ''}
        <th class="r" style="width:70px">Montant (DH)</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">TOTAL — ${data.totals.count} expédition(s)</td>
        <td class="c">${data.totals.nbColis}</td>
        <td></td>
        ${showCod ? `<td class="r">${money(data.totals.cod)}</td>` : ''}
        <td class="r">${money(totalTTC)}</td>
      </tr>
    </tfoot>
  </table>
  `}

  <div class="summary">
    <div class="recap">
      <h3>Récapitulatif par type de port</h3>
      <table>${portRows || '<tr><td>-</td><td></td></tr>'}</table>
      ${showCod ? `<div style="margin-top:6px;font-size:8pt;color:#4b5563">Contre-remboursement (CRBT) : ${money(data.totals.cod)} DH — à titre indicatif, non inclus dans le montant facturé.</div>` : ''}
    </div>
    <div class="totals">
      <h3>Montant à payer</h3>
      <table>
        <tr><td>Total HT</td><td class="r">${money(totalHT)} DH</td></tr>
        <tr><td>TVA 10%</td><td class="r">${money(totalTVA)} DH</td></tr>
        <tr class="ttc"><td>TOTAL TTC</td><td class="r">${money(totalTTC)} DH</td></tr>
      </table>
    </div>
  </div>

  <div class="words">
    Arrêtée la présente facture à la somme de ${esc(numberToWordsFr(Math.round(totalTTC * 100) / 100))} (${money(totalTTC)} DH TTC), dont TVA ${money(totalTVA)} DH.
  </div>

  ${data.notes ? `<div class="notes"><b>Notes :</b> ${esc(data.notes)}</div>` : ''}

  <div class="sign">
    <div>Cachet et signature BG Express</div>
    <div>Cachet et signature du client</div>
  </div>

</div>
</td></tr></tbody><tfoot><tr><td><div class="footer-space"></div></td></tr></tfoot></table>
<div class="footer">
  <span>R.C : 17447</span><span>T.P : 49803403</span><span>I.F : 31837263</span><span>CNSS : 1143595</span><span>ICE : 002158803000007</span>
</div>
<script>window.onload = function() { setTimeout(function(){ window.print(); }, 300); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=1100')
  if (!win) {
    alert("Impossible d'ouvrir la fenêtre d'impression (bloqueur de fenêtres ?)")
    return
  }
  win.document.write(html)
  win.document.close()
}
