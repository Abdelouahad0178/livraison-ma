/**
 * 🖨️ Bons de ramassage « 2 exemplaires sur une feuille A4 » (@page margin 5 mm) : chaque exemplaire, mis en page à
 * 148 mm de large à l'écran, est agrandi à l'impression (zoom proportionnel) au maximum qui tient dans la largeur
 * utile (198 mm) ET dans une demi-page (138 mm), puis étiré à cette demi-page (zone de cachet / signature agrandie)
 * → les 2 exemplaires couvrent ≈ 95 % de la feuille, sans déborder sur une 2e page.
 * Utilisé par printAgentTicket (Expéditions / admin), printParcelTicket (Facturier) et NewTab (après création).
 */
const MM = 96 / 25.4
const FIT_W = 198 * MM
const FIT_H = 138 * MM

/**
 * Script autonome pour la fenêtre d'impression (exemplaires « .copy », trait de coupe « .cut-line »).
 * autoPrint : appliqué au chargement puis impression ; sinon appliqué au chargement et avant chaque impression.
 */
export const fitA4Script = (autoPrint: boolean) => `function bgxFitA4() {
  try {
    var W = ${FIT_W}, H = ${FIT_H}, h = 0, w = 0;
    document.querySelectorAll('.copy').forEach(function (c) { h = Math.max(h, c.offsetHeight); w = Math.max(w, c.offsetWidth); });
    if (w && h) {
      var z = Math.min(W / w, H / h);
      var st = document.getElementById('bgx-fit-a4') || document.head.appendChild(document.createElement('style'));
      st.id = 'bgx-fit-a4';
      st.textContent = '@media print { .copy { zoom: ' + z + '; min-height: ' + (H / z) + 'px; } .cut-line { zoom: ' + z + '; } }';
    }
  } catch (e) {}
}
${autoPrint
    ? 'window.onload = function () { bgxFitA4(); window.print(); };'
    : "window.addEventListener('load', bgxFitA4); window.addEventListener('beforeprint', bgxFitA4);"}`
