export function printRetoursToLoad(parcels: any[], agencyName: string) {
  const date = new Date().toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Retours à charger - ${agencyName}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 11pt;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 3px solid #f97316;
        }
        .header h1 {
          color: #f97316;
          font-size: 24pt;
          margin-bottom: 5px;
        }
        .header .subtitle {
          color: #666;
          font-size: 11pt;
        }
        .info-box {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          padding: 10px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 5px;
        }
        .info-item {
          display: flex;
          flex-direction: column;
        }
        .info-label {
          font-size: 9pt;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 3px;
        }
        .info-value {
          font-size: 12pt;
          font-weight: bold;
          color: #333;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background: #f97316;
          color: white;
          padding: 10px 8px;
          text-align: left;
          font-size: 10pt;
          font-weight: 600;
        }
        td {
          padding: 8px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 10pt;
        }
        tr:nth-child(even) {
          background: #f9fafb;
        }
        .tracking {
          font-weight: bold;
          color: #2563eb;
        }
        .reason {
          color: #dc2626;
          font-size: 9pt;
        }
        .total-box {
          margin-top: 20px;
          padding: 15px;
          background: #fff7ed;
          border: 2px solid #f97316;
          border-radius: 5px;
          text-align: right;
        }
        .total-label {
          font-size: 12pt;
          color: #666;
          margin-bottom: 5px;
        }
        .total-value {
          font-size: 24pt;
          font-weight: bold;
          color: #f97316;
        }
        .signature-section {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          width: 45%;
          border-top: 2px solid #333;
          padding-top: 10px;
        }
        .signature-title {
          font-size: 10pt;
          color: #666;
          text-align: center;
        }
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>↩️ RETOURS À CHARGER</h1>
        <div class="subtitle">Feuille de chargement - ${agencyName}</div>
      </div>

      <div class="info-box">
        <div class="info-item">
          <span class="info-label">Date d'impression</span>
          <span class="info-value">${date}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Agence</span>
          <span class="info-value">${agencyName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Nombre de colis</span>
          <span class="info-value">${parcels.length}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 8%">N°</th>
            <th style="width: 15%">Tracking ID</th>
            <th style="width: 20%">Expéditeur</th>
            <th style="width: 15%">Ville origine</th>
            <th style="width: 20%">Destinataire</th>
            <th style="width: 12%">Vers</th>
            <th style="width: 10%">☑️</th>
          </tr>
        </thead>
        <tbody>
          ${parcels.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="tracking">${p.trackingId || '—'}</td>
              <td>${p.sender?.name || '—'}</td>
              <td>${p.destinationCity || '—'}</td>
              <td>${p.receiver?.name || '—'}</td>
              <td><strong>${p.originCity || '—'}</strong></td>
              <td style="text-align: center">☐</td>
            </tr>
            ${p.returnReason ? `
              <tr>
                <td colspan="7" class="reason" style="padding-left: 60px">
                  🔄 Raison: ${p.returnReason}
                </td>
              </tr>
            ` : ''}
          `).join('')}
        </tbody>
      </table>

      <div class="total-box">
        <div class="total-label">TOTAL COLIS À CHARGER</div>
        <div class="total-value">${parcels.length}</div>
      </div>

      <div class="signature-section">
        <div class="signature-box">
          <div class="signature-title">Chef d'agence (départ)</div>
        </div>
        <div class="signature-box">
          <div class="signature-title">Chauffeur</div>
        </div>
      </div>

      <script>
        window.onload = () => {
          window.print()
          setTimeout(() => window.close(), 500)
        }
      </script>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

export function printRetoursReceived(parcels: any[], agencyName: string) {
  const date = new Date().toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Retours reçus - ${agencyName}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 11pt;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 3px solid #3b82f6;
        }
        .header h1 {
          color: #3b82f6;
          font-size: 24pt;
          margin-bottom: 5px;
        }
        .header .subtitle {
          color: #666;
          font-size: 11pt;
        }
        .info-box {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          padding: 10px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 5px;
        }
        .info-item {
          display: flex;
          flex-direction: column;
        }
        .info-label {
          font-size: 9pt;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 3px;
        }
        .info-value {
          font-size: 12pt;
          font-weight: bold;
          color: #333;
        }
        .parcel-card {
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 15px;
          page-break-inside: avoid;
        }
        .parcel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e5e7eb;
        }
        .tracking {
          font-size: 14pt;
          font-weight: bold;
          color: #2563eb;
        }
        .status {
          background: #dbeafe;
          color: #1e40af;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 9pt;
          font-weight: 600;
        }
        .parcel-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .field {
          margin-bottom: 8px;
        }
        .field-label {
          font-size: 9pt;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .field-value {
          font-size: 11pt;
          color: #333;
          font-weight: 500;
        }
        .reason {
          grid-column: 1 / -1;
          background: #fef2f2;
          border: 1px solid #fecaca;
          padding: 8px;
          border-radius: 5px;
          margin-top: 5px;
        }
        .reason-text {
          color: #dc2626;
          font-size: 10pt;
        }
        .action-box {
          grid-column: 1 / -1;
          margin-top: 10px;
          padding: 10px;
          background: #f9fafb;
          border-radius: 5px;
          border: 1px dashed #9ca3af;
        }
        .action-label {
          font-size: 9pt;
          color: #666;
          margin-bottom: 5px;
        }
        .total-box {
          margin-top: 20px;
          padding: 15px;
          background: #eff6ff;
          border: 2px solid #3b82f6;
          border-radius: 5px;
          text-align: right;
        }
        .total-label {
          font-size: 12pt;
          color: #666;
          margin-bottom: 5px;
        }
        .total-value {
          font-size: 24pt;
          font-weight: bold;
          color: #3b82f6;
        }
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📦 RETOURS REÇUS</h1>
        <div class="subtitle">À traiter - ${agencyName}</div>
      </div>

      <div class="info-box">
        <div class="info-item">
          <span class="info-label">Date d'impression</span>
          <span class="info-value">${date}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Agence</span>
          <span class="info-value">${agencyName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Nombre de retours</span>
          <span class="info-value">${parcels.length}</span>
        </div>
      </div>

      ${parcels.map(p => `
        <div class="parcel-card">
          <div class="parcel-header">
            <span class="tracking">${p.trackingId || '—'}</span>
            <span class="status">${p.status || '—'}</span>
          </div>
          <div class="parcel-body">
            <div class="field">
              <div class="field-label">Expéditeur (retour vers)</div>
              <div class="field-value">${p.sender?.name || '—'}</div>
            </div>
            <div class="field">
              <div class="field-label">Téléphone</div>
              <div class="field-value">${p.sender?.tel || '—'}</div>
            </div>
            <div class="field">
              <div class="field-label">Adresse</div>
              <div class="field-value">${p.sender?.address || '—'}</div>
            </div>
            <div class="field">
              <div class="field-label">Ville</div>
              <div class="field-value">${p.sender?.city || p.originCity || '—'}</div>
            </div>
            ${p.returnReason ? `
              <div class="reason">
                <div class="reason-text">🔄 Raison du retour: ${p.returnReason}</div>
              </div>
            ` : ''}
            <div class="action-box">
              <div class="action-label">Action prise:</div>
              <div style="margin-top: 5px; display: flex; gap: 20px;">
                <label style="display: flex; align-items: center; gap: 5px;">
                  <input type="checkbox" style="width: 15px; height: 15px;">
                  <span>Assigné à livreur</span>
                </label>
                <label style="display: flex; align-items: center; gap: 5px;">
                  <input type="checkbox" style="width: 15px; height: 15px;">
                  <span>Retourné directement</span>
                </label>
              </div>
              <div style="margin-top: 8px; font-size: 9pt; color: #666;">
                Nom livreur: ___________________________ Signature: _______________
              </div>
            </div>
          </div>
        </div>
      `).join('')}

      <div class="total-box">
        <div class="total-label">TOTAL RETOURS À TRAITER</div>
        <div class="total-value">${parcels.length}</div>
      </div>

      <script>
        window.onload = () => {
          window.print()
          setTimeout(() => window.close(), 500)
        }
      </script>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

export function printRetoursHistory(parcels: any[], agencyName: string, filters?: any) {
  const date = new Date().toLocaleDateString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const formatDate = (ts: any) => {
    if (!ts) return '—'
    const d = typeof ts === 'string' ? new Date(ts) : ts.toDate?.() || new Date(ts.seconds * 1000)
    return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Historique des retours - ${agencyName}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 10pt;
          line-height: 1.3;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 3px solid #10b981;
        }
        .header h1 {
          color: #10b981;
          font-size: 22pt;
          margin-bottom: 5px;
        }
        .header .subtitle {
          color: #666;
          font-size: 10pt;
        }
        .info-box {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
          padding: 8px;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-radius: 5px;
        }
        .info-item {
          display: flex;
          flex-direction: column;
        }
        .info-label {
          font-size: 8pt;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 2px;
        }
        .info-value {
          font-size: 11pt;
          font-weight: bold;
          color: #333;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 9pt;
        }
        th {
          background: #10b981;
          color: white;
          padding: 8px 6px;
          text-align: left;
          font-size: 9pt;
          font-weight: 600;
        }
        td {
          padding: 6px;
          border-bottom: 1px solid #e5e7eb;
        }
        tr:nth-child(even) {
          background: #f9fafb;
        }
        .tracking {
          font-weight: bold;
          color: #2563eb;
        }
        .status {
          background: #d1fae5;
          color: #065f46;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 8pt;
          font-weight: 600;
          display: inline-block;
        }
        .total-box {
          margin-top: 15px;
          padding: 12px;
          background: #ecfdf5;
          border: 2px solid #10b981;
          border-radius: 5px;
          text-align: right;
        }
        .total-label {
          font-size: 11pt;
          color: #666;
          margin-bottom: 5px;
        }
        .total-value {
          font-size: 20pt;
          font-weight: bold;
          color: #10b981;
        }
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 HISTORIQUE DES RETOURS</h1>
        <div class="subtitle">Rapport complet - ${agencyName}</div>
      </div>

      <div class="info-box">
        <div class="info-item">
          <span class="info-label">Date d'impression</span>
          <span class="info-value">${date}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Agence</span>
          <span class="info-value">${agencyName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Période</span>
          <span class="info-value">${filters?.dateFrom || 'Début'} - ${filters?.dateTo || 'Fin'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Nombre de retours</span>
          <span class="info-value">${parcels.length}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 5%">N°</th>
            <th style="width: 12%">Tracking ID</th>
            <th style="width: 15%">Expéditeur</th>
            <th style="width: 10%">Origine</th>
            <th style="width: 15%">Destinataire</th>
            <th style="width: 10%">Destination</th>
            <th style="width: 18%">Raison</th>
            <th style="width: 10%">Date retour</th>
            <th style="width: 5%">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${parcels.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="tracking">${p.trackingId || '—'}</td>
              <td>${p.sender?.name || '—'}</td>
              <td>${p.originCity || '—'}</td>
              <td>${p.receiver?.name || '—'}</td>
              <td>${p.destinationCity || '—'}</td>
              <td style="font-size: 8pt;">${p.returnReason || '—'}</td>
              <td>${formatDate(p.returnedAt)}</td>
              <td><span class="status">✓</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="total-box">
        <div class="total-label">TOTAL RETOURS TRAITÉS</div>
        <div class="total-value">${parcels.length}</div>
      </div>

      <script>
        window.onload = () => {
          window.print()
          setTimeout(() => window.close(), 500)
        }
      </script>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
