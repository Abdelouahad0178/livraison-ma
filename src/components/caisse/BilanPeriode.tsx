import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePersistedOpen } from '../../hooks/usePersistedOpen'
import { ChevronDown, Printer, X } from 'lucide-react'
import { fmtFixed as fmtAmt } from '../../utils/formatNumber'
import { computeBilan, type Bilan, type BilanRole, type BilanItem } from '../../utils/bilanPeriode'

const frDay = (k: string | null) => (k ? k.split('-').reverse().join('/') : '—')
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ESC[c])

const driverOf = (i: BilanItem) => i.driver || 'Sans livreur'

/** Texte sans émojis ni caractères hors Latin-1 (polices standard du PDF). */
const pdfText = (v: any) => String(v ?? '').replace(/[—–]/g, '-').replace(/[^\x20-\xFF]/g, '').replace(/\s+/g, ' ').trim()

/** 📄 PDF de la liste (A4 paysage) : en-tête BG Express, livreur, tableau, total, signatures. Bibliothèque chargée au clic. */
async function buildListPdf(title: string, sub: string, items: BilanItem[], driver?: string): Promise<Blob> {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable') as Promise<any>])
  // Module de tableaux : fonction par défaut (navigateur) ou extension à activer (selon le format du module)
  const autoTable: (d: any, o: any) => void = typeof at.default === 'function' ? at.default
    : (() => { (at.applyPlugin || at.default?.applyPlugin)?.(jsPDF); return (d: any, o: any) => d.autoTable(o) })()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const total = items.reduce((t, i) => t + i.amount, 0)
  const money = (n: number) => fmtAmt(n).replace(/\s/g, ' ')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 58, 138)
  doc.text('BG EXPRESS', 10, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  doc.text(pdfText(sub), 10, 18)
  doc.text(`Imprimé le ${new Date().toLocaleString('fr-FR')}`, 287, 13, { align: 'right' })
  doc.setDrawColor(30, 58, 138); doc.setLineWidth(0.6); doc.line(10, 21, 287, 21)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17)
  doc.text(pdfText(title), 10, 28)
  let y = 32
  if (driver) {
    doc.setFillColor(224, 242, 254); doc.setDrawColor(125, 211, 252); doc.roundedRect(10, y, 277, 9, 1.5, 1.5, 'FD')
    doc.setFontSize(11); doc.setTextColor(12, 74, 110)
    doc.text(pdfText(`Livreur : ${driver}   -   ${items.length} expédition(s)   -   à encaisser : ${money(total)} DH`), 13, y + 6)
    y += 12
  }
  autoTable(doc, {
    startY: y,
    head: [['#', 'N° EXP', 'Expéditeur', 'Destinataire', 'Statut', 'Livreur / encaissé par', 'Expédition', 'Encaissement', 'Montant (DH)']],
    body: items.map((i, k) => [k + 1, i.nic, pdfText(i.sender), pdfText(i.receiver), pdfText(i.status), pdfText(i.driver), frDay(i.expDay), frDay(i.moneyDay) === '—' ? '-' : frDay(i.moneyDay), money(i.amount)]),
    foot: [[{ content: 'Total', colSpan: 8 }, money(total)]],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, lineColor: [209, 213, 219], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: 17, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 22, fontStyle: 'bold', textColor: [29, 78, 216] }, 8: { halign: 'right', cellWidth: 26 } },
    margin: { left: 10, right: 10 },
  })
  if (driver) {
    const end = ((doc as any).lastAutoTable?.finalY || y) + 8
    doc.setDrawColor(148, 163, 184); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    doc.roundedRect(10, end, 135, 20, 1.5, 1.5); doc.text(pdfText(`Livreur : ${driver}`), 13, end + 5)
    doc.roundedRect(152, end, 135, 20, 1.5, 1.5); doc.text("Chef d'exploitation / chef d'agence", 155, end + 5)
  }
  return doc.output('blob')
}

/**
 * 💬 Envoi WhatsApp EN PDF : le PDF de la liste est créé puis partagé (fenêtre de partage du téléphone / de Windows →
 * WhatsApp → contact). Si le partage de fichier n'est pas possible : le PDF est téléchargé et WhatsApp s'ouvre pour le joindre.
 */
async function shareWhatsAppPdf(title: string, sub: string, items: BilanItem[], driver?: string) {
  const blob = await buildListPdf(title, sub, items, driver)
  const name = `BG-Express-${pdfText(driver || title).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 50)}.pdf`
  const file = new File([blob], name, { type: 'application/pdf' })
  const nav: any = navigator
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], title, text: `BG EXPRESS — ${title}` }); return } catch (e: any) { if (e?.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  alert(`Le PDF « ${name} » a été téléchargé.\nWhatsApp va s'ouvrir : joignez-y ce fichier (trombone → Document).`)
  window.open(`https://wa.me/?text=${encodeURIComponent(`BG EXPRESS — ${title} (PDF joint)`)}`, '_blank', 'noopener')
}

/**
 * 🖨️ Impression de la liste d'expéditions d'un montant du bilan. `byDriver` : une feuille par livreur (saut de page),
 * avec son total et une case de signature — à remettre à chaque livreur qui doit encaisser.
 */
function printItems(title: string, sub: string, items: BilanItem[], byDriver = false) {
  const w = window.open('', '_blank')
  if (!w) { alert('Autorisez les fenêtres pour imprimer.'); return }
  const groups: [string, BilanItem[]][] = byDriver
    ? [...items.reduce((m, i) => m.set(driverOf(i), [...(m.get(driverOf(i)) || []), i]), new Map<string, BilanItem[]>()).entries()].sort((a, b) => a[0].localeCompare(b[0]))
    : [['', items]]
  const section = ([driver, list]: [string, BilanItem[]], idx: number) => {
    const total = list.reduce((t, i) => t + i.amount, 0)
    const rows = list.map((i, k) => `<tr><td>${k + 1}</td><td class="n">${esc(i.nic)}</td><td>${esc(i.sender)}</td><td>${esc(i.receiver)}</td><td>${esc(i.status)}</td><td>${esc(i.driver)}</td><td>${frDay(i.expDay)}</td><td>${frDay(i.moneyDay)}</td><td class="r">${fmtAmt(i.amount)}</td></tr>`).join('')
    return `<section${idx > 0 ? ' class="pb"' : ''}>
      <div class="top"><div class="brand"><img src="${location.origin}/LOGO.jpg" onerror="this.style.display='none'"><div><b>BG EXPRESS</b><div class="s">${esc(sub)}</div></div></div>
      <div class="meta">Imprimé le ${new Date().toLocaleString('fr-FR')}</div></div>
      <h1>${esc(title)}</h1>
      ${driver ? `<div class="drv">🚚 Livreur : <b>${esc(driver)}</b> &nbsp;·&nbsp; ${list.length} expédition(s) &nbsp;·&nbsp; à encaisser : <b>${fmtAmt(total)} DH</b></div>` : `<div class="s">${list.length} expédition(s) · total ${fmtAmt(total)} DH</div>`}
      <table><colgroup><col style="width:4%"><col style="width:10%"><col style="width:17%"><col style="width:17%"><col style="width:12%"><col style="width:14%"><col style="width:8%"><col style="width:8%"><col style="width:10%"></colgroup>
      <thead><tr><th>#</th><th>N° EXP</th><th>Expéditeur</th><th>Destinataire</th><th>Statut</th><th>Livreur / encaissé par</th><th>Expédition</th><th>Encaissement</th><th class="r">Montant (DH)</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td colspan="8">Total</td><td class="r">${fmtAmt(total)}</td></tr></tfoot></table>
      ${driver ? `<div class="sign"><div>Livreur : ${esc(driver)}</div><div>Chef d'exploitation / chef d'agence</div></div>` : ''}</section>`
  }
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{size:A4 landscape;margin:10mm} body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #1e3a8a;padding-bottom:6px;margin-bottom:8px}
    .brand{display:flex;align-items:center;gap:8px} .brand img{height:34px} .brand b{color:#1e3a8a;font-size:15px} .meta{color:#555;font-size:10px}
    h1{font-size:15px;margin:4px 0} .s{color:#555;font-size:10px} .pb{page-break-before:always}
    .drv{font-size:13px;color:#0c4a6e;background:#e0f2fe;border:1px solid #7dd3fc;border-radius:6px;padding:6px 10px;margin:6px 0 8px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th{background:#1e3a8a;color:#fff;text-align:left;padding:5px 4px;font-size:10px;border:1px solid #1e3a8a}
    td{border:1px solid #d1d5db;padding:4px;vertical-align:top;word-wrap:break-word;overflow-wrap:anywhere}
    tbody tr:nth-child(even) td{background:#f8fafc} tr{page-break-inside:avoid}
    .r{text-align:right;white-space:nowrap} .n{font-family:Consolas,monospace;font-weight:bold;color:#1d4ed8}
    tfoot td{font-weight:bold;border-top:2px solid #111;background:#f1f5f9}
    .sign{display:flex;gap:12px;margin-top:18px;page-break-inside:avoid} .sign div{flex:1;border:1px solid #94a3b8;border-radius:5px;height:20mm;padding:5px;font-size:10px;color:#475569}
  </style></head><body>${groups.map(section).join('')}
  <script>window.onload=()=>{window.print()}</script></body></html>`)
  w.document.close()
}

/**
 * 📅 Bilan de la journée / période — même bloc pour le chef d'exploitation (Collecte du soir) et le chef d'agence
 * (Caisse Agence), piloté par le filtre de date de la page.
 * ① Théorique à encaisser (expéditions de la période) · ② Encaissé à la date (même expéditions anciennes) → à verser.
 * Ports et COD suivent le même circuit : chef d'exploitation → chef d'agence → admin.
 */
export default function BilanPeriode(props: Readonly<{
  periodParcels: any[]
  moneyParcels: any[]
  city: string
  role: BilanRole
  fromKey: string | null
  toKey: string | null
  label: string
  sentKeys?: Set<string>
  agencyHolderIds?: Set<string> | null
  /** ② « Encaissé à la date » affiché AILLEURS (élément d'id donné, ex. haut de la Collecte du soir), toujours visible */
  encaisseTargetId?: string
  /** Contenu ajouté en bas du bilan (toujours visible) */
  footer?: ReactNode
}>) {
  const { periodParcels, moneyParcels, city, role, fromKey, toKey, label, sentKeys, agencyHolderIds, encaisseTargetId, footer } = props
  const [encaisseTarget, setEncaisseTarget] = useState<HTMLElement | null>(null)
  // ② déplacé : replié au démarrage (titre + totaux visibles), cartes au clic
  const [encOpen, setEncOpen] = useState(false)
  useEffect(() => { setEncaisseTarget(encaisseTargetId ? document.getElementById(encaisseTargetId) : null) }, [encaisseTargetId])
  const [open, setOpen] = usePersistedOpen(`bilan:${role}`, false)
  const [detail, setDetail] = useState<{ title: string; items: BilanItem[] } | null>(null)
  // 🚚 Livreur choisi dans la fenêtre de détail ('' = tous)
  const [detailDriver, setDetailDriver] = useState('')
  const [waBusy, setWaBusy] = useState(false)
  // Montant cliquable → liste des expéditions concernées
  const amtBtn = (v: number, items: BilanItem[], title: string, withDh = true) => (
    <button type="button" disabled={!items.length} onClick={() => { setDetailDriver(''); setDetail({ title, items }) }}
      title={items.length ? 'Voir les expéditions' : ''}
      className={`tabular-nums ${items.length ? 'hover:underline decoration-dotted underline-offset-2 cursor-pointer' : 'cursor-default'}`}>
      {fmtAmt(v)}{withDh ? ' DH' : ''}
    </button>
  )
  const b = useMemo(() => computeBilan({ periodParcels, moneyParcels, city, role, fromKey, toKey, sentKeys, agencyHolderIds }),
    [periodParcels, moneyParcels, city, role, fromKey, toKey, sentKeys, agencyHolderIds])
  const dest = role === 'exploitation' ? "au chef d'agence" : "à l'admin"
  const rows: [string, Bilan['theorique']['portsDus']][] = [
    ['💰 Ports dus', b.theorique.portsDus],
    ['📬 Ports payés à ramasser', b.theorique.portsPayes],
    ['💵 COD espèces', b.theorique.cod.especes],
    ['📋 COD chèques', b.theorique.cod.cheque],
    ['📝 COD traites', b.theorique.cod.traite],
  ]
  const sumRows = (list: typeof rows) => list.reduce((s, [, l]) => ({ total: s.total + l.total, encaisse: s.encaisse + l.encaisse, docs: s.docs + l.docs, reste: s.reste + l.reste }), { total: 0, encaisse: 0, docs: 0, reste: 0 })
  // 💵 Espèces (ports dus, ports payés, COD espèces) et 📋 chèques / traites : totaux SÉPARÉS, jamais additionnés
  const tot = sumRows(rows.slice(0, 3))
  const totDocs = sumRows(rows.slice(3))
  const enc: [string, typeof b.encaisse.ports][] = [['💰 Ports encaissés (espèces)', b.encaisse.ports], ['💵 COD encaissés (espèces)', b.encaisse.codEspeces], ['📋 Reçus en chèques / traites (documents)', b.encaisse.codDocs]]
  // 💵 Espèces (ports + COD espèces) et 📋 documents (chèques / traites) ne s'additionnent JAMAIS
  const cashEnc = enc.slice(0, 2)
  const docsEnc = b.encaisse.codDocs
  const aVerserTot = cashEnc.reduce((t, [, x]) => t + x.aVerser, 0)
  const aVerserDocs = docsEnc.aVerser

  // 🖨️ Impression du bilan complet (① théorique + ② encaissé)
  const printBilan = () => {
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les fenêtres pour imprimer.'); return }
    const strip = (t: string) => t.replace(/^\S+\s/, '')
    const tRows = rows.map(([lab, l]) => `<tr><td>${esc(strip(lab))} <span class="m">(${l.n})</span></td><td class="r b">${fmtAmt(l.total)}</td><td class="r g">${fmtAmt(l.encaisse)}</td><td class="r d">${fmtAmt(l.docs)}</td><td class="r o">${fmtAmt(l.reste)}</td></tr>`).join('')
    const eRow = ([lab, x]: [string, typeof b.encaisse.ports]) => `<tr><td>${esc(strip(lab))} <span class="m">(${x.n})</span></td><td class="r b">${fmtAmt(x.montant)}</td><td class="r g">${fmtAmt(x.verse)}</td><td class="r v">${fmtAmt(x.aVerser)}</td>${role === 'agence' ? `<td class="r o">${fmtAmt(x.nonRecu)}</td>` : ''}</tr>`
    const eRows = cashEnc.map(eRow).join('')
    const sum = (k: 'montant' | 'verse' | 'aVerser' | 'nonRecu') => cashEnc.reduce((t, [, x]) => t + x[k], 0)
    const encLabel = fromKey && fromKey === toKey ? `le ${frDay(fromKey)}` : 'sur la période'
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bilan — ${esc(label)}</title><style>
      *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      @page{size:A4 portrait;margin:12mm} body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:0}
      .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #0369a1;padding-bottom:6px;margin-bottom:10px}
      .top b{color:#0369a1;font-size:16px} .s{color:#555;font-size:10px}
      h1{font-size:15px;margin:0 0 4px} h2{font-size:12.5px;color:#0369a1;border-left:4px solid #0369a1;padding-left:7px;margin:14px 0 6px}
      table{width:100%;border-collapse:collapse} th{background:#0369a1;color:#fff;text-align:left;padding:5px;font-size:10px}
      td{border-bottom:1px solid #e2e8f0;padding:5px} .r{text-align:right} .b{font-weight:bold} .m{color:#888;font-size:9px}
      .g{color:#047857} .d{color:#0369a1} .o{color:#b45309} .v{color:#6d28d9;font-weight:bold} tfoot td,.tot td{font-weight:bold;border-top:2px solid #333;background:#f1f5f9} .docs td{background:#eff6ff;border-top:6px solid #fff}
      .kpi{display:flex;gap:8px;margin:8px 0} .k{flex:1;border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px} .k span{display:block;font-size:9px;color:#64748b;font-weight:bold;text-transform:uppercase} .k b{font-size:14px}
      .note{margin-top:8px;color:#555;font-size:9.5px} .sign{display:flex;gap:10px;margin-top:22px} .sign div{flex:1;border:1px solid #94a3b8;border-radius:5px;height:20mm;padding:5px;font-size:9px;color:#475569}
    </style></head><body>
    <div class="top"><div><b>BG EXPRESS</b><div class="s">Agence ${esc(city)} — ${role === 'exploitation' ? "Chef d'exploitation" : "Chef d'agence"}</div></div><div class="s" style="text-align:right">Imprimé le ${new Date().toLocaleString('fr-FR')}</div></div>
    <h1>Bilan — ${esc(label)}</h1>
    <div class="kpi"><div class="k"><span>Espèces à encaisser</span><b>${fmtAmt(tot.total)} DH</b></div><div class="k"><span>Encaissé (espèces)</span><b class="g">${fmtAmt(tot.encaisse)} DH</b></div><div class="k"><span>Chèques / traites reçus</span><b class="d">${fmtAmt(totDocs.docs)} DH</b></div><div class="k"><span>Reste</span><b class="o">${fmtAmt(tot.reste)} DH</b></div><div class="k"><span>À verser ${esc(dest)} — espèces</span><b class="v">${fmtAmt(aVerserTot)} DH</b></div><div class="k"><span>À verser — chèques / traites</span><b class="d">${fmtAmt(aVerserDocs)} DH</b></div></div>
    <h2>① Théorique à encaisser — expéditions de la période</h2>
    <table><thead><tr><th>Nature</th><th class="r">Total (DH)</th><th class="r">Encaissé espèces (DH)</th><th class="r">Documents reçus (DH)</th><th class="r">Reste (DH)</th></tr></thead><tbody>${tRows}</tbody>
    <tfoot><tr><td>Total espèces</td><td class="r">${fmtAmt(tot.total)}</td><td class="r g">${fmtAmt(tot.encaisse)}</td><td class="r d">${fmtAmt(tot.docs)}</td><td class="r o">${fmtAmt(tot.reste)}</td></tr><tr><td>Total chèques / traites</td><td class="r">${fmtAmt(totDocs.total)}</td><td class="r g">${fmtAmt(totDocs.encaisse)}</td><td class="r d">${fmtAmt(totDocs.docs)}</td><td class="r o">${fmtAmt(totDocs.reste)}</td></tr></tfoot></table>
    <h2>② Encaissé (espèces) et documents reçus ${esc(encLabel)} — y compris des expéditions plus anciennes</h2>
    <table><thead><tr><th>Nature</th><th class="r">Montant (DH)</th><th class="r">Déjà versé (DH)</th><th class="r">À verser ${esc(dest)} (DH)</th>${role === 'agence' ? '<th class="r">Pas encore reçu (DH)</th>' : ''}</tr></thead><tbody>${eRows}</tbody>
    <tbody class="tot"><tr><td>Total espèces</td><td class="r">${fmtAmt(sum('montant'))}</td><td class="r g">${fmtAmt(sum('verse'))}</td><td class="r v">${fmtAmt(sum('aVerser'))}</td>${role === 'agence' ? `<td class="r o">${fmtAmt(sum('nonRecu'))}</td>` : ''}</tr></tbody><tbody class="docs">${eRow(enc[2])}</tbody></table><div class="note">📋 Les chèques et traites sont des documents : ils ne s'additionnent pas aux espèces.</div>
    <div class="note">Circuit : chef d'exploitation → chef d'agence → admin (ports et COD). Dates en journées d'opération (08:00 → 06:00 le lendemain).</div>
    <div class="sign"><div>${role === 'exploitation' ? "Chef d'exploitation" : "Chef d'agence"}</div><div>${role === 'exploitation' ? "Chef d'agence" : 'Admin'}</div></div>
    <script>window.onload=()=>{window.print()}</script></body></html>`)
    w.document.close()
  }

  // 🚚 Fenêtre de détail : livreurs présents (nombre, montant) et lignes du livreur choisi
  const drivers: [string, number, number][] = detail
    ? [...detail.items.reduce((m, i) => { const k = driverOf(i); const c = m.get(k) || [0, 0]; m.set(k, [c[0] + 1, c[1] + i.amount]); return m }, new Map<string, [number, number]>()).entries()]
        .map(([d, [n, mm]]) => [d, n, mm] as [string, number, number]).sort((a, b) => a[0].localeCompare(b[0]))
    : []
  const shown = detail ? (detailDriver ? detail.items.filter(i => driverOf(i) === detailDriver) : detail.items) : []

  const encaisseBlock = (<>
        {/* ② Encaissé à la date */}
        <div>
          {encaisseTargetId ? (
            <button type="button" onClick={() => setEncOpen(o => !o)} aria-expanded={encOpen} className="w-full flex items-center justify-between gap-2 text-left mb-1.5">
              <span className="text-sm font-black text-slate-800">② Encaissé (espèces) et documents reçus {fromKey && fromKey === toKey ? `le ${fromKey.split('-').reverse().join('/')}` : 'sur la période'} — y compris des expéditions plus anciennes</span>
              <ChevronDown className={`w-5 h-5 text-sky-700 shrink-0 transition-transform ${encOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : (
          <h3 className="text-sm font-black text-slate-800 mb-1.5">② Encaissé (espèces) et documents reçus {fromKey && fromKey === toKey ? `le ${fromKey.split('-').reverse().join('/')}` : 'sur la période'} — y compris des expéditions plus anciennes</h3>
          )}
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-violet-100 px-2 py-1 font-bold text-violet-900">💵 Total espèces à verser {dest} : {fmtAmt(aVerserTot)} DH</span>
            <span className="rounded-lg bg-sky-100 px-2 py-1 font-bold text-sky-900">📋 Chèques / traites à remettre : {fmtAmt(aVerserDocs)} DH</span>
            <span className="text-slate-500 self-center">(jamais additionnés)</span>
          </div>
          {(!encaisseTargetId || encOpen) && (<>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {enc.map(([lab, x]) => (
              <div key={lab} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-slate-700">{lab}</span>
                  <span className="font-black text-slate-900">{amtBtn(x.montant, x.items.montant, lab)} <span className="text-[11px] font-normal text-slate-400">({x.n})</span></span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center text-[11px]">
                  <div className="rounded-lg bg-emerald-50 px-1 py-1"><div className="text-emerald-700">Déjà versé</div><b className="text-emerald-800">{amtBtn(x.verse, x.items.verse, `${lab} — déjà versé`, false)}</b></div>
                  <div className="rounded-lg bg-violet-100 px-1 py-1"><div className="text-violet-700 font-semibold">À verser {dest}</div><b className="text-violet-900">{amtBtn(x.aVerser, x.items.aVerser, `${lab} — à verser ${dest}`, false)}</b></div>
                  <div className="rounded-lg bg-amber-50 px-1 py-1" title={role === 'agence' ? "Encore chez le chef d'exploitation ou les livreurs : à recevoir avant de verser" : ''}>
                    <div className="text-amber-700">{role === 'agence' ? 'Pas encore reçu' : '—'}</div><b className="text-amber-800">{role === 'agence' ? amtBtn(x.nonRecu, x.items.nonRecu, `${lab} — pas encore reçu`, false) : ''}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {role === 'exploitation'
              ? "Circuit : vous → chef d'agence (versements Ports et COD ci-dessous) → admin. « Déjà versé » = dans un versement en attente ou reçu par le chef d'agence."
              : "Circuit : chef d'exploitation → vous → admin. « À verser » = argent reçu dans votre caisse, pas encore versé à l'admin ; « Pas encore reçu » = encore chez le chef d'exploitation ou les livreurs."}
          </p>
          </>)}
        </div>
  </>)

  return (
    <section className="rounded-2xl border-2 border-sky-200 bg-linear-to-br from-white to-sky-50/60 p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-2">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left">
        <span>
          <span className="block text-lg font-black text-slate-900">📅 Bilan — {label}</span>
          <span className="block text-xs text-slate-600">
            💵 Espèces à encaisser : <b>{fmtAmt(tot.total)} DH</b> · encaissé <b className="text-emerald-700">{fmtAmt(tot.encaisse)} DH</b> · reste <b className="text-amber-700">{fmtAmt(tot.reste)} DH</b>
            {' '}| 📋 Chèques / traites : <b>{fmtAmt(totDocs.total)} DH</b> · reçus <b className="text-sky-700">{fmtAmt(totDocs.docs)} DH</b> · reste <b className="text-amber-700">{fmtAmt(totDocs.reste)} DH</b>
            {' '}— <b className="text-violet-700">à verser {dest} : {fmtAmt(aVerserTot)} DH en espèces</b>{aVerserDocs > 0 && <> + <b className="text-sky-700">{fmtAmt(aVerserDocs)} DH en chèques / traites</b></>}
          </span>
        </span>
        <ChevronDown className={`w-5 h-5 text-sky-700 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <button type="button" onClick={printBilan} title="Imprimer le bilan"
        className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold">
        <Printer className="w-4 h-4" /> Imprimer
      </button>
      </div>

      {open && (<>
        {/* ① Théorique */}
        <div>
          <h3 className="text-sm font-black text-slate-800 mb-1.5">① Théorique à encaisser — expéditions de la période</h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="px-3 py-2 text-left">Nature</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Encaissé (espèces)</th><th className="px-3 py-2 text-right">Documents reçus</th><th className="px-3 py-2 text-right">Reste</th></tr>
              </thead>
              <tbody>
                {rows.map(([lab, l]) => (
                  <tr key={lab} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-semibold text-slate-700">{lab} <span className="text-[11px] font-normal text-slate-400">({l.n})</span></td>
                    <td className="px-3 py-1.5 text-right font-bold text-slate-900">{amtBtn(l.total, l.items.total, `${lab} — total`)}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-700">{amtBtn(l.encaisse, l.items.encaisse, `${lab} — encaissé (espèces)`)}</td>
                    <td className="px-3 py-1.5 text-right text-sky-700">{amtBtn(l.docs, l.items.docs, `${lab} — documents reçus (chèques / traites)`)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-amber-700">{amtBtn(l.reste, l.items.reste, `${lab} — reste à encaisser`)}</td>
                  </tr>
                ))}
                {([['💵 Total espèces (ports + COD espèces)', tot, 'bg-emerald-50'], ['📋 Total chèques / traites', totDocs, 'bg-sky-50']] as const).map(([lab, t, bg]) => (
                  <tr key={lab} className={`border-t-2 border-slate-200 font-black ${bg}`}>
                    <td className="px-3 py-1.5">{lab}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtAmt(t.total)} DH</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{fmtAmt(t.encaisse)} DH</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-sky-700">{fmtAmt(t.docs)} DH</td>
                    {/* 🚨 Total espèces : le RESTE À ENCAISSER en rouge clignotant (demande du 24/10/2026) */}
                    <td className={`px-3 py-1.5 text-right tabular-nums ${lab.startsWith('💵') && t.reste > 0 ? 'text-red-600' : 'text-amber-700'}`}>
                      {lab.startsWith('💵') && t.reste > 0
                        ? <span className="blink-alert inline-block" title="Espèces restant à encaisser">⚠️ {fmtAmt(t.reste)} DH</span>
                        : <>{fmtAmt(t.reste)} DH</>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!encaisseTargetId && encaisseBlock}
      </>)}

      {footer}
      {/* ② déplacé (ex. en haut de la Collecte du soir) : toujours visible, mêmes montants cliquables */}
      {encaisseTargetId && encaisseTarget && createPortal(
        <section className="rounded-2xl border-2 border-sky-200 bg-linear-to-br from-white to-sky-50/60 p-4 sm:p-5">{encaisseBlock}</section>,
        encaisseTarget)}

      {/* 🔎 Expéditions derrière un montant (cliquer un montant) */}
      {detail && (
        <div className="fixed inset-0 z-[9000] bg-black/40 flex items-center justify-center p-3" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
              <div>
                <div className="font-black text-slate-900">{detail.title}</div>
                <div className="text-xs text-slate-500">{label} · {shown.length} expédition(s) · {fmtAmt(shown.reduce((t, i) => t + i.amount, 0))} DH{detailDriver ? ` · 🚚 ${detailDriver}` : ''}</div>
              </div>
              <div className="flex gap-2">
                <select value={detailDriver} onChange={e => setDetailDriver(e.target.value)} title="Choisir le livreur avant d'imprimer"
                  className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold bg-white">
                  <option value="">🚚 Tous les livreurs ({detail.items.length})</option>
                  {drivers.map(([d, n, m]) => <option key={d} value={d}>{d} — {n} exp. · {fmtAmt(m)} DH</option>)}
                </select>
                <button type="button" onClick={() => printItems(detailDriver ? `${detail.title} — ${detailDriver}` : detail.title, label, shown, !!detailDriver)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"><Printer className="w-4 h-4" /> Imprimer</button>
                <button type="button" onClick={() => { setWaBusy(true); shareWhatsAppPdf(detailDriver ? `${detail.title} — ${detailDriver}` : detail.title, label, shown, detailDriver || undefined).catch(e => alert('Envoi impossible : ' + (e?.message || e))).finally(() => setWaBusy(false)) }}
                  disabled={waBusy}
                  title="Envoyer la liste en PDF par WhatsApp (choisissez WhatsApp puis le contact)"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-bold">{waBusy ? '…' : '💬 WhatsApp (PDF)'}</button>

                <button type="button" onClick={() => setDetail(null)} title="Fermer" aria-label="Fermer"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border-2 border-slate-400 bg-white text-slate-800 hover:bg-red-50 hover:border-red-400 hover:text-red-700 text-sm font-bold"><X className="w-5 h-5" /> Fermer</button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0 text-slate-500"><tr>
                  <th className="px-3 py-2 text-left">N° EXP</th><th className="px-3 py-2 text-left">Expéditeur</th><th className="px-3 py-2 text-left">Destinataire</th>
                  <th className="px-3 py-2 text-left">Statut</th><th className="px-3 py-2 text-left">Livreur / encaissé par</th><th className="px-3 py-2 text-left">Expédition</th><th className="px-3 py-2 text-left">Encaissement</th><th className="px-3 py-2 text-right">Montant</th>
                </tr></thead>
                <tbody>
                  {[...shown].sort((a, b) => (a.expDay || '').localeCompare(b.expDay || '') || a.nic.localeCompare(b.nic)).map((i, k) => (
                    <tr key={i.id + ':' + k} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 font-mono font-bold text-blue-700">{i.nic}</td>
                      <td className="px-3 py-1.5">{i.sender}</td><td className="px-3 py-1.5">{i.receiver}</td>
                      <td className="px-3 py-1.5">{i.status}</td><td className="px-3 py-1.5">{i.driver}</td>
                      <td className="px-3 py-1.5 tabular-nums">{frDay(i.expDay)}</td><td className="px-3 py-1.5 tabular-nums">{frDay(i.moneyDay)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtAmt(i.amount)} DH</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
