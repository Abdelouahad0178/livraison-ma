import { describe, it, expect } from 'vitest'
import { sameNonFunctionValues, sameDeps, buildRelayedValue } from './useStableCtxValue'

describe('contexte AgentCtx stabilisé', () => {
  it('ignore les fonctions recréées, détecte toute autre valeur changée', () => {
    const list = [1, 2]
    const a = { profile: { city: 'Agadir' }, parcels: list, n: 1, fn: () => 1 }
    const b = { profile: a.profile, parcels: list, n: 1, fn: () => 2 }
    expect(sameNonFunctionValues(a, b)).toBe(true)
    // Liste recalculée à l'identique (mêmes éléments, même ordre) = pas de changement ; sinon changement
    expect(sameNonFunctionValues(a, { ...b, parcels: [1, 2] })).toBe(true)
    expect(sameNonFunctionValues(a, { ...b, parcels: [2, 1] })).toBe(false)
    expect(sameNonFunctionValues(a, { ...b, parcels: [1, 2, 3] })).toBe(false)
    expect(sameNonFunctionValues({ o: { x: 1 } }, { o: { x: 1 } })).toBe(false) // objets : identité
    const el = { id: 'a' }
    expect(sameNonFunctionValues({ l: [el] }, { l: [{ ...el }] })).toBe(false) // élément modifié = nouvel objet
    expect(sameNonFunctionValues(a, { ...b, n: 2 })).toBe(false)
    expect(sameNonFunctionValues(a, { ...b, extra: 1 })).toBe(false)
    const { n: _n, ...noN } = b
    expect(sameNonFunctionValues(a, { ...noN, other: 1 })).toBe(false)
    expect(sameNonFunctionValues({ x: NaN }, { x: NaN })).toBe(true)
    expect(sameNonFunctionValues({ f: () => 1 }, { f: 1 })).toBe(false)
  })

  it('états cachés comparés un à un', () => {
    const perms = { edit: true }
    expect(sameDeps([perms, 1], [perms, 1])).toBe(true)
    expect(sameDeps([perms, 1], [{ edit: true }, 1])).toBe(false)
    expect(sameDeps([1], [1, 2])).toBe(false)
  })

  it('les relais appellent toujours la DERNIÈRE version de la fonction', () => {
    const latest = { current: { get: () => 'v1', value: 3 } as Record<string, any> }
    const v = buildRelayedValue(latest.current, latest)
    expect(v.value).toBe(3)
    expect(v.get()).toBe('v1')
    latest.current = { get: (x: string) => 'v2' + (x || ''), value: 3 }
    expect(v.get('!')).toBe('v2!')
  })
})
