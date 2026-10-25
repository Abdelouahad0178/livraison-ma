import React from 'react'
import { ALL_SERVICE_TYPES } from '../firebase/constants'
import { isMixedCod, codPartsDetailLabel } from './codParts'

/**
 * 🖨️ Bon de ramassage d'une expédition (2 exemplaires sur une feuille A4, code-barres + QR de suivi) — le MÊME
 * imprimé pour le chef d'agence / agent pro (onglet Expéditions) et l'admin (tableau des expéditions, colonne Suivi).
 * parcel = document COMPLET.
 */
export async function printAgentTicket(parcel: any): Promise<void> {
  const [{ default: JsBarcode }, { default: QRCodeForPrint }, { createRoot }, { flushSync }] = await Promise.all([
    import('jsbarcode'),
    import('../components/QRCodeSvg'),
    import('react-dom/client'),
    import('react-dom'),
  ])
  const logoUrl   = window.location.origin + '/LOGO.jpg'
  const parcelCreatedAt = parcel.createdAt?.toDate ? parcel.createdAt.toDate() : (parcel.createdAt ? new Date(parcel.createdAt) : new Date())
  const printDate = parcelCreatedAt.toLocaleDateString('fr-MA')

  const barcodeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(barcodeSvgEl, parcel.trackingId, { width: 1.3, height: 48, fontSize: 10, margin: 0, displayValue: true })
  const barcodeSvgStr = barcodeSvgEl.outerHTML

  const qrContainer = document.createElement('div')
  const qrRoot = createRoot(qrContainer)
  flushSync(() => {
    qrRoot.render(
      React.createElement(QRCodeForPrint, {
        value: `https://arelanc.web.app/track?id=${parcel.trackingId}`,
        size: 64,
        level: 'M',
        includeMargin: false,
      })
    )
  })
  const qrSvgStr = qrContainer.innerHTML
  qrRoot.unmount()

  const PORT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    port_du: { label: 'Port dû', color: '#ea580c' },
    port_paye: { label: 'Port payé', color: '#16a34a' },
    port_en_compte_destinataire: { label: 'Port en compte (Dest.)', color: '#7c3aed' },
    port_en_compte_expediteur: { label: 'Port en compte (Exp.)', color: '#4f46e5' },
    port_en_compte: { label: 'Port en compte', color: '#7c3aed' },
  }
  const portInfo = PORT_TYPE_LABELS[parcel.portType] || PORT_TYPE_LABELS.port_paye

  const checks = ALL_SERVICE_TYPES.map((st: any) => {
    // Cas spécial: Retour BL se base sur hasRetourBL au lieu de serviceType
    const isChecked = st.key === 'retour_bl'
      ? (parcel.hasRetourBL === true)
      : (parcel.serviceType === st.key || (st.key === 'especes' && isMixedCod(parcel)))
    return `
    <label style="display:flex;align-items:center;gap:4px;font-size:9pt;font-weight:600">
      <span style="width:12px;height:12px;border:1px solid #9ca3af;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:8px;${isChecked ? 'background:#2563eb;border-color:#2563eb;color:white' : ''}">${isChecked ? '✓' : ''}</span>
      ${st.label}
    </label>`
  }).join('')

  const renderCopy = () => `
<div style="border:1px solid #d1d5db;max-width:148mm;margin:0 auto">
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d1d5db;padding:8px 10px">
    <img src="${logoUrl}" style="height:36px;object-fit:contain" onerror="this.style.display='none'">
    <div style="text-align:center;flex:1">
      ${parcel.sender?.nic ? `<div style="font-weight:bold;color:#000;font-size:16pt;font-family:monospace;letter-spacing:1px">N EXP : ${parcel.sender.nic}</div>` : ''}
      <div style="font-weight:normal;color:#6b7280;font-size:7pt;letter-spacing:0.5px;font-family:monospace;margin-top:2px">${parcel.trackingId}</div>
    </div>
    <div style="text-align:right;font-size:10pt;color:#000;font-weight:600">${printDate}</div>
  </div>
  <table style="border-bottom:1px solid #d1d5db">
    <tr>
      <td style="width:50%;border-right:1px solid #d1d5db">
        <div style="font-weight:bold;font-size:8pt;text-transform:uppercase;color:#1d4ed8;margin-bottom:4px">Expéditeur</div>
        <div><span style="color:#6b7280">Nom : </span><strong>${parcel.sender?.name || '—'}</strong></div>
        ${parcel.sender?.address ? `<div><span style="color:#6b7280">Adresse : </span>${parcel.sender.address}</div>` : ''}
        <div><span style="color:#6b7280">Ville : </span><strong>${parcel.sender?.city || '—'}</strong></div>
        <div><span style="color:#6b7280">Tél : </span>${parcel.sender?.tel || '—'}</div>
      </td>
      <td style="width:50%">
        <div style="font-weight:bold;font-size:8pt;text-transform:uppercase;color:#1d4ed8;margin-bottom:4px">Destinataire</div>
        <div><span style="color:#6b7280">Nom : </span><strong>${parcel.receiver?.name || '—'}</strong></div>
        ${parcel.receiver?.address ? `<div><span style="color:#6b7280">Adresse : </span>${parcel.receiver.address}</div>` : ''}
        <div><span style="color:#6b7280">Ville : </span><strong style="color:#1d4ed8">${parcel.receiver?.city || '—'}</strong></div>
        <div><span style="color:#6b7280">Tél : </span>${parcel.receiver?.tel || '—'}</div>
      </td>
    </tr>
  </table>
  <table style="border-bottom:1px solid #d1d5db;background:#eff6ff">
    <tr>
      <td style="width:50%;border-right:1px solid #d1d5db">
        <div style="font-size:8pt;color:#6b7280;text-transform:uppercase">Nature de marchandise</div>
        <div style="font-weight:bold;font-size:13pt;color:#1e40af">${parcel.natureOfGoods || '—'}</div>
      </td>
      <td style="width:50%">
        <div style="font-size:8pt;color:#6b7280;text-transform:uppercase">Nombre de colis</div>
        <div style="font-weight:bold;font-size:13pt;color:#1e40af">${parcel.nbColis || 1}</div>
      </td>
    </tr>
  </table>
  <div style="display:flex;gap:16px;padding:5px 10px;border-bottom:1px solid #e5e7eb;background:#f9fafb">${checks}</div>
  <table style="border-bottom:1px solid #d1d5db;text-align:center">
    <tr>
      <td style="width:33%;border-right:1px solid #e5e7eb">
        <div style="font-size:8pt;color:#9ca3af;text-transform:uppercase">Poids</div>
        <div style="font-weight:bold;font-size:12pt">${parcel.weight ? parcel.weight + ' kg' : '—'}</div>
      </td>
      <td style="width:33%;border-right:1px solid #e5e7eb">
        <div style="font-size:8pt;color:#9ca3af;text-transform:uppercase">Prix</div>
        <div style="font-weight:bold;font-size:12pt;color:#1d4ed8">${parcel.price > 0 ? parcel.price + ' DH' : '—'}</div>
        <div style="font-weight:bold;font-size:8pt;text-transform:uppercase;color:${portInfo.color};margin-top:2px">${portInfo.label}</div>
      </td>
      <td style="width:33%">
        <div style="font-size:8pt;color:#9ca3af;text-transform:uppercase">RETOUR FOND</div>
        <div style="font-weight:bold;font-size:12pt;color:${parcel.codAmount > 0 ? '#ea580c' : '#d1d5db'}">${parcel.codAmount > 0 ? parcel.codAmount + ' DH' : '—'}</div>
        ${isMixedCod(parcel) ? `<div style="font-size:8pt;font-weight:bold;color:#c2410c">${codPartsDetailLabel(parcel)}</div>` : ''}
      </td>
    </tr>
  </table>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #e5e7eb">
    ${barcodeSvgStr}
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;margin-left:8px">
      ${qrSvgStr}
      <div style="font-size:7pt;color:#9ca3af">Suivi en ligne</div>
    </div>
  </div>
  <table style="border-top:1px solid #d1d5db;font-size:8pt;color:#9ca3af">
    <tr>
      <td style="width:50%;border-right:1px solid #e5e7eb">Cachet et Signature expéditeur</td>
      <td style="width:50%">Cachet et Signature destinataire</td>
    </tr>
  </table>
</div>`

  const ticketHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Bon-Ramassage-${parcel.trackingId}</title>
<style>
  @page { size: A4 portrait; margin: 6mm; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  body { font-family:Arial,sans-serif; font-size:10pt; margin:0; padding:0; }
  table { border-collapse:collapse; width:100%; }
  td { vertical-align:top; padding:6px 10px; }
  .cut-line { max-width:148mm; margin:0 auto; text-align:center; color:#9ca3af; font-size:8pt; border-top:1px dashed #9ca3af; padding-top:2px; }
</style>
</head>
<body>
${renderCopy()}
<div class="cut-line">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</div>
${renderCopy()}
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`

  // Créer un Blob URL pour que le document soit partageable via WhatsApp
  const blob = new Blob([ticketHtml], { type: 'text/html' })
  const blobUrl = URL.createObjectURL(blob)
  const win = window.open(blobUrl, '_blank', 'width=700,height=900')

  // Nettoyer l'URL après 30 secondes
  if (win) {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
  }
}
