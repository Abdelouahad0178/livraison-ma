type DynamicData = Record<string, any>

type DeliveryGroup = DynamicData & {
  parcels: DynamicData[]
}

const esc = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const fmtMoney = (value: string | number) => Number(value) > 0 ? `${Number(value).toLocaleString('fr-MA')} DH` : '-'

const fmtDate = (value: any) => {
  if (!value) return '-'
  const date = value.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function printDeliveryList(groups: DeliveryGroup[], profile: DynamicData = {}, options: DynamicData = {}) {
  if (!groups?.length) return

  const logoUrl = `${window.location.origin}/LOGO.jpg`
  const printDate = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
  const title = options.title || 'LISTE DES LIVRAISONS'
  const subtitle = options.subtitle || `Agence de ${profile?.city || '-'}`
  const hasManagerName = Object.prototype.hasOwnProperty.call(options, 'managerName')
  const managerName = hasManagerName
    ? (options.managerName || '-')
    : (profile?.role === 'chauffeur' ? '-' : (profile?.name || '-'))

  const groupHTML = (group: DeliveryGroup, index: number) => {
    const totalCod = group.parcels.reduce((sum, p) => sum + (Number(p.codAmount) || 0), 0)
    const totalPortDu = group.parcels
      .filter(p => p.portType === 'port_du')
      .reduce((sum, p) => sum + (Number(p.price) || 0), 0)

    const rows = group.parcels.map((p, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="tracking">${esc(p.trackingId || '-')}</td>
        <td>
          <strong>${esc(p.receiver?.name || '-')}</strong>
          <div class="muted">${esc(p.receiver?.tel || '')}</div>
        </td>
        <td>
          ${esc(p.receiver?.address || '-')}
          <div class="muted">${esc(p.receiver?.city || p.destinationCity || '')}</div>
        </td>
        <td>${esc(p.deliverySectorName || p.deliverySectorCode || '-')}</td>
        <td>${esc(p.natureOfGoods || '-')}</td>
        <td class="center">${esc(p.nbColis || 1)}</td>
        <td class="money">${fmtMoney(p.codAmount || 0)}</td>
        <td class="money">${p.portType === 'port_du' ? fmtMoney(p.price || 0) : '-'}</td>
        <td class="status">${esc(p.status || '-')}</td>
        <td>${fmtDate(p.deliveryAssignedAt || p.updatedAt || p.createdAt)}</td>
        <td class="sign">${p.signatureDataUrl ? `<img src='${p.signatureDataUrl}' style='max-width:88px;max-height:32px;object-fit:contain;display:block;margin:auto;' />` : ''}</td>
      </tr>
    `).join('')

    return `
      <section class="page ${index < groups.length - 1 ? 'break' : ''}">
        <header>
          <div class="brand">
            <img src="${logoUrl}" onerror="this.style.display='none'" />
            <div>
              <div class="brand-name">BG EXPRESS</div>
              ${profile?.agencyAddress ? `<div class="muted">${esc(profile.agencyAddress)}</div>` : '<div class="muted">N°19, Rue 5, Hay Tissir2 - Casablanca</div>'}
              <div class="muted">0522 62 92 89 | 0661 97 86 12</div>
            </div>
          </div>
          <div class="title">
            <h1>${esc(title)}</h1>
            <p>${esc(subtitle)}</p>
          </div>
          <div class="meta">
            <div>Date : <strong>${esc(printDate)}</strong></div>
            <div>Chef/agent : <strong>${esc(managerName)}</strong></div>
            <div>Livreur : <strong>${esc(group.name || '-')}</strong></div>
            ${group.secteur || group.secteurCode || profile?.secteur || profile?.secteurCode ? `<div>Secteur : <strong>${esc(group.secteur || group.secteurCode || profile?.secteur || profile?.secteurCode)}</strong></div>` : ''}
            ${group.matricule ? `<div>Véhicule : <strong>${esc(group.matricule)}</strong></div>` : ''}
          </div>
        </header>

        <div class="summary">
          <span>${group.parcels.length} livraison(s)</span>
          <span>RETOUR FOND : ${fmtMoney(totalCod)}</span>
          <span>Port dû : ${fmtMoney(totalPortDu)}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Tracking</th>
              <th>Destinataire</th>
              <th>Adresse</th>
              <th>Secteur</th>
              <th>Nature</th>
              <th>Nb</th>
              <th>RETOUR FOND</th>
              <th>Port dû</th>
              <th>Statut</th>
              <th>Date</th>
              <th>Signature</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; font-size: 8pt; }
    .page.break { page-break-after: always; }
    header { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 2px solid #ea580c; margin-bottom: 6px; }
    header > div { padding: 8px 10px; }
    .brand { display: flex; gap: 8px; align-items: center; }
    .brand img { height: 34px; object-fit: contain; }
    .brand-name { font-weight: 900; color: #ea580c; font-size: 10pt; letter-spacing: .5px; }
    .title { text-align: center; border-left: 2px solid #ea580c; border-right: 2px solid #ea580c; }
    h1 { margin: 0; font-size: 15pt; color: #ea580c; letter-spacing: .8px; }
    .title p { margin: 3px 0 0; font-size: 8.5pt; }
    .meta { text-align: right; line-height: 1.55; }
    .muted { color: #6b7280; font-size: 7.5pt; }
    .summary { display: flex; gap: 14px; margin: 0 0 6px; color: #9a3412; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th { border: 1px solid #9a3412; background: #ea580c; color: #fff; padding: 4px 5px; font-size: 7.4pt; white-space: nowrap; }
    td { border: 1px solid #d1d5db; padding: 4px 5px; vertical-align: top; font-size: 7.4pt; }
    tbody tr:nth-child(even) td { background: #fff7ed; }
    .num, .center { text-align: center; }
    .tracking { font-family: monospace; font-weight: 800; color: #c2410c; white-space: nowrap; }
    .money { text-align: right; font-weight: 800; white-space: nowrap; }
    .status { font-weight: 700; color: #9a3412; white-space: nowrap; }
    .sign { width: 95px; min-height: 36px; text-align: center; vertical-align: middle; }
  </style>
</head>
<body>
  ${groups.map(groupHTML).join('')}
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=1200,height=800')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
