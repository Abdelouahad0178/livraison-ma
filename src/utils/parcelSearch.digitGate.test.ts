// Le pré-filtre par chiffres (29/10/2026) de makeAgentSearchMatcher doit donner EXACTEMENT les mêmes résultats
// que la règle d'avant (reproduite ici) : champ normalisé contient le terme, ou forme compacte contient le terme compact.
import { describe, it, expect } from 'vitest'
import { makeAgentSearchMatcher } from './parcelSearch'
import { normText } from './normText'
import { normName } from './billingAgency'

const compact = (v: unknown) => normName(v).replace(/[^a-z0-9]/g, '')
const fields = (p: any): unknown[] => [
  p.id, p.trackingId, p.senderNic, p.sender?.nic,
  p.clientName, p.sender?.name, p.sender?.tel, p.sender?.city, p.originCity,
  p.receiver?.name, p.receiver?.tel, p.receiver?.city, p.destinationCity,
]
function oldMatch(query: string, scope: string, p: any): boolean {
  const q = normText(query)
  if (!q) return true
  const cq = compact(q)
  return fields(p).some((v, i) => {
    if ((scope === 'receiver' && i >= 4 && i <= 8) || (scope === 'sender' && i >= 9)) return false
    const raw = normText(v)
    return raw.includes(q) || compact(raw).includes(cq)
  })
}

const VALUES = ['1085829D', '1085829d', '108-5829 D', '1085829', '10858290X', 'LMA1085829D', 'Café 1085829D', 'COPÏMA 12A',
  '06 12 34 56 78', '0612345678', 'Rabat', 'Aït Melloul', '  1085 829d  ', null, undefined, 1085829, 'x9y8z7', 'ÉPICERIE 2B']
const parcels = VALUES.flatMap((v, k) => [
  { id: 'id' + k, trackingId: v, sender: { name: VALUES[(k + 3) % VALUES.length], tel: VALUES[(k + 5) % VALUES.length] }, receiver: { name: v, city: 'Agadir' } },
  { id: 'p' + k, senderNic: v, clientName: VALUES[(k + 7) % VALUES.length], receiver: { tel: VALUES[(k + 1) % VALUES.length] } },
  Object.freeze({ id: 'f' + k, sender: { nic: v } }),
])
const QUERIES = ['1085829D', '1085829d', '108 5829d', '5829d', 'lma1085829', '12a', 'copima 12a', '34 56', '612345678x',
  'x9y8', '9y8z7', 'epicerie 2b', 'café 1085', 'D', 'ab', '829', '1085829', 'Rabat']

describe('makeAgentSearchMatcher — pré-filtre par chiffres', () => {
  for (const scope of ['all', 'sender', 'receiver']) {
    it(`mêmes résultats qu'avant (scope ${scope})`, () => {
      for (const q of QUERIES) {
        const m = makeAgentSearchMatcher(q, scope)
        // deux passages : le 2e utilise le cache des chiffres / formes normalisées
        for (let pass = 0; pass < 2; pass++) {
          const got = parcels.filter(p => m(p)).map(p => p.id)
          const want = parcels.filter(p => (/^\d+$/.test(normText(q)) ? null : true) && oldMatch(q, scope, p)).map(p => p.id)
          if (/^\d+$/.test(normText(q))) continue // chiffres seuls : autre règle (inchangée)
          expect(got, `${q} / ${scope}`).toEqual(want)
        }
      }
    })
  }
})
