// Ajoute la garde d'argent moneyInvariantsOk() à CHAQUE « allow update » du bloc parcels (écriture du fichier de règles).
// Chaque règle est conservée telle quelle : « allow update: if X; » → « allow update: if moneyInvariantsOk() && (X); »
import { readFileSync, writeFileSync } from 'fs'
const src = readFileSync('firestore.rules', 'utf8')
const start = src.indexOf('match /parcels/{parcelId} {')
const end = src.indexOf('match /cities/{cityId} {')
let block = src.slice(start, end)
const FN = `match /parcels/{parcelId} {
      // 💰 GARDE D'ARGENT (diagnostic du 24/10/2026) — ajoutée à TOUTES les règles « update » ci-dessous (une règle
      // Firestore suffit à autoriser : une interdiction doit donc figurer dans chacune). Hors admin :
      // 1. un PORT DÛ déjà encaissé (collecté / reçu) ne change pas de type (avant : passé « en compte », l'argent
      //    sortait de la caisse — point 1.3) ;
      // 2. une expédition dont l'argent est encaissé (port dû ou COD) ne revient pas « Arrivé en agence » depuis
      //    « En cours de livraison » / « Livré » (avant : annulation d'assignation après encaissement — point 1.4).
      function portDuCashedBefore() {
        return resource.data.get('portType', '') in ['port_du', 'port_du_cheque']
          && resource.data.get('portStatus', null) in ['collected', 'received'];
      }
      function codCashedBefore() {
        return resource.data.get('codAmount', 0) is number && resource.data.get('codAmount', 0) > 0
          && resource.data.get('codStatus', null) != null && resource.data.get('codStatus', null) != 'pending';
      }
      function moneyInvariantsOk() {
        return isAdmin() || (
          !(portDuCashedBefore() && request.resource.data.get('portType', '') != resource.data.get('portType', ''))
          && !(request.resource.data.get('status', '') == 'Arrivé en agence'
            && resource.data.get('status', '') in ['En cours de livraison', 'Livré']
            && (portDuCashedBefore() || codCashedBefore()))
        );
      }`
block = block.replace('match /parcels/{parcelId} {', FN)
let out = '', i = 0, n = 0
while (true) {
  const k = block.indexOf('allow update: if ', i)
  if (k < 0) { out += block.slice(i); break }
  out += block.slice(i, k) + 'allow update: if ('
  let j = k + 'allow update: if '.length, inStr = false
  for (; j < block.length; j++) {
    const c = block[j]
    if (!inStr && c === '/' && block[j + 1] === '/') { const e = block.indexOf('\n', j); out += block.slice(j, e); j = e - 1; continue }
    if (c === "'") inStr = !inStr
    if (!inStr && c === ';') break
    out += c
  }
  out += ') && moneyInvariantsOk();'
  i = j + 1; n++
}
writeFileSync('firestore.rules', src.slice(0, start) + out + src.slice(end))
console.log('règles « update » modifiées :', n)
