export function printEmployeeContract(employee: any, form: any) {
  const logoUrl = window.location.origin + '/LOGO.jpg'
  const today = new Date().toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })
  const fmt = (d: any) => d ? new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' }) : '_______________'
  const fmtSalaire = (s: any) => s ? parseFloat(s).toLocaleString('fr-MA') + ' DH' : '_______________'
  const typeLabel = form.typeContrat === 'CDI' ? 'INDETERMINEE' : 'DETERMINEE'
  const dureeCDD = form.typeContrat === 'CDD' && form.dateFin ? `du ${fmt(form.dateDebut)} au ${fmt(form.dateFin)}` : ''
  const ftxt = `BG EXPRESS &nbsp;|&nbsp; N 19, Rue 5, Hay Tissir2 - Casablanca &nbsp;|&nbsp; 0522 62 92 89 &nbsp;|&nbsp; bgexpress2019@gmail.com &nbsp;|&nbsp; Genere le ${today}`

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Contrat-${form.typeContrat}-${employee.name?.replace(/ /g, '-')}</title>
  <style>
    @page { size: A4; margin: 12mm 15mm; }
    * { box-sizing:border-box; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    body { font-family: Arial, sans-serif; font-size: 9.8pt; color: #111; margin:0; padding:0; line-height:1.55; }
    .page { width: 100%; height: 273mm; display: flex; flex-direction: column; page-break-after: always; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .body { flex: 1; overflow: hidden; }
    .footer { border-top: 1px solid #d1d5db; padding-top: 4px; font-size: 7pt; color: #9ca3af; text-align: center; margin-top: auto; }
    .hdr { display:flex; align-items:center; border:2px solid #1e3a8a; padding:6px 12px; gap:12px; margin-bottom:7px; background:#eff6ff; }
    .hdr-info { font-size:8pt; color:#374151; line-height:1.45; }
    .hdr-info b { color:#1e3a8a; font-size:10.5pt; display:block; }
    .hdr2 { display:flex; align-items:center; border:1px solid #1e3a8a; padding:4px 10px; gap:10px; margin-bottom:6px; background:#eff6ff; }
    h1 { font-size:12.5pt; text-align:center; text-transform:uppercase; letter-spacing:1px; margin:7px 0 2px; color:#1e3a8a; }
    .subtitle { text-align:center; font-size:8pt; color:#374151; margin-bottom:7px; border-bottom:1px solid #e5e7eb; padding-bottom:5px; }
    h2 { font-size:8.5pt; text-transform:uppercase; background:#1e3a8a; color:#fff; margin:7px 0 4px; padding:2.5px 7px; letter-spacing:0.4px; }
    table.info { width:100%; border-collapse:collapse; margin:3px 0 5px; border:1px solid #e2e8f0; }
    table.info td { padding:3.5px 7px; font-size:9pt; vertical-align:top; border-bottom:1px solid #f1f5f9; }
    table.info td.lbl { font-weight:bold; color:#1e3a8a; background:#f8fafc; border-right:1px solid #e2e8f0; width:32%; white-space:nowrap; }
    p { margin:3px 0; text-align:justify; }
    .art { margin-bottom:1px; }
    ul.obl { margin:3px 0 3px 16px; padding:0; }
    ul.obl li { margin:2.5px 0; }
    .mention { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:3px; padding:4px 9px; font-size:8.5pt; color:#166534; margin:7px 0; }
    .sig-block { display:flex; justify-content:space-between; margin-top:22px; }
    .sig-col { width:44%; text-align:center; font-size:9pt; }
    .sig-line { border-top:1px solid #000; margin-top:40px; padding-top:3px; }
  </style>
</head>
<body>
<div class="page">
  <div class="body">
    <div class="hdr">
      <img src="${logoUrl}" style="height:40px;object-fit:contain" onerror="this.style.display='none'">
      <div class="hdr-info"><b>BG EXPRESS</b>N 19, Rue 5, Hay Tissir2 - Casablanca &nbsp;|&nbsp; 0522 62 92 89 &nbsp;|&nbsp; 0661 97 86 12 &nbsp;|&nbsp; bgexpress2019@gmail.com</div>
      <div style="margin-left:auto;text-align:right;font-size:8pt;color:#374151;white-space:nowrap">Fait a Casablanca<br><strong>Le : ${today}</strong></div>
    </div>
    <h1>Contrat de Travail a Duree ${typeLabel}</h1>
    <div class="subtitle">Regi par le Code du Travail Marocain - Loi n 65-99 et ses textes d'application</div>
    <h2>Article 1 - Parties au contrat</h2>
    <div class="art">
      <p><strong>L'Employeur :</strong> La societe <strong>BG EXPRESS</strong>, societe a responsabilite limitee de droit marocain, dont le siege social est sis N 19, Rue 5, Hay Tissir2 - Casablanca, representee par son gerant, ci-apres denommee l'Employeur.</p>
      <p style="margin-top:4px"><strong>Le(la) Salarie(e) :</strong></p>
      <table class="info">
        <tr><td class="lbl">Nom et prenom</td><td><strong>${employee.name || '_______________'}</strong></td><td class="lbl">N CIN</td><td>${employee.cin || '_______________'}</td></tr>
        <tr><td class="lbl">Date de naissance</td><td>${fmt(employee.dateNaissance)}</td><td class="lbl">Lieu de naissance</td><td>${form.lieuNaissance || '_______________'}</td></tr>
        <tr><td class="lbl">Nationalite</td><td>${form.nationalite || 'Marocaine'}</td><td class="lbl">Situation familiale</td><td>${employee.situationFamiliale || '_______________'}</td></tr>
        <tr><td class="lbl">Adresse</td><td colspan="3">${employee.adresse || '_______________'}</td></tr>
        ${employee.cnss ? `<tr><td class="lbl">N CNSS</td><td colspan="3">${employee.cnss}</td></tr>` : ''}
      </table>
      <p>Ci-apres denomme(e) le(la) Salarie(e).</p>
    </div>
    <h2>Article 2 - Objet et lieu de travail</h2>
    <div class="art">
      <p>L'employeur engage le(la) salarie(e) en qualite de <strong>${form.poste}</strong>, au sein du departement <strong>${form.departement}</strong>, pour exercer ses fonctions dans l'agence de <strong>${form.lieuTravail || 'Casablanca'}</strong>.</p>
      <p>Le(la) salarie(e) s'engage a executer les taches inherentes a son poste avec diligence, loyaute et professionnalisme, conformement aux directives de la hierarchie et au reglement interieur de la societe.</p>
    </div>
    <h2>Article 2.1 - Clause de mobilite geographique</h2>
    <div class="art">
      <p>Le(la) salarie(e) accepte expressement que la societe BG EXPRESS puisse, en fonction des necessites du service et de l'organisation de l'entreprise, l'affecter dans toute agence ou site d'exploitation situe sur le territoire marocain. Cette mobilite geographique fait partie integrante des conditions d'execution du present contrat.</p>
      <p>En cas de mutation definitive, l'employeur s'engage a en informer le(la) salarie(e) par ecrit avec un preavis raisonnable.</p>
    </div>
    <h2>Article 3 - Duree et prise d'effet</h2>
    <div class="art">
      ${form.typeContrat === 'CDI'
        ? `<p>Le present contrat est conclu pour une <strong>duree indeterminee</strong> et prend effet a compter du <strong>${fmt(form.dateDebut)}</strong>. Il ne pourra y etre mis fin que dans le respect des dispositions du Code du Travail relatives au licenciement ou a la demission, moyennant le respect des delais de preavis legaux.</p>`
        : `<p>Le present contrat est conclu pour une <strong>duree determinee</strong> ${dureeCDD}, prenant effet le <strong>${fmt(form.dateDebut)}</strong> et prenant fin de plein droit a la date convenue. Conformement a l'article 16 du Code du Travail, il ne peut etre renouvele qu'une seule fois, sans depasser deux ans au total.</p>`
      }
    </div>
    <h2>Article 4 - Periode d'essai</h2>
    <div class="art"><p>Conformement a l'article 13 du Code du Travail Marocain, le present contrat est soumis a une <strong>periode d'essai de ${form.periodeEssai}</strong> a compter de la date de prise de fonctions effective.</p></div>
    <h2>Article 5 - Remuneration</h2>
    <div class="art"><p>En contrepartie de ses services, le(la) salarie(e) percevra un <strong>salaire brut mensuel de ${fmtSalaire(form.salaireBrut)}</strong>, soumis aux retenues legales obligatoires, verse au plus tard le dernier jour ouvrable de chaque mois.${form.avantages ? ` <strong>Avantages :</strong> ${form.avantages}.` : ''}</p></div>
  </div>
  <div class="footer">${ftxt}</div>
</div>
<div class="page">
  <div class="body">
    <div class="hdr2">
      <img src="${logoUrl}" style="height:26px;object-fit:contain" onerror="this.style.display='none'">
      <div style="font-size:8pt;font-weight:bold;color:#1e3a8a">BG EXPRESS - Contrat de Travail a Duree ${typeLabel} - ${employee.name || ''}</div>
      <div style="margin-left:auto;font-size:7.5pt;color:#6b7280">Page 2 / 2</div>
    </div>
    <h2>Article 6 - Duree et organisation du travail</h2>
    <div class="art"><p>La duree legale du travail est fixee a <strong>44 heures par semaine</strong>. Les horaires applicables sont : <strong>${form.horaire}</strong>. Les heures supplementaires seront remunerees aux taux prevus par la loi.</p></div>
    <h2>Article 7 - Conges annuels et absences</h2>
    <div class="art"><p>Le(la) salarie(e) beneficiera d'un <strong>conge annuel paye de 1,5 jour ouvrable par mois de service effectif</strong>. Toute absence devra etre justifiee dans un delai de 48 heures.</p></div>
    <h2>Article 8 - Obligations et deontologie du salarie</h2>
    <div class="art">
      <p>Le(la) salarie(e) s'engage a :</p>
      <ul class="obl">
        <li>Executer avec soin et assiduite les taches confiees ;</li>
        <li>Observer une stricte confidentialite sur les informations commerciales, financieres et operationnelles ;</li>
        <li>Respecter le reglement interieur, les normes d'hygiene, de securite et les regles de discipline ;</li>
        <li>Informer immediatement l'employeur de toute absence ;</li>
        <li>S'abstenir de toute activite professionnelle concurrente pendant la duree du contrat ;</li>
        <li>Prendre soin du materiel, des equipements et vehicules mis a disposition.</li>
      </ul>
    </div>
    <h2>Article 9 - Resiliation du contrat</h2>
    <div class="art">
      ${form.typeContrat === 'CDI'
        ? `<p>Le present contrat peut etre resilie par l'une ou l'autre des parties sous reserve du delai de preavis legal. En cas de licenciement, les dispositions des articles 35 a 73 du Code du Travail seront appliquees.</p>`
        : `<p>Le present contrat prend fin de plein droit a l'arrivee de son terme. En cas de rupture anticipee non justifiee par une faute grave, la partie responsable sera tenue de verser une indemnite compensatrice.</p>`
      }
    </div>
    <h2>Article 10 - Reglement des litiges</h2>
    <div class="art"><p>Tout differend relatif a l'execution, l'interpretation ou la resiliation du present contrat sera soumis, a defaut de reglement amiable, aux juridictions du travail competentes. Convention collective applicable : <em>${form.conventionColl}</em>.</p></div>
    <div class="mention">Le present contrat est etabli en deux exemplaires originaux de valeur egale, un exemplaire remis a chaque partie.</div>
    <div class="sig-block">
      <div class="sig-col"><div><strong>L'Employeur</strong></div><div style="color:#374151;margin-top:2px;font-size:8.5pt">BG EXPRESS - Casablanca</div><div class="sig-line">Cachet et Signature</div></div>
      <div class="sig-col"><div><strong>Le(la) Salarie(e)</strong></div><div style="color:#374151;margin-top:2px;font-size:8.5pt">${employee.name || ''}</div><div class="sig-line">Lu et approuve - Signature</div></div>
    </div>
  </div>
  <div class="footer">${ftxt}</div>
</div>
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=860,height=1100')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
