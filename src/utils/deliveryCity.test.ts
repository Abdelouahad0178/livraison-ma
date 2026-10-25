import { describe, it, expect } from 'vitest'
import { deliveryCityBlock } from './deliveryCity'

describe('deliveryCityBlock', () => {
  const toCasa = { status: 'Arrivé en agence', destinationCity: 'Casablanca' }
  it('refuse le chef d\'agence / agent pro / aide agent d\'une autre ville', () => {
    for (const role of ['chef_agence', 'agentpro', 'aide_agent']) expect(deliveryCityBlock(role, 'Marrakech', toCasa)).toMatch(/Casablanca/)
  })
  it('autorise l\'agence de destination', () => {
    expect(deliveryCityBlock('chef_agence', 'Casablanca', toCasa)).toBeNull()
  })
  it('ne concerne pas les autres rôles', () => {
    for (const role of ['livreur', 'livreur-gare', 'chef_exploitation', 'admin']) expect(deliveryCityBlock(role, 'Marrakech', toCasa)).toBeNull()
  })
  it('ignore une expédition déjà livrée', () => {
    expect(deliveryCityBlock('chef_agence', 'Marrakech', { ...toCasa, status: 'Livré' })).toBeNull()
  })
})

import { collectCityBlock } from './deliveryCity'
describe('collectCityBlock — COD / port dû encaissés par la destination', () => {
  const p = { destinationCity: 'Marrakech', senderNic: '1090174' }
  it('refuse le chef d\'exploitation de la ville d\'origine', () => {
    expect(collectCityBlock('chef_exploitation', 'Agadir', p)).toMatch(/Marrakech/)
    expect(collectCityBlock('chef_agence', 'Agadir', p, 'port dû')).toMatch(/port dû/)
  })
  it('autorise la destination et les autres rôles ; refuse aussi la voisine Agadir ⇄ Ait Melloul', () => {
    expect(collectCityBlock('chef_exploitation', 'Marrakech', p)).toBeNull()
    expect(collectCityBlock('chef_exploitation', 'Agadir', { destinationCity: 'Ait Melloul' })).toMatch(/Ait Melloul/)
    expect(collectCityBlock('livreur', 'Agadir', p)).toBeNull()
    expect(collectCityBlock('admin', '', p)).toBeNull()
    expect(collectCityBlock('encaisseur_central', '', p)).toBeNull()
  })
})
