import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/db'

export function printCharge(groups: any[], profileData: any): void {
  const printDate = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
  const logoUrl   = window.location.origin + '/LOGO.jpg'

  const groupHTML = (g: any) => {
    const rows = g.parcels.map((p: any, i: any) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#eff6ff'}">
        <td style="text-align:center;font-weight:bold;color:#555">${i + 1}</td>
        <td style="font-family:monospace;font-weight:bold;color:#1d4ed8;white-space:nowrap">${p.trackingId || ''}</td>
        <td style="text-align:center;font-weight:bold;letter-spacing:0.5px">${p.sender?.nic || '—'}</td>
        <td><strong>${p.sender?.name || '—'}</strong><br><span style="color:#6b7280;font-size:7pt">${p.sender?.city || ''}</span></td>
        <td><strong>${p.receiver?.name || '—'}</strong><br><span style="color:#6b7280;font-size:7pt">${p.receiver?.city || ''} · ${p.receiver?.tel || ''}</span></td>
        <td style="text-align:center">${p.nbColis || 1}</td>
        <td style="text-align:center;white-space:nowrap">${p.weight ? p.weight + ' kg' : '—'}</td>
        <td>${p.natureOfGoods || '—'}</td>
        <td style="color:#1d4ed8">En transit</td>
      </tr>`).join('')

    return `
      <div style="page-break-after:always">
        <table style="width:100%;border-collapse:collapse;margin-bottom:6px;border:2px solid #1e40af">
          <tr>
            <td style="padding:8px 14px;width:33%;vertical-align:middle">
              <img src="${logoUrl}" style="height:36px;object-fit:contain;display:block;margin-bottom:4px" onerror="this.style.display='none'">
              <div style="font-size:9pt;font-weight:bold;color:#1e40af;letter-spacing:0.5px">BG EXPRESS</div>
              <div style="font-size:7.5pt;color:#374151">N°19, Rue 5, Hay Tissir2 – Casablanca</div>
              <div style="font-size:7.5pt;color:#374151">☎ 0522 62 92 89 &nbsp;|&nbsp; 📱 0661 97 86 12</div>
              <div style="font-size:7.5pt;color:#374151">✉ bgexpress2019@gmail.com</div>
            </td>
            <td style="padding:8px 14px;text-align:center;vertical-align:middle;border-left:2px solid #1e40af;border-right:2px solid #1e40af;width:34%">
              <div style="font-size:15pt;font-weight:bold;color:#1e40af;letter-spacing:1px">FEUILLE DE CHARGE</div>
              <div style="font-size:8.5pt;color:#374151;margin-top:2px">Agence de <strong>${profileData?.city || '—'}</strong></div>
            </td>
            <td style="padding:8px 14px;text-align:right;vertical-align:middle;width:33%;font-size:8.5pt">
              <div><strong>Date :</strong> ${printDate}</div>
              <div><strong>Agent :</strong> ${profileData?.name || '—'}</div>
              <div style="color:#1e40af;font-weight:bold;font-size:10pt;margin-top:3px">Chauffeur : ${g.name}</div>
              ${g.matricule ? `<div style="font-size:8pt;color:#374151;margin-top:2px">🚛 Matricule : <strong>${g.matricule}</strong></div>` : ''}
            </td>
          </tr>
        </table>

        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr>
              <th style="width:24px;text-align:center">N°</th>
              <th>N° Tracking</th>
              <th style="text-align:center">Code Ramasseur</th>
              <th>Expéditeur</th>
              <th>Destinataire</th>
              <th style="width:28px;text-align:center">Nb</th>
              <th style="text-align:center">Poids</th>
              <th>Nature</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background:#dbeafe">
              <td colspan="8" style="text-align:right;font-weight:bold;color:#1e40af">TOTAL — ${g.parcels.length} colis</td>
              <td colspan="1"></td>
            </tr>
          </tbody>
        </table>

        <div style="display:flex;justify-content:flex-start;margin-top:24px;font-size:8.5pt">
          <div style="text-align:center;width:200px">
            <div style="margin-top:32px;border-top:1px solid #999;padding-top:4px">Signature Agent</div>
          </div>
        </div>
      </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Feuille-Charge-${printDate.replace(/ /g,'-')}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #111; margin: 0; padding: 0; }
    table { border-collapse: collapse; width: 100%; }
    th { border: 1px solid #1e3a8a; padding: 5px 6px; background-color: #1e40af; color: #fff; font-weight: bold; font-size: 8pt; white-space: nowrap; }
    td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: middle; font-size: 8pt; }
    tr:nth-child(even) td { background-color: #eff6ff; }
  </style>
</head>
<body>
  ${groups.map((g: any) => groupHTML(g)).join('')}
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1200,height=800')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

export async function printTable(parcels: any[], driverName?: string): Promise<void> {
  if (!parcels.length) return

  // Charger les signatures depuis Firestore
  const sigMap = {}
  await Promise.all(
    parcels
      .filter((p: any) => p.signatureConfirmedAt)
      .map(async (p: any) => {
        try {
          const snap = await getDoc(doc(db, 'deliverySignatures', p.id))
          if (snap.exists()) (sigMap as any)[p.id] = snap.data().signatureDataUrl
        } catch {}
      })
  )

  const STATUS_CSS = {
    'Initialisé':            { bg: '#f3f4f6', col: '#374151' },
    'En transit':            { bg: '#dbeafe', col: '#1d4ed8' },
    'Arrivé en agence':      { bg: '#ede9fe', col: '#6d28d9' },
    'En cours de livraison': { bg: '#ffedd5', col: '#c2410c' },
    'Livré':                 { bg: '#dcfce7', col: '#15803d' },
    'Retourné':              { bg: '#fee2e2', col: '#b91c1c' },
  }

  const PORT_TYPE_LABEL = {
    port_paye:     'Port Payé',
    port_du:       'Port Dû',
    port_en_compte:'En Compte',
  }
  const SERVICE_LABEL = {
    especes:  'C/Espèces',
    cheque:   'C/Chèque',
    traite:   'C/Traite',
    retour_bl:'Retour BL',
    simple:   'Simple',
  }

  const totalCod  = parcels.reduce((s: any, p: any) => s + (p.codAmount  || 0), 0)
  const totalPort = parcels.reduce((s: any, p: any) => s + (p.price      || 0), 0)
  const printDate = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const rows = parcels.map((p: any, i: any) => {
    const st  = (STATUS_CSS as any)[p.status] || { bg: '#f3f4f6', col: '#374151' }
    const portLabel = (PORT_TYPE_LABEL as any)[p.portType] || (p.portType || '—')
    const svcLabel  = (SERVICE_LABEL as any)[p.serviceType] || (p.serviceType || '—')
    const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : (p.createdAt ? new Date(p.createdAt) : null)
    const dateStr   = createdAt ? createdAt.toLocaleDateString('fr-MA') : '—'
    const rowBg     = i % 2 === 0 ? '#ffffff' : '#f0f7ff'
    const sigUrl    = (sigMap as any)[p.id]
    return `
      <tr style="background:${rowBg}">
        <td style="text-align:center">${i + 1}</td>
        <td style="font-family:monospace;font-weight:bold;color:#1d4ed8">${p.trackingId || '—'}</td>
        <td style="text-align:center">${dateStr}</td>
        <td style="font-family:monospace;color:#7c3aed">${p.sender?.nic || '—'}</td>
        <td><div style="font-weight:bold">${p.sender?.name || '—'}</div><div style="color:#6b7280;font-size:7.5pt">${p.sender?.tel || ''} ${p.sender?.city ? '· ' + p.sender.city : ''}</div></td>
        <td><div style="font-weight:bold">${p.receiver?.name || '—'}</div><div style="color:#6b7280;font-size:7.5pt">${p.receiver?.tel || ''} ${p.receiver?.city ? '· ' + p.receiver.city : ''}</div></td>
        <td style="text-align:center">${p.nbColis || 1}</td>
        <td style="text-align:center">${p.weight ? p.weight + ' kg' : '—'}</td>
        <td style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.natureOfGoods || '—'}</td>
        <td style="text-align:right;font-weight:bold;color:#ea580c">${p.codAmount > 0 ? p.codAmount + ' DH' : '—'}</td>
        <td style="text-align:right;font-weight:bold">${p.price ? p.price + ' DH' : '—'}</td>
        <td style="text-align:center">${portLabel}</td>
        <td style="text-align:center">${svcLabel}</td>
        <td style="text-align:center"><span style="background:${st.bg};color:${st.col};padding:2px 6px;border-radius:10px;font-size:7.5pt;font-weight:bold;white-space:nowrap">${p.status || '—'}</span></td>
        <td>${p.chauffeurName || '—'}</td>
        <td style="text-align:center;width:95px;min-height:36px;vertical-align:middle">${sigUrl ? `<img src="${sigUrl}" style="max-width:88px;max-height:32px;object-fit:contain;display:block;margin:auto;" />` : ''}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Tableau des expéditions</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, sans-serif; font-size: 8pt; color: #111; margin: 0; padding: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; border-bottom: 2px solid #1e40af; padding-bottom: 6px; }
    .logo-text { font-size: 18pt; font-weight: 900; color: #1e40af; letter-spacing: 2px; }
    .logo-sub  { font-size: 8pt; color: #6b7280; }
    .meta      { text-align: right; font-size: 8pt; color: #374151; min-width: 280px; padding-right: 8px; }
    .meta div  { margin-bottom: 2px; white-space: nowrap; }
    .meta strong { color: #1e40af; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; margin-top: 4px; }
    th { border: 1px solid #1e40af; padding: 4px 5px; background: #1e40af; color: #fff; font-size: 7.5pt; white-space: nowrap; text-align: center; }
    td { border: 1px solid #d1d5db; padding: 3px 5px; font-size: 7.5pt; vertical-align: middle; }
    .totals td { border-top: 2px solid #1e40af; font-weight: bold; background: #eff6ff; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-text">BG EXPRESS</div>
      <div class="logo-sub">Tableau des expéditions</div>
    </div>
    <div class="meta">
      <div>Date : <strong>${printDate}</strong></div>
      ${driverName ? `<div>Livreur : <strong>${driverName}</strong></div>` : ''}
      <div>Nombre de colis : <strong>${parcels.length}</strong></div>
      <div>Total RETOUR FOND : <strong>${totalCod.toLocaleString('fr-MA')} DH</strong></div>
      <div>Total Port : <strong>${totalPort.toLocaleString('fr-MA')} DH</strong></div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>N°</th>
        <th>Tracking</th>
        <th>Date</th>
        <th>N EXP</th>
        <th>Expéditeur</th>
        <th>Destinataire</th>
        <th>Nb</th>
        <th>Poids</th>
        <th>Nature</th>
        <th>RETOUR FOND (DH)</th>
        <th>Port (DH)</th>
        <th>Type port</th>
        <th>Encaiss.</th>
        <th>Statut</th>
        <th>Chauffeur</th>
        <th>Signature</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="totals">
        <td colspan="9" style="text-align:right">TOTAUX</td>
        <td style="text-align:right">${totalCod.toLocaleString('fr-MA')} DH</td>
        <td style="text-align:right">${totalPort.toLocaleString('fr-MA')} DH</td>
        <td colspan="5"></td>
      </tr>
    </tbody>
  </table>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1400,height=900')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

export async function printBonRamassage(nexpCodes: any[], batchRef: string, sectorCode: string, chauffeurName: string): Promise<void> {
  const { default: JsBarcode } = await import('jsbarcode')
  const printDate = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const slipHTML = (nexp: any, idx: any) => {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try { JsBarcode(svgEl, nexp, { format: 'CODE128', displayValue: false, margin: 2, width: 1.2, height: 28 }) } catch {}
    const barcodeSVG = svgEl.outerHTML
    return `
    <div class="slip">
      <div class="slip-header">
        <div style="font-size:13pt;font-weight:900;color:#1e40af;letter-spacing:1px">BG EXPRESS</div>
        <div style="font-size:7.5pt;color:#6b7280;font-weight:600">BON DE RAMASSAGE N° ${idx + 1}</div>
      </div>
      <div class="nexp-block">
        ${barcodeSVG}
        <div style="font-family:monospace;font-weight:bold;font-size:8pt;color:#1e40af;margin-top:2px">${nexp}</div>
      </div>
      <div class="info-row">
        <span>Secteur : <strong>${sectorCode}</strong></span>
        <span>Ramasseur : <strong>${chauffeurName}</strong></span>
        <span>Date : ${printDate}</span>
      </div>
      <div class="section-label">EXPÉDITEUR</div>
      <div class="fields">
        <div class="field-row"><span class="field-label">Nom</span><span class="field-line"></span></div>
        <div class="field-row"><span class="field-label">Tél</span><span class="field-line"></span></div>
        <div class="field-row"><span class="field-label">Adresse</span><span class="field-line"></span></div>
        <div class="field-row"><span class="field-label">Ville</span><span class="field-line"></span></div>
      </div>
      <div class="section-label">COLIS</div>
      <div class="fields">
        <div class="field-row-3">
          <div class="field-item"><span class="field-label">Nb colis</span><span class="field-line"></span></div>
          <div class="field-item"><span class="field-label">Poids (kg)</span><span class="field-line"></span></div>
          <div class="field-item"><span class="field-label">RETOUR FOND (DH)</span><span class="field-line"></span></div>
        </div>
        <div class="field-row"><span class="field-label">Nature</span><span class="field-line"></span></div>
      </div>
      <div class="section-label">DESTINATAIRE</div>
      <div class="fields">
        <div class="field-row"><span class="field-label">Nom</span><span class="field-line"></span></div>
        <div class="field-row"><span class="field-label">Tél</span><span class="field-line"></span></div>
        <div class="field-row"><span class="field-label">Ville</span><span class="field-line"></span></div>
      </div>
    </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Bons de Ramassage – ${batchRef}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 8pt; color: #111; margin: 0; padding: 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
    .slip { border: 1.5px solid #1e40af; border-radius: 6px; padding: 5px 6px; break-inside: avoid; }
    .slip-header { text-align: center; border-bottom: 1px solid #dbeafe; padding-bottom: 3px; margin-bottom: 3px; }
    .nexp-block { text-align: center; margin: 3px 0; }
    .nexp-block svg { max-width: 100%; }
    .info-row { display: flex; gap: 6px; justify-content: space-between; font-size: 7pt; color: #374151; background: #eff6ff; border-radius: 4px; padding: 2px 4px; margin: 3px 0; flex-wrap: wrap; }
    .section-label { font-size: 7pt; font-weight: 800; color: #1e40af; text-transform: uppercase; background: #dbeafe; border-radius: 3px; padding: 1px 4px; margin: 3px 0 2px; }
    .fields { padding: 0 2px; }
    .field-row { display: flex; align-items: flex-end; gap: 3px; margin: 2px 0; }
    .field-label { font-size: 7pt; color: #6b7280; white-space: nowrap; min-width: 38px; }
    .field-line { flex: 1; border-bottom: 0.8px solid #9ca3af; height: 12px; }
    .field-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin: 2px 0; }
    .field-item { display: flex; flex-direction: column; gap: 1px; }
    .field-item .field-label { font-size: 6.5pt; }
    .field-item .field-line { border-bottom: 0.8px solid #9ca3af; height: 12px; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="grid">
    ${nexpCodes.map((nexp: any, i: any) => slipHTML(nexp, i)).join('')}
  </div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=1100')
  if (win) { win.document.write(html); win.document.close() }
}
