/**
 * Utilitaire pour imprimer/afficher le bon d'expédition (Bon de Ramassage)
 */

export function printParcelTicket(parcel: any) {
  if (!parcel) {
    console.error('Pas de colis fourni pour l\'impression')
    return
  }

  // Types de service
  const ALL_SERVICE_TYPES = [
    { key: 'simple', label: 'Simple', emoji: '📦' },
    { key: 'especes', label: 'Espèces', emoji: '💵' },
    { key: 'cheque', label: 'Chèque', emoji: '📝' },
    { key: 'traite', label: 'Traite', emoji: '📄' },
    { key: 'virement', label: 'Virement', emoji: '🏦' },
  ]

  // Formater la date
  const formatDate = (date: any) => {
    try {
      if (!date) return new Date().toLocaleDateString('fr-MA')

      // Si c'est un timestamp Firestore avec toDate()
      if (date && typeof date.toDate === 'function') {
        return date.toDate().toLocaleDateString('fr-MA')
      }

      // Si c'est déjà un objet Date
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('fr-MA')
      }

      // Si c'est une string ou un timestamp
      if (typeof date === 'string' || typeof date === 'number') {
        const d = new Date(date)
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString('fr-MA')
        }
      }

      // Si c'est un objet avec seconds (Firestore Timestamp)
      if (date && typeof date === 'object' && 'seconds' in date) {
        return new Date(date.seconds * 1000).toLocaleDateString('fr-MA')
      }

      // Fallback : date actuelle
      return new Date().toLocaleDateString('fr-MA')
    } catch (error) {
      console.error('Erreur formatage date:', error, date)
      return new Date().toLocaleDateString('fr-MA')
    }
  }

  // Obtenir l'URL du logo (chemin absolu pour éviter les problèmes de chargement)
  const logoUrl = `${window.location.origin}/LOGO.jpg`

  // Générer le HTML du bon
  const ticketHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bon-Ramassage-${parcel.trackingId || 'TRACKING'}</title>
  <style>
    @page {
      size: A5 portrait;
      margin: 8mm;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      #ticket-print {
        width: 148mm !important;
        max-width: 148mm !important;
        margin: 0 auto !important;
      }
    }

    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }

    #ticket-print {
      max-width: 148mm;
      margin: 0 auto;
      background: white;
      border: 1px solid #ddd;
      font-size: 11px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #ddd;
      padding: 8px 12px;
    }

    .header img {
      height: 36px;
      object-fit: contain;
    }

    .header .logo-placeholder {
      height: 36px;
      display: flex;
      align-items: center;
      font-weight: bold;
      color: #1d4ed8;
      font-size: 16px;
    }

    .header-right {
      text-align: right;
    }

    .header-title {
      font-size: 10px;
      color: #666;
    }

    .nic {
      font-weight: bold;
      color: #2563eb;
      font-size: 12px;
      font-family: monospace;
      letter-spacing: 1.5px;
    }

    .tracking {
      font-weight: bold;
      color: #1d4ed8;
      font-size: 14px;
      letter-spacing: 1.5px;
    }

    .date {
      font-size: 9px;
      color: #999;
    }

    .service-types {
      display: flex;
      gap: 16px;
      padding: 6px 12px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .service-type {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
    }

    .checkbox {
      width: 12px;
      height: 12px;
      border: 1px solid #999;
      border-radius: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 8px;
    }

    .checkbox.checked {
      background: #2563eb;
      border-color: #2563eb;
      color: white;
    }

    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #ddd;
    }

    .detail-section {
      padding: 8px 12px;
    }

    .detail-section + .detail-section {
      border-left: 1px solid #ddd;
    }

    .section-title {
      font-weight: bold;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1d4ed8;
      margin-bottom: 6px;
    }

    .detail-row {
      margin: 4px 0;
    }

    .label {
      color: #666;
    }

    .value {
      font-weight: 600;
    }

    .nic-box {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #dbeafe;
      border: 1px solid #93c5fd;
      border-radius: 4px;
      padding: 2px 6px;
      margin-top: 2px;
    }

    .nic-label {
      font-size: 9px;
      font-weight: bold;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .nic-value {
      font-weight: bold;
      color: #1e40af;
      font-family: monospace;
      font-size: 11px;
    }

    .nature-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #ddd;
      background: #dbeafe;
    }

    .nature-item {
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .nature-item + .nature-item {
      border-left: 1px solid #ddd;
    }

    .nature-icon {
      font-size: 18px;
    }

    .nature-label {
      font-size: 9px;
      color: #666;
      text-transform: uppercase;
    }

    .nature-value {
      font-weight: bold;
      font-size: 13px;
      color: #1e40af;
    }

    .amounts {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      border-bottom: 1px solid #ddd;
      text-align: center;
    }

    .amount-item {
      padding: 6px 8px;
    }

    .amount-item + .amount-item {
      border-left: 1px solid #e5e7eb;
    }

    .amount-label {
      color: #999;
      font-size: 9px;
      text-transform: uppercase;
    }

    .amount-value {
      font-weight: bold;
      font-size: 14px;
    }

    .barcode-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #e5e7eb;
    }

    .qr-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      margin-left: 8px;
    }

    .qr-label {
      font-size: 8px;
      color: #999;
    }

    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-top: 1px solid #ddd;
      font-size: 9px;
      color: #999;
    }

    .signature-item {
      padding: 8px 12px;
    }

    .signature-item + .signature-item {
      border-left: 1px solid #e5e7eb;
    }

    .print-button {
      margin: 20px auto;
      padding: 12px 24px;
      background: #1f2937;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: block;
    }

    .print-button:hover {
      background: #111827;
    }

    @media print {
      .print-button {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div id="ticket-print">
    <!-- Header -->
    <div class="header">
      <img src="${logoUrl}" alt="BG Express" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div class="logo-placeholder" style="display:none;">BG EXPRESS</div>
      <div class="header-right">
        <div class="header-title">Bon de Ramassage</div>
        ${parcel.sender?.nic || parcel.senderNic ? `<div class="nic">N EXP : ${parcel.sender?.nic || parcel.senderNic}</div>` : ''}
        <div class="tracking">${parcel.trackingId || 'TRACKING-ID'}</div>
        <div class="date">${formatDate(parcel.createdAt)}</div>
      </div>
    </div>

    <!-- Type de service -->
    <div class="service-types">
      ${ALL_SERVICE_TYPES.map(st => {
        const types = (parcel.serviceType || '').split(',').filter(Boolean)
        const isSelected = types.includes(st.key) || (st.key === 'simple' && !parcel.serviceType)
        return `
          <div class="service-type">
            <span class="checkbox ${isSelected ? 'checked' : ''}">${isSelected ? '✓' : ''}</span>
            <span>${st.label}</span>
          </div>
        `
      }).join('')}
      <div class="service-type">
        <span class="checkbox ${parcel.hasRetourBL ? 'checked' : ''}">${parcel.hasRetourBL ? '✓' : ''}</span>
        <span>Retour BL</span>
      </div>
    </div>

    <!-- Expéditeur / Destinataire -->
    <div class="details-grid">
      <div class="detail-section">
        <div class="section-title">Expéditeur</div>
        <div class="detail-row">
          <span class="label">Nom : </span>
          <span class="value">${parcel.sender?.name || parcel.senderName || '—'}</span>
        </div>
        <div class="nic-box">
          <span class="nic-label">N EXP :</span>
          <span class="nic-value">${parcel.sender?.nic || parcel.senderNic || '—'}</span>
        </div>
        ${parcel.sender?.address ? `<div class="detail-row"><span class="label">Adresse : </span>${parcel.sender.address}</div>` : ''}
        <div class="detail-row">
          <span class="label">Ville : </span>
          <span class="value">${parcel.sender?.city || parcel.originCity || '—'}</span>
        </div>
        <div class="detail-row">
          <span class="label">Tél : </span>
          ${parcel.sender?.tel || parcel.senderTel || '—'}
        </div>
      </div>
      <div class="detail-section">
        <div class="section-title">Destinataire</div>
        <div class="detail-row">
          <span class="label">Nom : </span>
          <span class="value">${parcel.receiver?.name || parcel.receiverName || '—'}</span>
        </div>
        ${parcel.receiver?.address ? `<div class="detail-row"><span class="label">Adresse : </span>${parcel.receiver.address}</div>` : ''}
        <div class="detail-row">
          <span class="label">Ville : </span>
          <span class="value" style="color: #1d4ed8; font-weight: bold;">${parcel.receiver?.city || parcel.destinationCity || '—'}</span>
        </div>
        <div class="detail-row">
          <span class="label">Tél : </span>
          ${parcel.receiver?.tel || parcel.receiverTel || '—'}
        </div>
      </div>
    </div>

    <!-- Nature + Nb colis -->
    <div class="nature-section">
      <div class="nature-item">
        <span class="nature-icon">📦</span>
        <div>
          <div class="nature-label">Nature de marchandise</div>
          <div class="nature-value">${parcel.natureOfGoods || parcel.contenu || '—'}</div>
        </div>
      </div>
      <div class="nature-item">
        <span class="nature-icon">🔢</span>
        <div>
          <div class="nature-label">Nombre de colis</div>
          <div class="nature-value">${parcel.nbColis || 1}</div>
        </div>
      </div>
    </div>

    <!-- Montants -->
    <div class="amounts">
      <div class="amount-item">
        <div class="amount-label">Poids</div>
        <div class="amount-value">${parcel.weight || 0} kg</div>
      </div>
      <div class="amount-item">
        <div class="amount-label">Prix</div>
        <div class="amount-value" style="color: #1d4ed8;">${parcel.price || 0} DH</div>
      </div>
      <div class="amount-item">
        <div class="amount-label">RETOUR FOND</div>
        <div class="amount-value" style="color: ${(parcel.codAmount || 0) > 0 ? '#ea580c' : '#d1d5db'};">
          ${(parcel.codAmount || 0) > 0 ? `${parcel.codAmount} DH` : '—'}
        </div>
      </div>
    </div>

    <!-- Barcode + QR -->
    <div class="barcode-section">
      <svg id="barcode"></svg>
      <div class="qr-section">
        <svg id="qrcode"></svg>
        <div class="qr-label">Suivi en ligne</div>
      </div>
    </div>

    <!-- Signatures -->
    <div class="signatures">
      <div class="signature-item">Cachet et Signature expéditeur</div>
      <div class="signature-item">Cachet et Signature destinataire</div>
    </div>
  </div>

  <button class="print-button" onclick="window.print()">🖨️ Imprimer</button>

  <!-- Charger les librairies de génération de codes-barres -->
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>

  <script>
    // Générer le code-barres
    JsBarcode("#barcode", "${parcel.trackingId || 'TRACKING'}", {
      format: "CODE128",
      width: 1.3,
      height: 48,
      fontSize: 10,
      margin: 0
    });

    // Générer le QR code
    QRCode.toCanvas(document.getElementById('qrcode'),
      "https://arelanc.web.app/track?id=${parcel.trackingId || ''}",
      {
        width: 64,
        margin: 0,
        errorCorrectionLevel: 'M'
      },
      function (error) {
        if (error) console.error('Erreur QR:', error);
      }
    );
  </script>
</body>
</html>
  `.trim()

  // Ouvrir dans une nouvelle fenêtre
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Impossible d\'ouvrir la fenêtre d\'impression. Veuillez autoriser les popups.')
    return
  }

  printWindow.document.write(ticketHTML)
  printWindow.document.close()
}
