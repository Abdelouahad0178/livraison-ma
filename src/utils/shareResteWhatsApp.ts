/**
 * 💬 Admin › Port par agence / COD par agence › « Reste à encaisser » : envoi par WhatsApp de la liste cochée (même
 * contenu que l'impression printResteAEncaisser). Le PDF est déposé en ligne et son LIEN part dans le message : rien à
 * joindre à la main (application WhatsApp de Windows, WhatsApp Web, ou téléphone via QR code — WhatsAppSendDialog).
 */
import type { ResteLine } from './agencyFollowUp'

/** Texte sans émojis ni caractères hors Latin-1 (polices standard du PDF). */
const pdfText = (v: any) => String(v ?? '').replace(/[—–]/g, '-').replace(/→/g, '->').replace(/[^\x20-\xFF]/g, '').replace(/\s+/g, ' ').trim()
const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')
const fmtD = (v: any) => { const d = v?.toDate ? v.toDate() : v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : '' }
const FOCUS_TITLE = { reste: 'Reste à encaisser', attendu: 'Attendu (vue théorique)', encaisse: 'Encaissé (situation caisse)' }

async function buildRestePdf(o: ShareResteOpts): Promise<Blob> {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable') as Promise<any>])
  const autoTable: (d: any, opt: any) => void = typeof at.default === 'function' ? at.default
    : (() => { (at.applyPlugin || at.default?.applyPlugin)?.(jsPDF); return (d: any, opt: any) => d.autoTable(opt) })()
  const { city, periodText, lines, kindLabels, subject, focus, driver } = o
  const title = `${FOCUS_TITLE[focus]} - ${subject} - ${city}`
  const total = lines.reduce((s, l) => s + l[focus], 0)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(180, 83, 9)
  doc.text('BG EXPRESS', 10, 13)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  doc.text(pdfText(`Période : ${periodText}`), 10, 18)
  doc.text(`Imprimé le ${new Date().toLocaleString('fr-FR')}`, 287, 13, { align: 'right' })
  doc.setDrawColor(180, 83, 9); doc.setLineWidth(0.6); doc.line(10, 21, 287, 21)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17)
  doc.text(pdfText(title), 10, 28)
  let y = 32
  if (driver) {
    doc.setFillColor(255, 251, 235); doc.setDrawColor(251, 191, 36); doc.roundedRect(10, y, 277, 9, 1.5, 1.5, 'FD')
    doc.setFontSize(11); doc.setTextColor(146, 64, 14)
    doc.text(pdfText(`Livreur : ${driver}   -   ${lines.length} expédition(s)   -   ${FOCUS_TITLE[focus].toLowerCase()} : ${money(total)} DH`), 13, y + 6)
    y += 12
  }
  autoTable(doc, {
    startY: y,
    head: [['#', 'N° EXP', 'Date', 'Expéditeur', 'Destinataire', subject === 'Ports' ? 'Port' : 'Valeur', 'Statut / livreur', 'Attendu', 'Encaissé', 'Reste']],
    body: lines.map((l, k) => {
      const p = l.p
      const who = `${p.deliveryDriverName ? `livreur : ${p.deliveryDriverName}` : 'sans livreur (retrait agence)'}${(p.portCollectedBy || p.codCollectedBy) ? ` - encaissé par ${p.portCollectedBy || p.codCollectedBy}` : ''}`
      return [k + 1, pdfText(p.senderNic || p.sender?.nic || p.trackingId || ''), fmtD(p.createdAt),
        pdfText(`${p.sender?.name || ''} (${p.originCity || ''})`), pdfText(`${p.receiver?.name || ''} (${p.destinationCity || ''})`),
        pdfText(kindLabels[l.kind] || l.kind), pdfText(`${p.status || ''} - ${who}`), money(l.attendu), money(l.encaisse), money(l.reste)]
    }),
    foot: [[{ content: `TOTAL - ${lines.length} expédition(s)`, colSpan: 9 }, money(total)]],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.5, lineColor: [209, 213, 219], lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [255, 251, 235], textColor: 17, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 20, fontStyle: 'bold', textColor: [29, 78, 216] }, 2: { cellWidth: 18 },
      7: { halign: 'right', cellWidth: 20 }, 8: { halign: 'right', cellWidth: 20 }, 9: { halign: 'right', cellWidth: 22, fontStyle: 'bold' } },
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

export interface ShareResteOpts {
  city: string; periodText: string; lines: ResteLine[]
  kindLabels: Record<string, string>; subject: string; focus: 'reste' | 'attendu' | 'encaisse'
  /** Livreur filtré (bandeau + cases de signature dans le PDF) */
  driver?: string
}

const dhTxt = (n: number) => `${money(n)} DH`

/**
 * 📤 PDF déposé dans Firebase Storage (shared-reports/<uid>/…) → lien de téléchargement à mettre DANS le message WhatsApp :
 * plus de fichier à joindre à la main (Windows, WhatsApp Web, téléphone via QR). Retourne le lien et le message.
 */
export async function prepareResteWhatsApp(o: ShareResteOpts): Promise<{ url: string; message: string; name: string }> {
  const blob = await buildRestePdf(o)
  const label = `${FOCUS_TITLE[o.focus]} ${o.subject} ${o.city}${o.driver ? ` ${o.driver}` : ''}`
  const name = `BG-Express-${pdfText(label).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 70)}.pdf`
  const [{ ref, uploadBytes, getDownloadURL }, { storage }, { auth }] = await Promise.all([
    import('firebase/storage'), import('../firebase/storage'), import('../firebase/config'),
  ])
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Session expirée : reconnectez-vous.')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const r = ref(storage, `shared-reports/${uid}/${stamp}-${name}`)
  await uploadBytes(r, blob, { contentType: 'application/pdf' })
  const url = await getDownloadURL(r)
  const total = o.lines.reduce((s, l) => s + l[o.focus], 0)
  const message = [
    `BG EXPRESS — ${FOCUS_TITLE[o.focus]} (${o.subject}) — ${o.city}`,
    o.driver ? `Livreur : ${o.driver}` : '',
    `${o.lines.length} expédition(s) — ${dhTxt(total)}`,
    `Période : ${o.periodText}`,
    `Liste détaillée (PDF) : ${url}`,
  ].filter(Boolean).join('\n')
  return { url, message, name }
}

/** Numéro marocain → format WhatsApp international (06… / 07… → 2126… / 2127…). '' si vide ou invalide. */
export function waNumber(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 10 && d.startsWith('0')) d = `212${d.slice(1)}`
  if (d.length === 9 && /^[5-7]/.test(d)) d = `212${d}`
  return d.length >= 11 ? d : ''
}

