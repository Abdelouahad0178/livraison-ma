// PDF : état des COD EN ESPÈCES des expéditeurs (septembre et octobre 2026), avec ancienneté (jours depuis la création).
// Données lues par _etat-cod-especes-sept.mjs (lecture seule). Usage : node … <out.pdf> <mois1.json> [mois2.json …]
import { readFileSync, writeFileSync } from 'fs'
import { jsPDF } from 'jspdf'
import autoTableMod from 'jspdf-autotable'
const autoTable = autoTableMod.default || autoTableMod
const [out, ...files] = process.argv.slice(2)
const months = files.map(f => JSON.parse(readFileSync(f, 'utf8')))
const TZ = 'Africa/Casablanca'
const NOW = Date.now()
const txt = v => String(v ?? '').replace(/[—–]/g, '-').split('\n').map(l => l.replace(/[^\x20-\xFF]/g, '').replace(/\s+/g, ' ').trim()).join('\n')
const money = n => (Math.round((n || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')
const d = t => (t ? new Date(t).toLocaleDateString('fr-FR', { timeZone: TZ }) : '-')
const days = t => (t ? Math.floor((NOW - t) / 86400000) : '-')
const MONTH_FR = { '2026-09': 'Septembre 2026', '2026-10': 'Octobre 2026' }
const W = 297
const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
const header = (title, sub) => {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 58, 138); doc.text('BG EXPRESS', 10, 12)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100)
  doc.text(`Édité le ${new Date().toLocaleString('fr-FR', { timeZone: TZ })}`, W - 10, 12, { align: 'right' })
  doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.6); doc.line(10, 15, W - 10, 15)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17); doc.text(txt(title), 10, 22)
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80); doc.text(doc.splitTextToSize(txt(sub), W - 20), 10, 27) }
  return sub ? 35 : 26
}
const table = (startY, head, body, extra = {}) => {
  autoTable(doc, {
    startY, head: [head], body,
    styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.2, lineColor: [215, 219, 226], lineWidth: 0.15, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: 17, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10, top: 20 }, showFoot: 'lastPage', ...extra,
  })
  return doc.lastAutoTable.finalY + 6
}
const STEPS = ['Pas encore encaissé', 'Encaissé (livreur / chef d\'exploitation)', 'Reçu en caisse (agence)', 'Envoyé à l\'agence source', 'Versé au compte société', 'Réglé à l\'expéditeur', 'Retourné - non encaissé']
const NOTE = "Montant = part ESPÈCES du retour de fonds (COD mixte : sa part espèces ; COD chèque / traite exclus). Jours = jours écoulés entre la création de l'expédition et aujourd'hui. "
  + "Étape : situation de l'argent dans le site. ⚠ Avant le 05/10/2026, les encaissements de COD n'étaient pas encore suivis dans le site : pour septembre, « Pas encore encaissé » signifie surtout « non saisi », pas forcément « non payé »."

// ── Synthèse générale ──
let y = header('État des COD en espèces des expéditeurs - Septembre et Octobre 2026', NOTE)
const gen = months.map(m => {
  const r = m.rows, tot = r.reduce((t, x) => t + x.cash, 0)
  const by = STEPS.map(s => r.filter(x => x.step.replace('—', '-') === s).reduce((t, x) => t + x.cash, 0))
  return [MONTH_FR[m.month] || m.month, r.length, new Set(r.map(x => x.sender)).size, money(tot), ...by.map(money)]
})
y = table(y, ['Mois', 'Expéditions', 'Expéditeurs', 'Total espèces (DH)', 'Pas encore encaissé', 'Encaissé (livreur / exploit.)', 'Reçu en caisse agence', 'Envoyé agence source', 'Versé compte société', 'Réglé expéditeur', 'Retourné non encaissé'], gen,
  { columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => [i, { halign: 'right' }])) })

for (const m of months) {
  const label = MONTH_FR[m.month] || m.month
  // Par expéditeur
  const map = new Map()
  for (const r of m.rows) {
    const g = map.get(r.sender) || { sender: r.sender, origin: r.origin, tel: r.senderTel, rows: [], cash: 0 }
    g.rows.push(r); g.cash += r.cash; if (!g.tel && r.senderTel) g.tel = r.senderTel
    map.set(r.sender, g)
  }
  const groups = [...map.values()].sort((a, b) => b.cash - a.cash)
  const enc = r => r.step !== 'Pas encore encaissé' && !r.step.startsWith('Retourné')
  doc.addPage()
  y = header(`${label} - COD en espèces par expéditeur (${groups.length} expéditeurs, ${m.rows.length} expéditions)`, NOTE)
  y = table(y, ['#', 'Expéditeur', 'Ville', 'Téléphone', 'Exp.', 'Total espèces (DH)', 'Encaissé (DH)', 'Pas encore encaissé (DH)', 'Réglé à l\'exp. (DH)', 'Plus ancienne', 'Jours max', 'Jours moyen'],
    groups.map((g, i) => {
      const ages = g.rows.map(r => days(r.created)).filter(x => x !== '-')
      return [i + 1, txt(g.sender), txt(g.origin), txt(g.tel), g.rows.length, money(g.cash),
        money(g.rows.filter(enc).reduce((t, r) => t + r.cash, 0)), money(g.rows.filter(r => r.step === 'Pas encore encaissé').reduce((t, r) => t + r.cash, 0)),
        money(g.rows.filter(r => r.paidSender).reduce((t, r) => t + r.cash, 0)),
        d(Math.min(...g.rows.map(r => r.created))), Math.max(...ages), Math.round(ages.reduce((t, x) => t + x, 0) / ages.length)]
    }),
    { columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 55, fontStyle: 'bold' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' } },
      foot: [[{ content: `Total ${label}`, colSpan: 4 }, m.rows.length, money(groups.reduce((t, g) => t + g.cash, 0)), money(m.rows.filter(enc).reduce((t, r) => t + r.cash, 0)), money(m.rows.filter(r => r.step === 'Pas encore encaissé').reduce((t, r) => t + r.cash, 0)), money(m.rows.filter(r => r.paidSender).reduce((t, r) => t + r.cash, 0)), '', '', '']] })

  // Détail par expéditeur
  doc.addPage()
  y = header(`${label} - Détail des expéditions par expéditeur`, 'Une ligne par expédition, de la plus ancienne à la plus récente ; jours = jours écoulés depuis la création jusqu\'à aujourd\'hui.')
  const body = []
  for (const g of groups) {
    body.push([{ content: txt(`${g.sender}${g.origin ? ` (${g.origin})` : ''}${g.tel ? ` · ${g.tel}` : ''} - ${g.rows.length} exp. - ${money(g.cash)} DH`), colSpan: 9, styles: { fillColor: [224, 231, 255], fontStyle: 'bold', textColor: [30, 58, 138] } }])
    g.rows.sort((a, b) => a.created - b.created).forEach(r => body.push([
      r.nic, d(r.created), days(r.created), txt(r.dest), txt(r.receiver), txt(r.status) + (r.archived ? ' (archivée)' : ''),
      txt(r.step.replace('—', '-')), r.collectedAt ? d(r.collectedAt) : '-', money(r.cash) + (r.mixed ? ` (mixte, total ${money(r.total)})` : ''),
    ]))
  }
  table(y, ['N° EXP', 'Création', 'Jours', 'Destination', 'Destinataire', 'Statut', 'Étape de l\'argent', 'Encaissé le', 'Espèces (DH)'], body,
    { columnStyles: { 2: { halign: 'right' }, 8: { halign: 'right' } } })
}
const n = doc.getNumberOfPages()
for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Page ${i} / ${n}`, W - 10, 205, { align: 'right' }) }
writeFileSync(out, Buffer.from(doc.output('arraybuffer')))
console.log('PDF :', out, '-', n, 'pages')
