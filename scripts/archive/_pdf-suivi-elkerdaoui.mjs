// PDF : suivi détaillé des mouvements des comptes Elkerdaoui (données lues par _suivi-elkerdaoui.mjs, lecture seule).
import { readFileSync, writeFileSync } from 'fs'
import { jsPDF } from 'jspdf'
import autoTableMod from 'jspdf-autotable'
const autoTable = autoTableMod.default || autoTableMod
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const out = process.argv[3]
const TZ = 'Africa/Casablanca'
const txt = v => String(v ?? '').replace(/[—–]/g, '-').replace(/→/g, 'a').split('\n').map(l => l.replace(/[^\x20-\xFF]/g, '').replace(/\s+/g, ' ').trim()).join('\n')
const money = n => (Math.round((n || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')
const dt = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')
const dayFr = k => k.split('-').reverse().join('/')
const opDay = t => new Date(t - 6 * 3600e3).toISOString().slice(0, 10)
const TYPE = { port_du: 'Port du', port_paye: 'Port paye', port_du_cheque: 'Port du cheque', especes: 'Especes', cheque: 'Cheque', traite: 'Traite' }

const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
const W = 297
const header = (title, sub) => {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 58, 138); doc.text('BG EXPRESS', 10, 12)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100)
  doc.text(`Édité le ${new Date().toLocaleString('fr-FR', { timeZone: TZ })}`, W - 10, 12, { align: 'right' })
  doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.6); doc.line(10, 15, W - 10, 15)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17); doc.text(txt(title), 10, 22)
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80); doc.text(txt(sub), 10, 27) }
  return sub ? 31 : 26
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
const section = (y, label) => {
  if (y > 180) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(190, 24, 93); doc.text(txt(label), 10, y)
  return y + 2
}

// Mouvements regroupés par expédition et par nature (port / COD) : une ligne = ce que le compte a fait sur cette somme
const KIND_LABEL = {
  port_collecte: 'collecté', port_recu_exp: 'reçu (chef exploit.)', port_recu_chef: 'reçu en caisse (chef agence)',
  port_paye_recu_exp: 'port payé reçu (chef exploit.)', port_paye_recu_chef: 'port payé reçu (chef agence)',
  cod_collecte: 'collecté', cod_recu_exp: 'reçu (chef exploit.)', cod_recu_chef: 'reçu en caisse (chef agence)', cod_mixte: 'déclaré chèque + espèces',
}
const grouped = acc => {
  const m = new Map()
  for (const x of acc.moves) {
    if (x.kind === 'pointage_arrivee') continue
    const fam = x.kind.startsWith('port') ? 'Port' : 'COD'
    const k = `${x.nic}|${fam}`
    const g = m.get(k) || { ...x, fam, t: x.t, actions: new Set() }
    g.t = Math.min(g.t, x.t); g.actions.add(KIND_LABEL[x.kind] || x.kind)
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => a.t - b.t)
}

// ── Page 1 : synthèse ────────────────────────────────────────────────────────
let y = header('Suivi détaillé des mouvements — ABDELLAH ELKERDAOUI (4 comptes, 3 postes)',
  `Période : du 05/10/2026 08:00 (début du vrai calcul de l'argent) au ${new Date().toLocaleDateString('fr-FR', { timeZone: TZ })} — journées d'opération (08:00 à 06:00 le lendemain). Données lues dans la base, sans modification.`)
// Une réception (chef d'exploitation + caisse chef d'agence) = UNE seule somme par expédition
const sumKind = (a, kinds) => { const seen = new Set(); return a.moves.filter(m => kinds.includes(m.kind)).reduce((s, m) => { if (seen.has(m.nic)) return s; seen.add(m.nic); return [s[0] + 1, s[1] + m.amount] }, [0, 0]) }
const syn = data.accounts.map(a => {
  const cr = Object.values(a.created).reduce((s, c) => [s[0] + c.n, s[1] + c.port], [0, 0])
  const pc = sumKind(a, ['port_collecte']), pr = sumKind(a, ['port_recu_exp', 'port_recu_chef']), cc = sumKind(a, ['cod_collecte']), cr2 = sumKind(a, ['cod_recu_exp', 'cod_recu_chef'])
  const pt = a.moves.filter(m => m.kind === 'pointage_arrivee').length
  const ent = a.caisse.filter(c => c.type === 'entree').reduce((s, c) => s + c.amount, 0), sor = a.caisse.filter(c => c.type !== 'entree').reduce((s, c) => s + c.amount, 0)
  const last = Math.max(0, ...a.moves.map(m => m.t), a.presence?.last || 0)
  return [txt(`${a.role}\n${a.city}`), txt(`${a.name}\n${a.email}`), `${cr[0]}\n${money(cr[1])} DH`, `${pc[0]}\n${money(pc[1])} DH`, `${pr[0]}\n${money(pr[1])} DH`,
    `${cc[0]}\n${money(cc[1])} DH`, `${cr2[0]}\n${money(cr2[1])} DH`, String(pt), String(a.arrivages.length), `${a.caisse.length}\n+${money(ent)} / -${money(sor)}`, last ? dt(last) : 'aucune']
})
y = table(y + 2, ['Poste', 'Compte', 'Exp. créées (port)', 'Ports collectés', 'Ports reçus', 'COD collectés', 'COD reçus', 'Arrivées pointées', 'Arrivages', 'Lignes de caisse (entrées / sorties DH)', 'Dernière activité'], syn,
  { styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.5, lineColor: [215, 219, 226], lineWidth: 0.15 } })
doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70)
;[
  "Lecture : « collecté » = encaissé lui-même (au guichet ou à la place du livreur) ; « reçu » = remis par le livreur / le guichet. Une même somme peut être collectée ET reçue par le même compte (comptée dans les deux colonnes).",
  "Chef d'exploitation : reçoit l'argent des livreurs puis le verse au chef d'agence. Chef d'agence : reçoit les versements (ou encaisse en l'absence du chef d'exploitation) et verse à l'admin.",
  "Agent pro (elkerdaouipro@gmail.com) : aucune action enregistrée sur la période. Versements chef d'exploitation → chef d'agence (valeursEnvois) et versements à l'admin (adminTransfers) : aucun pour ces comptes sur la période.",
].forEach((l, i) => doc.text(doc.splitTextToSize(txt(l), W - 20), 10, y + i * 8))

// ── Une partie par compte ───────────────────────────────────────────────────
for (const a of data.accounts) {
  doc.addPage()
  y = header(`${a.role} — ${a.city} — ${a.name}`, `${a.email} · du 05/10/2026 au ${new Date().toLocaleDateString('fr-FR', { timeZone: TZ })}`)
  if (a.presence) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60)
    doc.text(txt(`Aujourd'hui (${dayFr(a.presence.day)}) : première connexion ${dt(a.presence.first)}, dernière activité ${dt(a.presence.last)}, ${a.presence.actions} actions, ${a.presence.created} expéditions créées, ${a.presence.updated} modifiées, ${a.presence.cod} COD encaissés — poste : ${a.presence.device}, page : ${a.presence.page}`), 10, y)
    y += 5
  }
  // Synthèse par journée
  const days = new Map()
  const D = k => { if (!days.has(k)) days.set(k, { cr: 0, crPort: 0, pc: [0, 0], pr: [0, 0], cc: [0, 0], cr2: [0, 0], pt: 0, as: 0 }); return days.get(k) }
  Object.entries(a.created).forEach(([k, c]) => { const d = D(k); d.cr = c.n; d.crPort = c.port })
  Object.entries(a.assigned).forEach(([k, n]) => { D(k).as = n })
  const recSeen = new Set()
  for (const m of a.moves) {
    const d = D(opDay(m.t))
    if (m.kind.includes('recu')) { const k = `${m.nic}|${m.kind.slice(0, 3)}`; if (recSeen.has(k)) continue; recSeen.add(k) }
    if (m.kind === 'port_collecte') { d.pc[0]++; d.pc[1] += m.amount }
    else if (m.kind.startsWith('port_') && m.kind.includes('recu')) { d.pr[0]++; d.pr[1] += m.amount }
    else if (m.kind === 'cod_collecte') { d.cc[0]++; d.cc[1] += m.amount }
    else if (m.kind.startsWith('cod_recu')) { d.cr2[0]++; d.cr2[1] += m.amount }
    else if (m.kind === 'pointage_arrivee') d.pt++
  }
  const keys = [...days.keys()].sort()
  if (!keys.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(120); doc.text('Aucune action enregistrée sur la période.', 10, y + 6)
    continue
  }
  y = section(y + 2, 'Synthèse par journée d\'opération')
  const f = p => (p[0] ? `${p[0]} · ${money(p[1])}` : '-')
  const tot = keys.reduce((t, k) => { const d = days.get(k); return { cr: t.cr + d.cr, crPort: t.crPort + d.crPort, pc: [t.pc[0] + d.pc[0], t.pc[1] + d.pc[1]], pr: [t.pr[0] + d.pr[0], t.pr[1] + d.pr[1]], cc: [t.cc[0] + d.cc[0], t.cc[1] + d.cc[1]], cr2: [t.cr2[0] + d.cr2[0], t.cr2[1] + d.cr2[1]], pt: t.pt + d.pt, as: t.as + d.as } }, { cr: 0, crPort: 0, pc: [0, 0], pr: [0, 0], cc: [0, 0], cr2: [0, 0], pt: 0, as: 0 })
  y = table(y + 1, ['Journée', 'Exp. créées', 'Port des exp. créées (DH)', 'Ports collectés (n · DH)', 'Ports reçus (n · DH)', 'COD collectés (n · DH)', 'COD reçus (n · DH)', 'Arrivées pointées', 'Assignations livreur'],
    keys.map(k => { const d = days.get(k); return [dayFr(k), d.cr || '-', d.cr ? money(d.crPort) : '-', f(d.pc), f(d.pr), f(d.cc), f(d.cr2), d.pt || '-', d.as || '-'] }),
    { foot: [['Total', tot.cr, money(tot.crPort), f(tot.pc), f(tot.pr), f(tot.cc), f(tot.cr2), tot.pt, tot.as]], columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } } })

  // Détail des sommes
  const g = grouped(a)
  if (g.length) {
    y = section(y, `Détail des sommes encaissées / reçues (${g.length} lignes, une ligne par expédition et par nature)`)
    y = table(y + 1, ['#', 'Date et heure', 'Nature', 'N° EXP', 'Destinataire', 'Livreur', 'Statut', 'Ce qu\'il a fait', 'Montant (DH)'],
      g.map((x, i) => [i + 1, dt(x.t), txt(`${x.fam === 'Port' ? (TYPE[x.type] || `Port ${x.type}`) : `COD ${TYPE[x.type] || x.type}`}${x.cash ? ` mixte (dont ${money(x.cash)} espèces)` : ''}`), x.nic, txt(x.receiver), txt(x.driver), txt(x.status), txt([...x.actions].join(' + ')), money(x.amount)]),
      { columnStyles: { 0: { cellWidth: 9 }, 8: { halign: 'right' } },
        foot: [[{ content: `Total ports : ${money(g.filter(x => x.fam === 'Port').reduce((s, x) => s + x.amount, 0))} DH · Total COD : ${money(g.filter(x => x.fam === 'COD').reduce((s, x) => s + x.amount, 0))} DH`, colSpan: 9 }]] })
  }
  // Arrivages
  if (a.arrivages.length) {
    y = section(y, `Arrivages confirmés (${a.arrivages.length})`)
    y = table(y + 1, ['Date et heure', 'Référence', 'Ville', 'Attendues', 'Arrivées', 'Manquantes', 'Colis arrivés'],
      a.arrivages.map(r => [dt(r.t), txt(r.ref), txt(r.city), r.expected, r.arrived, r.missing, r.boxes]))
  }
  // Pointages d'arrivée
  const pts = a.moves.filter(m => m.kind === 'pointage_arrivee')
  if (pts.length) {
    y = section(y, `Expéditions pointées à l'arrivée (${pts.length})`)
    y = table(y + 1, ['#', 'Date et heure', 'N° EXP', 'Destinataire', 'Statut actuel', 'COD (DH)'],
      pts.map((x, i) => [i + 1, dt(x.t), x.nic, txt(x.receiver), txt(x.status), x.amount ? money(x.amount) : '-']), { columnStyles: { 0: { cellWidth: 9 }, 5: { halign: 'right' } } })
  }
  // Caisse
  if (a.caisse.length) {
    const ent = a.caisse.filter(c => c.type === 'entree').reduce((s, c) => s + c.amount, 0), sor = a.caisse.filter(c => c.type !== 'entree').reduce((s, c) => s + c.amount, 0)
    y = section(y, `Lignes de caisse écrites par ce compte (${a.caisse.length})`)
    y = table(y + 1, ['#', 'Date et heure', 'Sens', 'Catégorie', 'Description', 'Référence', 'Montant (DH)'],
      a.caisse.map((c, i) => [i + 1, dt(c.t), c.type === 'entree' ? 'Entrée' : 'Sortie', txt(c.category), txt(c.description), txt(c.reference), money(c.amount)]),
      { columnStyles: { 0: { cellWidth: 9 }, 4: { cellWidth: 110 }, 6: { halign: 'right' } }, foot: [[{ content: `Entrées : ${money(ent)} DH · Sorties : ${money(sor)} DH · Solde : ${money(ent - sor)} DH`, colSpan: 7 }]] })
  }
  if (a.delays.length) {
    y = section(y, `Retards signalés / résolus (${a.delays.length})`)
    y = table(y + 1, ['Date et heure', 'N° EXP', 'Livreur', 'Motif', 'Résolu'], a.delays.map(d => [dt(d.t), d.nic, txt(d.driver), txt(d.reason), d.resolved ? 'oui' : 'non']))
  }
}
// Pagination
const n = doc.getNumberOfPages()
for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Page ${i} / ${n}`, W - 10, 205, { align: 'right' }) }
writeFileSync(out, Buffer.from(doc.output('arraybuffer')))
console.log('PDF :', out, '—', n, 'pages')
