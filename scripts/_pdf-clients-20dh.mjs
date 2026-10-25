// PDF : clients d'Agadir et d'Ait Melloul qui paient 20 DH par colis (données lues par _clients-20dh.mjs, lecture seule).
import { readFileSync, writeFileSync } from 'fs'
import { jsPDF } from 'jspdf'
import autoTableMod from 'jspdf-autotable'
const autoTable = autoTableMod.default || autoTableMod
const list = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const out = process.argv[3]
const sel = list.filter(c => c.exps >= 2 && c.at20 > 0 && c.at20 / c.exps >= 0.8)
const txt = v => String(v ?? '').replace(/[—–]/g, '-').replace(/[^\x20-\xFF]/g, '').replace(/\s+/g, ' ').trim()
const money = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\s/g, ' ')
const day = ms => ms ? new Date(ms).toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca' }) : '-'
const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
const head = (title) => {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 58, 138); doc.text('BG EXPRESS', 10, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  doc.text(`Édité le ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}`, 287, 13, { align: 'right' })
  doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.6); doc.line(10, 16, 287, 16)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17); doc.text(txt(title), 10, 23)
}
head('Clients qui paient 20 DH par colis - Agadir et Ait Melloul')
doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60)
const crit = [
  "Période : expéditions créées du 20/07/2026 au " + new Date().toLocaleDateString('fr-FR') + " (expéditions actives et archivées).",
  "Client = celui qui paie le port : l'expéditeur (port payé, en compte expéditeur) ou le destinataire (port dû, en compte destinataire) de la ville.",
  "Retenu si : au moins 2 expéditions et au moins 80 % d'entre elles à 20 DH par colis (prix du port / nombre de colis).",
  `Total : ${sel.length} clients (Agadir ${sel.filter(c => c.city === 'Agadir').length}, Ait Melloul ${sel.filter(c => c.city === 'Ait Melloul').length}).`,
]
crit.forEach((l, i) => doc.text(l, 10, 29 + i * 4.5))
let y = 49
for (const city of ['Agadir', 'Ait Melloul']) {
  const rows = sel.filter(c => c.city === city).sort((a, b) => b.colis - a.colis || a.name.localeCompare(b.name))
  if (!rows.length) continue
  if (y > 170) { doc.addPage(); head('Clients qui paient 20 DH par colis - suite'); y = 30 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(190, 24, 93)
  doc.text(`${city} - ${rows.length} clients`, 10, y)
  autoTable(doc, {
    startY: y + 2,
    head: [['#', 'Client', 'Téléphone', 'Paie comme', 'Expéditions', 'Colis', 'À 20 DH/colis', 'Montant ports (DH)', 'Dernière exp.']],
    body: rows.map((c, i) => [i + 1, txt(c.name), txt(c.tel) || '-', txt(c.roles), c.exps, c.colis, `${c.at20}/${c.exps} (${Math.round(c.at20 / c.exps * 100)} %)`, money(c.montant), day(c.last)]),
    foot: [[{ content: `Total ${city}`, colSpan: 4 }, rows.reduce((t, c) => t + c.exps, 0), rows.reduce((t, c) => t + c.colis, 0), '', money(rows.reduce((t, c) => t + c.montant, 0)), '']],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.5, lineColor: [209, 213, 219], lineWidth: 0.2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: 17, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 70, fontStyle: 'bold' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 7: { halign: 'right' } },
    showFoot: 'lastPage',
    margin: { left: 10, right: 10 },
    didDrawPage: () => { doc.setFontSize(8); doc.setTextColor(120); doc.text(`Page ${doc.getNumberOfPages()}`, 287, 205, { align: 'right' }) },
  })
  y = doc.lastAutoTable.finalY + 10
}
writeFileSync(out, Buffer.from(doc.output('arraybuffer')))
console.log('PDF :', out, '—', sel.length, 'clients')
