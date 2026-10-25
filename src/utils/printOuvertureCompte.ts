import type { ClientAccount, Person } from '../firebase/clientAccounts'

/**
 * 🖨️ « Demande d'ouverture de compte client » BG EXPRESS — une page A4.
 * Sans compte : formulaire VIERGE à faire remplir par le client. Avec un compte : la même fiche remplie (réimpression).
 * Section 4 « Tarifs » : mention « VOIR CONTRAT D'ENGAGEMENT ». Facturation : mensuelle seulement.
 * Pied de page (identifiants légaux + RIB BG EXPRESS) imprimé tout en bas de la feuille.
 */
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export const OPTIONS = {
  type: ['Société', 'Commerçant (personne physique)', 'Auto-entrepreneur', 'E-commerçant', 'Administration / Association'],
  formeJuridique: ['SARL', 'SARLAU', 'SA', 'Autre'],
  services: ['Messagerie colis', 'Contre-remboursement (COD)', 'Retour BL', 'Livraison en gare', 'Livraison à domicile', 'Ramassage'],
  codModes: ['Espèces', 'Chèque', 'Traite', 'Chèque + espèces'],
  portModes: ['En compte expéditeur', 'En compte destinataire', 'Port payé au départ', 'Port dû (à la livraison)'],
  delaiPaiement: ['À réception', '15 jours', '30 jours'],
  reglementModes: ['Virement bancaire', 'Chèque', 'Espèces', 'Effet de commerce (traite)'],
  restitutionMode: ["Virement", 'Chèque', "Espèces à l'agence"],
  restitutionPeriodicite: ['Quotidienne', '2 fois / semaine', 'Hebdomadaire'],
  documents: ['R.C (modèle J ou 7)', 'Attestation I.F et ICE', 'Patente', 'CIN du gérant', 'RIB original', 'Statuts / PV de nomination', 'Carte auto-entrepreneur'],
}

export function printOuvertureCompte(a?: ClientAccount | null) {
  const f = a || ({} as Partial<ClientAccount>)
  const v = (x: unknown) => esc(x)
  const has = (list: string[] | undefined, o: string) => !!list && list.includes(o)
  const box = (on: boolean) => `<span class="box${on ? ' on' : ''}">${on ? '✓' : ''}</span>`
  const opts = (all: string[], sel: (o: string) => boolean) => all.map((o, i) => `${box(sel(o)).replace('class="box', `class="box${i === 0 ? ' f' : ''}`)}${esc(o)}`).join(' ')
  const p = (x?: Person) => x || {}
  const rib = String(f.rib || '').replace(/\D/g, '').padEnd(24, ' ').slice(0, 24).split('')
  const ribCells = rib.map((c, i) => `<td${[2, 5, 21].includes(i) ? ' style="border-right:2px solid #111"' : ''}>${c.trim() ? esc(c) : ''}</td>`).join('')
  const logo = `${location.origin}/LOGO.jpg`
  const fr = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join(' / ') : '..... / ..... / 20.....')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>BG EXPRESS — Ouverture de compte${a ? ` ${esc(a.accountNumber)}` : ''}</title>
<style>
  @page { size: A4 portrait; margin: 7mm 9mm 6mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7.9pt; color: #111; margin: 0; }
  /* Une seule page A4 : hauteur fixe avec marge de sécurité (marges / en-têtes du navigateur), pied de page poussé tout en bas */
  html, body { height: auto; overflow: hidden; }
  .page { display: flex; flex-direction: column; height: 264mm; overflow: hidden; break-inside: avoid; page-break-inside: avoid; page-break-after: avoid; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2.5px solid #1e3a8a; padding-bottom: 3px; }
  .head img { height: 40px; }
  .co { text-align: right; font-size: 7.2pt; line-height: 1.3; color: #333; }
  .co b { color: #1e3a8a; font-size: 9.5pt; }
  .title { display: flex; justify-content: space-between; align-items: center; margin: 4px 0 2px; }
  h1 { font-size: 12.5pt; margin: 0; color: #1e3a8a; }
  .ref { font-size: 7.4pt; } .ref b { font-size: 9pt; color: #1e3a8a; }
  h2 { font-size: 8pt; margin: 4px 0 2px; padding: 1.5px 6px; background: #1e3a8a; color: #fff; border-radius: 2px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #94a3b8; padding: 2px 4px; vertical-align: middle; }
  th { background: #e0e7ff; text-align: left; font-size: 7.2pt; }
  .lbl { background: #f1f5f9; font-weight: bold; font-size: 7.2pt; white-space: nowrap; }
  .l { height: 19px; font-weight: bold; color: #0c2a6b; }
  .box { display: inline-block; width: 9px; height: 9px; border: 1px solid #111; margin: 0 3px 0 7px; vertical-align: -1px; font-size: 8px; line-height: 8px; text-align: center; font-weight: bold; }
  .box.f { margin-left: 0; } .box.on { background: #dbeafe; color: #1e3a8a; }
  .rib td { height: 18px; padding: 0; text-align: center; font-weight: bold; }
  .tarif { height: 58px; text-align: center; font-size: 17pt; font-weight: 900; letter-spacing: 6px; color: #1e3a8a; background: repeating-linear-gradient(135deg, #fff 0 10px, #eef2ff 10px 20px); }
  .cg { font-size: 6.5pt; line-height: 1.3; text-align: justify; columns: 2; column-gap: 10px; margin-top: 2px; }
  .cg p { margin: 0 0 1.5px; }
  .sign { display: flex; gap: 8px; margin-top: 4px; }
  .sign > div { flex: 1; border: 1px solid #94a3b8; border-radius: 3px; height: 26mm; padding: 3px 6px; font-size: 7.4pt; }
  .admin { margin-top: 4px; border: 1.5px dashed #1e3a8a; border-radius: 3px; padding: 2px 5px; }
  .admin b { color: #1e3a8a; }
  .foot { margin-top: auto; text-align: center; font-size: 6.9pt; color: #333; border-top: 1.5px solid #1e3a8a; padding-top: 2px; line-height: 1.45; }
  .foot span { margin: 0 5px; } .foot .rib-bg { font-weight: bold; color: #1e3a8a; font-size: 7.6pt; }
</style></head><body><div class="page">
<div class="head">
  <img src="${logo}" alt="BG Express" onerror="this.style.display='none'">
  <div class="co">
    <b>BG EXPRESS</b> — Messagerie · Transport de colis · Contre-remboursement<br>
    Bloc H Rue 2 N°982 Agdal - Ait Melloul · Siège Casablanca : N°19, Rue 5, Hay Tissir 2<br>
    Tél : 05 28 30 68 58 — 05 22 62 92 89 · Gsm : 06 61 20 35 18 / 06 61 29 99 42 · bgexpress2019@gmail.com
  </div>
</div>
<div class="title">
  <h1>DEMANDE D'OUVERTURE DE COMPTE CLIENT</h1>
  <div class="ref">N° de compte : ${a ? `<b>${v(f.accountNumber)}</b>` : '.....................'} &nbsp; Date : ${fr(f.dateOuverture)} &nbsp; Agence : ${a ? `<b>${v(f.agence || f.city)}</b>` : '......................'}</div>
</div>

<h2>1. IDENTIFICATION DU CLIENT</h2>
<table>
  <tr><td class="lbl">Type</td><td colspan="5">${opts(OPTIONS.type, o => f.type === o)}</td></tr>
  <tr><td class="lbl">Raison sociale / Nom</td><td colspan="3" class="l">${v(f.raisonSociale)}</td><td class="lbl">Forme juridique</td><td style="width:24%;white-space:nowrap">${opts(OPTIONS.formeJuridique, o => f.formeJuridique === o)}</td></tr>
  <tr><td class="lbl">Enseigne commerciale</td><td colspan="3" class="l">${v(f.enseigne)}</td><td class="lbl">Activité</td><td class="l">${v(f.activite)}</td></tr>
  <tr><td class="lbl">Adresse du siège</td><td colspan="3" class="l">${v(f.adresse)}</td><td class="lbl">Ville</td><td class="l">${v(f.ville)}</td></tr>
  <tr><td class="lbl">R.C N° / Tribunal</td><td class="l" style="width:20%">${v([f.rc, f.tribunal].filter(Boolean).join(' / '))}</td><td class="lbl">I.F</td><td class="l" style="width:17%">${v(f.ifiscal)}</td><td class="lbl">ICE</td><td class="l">${v(f.ice)}</td></tr>
  <tr><td class="lbl">Patente (T.P)</td><td class="l">${v(f.patente)}</td><td class="lbl">CNSS</td><td class="l">${v(f.cnss)}</td><td class="lbl">Capital (DH)</td><td class="l">${v(f.capital)}</td></tr>
  <tr><td class="lbl">Téléphone</td><td class="l">${v(f.tel)}</td><td class="lbl">Gsm</td><td class="l">${v(f.gsm)}</td><td class="lbl">E-mail</td><td class="l">${v(f.email)}</td></tr>
</table>

<h2>2. RESPONSABLES ET ADRESSE D'ENLÈVEMENT</h2>
<table>
  <tr><th style="width:21%"></th><th>Nom et prénom</th><th style="width:14%">N° CIN</th><th style="width:15%">Gsm</th><th style="width:24%">E-mail</th></tr>
  ${([['Gérant / représentant légal', p(f.gerant)], ['Contact expéditions', p(f.contactExp)], ['Contact comptabilité', p(f.contactCompta)]] as [string, Person][])
    .map(([lab, x]) => `<tr><td class="lbl">${lab}</td><td class="l">${v(x.nom)}</td><td class="l">${v(x.cin)}</td><td class="l">${v(x.gsm)}</td><td class="l">${v(x.email)}</td></tr>`).join('')}
  <tr><td class="lbl">Adresse de ramassage</td><td colspan="2" class="l">${v(f.ramassageAdresse)}</td><td class="lbl">Horaires</td><td class="l">${v(f.ramassageHoraires)}</td></tr>
</table>

<h2>3. SERVICES, PORT ET FACTURATION</h2>
<table>
  <tr><td class="lbl">Services</td><td colspan="3">${opts(OPTIONS.services, o => has(f.services, o))}</td></tr>
  <tr><td class="lbl">COD accepté en</td><td style="white-space:nowrap">${opts(OPTIONS.codModes, o => has(f.codModes, o))}</td><td class="lbl">Volume mensuel estimé</td><td class="l">${a ? `${v(f.volumeMensuel || '....')} expéditions · ${v(f.poidsMoyen || '....')} kg moyen` : '........ expéditions · ........ kg moyen'}</td></tr>
  <tr><td class="lbl">Paiement du port</td><td colspan="3">${opts(OPTIONS.portModes, o => has(f.portModes, o))}</td></tr>
  <tr><td class="lbl">Facturation</td><td>${box(true).replace('class="box', 'class="box f')}Mensuelle</td><td class="lbl">Délai de paiement</td><td>${opts(OPTIONS.delaiPaiement, o => f.delaiPaiement === o)}</td></tr>
  <tr><td class="lbl">Règlement des factures</td><td colspan="3">${opts(OPTIONS.reglementModes, o => has(f.reglementModes, o))} &nbsp;·&nbsp; Plafond de crédit accordé : ${f.plafondCredit ? `<b>${v(f.plafondCredit)}</b>` : '....................'} DH</td></tr>
</table>

<h2>4. TARIFS CONVENUS (HT)</h2>
<table>
  <tr><th>Zone</th><th style="width:18%">Colis jusqu'à ..... kg (DH)</th><th style="width:16%">Kg supplémentaire (DH)</th><th style="width:16%">Frais COD</th><th style="width:16%">Retour / BL (DH)</th></tr>
  <tr><td colspan="5" class="tarif">VOIR CONTRAT D'ENGAGEMENT</td></tr>
</table>

<h2>5. RESTITUTION DES RETOURS DE FONDS (COD)</h2>
<table>
  <tr><td class="lbl">Mode</td><td>${opts(OPTIONS.restitutionMode, o => f.restitutionMode === o)}</td><td class="lbl">Périodicité</td><td>${opts(OPTIONS.restitutionPeriodicite, o => f.restitutionPeriodicite === o)}</td></tr>
  <tr><td class="lbl">Banque / Agence</td><td class="l">${v(f.banque)}</td><td class="lbl">Titulaire du compte</td><td class="l">${v(f.titulaire)}</td></tr>
  <tr><td class="lbl">RIB (24 chiffres)</td><td colspan="3" style="padding:0"><table class="rib"><tr>${ribCells}</tr></table></td></tr>
</table>

<h2>6. DOCUMENTS À JOINDRE</h2>
<table><tr><td style="font-size:7pt">${opts(OPTIONS.documents, o => has(f.documents, o))}</td></tr></table>

<h2>7. CONDITIONS GÉNÉRALES</h2>
<div class="cg">
  <p><b>1. Objet.</b> Une fois acceptée par BG EXPRESS, la présente demande ouvre au client un compte d'expédition aux conditions ci-dessus et à celles du contrat d'engagement.</p>
  <p><b>2. Expéditions.</b> Colis emballés et étiquetés, bon d'expédition complet (destinataire, téléphone, ville, montant du COD). Les marchandises interdites, dangereuses, illicites ou périssables sont refusées.</p>
  <p><b>3. Contre-remboursement.</b> BG EXPRESS encaisse le montant indiqué sur le bon dans le mode convenu et le restitue au client selon la périodicité choisie. Les chèques et traites sont remis tels que reçus, sans garantie de provision.</p>
  <p><b>4. Paiement.</b> Les ports en compte sont facturés mensuellement et payables dans le délai indiqué ; un retard peut entraîner la suspension du compte.</p>
  <p><b>5. Responsabilité.</b> Sauf déclaration de valeur acceptée par écrit, la responsabilité de BG EXPRESS est limitée selon la réglementation marocaine du transport. Réserves écrites sous 48 h après livraison. Les retours sont facturés selon le contrat d'engagement.</p>
  <p><b>6. Données personnelles.</b> Loi n° 09-08 : droit d'accès, de rectification et d'opposition auprès de BG EXPRESS. <b>7. Litiges :</b> tribunaux du siège de BG EXPRESS.</p>
</div>

<div class="sign">
  <div><b>Le client</b> — « Lu et approuvé », date, cachet et signature :</div>
  <div><b>BG EXPRESS</b> — date, cachet et signature :</div>
</div>
<div class="admin"><b>Réservé à BG EXPRESS :</b> Code client ${a ? `<b>${v(f.accountNumber)}</b>` : '..................'} · Agence ${a ? v(f.agence || f.city) : '..................'} · Commercial ${a && f.commercial ? v(f.commercial) : '..................'} · Date d'ouverture ${fr(f.dateOuverture)} · Dossier complet ${box(false)}Oui ${box(false)}Non · Validé par ..................</div>

<div class="foot">
  <span><b>BG EXPRESS</b></span><span>R.C : 17447</span><span>T.P : 49803403</span><span>I.F : 31837263</span><span>CNSS : 1143595</span><span>ICE : 002158803000007</span><br>
  <span class="rib-bg">RIB BG EXPRESS — ATTIJARIWAFA BANK : 007 022 001359000000140 80</span>
</div>
</div>
<script>window.onload = function () { setTimeout(function () { window.print() }, 350) }<\/script>
</body></html>`
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) { alert("Autorisez les fenêtres pour imprimer."); return }
  w.document.open(); w.document.write(html); w.document.close()
}
