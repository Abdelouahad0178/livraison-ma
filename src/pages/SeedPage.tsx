import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, serverTimestamp, getDocs, writeBatch, doc, Timestamp, query, where } from 'firebase/firestore'
import { db, auth } from '../firebase/config'
import { generateTrackingId, archiveParcels } from '../firebase/firestore'
import { CITIES } from '../firebase/constants'
import { Package, Trash2, Play, RefreshCw, CheckCircle2, AlertTriangle, X, Database } from 'lucide-react'

const STATUSES_HIST   = ['Livré', 'Livré', 'Livré', 'Livré', 'Retourné', 'Retourné', 'Livré']
const STATUSES_RECENT = ['Initialisé', 'Initialisé', 'Arrivé en agence', 'Arrivé en agence', 'En cours de livraison', 'Livré', 'Livré', 'Retourné']
const SERVICE_TYPES   = ['oc', 'oc', 'oc', 'especes', 'cheque', 'traite', 'retour_bl']

function randHistTimestamp() {
  const daysAgo = 90 + Math.random() * 60
  return Timestamp.fromDate(new Date(Date.now() - daysAgo * 864e5))
}

function randRecentTimestamp() {
  const daysAgo = Math.random() * 55 // entre aujourd'hui et il y a 55 jours
  return Timestamp.fromDate(new Date(Date.now() - daysAgo * 864e5))
}

function buildRecentParcel(users: any, allCities: any) {
  const agents = users.filter((u: any) => ['agent', 'chef_agence', 'aide_agent'].includes(u.role))
  if (!agents.length) return null
  const agent = agents[Math.floor(Math.random() * agents.length)]
  const from = agent.city || allCities[Math.floor(Math.random() * allCities.length)]
  const toCandidates = allCities.filter((c: any) => c !== from)
  const to = toCandidates[Math.floor(Math.random() * toCandidates.length)]
  const destAgents = users.filter((u: any) => ['agent', 'chef_agence'].includes(u.role) && u.city === to)
  const destAgent = destAgents.length ? destAgents[Math.floor(Math.random() * destAgents.length)] : null
  const status = STATUSES_RECENT[Math.floor(Math.random() * STATUSES_RECENT.length)]
  const svcType = SERVICE_TYPES[Math.floor(Math.random() * SERVICE_TYPES.length)]
  const isCod = ['especes', 'cheque', 'traite'].includes(svcType)
  const codAmount = isCod ? Math.round((100 + Math.random() * 900) / 50) * 50 : 0
  const ts = randRecentTimestamp()
  const senderNames = ['Mohammed Alami', 'Fatima Benali', 'Youssef Chraibi', 'Khadija Idrissi', 'Omar Tazi', 'Aicha Bennani']
  const recNames = ['Sara Lahlou', 'Hamid Ouazzani', 'Nadia Sefrioui', 'Rachid Fassi', 'Leila Amrani', 'Karim Berrada']
  const isTerminal = ['Livré', 'Retourné'].includes(status)
  return {
    trackingId: generateTrackingId(),
    status,
    sender: {
      name: senderNames[Math.floor(Math.random() * senderNames.length)],
      tel: '066' + String(Math.floor(Math.random() * 9000000) + 1000000),
      city: from, address: 'Rue Hassan II N°' + Math.floor(Math.random() * 100 + 1),
    },
    receiver: {
      name: recNames[Math.floor(Math.random() * recNames.length)],
      tel: '065' + String(Math.floor(Math.random() * 9000000) + 1000000),
      city: to, address: 'Bd Mohammed V N°' + Math.floor(Math.random() * 100 + 1),
    },
    originCity: from, destinationCity: to,
    natureOfGoods: ['Textile', 'Électronique', 'Alimentation', 'Cosmétique', 'Pièces auto'][Math.floor(Math.random() * 5)],
    serviceType: svcType,
    weight: [1, 2, 3, 5, 8][Math.floor(Math.random() * 5)],
    nbColis: [1, 1, 1, 2][Math.floor(Math.random() * 4)],
    price: Math.round((30 + Math.random() * 40) / 5) * 5,
    codAmount,
    codStatus: isCod ? (isTerminal ? 'collected' : 'pending') : null,
    codPaymentType: isCod ? svcType : null,
    portType: 'port_paye',
    agentId: agent.id, agentName: agent.name || '', agentRole: agent.role,
    destinationAgentId: destAgent?.id || null, destinationAgentName: destAgent?.name || null,
    visibleInDestinationAgency: !!destAgent,
    chauffeurId: null, chauffeurName: null, deliveryDriverId: null, deliveryDriverName: null,
    shipmentLoadedAt: null, destinationArrivedAt: null,
    createdAt: ts,
    history: [{ status: 'Initialisé', timestamp: ts.toDate().toISOString(), note: 'Colis récent (seed)' }],
    validatedByChef: null, aideEditUnlocked: false, photoUrl: '',
    clientId: null, clientName: null,
    _seedRecent: true,
  }
}

function buildHistParcel(users: any, allCities: any) {
  const agents = users.filter((u: any) => ['agent', 'chef_agence', 'aide_agent'].includes(u.role))
  if (!agents.length) return null
  const agent = agents[Math.floor(Math.random() * agents.length)]
  const from = agent.city || allCities[Math.floor(Math.random() * allCities.length)]
  const toCandidates = allCities.filter((c: any) => c !== from)
  const to = toCandidates[Math.floor(Math.random() * toCandidates.length)]
  const destAgents = users.filter((u: any) => ['agent', 'chef_agence'].includes(u.role) && u.city === to)
  const destAgent = destAgents.length ? destAgents[Math.floor(Math.random() * destAgents.length)] : null
  const status = STATUSES_HIST[Math.floor(Math.random() * STATUSES_HIST.length)]
  const svcType = SERVICE_TYPES[Math.floor(Math.random() * SERVICE_TYPES.length)]
  const isCod = ['especes', 'cheque', 'traite'].includes(svcType)
  const codAmount = isCod ? Math.round((100 + Math.random() * 900) / 50) * 50 : 0
  const ts = randHistTimestamp()
  const senderNames = ['Mohammed Alami', 'Fatima Benali', 'Youssef Chraibi', 'Khadija Idrissi', 'Omar Tazi', 'Aicha Bennani']
  const recNames = ['Sara Lahlou', 'Hamid Ouazzani', 'Nadia Sefrioui', 'Rachid Fassi', 'Leila Amrani', 'Karim Berrada']
  return {
    trackingId: generateTrackingId(),
    status,
    sender: {
      name: senderNames[Math.floor(Math.random() * senderNames.length)],
      tel: '066' + String(Math.floor(Math.random() * 9000000) + 1000000),
      city: from,
      address: 'Rue Hassan II N°' + Math.floor(Math.random() * 100 + 1),
    },
    receiver: {
      name: recNames[Math.floor(Math.random() * recNames.length)],
      tel: '065' + String(Math.floor(Math.random() * 9000000) + 1000000),
      city: to,
      address: 'Bd Mohammed V N°' + Math.floor(Math.random() * 100 + 1),
    },
    originCity: from,
    destinationCity: to,
    natureOfGoods: ['Textile', 'Électronique', 'Alimentation', 'Cosmétique', 'Pièces auto'][Math.floor(Math.random() * 5)],
    serviceType: svcType,
    weight: [1, 2, 3, 5, 8][Math.floor(Math.random() * 5)],
    nbColis: [1, 1, 1, 2][Math.floor(Math.random() * 4)],
    price: Math.round((30 + Math.random() * 40) / 5) * 5,
    codAmount,
    codStatus: isCod ? (status === 'Livré' ? 'collected' : 'pending') : null,
    codSenderPaid: isCod && status === 'Livré' ? true : false,
    codPaymentType: isCod ? svcType : null,
    portType: 'port_paye',
    agentId: agent.id,
    agentName: agent.name || '',
    agentRole: agent.role,
    destinationAgentId: destAgent?.id || null,
    destinationAgentName: destAgent?.name || null,
    visibleInDestinationAgency: !!destAgent,
    chauffeurId: null,
    chauffeurName: null,
    deliveryDriverId: null,
    deliveryDriverName: null,
    shipmentLoadedAt: null,
    destinationArrivedAt: null,
    chefPointedAt: null,
    createdAt: ts,
    history: [{ status: 'Initialisé', timestamp: ts.toDate().toISOString(), note: 'Colis historique (seed)' }],
    validatedByChef: null,
    aideEditUnlocked: false,
    photoUrl: '',
    clientId: null,
    clientName: null,
    _seedHistorique: true,
  }
}

// â"€â"€ Paires de villes pour les tests â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const PAIRS = [
  { from: 'Casablanca', to: 'Marrakech' },
  { from: 'Casablanca', to: 'Agadir' },
  { from: 'Rabat',      to: 'Fès' },
  { from: 'Tanger',     to: 'Casablanca' },
  { from: 'Marrakech',  to: 'Casablanca' },
  { from: 'Agadir',     to: 'Rabat' },
  { from: 'Fès',        to: 'Tanger' },
]

const GOODS = ['Textile', 'Électronique', 'Alimentation', 'Cosmétique', 'Pièces auto', 'Matériel BTP', 'Bijoux']

const rand = (arr: any) => arr[Math.floor(Math.random() * arr.length)]
const randAmount = (min: any, max: any) => Math.round((Math.random() * (max - min) + min) / 50) * 50
const now = () => new Date().toISOString()
const ago = (h: any) => new Date(Date.now() - h * 3600000).toISOString()

function makeSender(city: any) {
  const names = ['Mohammed Alami', 'Fatima Benali', 'Youssef Chraibi', 'Khadija Idrissi', 'Omar Tazi', 'Aicha Bennani']
  const tels = ['0661234567', '0641234567', '0621234567', '0671234567', '0691234567']
  return { name: rand(names), tel: rand(tels), city, address: `${rand(['Rue', 'Av.', 'Bd'])} ${rand(['Hassan II', 'Mohammed V', 'Zerktouni'])} N°${Math.floor(Math.random()*100)+1}` }
}

function makeReceiver(city: any) {
  const names = ['Sara Lahlou', 'Hamid Ouazzani', 'Nadia Sefrioui', 'Rachid Fassi', 'Leila Amrani', 'Karim Berrada']
  const tels = ['0652345678', '0612345678', '0632345678', '0672345678', '0698765432']
  return { name: rand(names), tel: rand(tels), city, address: `Quartier ${rand(['Hay Riad', 'Guéliz', 'Agdal', 'Massira', 'Hay Salam'])} N°${Math.floor(Math.random()*50)+1}` }
}

// â"€â"€ Étapes à créer â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const STAGES = [
  {
    id: 'init',
    label: 'Étape 0 - Initialisé',
    desc: 'Colis enregistré en agence, pas encore chargé',
    color: 'gray',
    build: (pair: any, users: any) => {
      const agent = pickUser(users, ['agent', 'chef_agence', 'aide_agent'], pair.from)
      if (!agent) return null
      const codAmount = randAmount(100, 500)
      return {
        trackingId: generateTrackingId(),
        status: 'Initialisé',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([1, 2, 3, 5, 8]),
        nbColis: rand([1, 1, 2]),
        price: randAmount(30, 60),
        codAmount,
        codStatus: 'pending',
        codPaymentType: null,
        portType: rand(['port_paye', 'port_paye', 'port_du']),
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: null,
        deliveryDriverName: null,
        destinationAgentId: null,
        destinationAgentName: null,
        visibleInDestinationAgency: false,
        shipmentLoadedAt: null,
        destinationArrivedAt: null,
        chefPointedAt: null,
        history: [{ status: 'Initialisé', timestamp: ago(5), note: 'Colis enregistré en agence (test seed)' }],
        createdAt: serverTimestamp(),
        validatedByChef: agent.role === 'aide_agent' ? false : null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'transit',
    label: 'Étape 1 - En transit',
    desc: 'Chargé sur camion, en route vers destination',
    color: 'blue',
    build: (pair: any, users: any) => {
      const agent = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const chauffeur = pickUser(users, ['chauffeur'], pair.from) || pickUser(users, ['chauffeur'], undefined)
      if (!agent || !chauffeur) return null
      const codAmount = randAmount(200, 800)
      return {
        trackingId: generateTrackingId(),
        status: 'En transit',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([2, 5, 10]),
        nbColis: rand([1, 2, 3]),
        price: randAmount(35, 70),
        codAmount,
        codStatus: 'pending',
        codPaymentType: null,
        portType: 'port_paye',
        agentId: agent.id,
        agentName: agent.name,
        agentRole: 'agent',
        chauffeurId: chauffeur.id,
        chauffeurName: chauffeur.name,
        deliveryDriverId: null,
        deliveryDriverName: null,
        destinationAgentId: null,
        destinationAgentName: null,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(3),
        destinationArrivedAt: null,
        chefPointedAt: null,
        history: [
          { status: 'Initialisé', timestamp: ago(6), note: 'Colis enregistré' },
          { status: 'En transit', timestamp: ago(3), note: `Chargé sur ${chauffeur.name}` },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'arrived_no_point',
    label: 'Étape 3 - Arrivé (à pointer)',
    desc: 'Arrivé en agence destination, chef doit pointer',
    color: 'purple',
    build: (pair: any, users: any) => {
      const agentOrigin = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const agentDest = pickUser(users, ['agent', 'chef_agence', 'aide_agent'], pair.to)
      const chauffeur = pickUser(users, ['chauffeur'], undefined) || agentOrigin
      if (!agentOrigin || !agentDest) return null
      const codAmount = randAmount(150, 600)
      return {
        trackingId: generateTrackingId(),
        status: 'Arrivé en agence',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([1, 3, 5]),
        nbColis: 1,
        price: randAmount(30, 55),
        codAmount,
        codStatus: 'pending',
        codPaymentType: null,
        portType: 'port_paye',
        agentId: agentOrigin.id,
        agentName: agentOrigin.name,
        agentRole: 'agent',
        chauffeurId: chauffeur?.id || null,
        chauffeurName: chauffeur?.name || null,
        deliveryDriverId: null,
        deliveryDriverName: null,
        destinationAgentId: agentDest.id,
        destinationAgentName: agentDest.name,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(10),
        destinationArrivedAt: ago(1),
        chefPointedAt: null,
        history: [
          { status: 'Initialisé', timestamp: ago(12), note: 'Colis enregistré' },
          { status: 'En transit', timestamp: ago(10), note: 'Chargé sur camion' },
          { status: 'Arrivé en agence', timestamp: ago(1), note: 'Réceptionné - en attente de pointage chef' },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'arrived_pointed',
    label: 'Étape 3bis - Pointé par chef (prêt à assigner)',
    desc: 'Arrivé + chef pointé, peut être assigné à un livreur',
    color: 'amber',
    build: (pair: any, users: any) => {
      const agentOrigin = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const agentDest = pickUser(users, ['agent', 'chef_agence'], pair.to)
      const chef = pickUser(users, ['chef_agence'], pair.to) || agentDest
      if (!agentOrigin || !agentDest) return null
      const codAmount = randAmount(100, 500)
      return {
        trackingId: generateTrackingId(),
        status: 'Arrivé en agence',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([1, 2, 4]),
        nbColis: 1,
        price: randAmount(30, 55),
        codAmount,
        codStatus: 'pending',
        codPaymentType: null,
        portType: 'port_paye',
        agentId: agentOrigin.id,
        agentName: agentOrigin.name,
        agentRole: 'agent',
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: null,
        deliveryDriverName: null,
        destinationAgentId: agentDest.id,
        destinationAgentName: agentDest.name,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(14),
        destinationArrivedAt: ago(3),
        chefPointedAt: ago(2),
        chefPointedBy: chef?.name || agentDest.name,
        chefPointedById: chef?.id || agentDest.id,
        history: [
          { status: 'Initialisé', timestamp: ago(16), note: 'Colis enregistré' },
          { status: 'En transit', timestamp: ago(14), note: 'Chargé sur camion' },
          { status: 'Arrivé en agence', timestamp: ago(3), note: 'Réceptionné' },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'delivery',
    label: 'Étape 4 - En cours de livraison',
    desc: 'Assigné à un livreur, en cours de livraison',
    color: 'orange',
    build: (pair: any, users: any) => {
      const agentOrigin = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const agentDest = pickUser(users, ['agent', 'chef_agence'], pair.to)
      const chef = pickUser(users, ['chef_agence'], pair.to) || agentDest
      const livreur = pickUser(users, ['livreur'], pair.to) || pickUser(users, ['chauffeur'], pair.to)
      if (!agentOrigin || !agentDest || !livreur) return null
      const codAmount = randAmount(200, 700)
      return {
        trackingId: generateTrackingId(),
        status: 'En cours de livraison',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([1, 2, 3]),
        nbColis: 1,
        price: randAmount(30, 55),
        codAmount,
        codStatus: 'pending',
        codPaymentType: null,
        portType: rand(['port_paye', 'port_du']),
        agentId: agentOrigin.id,
        agentName: agentOrigin.name,
        agentRole: 'agent',
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: livreur.id,
        deliveryDriverName: livreur.name,
        deliverySectorId: null,
        deliverySectorName: '',
        deliveryAssignedAt: ago(1),
        deliveryAssignedBy: agentDest.name,
        destinationAgentId: agentDest.id,
        destinationAgentName: agentDest.name,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(20),
        destinationArrivedAt: ago(5),
        chefPointedAt: ago(4),
        chefPointedBy: chef?.name || agentDest.name,
        chefPointedById: chef?.id || agentDest.id,
        history: [
          { status: 'Initialisé', timestamp: ago(22), note: 'Colis enregistré' },
          { status: 'En transit', timestamp: ago(20), note: 'Chargé' },
          { status: 'Arrivé en agence', timestamp: ago(5), note: 'Réceptionné' },
          { status: 'En cours de livraison', timestamp: ago(1), note: `Assigné à ${livreur.name}` },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'delivered_especes',
    label: 'Étape 5a - Livré (espèces)',
    desc: 'Livré avec RETOUR FOND espèces collecté, à pointer par pointeur',
    color: 'green',
    build: (pair: any, users: any) => {
      const agentOrigin = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const agentDest = pickUser(users, ['agent', 'chef_agence'], pair.to)
      const chef = pickUser(users, ['chef_agence'], pair.to) || agentDest
      const livreur = pickUser(users, ['livreur'], pair.to) || pickUser(users, ['chauffeur'], pair.to)
      if (!agentOrigin || !agentDest || !livreur) return null
      const codAmount = randAmount(200, 600)
      return {
        trackingId: generateTrackingId(),
        status: 'Livré',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([1, 2]),
        nbColis: 1,
        price: randAmount(30, 55),
        codAmount,
        codStatus: 'collected',
        codPaymentType: 'especes',
        codCollectedAt: ago(0.5),
        codCollectedBy: livreur.name,
        codCollectedById: livreur.id,
        portType: 'port_paye',
        agentId: agentOrigin.id,
        agentName: agentOrigin.name,
        agentRole: 'agent',
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: livreur.id,
        deliveryDriverName: livreur.name,
        destinationAgentId: agentDest.id,
        destinationAgentName: agentDest.name,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(25),
        destinationArrivedAt: ago(8),
        chefPointedAt: ago(7),
        chefPointedBy: chef?.name || agentDest.name,
        chefPointedById: chef?.id || agentDest.id,
        history: [
          { status: 'Initialisé', timestamp: ago(27), note: 'Colis enregistré' },
          { status: 'En transit', timestamp: ago(25), note: 'Chargé' },
          { status: 'Arrivé en agence', timestamp: ago(8), note: 'Réceptionné' },
          { status: 'En cours de livraison', timestamp: ago(4), note: `Assigné à ${livreur.name}` },
          { status: 'Livré', timestamp: ago(0.5), note: `Livré · Espèces ${codAmount} DH collectés` },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'delivered_cheque',
    label: 'Étape 5b - Livré (chèque, à contrôler)',
    desc: 'Livré avec chèque collecté - contrôle document requis',
    color: 'blue',
    build: (pair: any, users: any) => {
      const agentOrigin = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const agentDest = pickUser(users, ['agent', 'chef_agence'], pair.to)
      const chef = pickUser(users, ['chef_agence'], pair.to) || agentDest
      const livreur = pickUser(users, ['livreur'], pair.to) || pickUser(users, ['chauffeur'], pair.to)
      if (!agentOrigin || !agentDest || !livreur) return null
      const codAmount = randAmount(300, 1000)
      return {
        trackingId: generateTrackingId(),
        status: 'Livré',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'cc',
        weight: rand([2, 5, 8]),
        nbColis: rand([1, 2]),
        price: randAmount(35, 65),
        codAmount,
        codStatus: 'collected',
        codPaymentType: 'cheque',
        codCollectedAt: ago(1),
        codCollectedBy: livreur.name,
        codCollectedById: livreur.id,
        portType: 'port_paye',
        agentId: agentOrigin.id,
        agentName: agentOrigin.name,
        agentRole: 'agent',
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: livreur.id,
        deliveryDriverName: livreur.name,
        destinationAgentId: agentDest.id,
        destinationAgentName: agentDest.name,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(30),
        destinationArrivedAt: ago(10),
        chefPointedAt: ago(9),
        chefPointedBy: chef?.name || agentDest.name,
        chefPointedById: chef?.id || agentDest.id,
        history: [
          { status: 'Initialisé', timestamp: ago(32), note: 'Colis enregistré - Contre-chèque' },
          { status: 'En transit', timestamp: ago(30), note: 'Chargé' },
          { status: 'Arrivé en agence', timestamp: ago(10), note: 'Réceptionné' },
          { status: 'En cours de livraison', timestamp: ago(5), note: `Assigné à ${livreur.name}` },
          { status: 'Livré', timestamp: ago(1), note: `Livré · Chèque ${codAmount} DH collecté` },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'returned',
    label: 'Étape 5c - Retourné',
    desc: 'Livraison échouée, colis retourné en agence',
    color: 'red',
    build: (pair: any, users: any) => {
      const agentOrigin = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const agentDest = pickUser(users, ['agent', 'chef_agence'], pair.to)
      const chef = pickUser(users, ['chef_agence'], pair.to) || agentDest
      const livreur = pickUser(users, ['livreur'], pair.to) || pickUser(users, ['chauffeur'], pair.to)
      if (!agentOrigin || !agentDest || !livreur) return null
      return {
        trackingId: generateTrackingId(),
        status: 'Retourné',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([1, 2]),
        nbColis: 1,
        price: randAmount(30, 55),
        codAmount: randAmount(100, 400),
        codStatus: 'pending',
        codPaymentType: null,
        portType: 'port_paye',
        agentId: agentOrigin.id,
        agentName: agentOrigin.name,
        agentRole: 'agent',
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: livreur.id,
        deliveryDriverName: livreur.name,
        destinationAgentId: agentDest.id,
        destinationAgentName: agentDest.name,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(36),
        destinationArrivedAt: ago(12),
        chefPointedAt: ago(11),
        chefPointedBy: chef?.name || agentDest.name,
        chefPointedById: chef?.id || agentDest.id,
        history: [
          { status: 'Initialisé', timestamp: ago(38), note: 'Colis enregistré' },
          { status: 'En transit', timestamp: ago(36), note: 'Chargé' },
          { status: 'Arrivé en agence', timestamp: ago(12), note: 'Réceptionné' },
          { status: 'En cours de livraison', timestamp: ago(6), note: `Assigné à ${livreur.name}` },
          { status: 'Retourné', timestamp: ago(2), note: 'Destinataire absent / refusé' },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
  {
    id: 'port_du',
    label: 'Étape - Port dû (à valider pointeur)',
    desc: 'Livré avec port dû collecté par livreur',
    color: 'teal',
    build: (pair: any, users: any) => {
      const agentOrigin = pickUser(users, ['agent', 'chef_agence'], pair.from)
      const agentDest = pickUser(users, ['agent', 'chef_agence'], pair.to)
      const chef = pickUser(users, ['chef_agence'], pair.to) || agentDest
      const livreur = pickUser(users, ['livreur'], pair.to) || pickUser(users, ['chauffeur'], pair.to)
      if (!agentOrigin || !agentDest || !livreur) return null
      const price = randAmount(30, 80)
      return {
        trackingId: generateTrackingId(),
        status: 'Livré',
        sender: makeSender(pair.from),
        receiver: makeReceiver(pair.to),
        originCity: pair.from,
        destinationCity: pair.to,
        natureOfGoods: rand(GOODS),
        serviceType: 'oc',
        weight: rand([2, 3, 5]),
        nbColis: 1,
        price,
        codAmount: 0,
        codStatus: null,
        codPaymentType: null,
        portType: 'port_du',
        portStatus: 'collected',
        portCollectedAt: ago(1),
        portCollectedBy: livreur.name,
        portCollectedById: livreur.id,
        agentId: agentOrigin.id,
        agentName: agentOrigin.name,
        agentRole: 'agent',
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: livreur.id,
        deliveryDriverName: livreur.name,
        destinationAgentId: agentDest.id,
        destinationAgentName: agentDest.name,
        visibleInDestinationAgency: true,
        shipmentLoadedAt: ago(20),
        destinationArrivedAt: ago(6),
        chefPointedAt: ago(5),
        chefPointedBy: chef?.name || agentDest.name,
        chefPointedById: chef?.id || agentDest.id,
        history: [
          { status: 'Initialisé', timestamp: ago(22), note: 'Port dû enregistré' },
          { status: 'En transit', timestamp: ago(20), note: 'Chargé' },
          { status: 'Arrivé en agence', timestamp: ago(6), note: 'Réceptionné' },
          { status: 'En cours de livraison', timestamp: ago(3), note: `Assigné à ${livreur.name}` },
          { status: 'Livré', timestamp: ago(1), note: `Livré · Port dû ${price} DH collecté` },
        ],
        createdAt: serverTimestamp(),
        validatedByChef: null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
    }
  },
]

function pickUser(users: any, roles: any, city: any) {
  const candidates = users.filter((u: any) => roles.includes(u.role) && (!city || u.city === city))
  return candidates.length ? rand(candidates) : null
}

const COLORS = {
  gray:   { bg: 'bg-gray-50',   border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-700',   dot: 'bg-gray-400'   },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500'  },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',      dot: 'bg-red-500'    },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500'   },
}

// â"€â"€ 10 expéditions Casa -> Marrakech â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const CASA_MKH_SPECS = [
  { serviceType: 'simple',    label: 'Simple',    codAmount: 0 },
  { serviceType: 'especes',   label: 'C/Espèces', codAmount: null },
  { serviceType: 'especes',   label: 'C/Espèces', codAmount: null },
  { serviceType: 'especes',   label: 'C/Espèces', codAmount: null },
  { serviceType: 'cheque',    label: 'C/Chèque',  codAmount: null },
  { serviceType: 'cheque',    label: 'C/Chèque',  codAmount: null },
  { serviceType: 'traite',    label: 'C/Traite',  codAmount: null },
  { serviceType: 'traite',    label: 'C/Traite',  codAmount: null },
  { serviceType: 'retour_bl', label: 'C/BL',      codAmount: 0 },
  { serviceType: 'retour_bl', label: 'C/BL',      codAmount: 0 },
]

export default function SeedPage() {
  const navigate = useNavigate()
  const [users,  setUsers]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<any[]>([]) // { stage, pair, ok, trackingId, error }
  const [cleared, setCleared] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [selectedStages, setSelectedStages] = useState(new Set(STAGES.map(s => s.id)))
  const [selectedPairs, setSelectedPairs] = useState(new Set(PAIRS.map(p => `${p.from}->${p.to}`)))
  const [seedingQuick, setSeedingQuick] = useState(false)
  const [quickResults, setQuickResults] = useState<any[]>([])
  const [seedingHist, setSeedingHist] = useState(false)
  const [histProgress, setHistProgress] = useState({ done: 0, total: 0, errors: 0 })
  const [histDone, setHistDone] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveProgress, setArchiveProgress] = useState({ done: 0, total: 0 })
  const [archiveDone, setArchiveDone] = useState<any>(null)
  const [archiveCity, setArchiveCity] = useState('')
  const [archiveDays, setArchiveDays] = useState(180)
  const [archiveDaysCustom, setArchiveDaysCustom] = useState('')
  const [seedingRecent, setSeedingRecent] = useState(false)
  const [recentProgress, setRecentProgress] = useState({ done: 0, total: 0, errors: 0 })
  const [recentDone, setRecentDone] = useState(false)
  const [recentCount, setRecentCount] = useState(200)

  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const usersByRole = users.reduce((acc, u) => {
    const r = u.role || 'unknown'
    acc[r] = acc[r] || []
    acc[r].push(u)
    return acc
  }, {})

  async function handleSeed() {
    setRunning(true)
    setResults([])
    const logs: any[] = []
    for (const stage of STAGES) {
      if (!selectedStages.has(stage.id)) continue
      for (const pair of PAIRS) {
        const key = `${pair.from}->${pair.to}`
        if (!selectedPairs.has(key)) continue
        try {
          const data = stage.build(pair, users)
          if (!data) {
            logs.push({ stage: stage.label, pair: key, ok: false, error: 'Utilisateurs manquants pour cette ville' })
            continue
          }
          const ref = await addDoc(collection(db, 'parcels'), data)
          logs.push({ stage: stage.label, pair: key, ok: true, trackingId: data.trackingId, id: ref.id })
        } catch (e: any) {
          logs.push({ stage: stage.label, pair: key, ok: false, error: e.message })
        }
      }
    }
    setResults(logs)
    setRunning(false)
  }

  async function handleSeedCasaMkh() {
    setSeedingQuick(true)
    setQuickResults([])
    const agent = pickUser(users, ['agent', 'chef_agence', 'aide_agent'], 'Casablanca')
    if (!agent) {
      setQuickResults([{ ok: false, error: 'Aucun agent/chef trouvé pour Casablanca. Créez d\'abord un utilisateur.' }])
      setSeedingQuick(false)
      return
    }
    const logs: any[] = []
    for (const spec of CASA_MKH_SPECS) {
      const codAmt = spec.codAmount !== null ? spec.codAmount : randAmount(200, 800)
      const trackingId = generateTrackingId()
      const data = {
        trackingId,
        status: 'Initialisé',
        sender: makeSender('Casablanca'),
        receiver: makeReceiver('Marrakech'),
        originCity: 'Casablanca',
        destinationCity: 'Marrakech',
        natureOfGoods: rand(GOODS),
        serviceType: spec.serviceType,
        weight: rand([1, 2, 3, 5]),
        nbColis: rand([1, 1, 2]),
        price: randAmount(30, 60),
        codAmount: codAmt,
        codStatus: 'pending',
        codPaymentType: null,
        portType: 'port_paye',
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        agencyCity: 'Casablanca',
        chauffeurId: null,
        chauffeurName: null,
        deliveryDriverId: null,
        deliveryDriverName: null,
        destinationAgentId: null,
        destinationAgentName: null,
        visibleInDestinationAgency: false,
        shipmentLoadedAt: null,
        destinationArrivedAt: null,
        chefPointedAt: null,
        history: [{ status: 'Initialisé', timestamp: now(), note: `Colis enregistré - ${spec.label}` }],
        createdAt: serverTimestamp(),
        validatedByChef: agent.role === 'aide_agent' ? false : null,
        aideEditUnlocked: false,
        photoUrl: '',
        clientId: null,
        clientName: null,
      }
      try {
        await addDoc(collection(db, 'parcels'), data)
        logs.push({ ok: true, trackingId, label: spec.label })
      } catch (e: any) {
        logs.push({ ok: false, label: spec.label, error: e.message })
      }
    }
    setQuickResults(logs)
    setSeedingQuick(false)
  }

  async function handleSeedHistorique(total = 20000) {
    const agents = users.filter(u => ['agent', 'chef_agence', 'aide_agent'].includes(u.role))
    if (!agents.length) { alert('Aucun agent trouvé. Créez des utilisateurs d\'abord.'); return }
    setSeedingHist(true)
    setHistDone(false)
    setHistProgress({ done: 0, total, errors: 0 })
    const BATCH_SIZE = 450
    let done = 0, errors = 0
    try {
      while (done < total) {
        const batchCount = Math.min(BATCH_SIZE, total - done)
        const batch = writeBatch(db)
        for (let i = 0; i < batchCount; i++) {
          const parcel = buildHistParcel(users, CITIES)
          if (!parcel) { errors++; continue }
          batch.set(doc(collection(db, 'parcels')), parcel)
        }
        await batch.commit()
        done += batchCount
        setHistProgress(p => ({ ...p, done, errors }))
      }
      setHistDone(true)
    } catch (e: any) {
      alert('Erreur batch : ' + e.message)
    }
    setSeedingHist(false)
  }

  async function handleClearSeedOnly() {
    if (!window.confirm('Supprimer uniquement les colis de test (_seedHistorique) ?')) return
    setClearing(true)
    try {
      const snap = await getDocs(query(collection(db, 'parcels'), where('_seedHistorique', '==', true)))
      const chunks: any[] = []
      let chunk = writeBatch(db)
      let n = 0
      for (const d of snap.docs) {
        chunk.delete(doc(db, 'parcels', d.id))
        n++
        if (n === 500) { chunks.push(chunk); chunk = writeBatch(db); n = 0 }
      }
      if (n > 0) chunks.push(chunk)
      await Promise.all(chunks.map(b => b.commit()))
      setCleared(true)
      alert(`✅ ${snap.size} colis de test supprimés. Vos vrais colis sont intacts.`)
    } catch(e: any) {
      alert('Erreur: ' + e.message)
    }
    setClearing(false)
  }

  async function handleArchive(city: any, days: any) {
    const label = days < 7 ? `${days} jour${days > 1 ? 's' : ''}` : days < 30 ? `${Math.round(days / 7)} semaine${days >= 14 ? 's' : ''}` : days < 365 ? `${Math.round(days / 30)} mois` : `${Math.round(days / 365)} an${days >= 730 ? 's' : ''}`
    if (!window.confirm(`Archiver les colis terminés (Livré/Retourné) de ${city} datant de plus de ${label} (${days} jours) ?\n\nIls seront déplacés vers "parcels_archive" et ne chargeront plus dans l'interface.`)) return
    setArchiving(true)
    setArchiveProgress({ done: 0, total: 0 })
    setArchiveDone(null)
    try {
      const result = await archiveParcels(city, days, (done?: number, total?: number) => setArchiveProgress({ done: done || 0, total: total || 0 }))
      setArchiveDone(result.archived)
    } catch(e: any) {
      alert('Erreur archivage: ' + e.message)
    }
    setArchiving(false)
  }

  async function handleSeedRecent(total: any) {
    setSeedingRecent(true)
    setRecentDone(false)
    setRecentProgress({ done: 0, total, errors: 0 })
    const BATCH_SIZE = 450
    let done = 0, errors = 0
    while (done < total) {
      const batchCount = Math.min(BATCH_SIZE, total - done)
      const batch = writeBatch(db)
      for (let i = 0; i < batchCount; i++) {
        const parcel = buildRecentParcel(users, CITIES)
        if (!parcel) { errors++; continue }
        batch.set(doc(collection(db, 'parcels')), parcel)
      }
      await batch.commit()
      done += batchCount
      setRecentProgress({ done, total, errors })
    }
    setRecentDone(true)
    setSeedingRecent(false)
  }

  async function handleClearRecentOnly() {
    if (!window.confirm('Supprimer uniquement les colis de test récents (_seedRecent) ?')) return
    setClearing(true)
    try {
      const snap = await getDocs(query(collection(db, 'parcels'), where('_seedRecent', '==', true)))
      const chunks: any[] = []
      let chunk = writeBatch(db), n = 0
      for (const d of snap.docs) {
        chunk.delete(doc(db, 'parcels', d.id))
        n++
        if (n === 500) { chunks.push(chunk); chunk = writeBatch(db); n = 0 }
      }
      if (n > 0) chunks.push(chunk)
      await Promise.all(chunks.map(b => b.commit()))
      alert(`✅ ${snap.size} colis de test récents supprimés.`)
    } catch(e: any) { alert('Erreur: ' + e.message) }
    setClearing(false)
  }

  async function handleClearParcels() {
    if (!window.confirm('Supprimer TOUS les colis ? (les utilisateurs sont préservés)')) return
    setClearing(true)
    try {
      const snap = await getDocs(collection(db, 'parcels'))
      const chunks: any[] = []
      let chunk = writeBatch(db)
      let n = 0
      for (const d of snap.docs) {
        chunk.delete(doc(db, 'parcels', d.id))
        n++
        if (n === 500) { chunks.push(chunk); chunk = writeBatch(db); n = 0 }
      }
      if (n > 0) chunks.push(chunk)
      await Promise.all(chunks.map(b => b.commit()))
      setCleared(true)
      setResults([])
    } catch(e: any) {
      alert('Erreur: ' + e.message)
    }
    setClearing(false)
  }

  const toggleStage = (id: any) => setSelectedStages(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const togglePair = (key: any) => setSelectedPairs(s => {
    const n = new Set(s)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })

  const ok  = results.filter(r => r.ok).length
  const err = results.filter(r => !r.ok).length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Package className="w-7 h-7 text-blue-400" /> Générateur de données test
            </h1>
            <p className="text-gray-400 text-sm mt-1">Crée des colis à chaque étape du circuit · Admin seulement</p>
          </div>
          <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm">
            <X className="w-4 h-4" /> Fermer
          </button>
        </div>

        {/* Utilisateurs chargés */}
        {loading ? (
          <div className="bg-gray-900 rounded-2xl p-6 text-center text-gray-400">Chargement des utilisateurs…</div>
        ) : (
          <div className="bg-gray-900 rounded-2xl p-5">
            <h2 className="font-bold text-gray-200 mb-3 text-sm uppercase tracking-wider">Utilisateurs trouvés ({users.length})</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(usersByRole).map(([role, list]) => (
                <div key={role} className="bg-gray-800 rounded-xl p-3">
                  <p className="text-xs font-bold text-gray-300 uppercase">{role.replace('_', ' ')}</p>
                  <p className="text-2xl font-black text-blue-400">{(list as any[]).length}</p>
                  <div className="space-y-0.5 mt-1">
                    {(list as any[]).slice(0, 3).map(u => (
                      <p key={u.id} className="text-xs text-gray-500 truncate">{u.name} · {u.city || '-'}</p>
                    ))}
                    {(list as any[]).length > 3 && <p className="text-xs text-gray-600">+{(list as any[]).length - 3} autres</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sélection étapes */}
        <div className="bg-gray-900 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-200 text-sm uppercase tracking-wider">Étapes à générer</h2>
            <div className="flex gap-2">
              <button onClick={() => setSelectedStages(new Set(STAGES.map(s => s.id)))} className="text-xs text-blue-400 hover:underline">Tout</button>
              <span className="text-gray-600">·</span>
              <button onClick={() => setSelectedStages(new Set())} className="text-xs text-gray-500 hover:underline">Aucun</button>
            </div>
          </div>
          <div className="space-y-2">
            {STAGES.map(s => {
              const c = (COLORS as any)[s.color] || COLORS.gray
              const checked = selectedStages.has(s.id)
              return (
                <label key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  checked ? `${c.bg} ${c.border}` : 'bg-gray-800 border-gray-700 opacity-50'
                }`}>
                  <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleStage(s.id)} />
                  <span className={`w-3 h-3 rounded-full shrink-0 ${checked ? c.dot : 'bg-gray-600'}`} />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${checked ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                    <p className={`text-xs ${checked ? 'text-gray-600' : 'text-gray-500'}`}>{s.desc}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Sélection paires */}
        <div className="bg-gray-900 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-200 text-sm uppercase tracking-wider">Paires de villes</h2>
            <div className="flex gap-2">
              <button onClick={() => setSelectedPairs(new Set(PAIRS.map(p => `${p.from}->${p.to}`)))} className="text-xs text-blue-400 hover:underline">Tout</button>
              <span className="text-gray-600">·</span>
              <button onClick={() => setSelectedPairs(new Set())} className="text-xs text-gray-500 hover:underline">Aucun</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PAIRS.map(p => {
              const key = `${p.from}->${p.to}`
              const checked = selectedPairs.has(key)
              return (
                <label key={key} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition text-sm ${
                  checked ? 'bg-blue-950 border-blue-700 text-blue-200' : 'bg-gray-800 border-gray-700 text-gray-500 opacity-50'
                }`}>
                  <input type="checkbox" className="hidden" checked={checked} onChange={() => togglePair(key)} />
                  <span className={`w-2 h-2 rounded-full shrink-0 ${checked ? 'bg-blue-400' : 'bg-gray-600'}`} />
                  <span className="font-mono font-bold truncate">{p.from} {'->'} {p.to}</span>
                </label>
              )
            })}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {selectedStages.size} étapes × {selectedPairs.size} paires = <strong className="text-gray-300">{selectedStages.size * selectedPairs.size} colis</strong> à créer
          </p>
        </div>

        {/* ══ COLIS R?CENTS - pour tester la pagination ══ */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-emerald-700/50">
          <div className="flex items-center gap-3 mb-1">
            <Package className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-emerald-300 text-sm uppercase tracking-wider">Expéditions récentes (0 - 55 jours)</h2>
          </div>
          <p className="text-gray-500 text-xs mb-4">
            Génère des colis datés des <strong className="text-gray-300">55 derniers jours</strong> - ils apparaissent immédiatement dans l'onglet Expéditions de l'AgentPage.
            Statuts variés : Initialisé, Arrivé en agence, En cours de livraison, Livré, Retourné.
          </p>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Quantité</label>
              <select
                value={recentCount}
                onChange={e => setRecentCount(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm"
              >
                <option value={100}>100 colis</option>
                <option value={200}>200 colis</option>
                <option value={500}>500 colis</option>
                <option value={1000}>1 000 colis</option>
              </select>
            </div>
            <button
              onClick={() => !seedingRecent && handleSeedRecent(recentCount)}
              disabled={seedingRecent || loading}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold py-3 px-5 rounded-xl transition text-sm"
            >
              {seedingRecent ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {seedingRecent
                ? `Génération… ${recentProgress.done}/${recentProgress.total}`
                : `Générer ${recentCount.toLocaleString()} colis récents`}
            </button>
          </div>
          {recentDone && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm mb-3">
              <CheckCircle2 className="w-4 h-4" />
              {recentProgress.done.toLocaleString()} colis récents créés - va dans l'onglet Expéditions pour les voir !
            </div>
          )}
          <button
            onClick={handleClearRecentOnly}
            disabled={clearing}
            className="flex items-center gap-2 bg-gray-800 hover:bg-red-900/50 border border-gray-700 disabled:opacity-40 text-gray-400 hover:text-red-300 font-semibold py-2 px-4 rounded-xl transition text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Supprimer les colis récents test
          </button>
        </div>

        {/* ══ MASSE HISTORIQUE 3 MOIS ══ */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-violet-700/50">
          <div className="flex items-center gap-3 mb-1">
            <Database className="w-5 h-5 text-violet-400" />
            <h2 className="font-bold text-violet-300 text-sm uppercase tracking-wider">20 000 expéditions historiques (-3 mois)</h2>
          </div>
          <p className="text-gray-500 text-xs mb-4">
            Génère des colis avec <code className="text-violet-300">createdAt</code> entre 90 et 150 jours en arrière.
            Permettra de vérifier que le filtre 60 jours fonctionne (ces colis n'apparaissent pas aux agents).
          </p>

          {/* Barre de progression */}
          {(seedingHist || histProgress.total > 0) && (
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{histProgress.done.toLocaleString()} / {histProgress.total.toLocaleString()} colis</span>
                <span>{Math.round(histProgress.done / histProgress.total * 100)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                <div
                  className="h-3 rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round(histProgress.done / histProgress.total * 100))}%` }}
                />
              </div>
              {histProgress.errors > 0 && (
                <p className="text-xs text-red-400">{histProgress.errors} erreurs</p>
              )}
            </div>
          )}

          {histDone && (
            <div className="mb-3 bg-green-950 border border-green-800 rounded-xl px-4 py-2.5 text-green-300 text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {histProgress.done.toLocaleString()} colis historiques créés avec succès !
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => handleSeedHistorique(20000)}
              disabled={seedingHist || loading}
              className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white font-bold py-3 px-5 rounded-xl transition text-sm"
            >
              {seedingHist ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {seedingHist ? `Création… ${histProgress.done.toLocaleString()}/${histProgress.total.toLocaleString()}` : 'Créer 20 000 expéditions'}
            </button>
            <button
              onClick={() => handleSeedHistorique(1000)}
              disabled={seedingHist || loading}
              className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 font-bold py-3 px-4 rounded-xl transition text-sm"
            >
              Test 1 000
            </button>
          </div>
          <p className="text-[11px] text-gray-600 mt-2">
            ⚠️ 20 000 écritures = quota journalier Spark complet. Faites-le en dehors des heures de travail ou passez à Blaze d'abord.
          </p>
        </div>

        {/* ══ SUPPRIMER COLIS TEST ══ */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-red-800/50">
          <h2 className="font-bold text-red-400 text-sm uppercase tracking-wider mb-1">??? Supprimer les colis de test</h2>
          <p className="text-gray-500 text-xs mb-4">
            Supprime <strong className="text-gray-300">uniquement</strong> les colis marqués <code className="text-red-300">_seedHistorique: true</code>. Vos vrais colis ne sont pas touchés.
          </p>
          <button
            onClick={handleClearSeedOnly}
            disabled={clearing}
            className="flex items-center gap-2 bg-red-800 hover:bg-red-700 disabled:opacity-40 text-white font-bold py-3 px-5 rounded-xl transition text-sm"
          >
            {clearing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {clearing ? 'Suppression en cours…' : 'Supprimer les colis historiques test'}
          </button>
        </div>

        {/* Phase 4 - Archive */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-teal-800/40">
          <h2 className="font-bold text-teal-400 text-sm uppercase tracking-wider mb-1">?? Archiver les anciens colis</h2>
          <p className="text-gray-500 text-xs mb-4">
            Déplace les colis <strong className="text-gray-300">Livré / Retourné</strong> plus anciens que X jours vers <code className="text-teal-300">parcels_archive</code>.
            Réduit la collection active et accélère toutes les requêtes.
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Ville</label>
              <select
                value={archiveCity}
                onChange={e => setArchiveCity(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm"
              >
                <option value="">- choisir -</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Plus anciens que</label>
              <select
                value={archiveDays}
                onChange={e => { setArchiveDays(Number(e.target.value)); setArchiveDaysCustom('') }}
                className="bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm"
              >
                <option value={7}>1 semaine (7 jours)</option>
                <option value={14}>2 semaines (14 jours)</option>
                <option value={30}>1 mois (30 jours)</option>
                <option value={60}>2 mois (60 jours)</option>
                <option value={90}>3 mois (90 jours)</option>
                <option value={180}>6 mois (180 jours)</option>
                <option value={365}>1 an (365 jours)</option>
                <option value={0}>Personnalisé…</option>
              </select>
            </div>
            {archiveDays === 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Nombre de jours</label>
                <input
                  type="number"
                  min={1}
                  value={archiveDaysCustom}
                  onChange={e => setArchiveDaysCustom(e.target.value)}
                  placeholder="ex: 45"
                  className="bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-3 py-2 text-sm w-28"
                />
              </div>
            )}
          </div>
          <button
            onClick={() => {
              const effectiveDays = archiveDays === 0 ? Number(archiveDaysCustom) : archiveDays
              if (archiveCity && effectiveDays > 0) handleArchive(archiveCity, effectiveDays)
            }}
            disabled={archiving || !archiveCity || (archiveDays === 0 && !Number(archiveDaysCustom))}
            className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white font-bold py-3 px-5 rounded-xl transition text-sm"
          >
            {archiving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {archiving
              ? `Archivage… ${archiveProgress.done}/${archiveProgress.total}`
              : 'Lancer l\'archivage'}
          </button>
          {archiveDone !== null && (
            <div className="mt-3 flex items-center gap-2 text-teal-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {archiveDone === 0
                ? 'Aucun colis à archiver pour ces critères.'
                : `? ${archiveDone} colis archivés avec succès.`}
            </div>
          )}
        </div>

        {/* Diagnostic retours */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-blue-800/40">
          <h2 className="font-bold text-blue-400 text-sm uppercase tracking-wider mb-1">🔍 Diagnostic Retours</h2>
          <p className="text-gray-500 text-xs mb-4">
            Vérifie les champs des colis retournés (status, wasReturned, returnedAt, etc.)
          </p>
          <button
            onClick={async () => {
              const q = query(collection(db, 'parcels'), where('status', 'in', ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']), limit(10))
              const snapshot = await getDocs(q)
              let report = '📊 DIAGNOSTIC RETOURS\n\n'
              snapshot.forEach(docSnap => {
                const p = docSnap.data()
                report += `📦 ${p.trackingId}\n`
                report += `  - status: ${p.status}\n`
                report += `  - wasReturned: ${p.wasReturned || 'undefined'}\n`
                report += `  - returnedAt: ${p.returnedAt ? 'OUI' : 'NON'}\n`
                report += `  - originCity: ${p.originCity}\n`
                report += `  - destinationCity: ${p.destinationCity}\n`
                report += `  - returnToCity: ${p.returnToCity || 'undefined'}\n`
                report += `  - createdByCity: ${p.createdByCity || 'undefined'}\n\n`
              })
              console.log(report)
              alert(report + '\n(Voir console pour détails)')
            }}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 px-5 rounded-xl transition text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Diagnostic Retours (10 colis)
          </button>
        </div>

        {/* Corriger anciens retours */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-red-800/40">
          <h2 className="font-bold text-red-400 text-sm uppercase tracking-wider mb-1">🔧 Corriger les anciens retours</h2>
          <p className="text-gray-500 text-xs mb-4">
            Ajoute le champ <code className="text-red-300">returnToCity</code> aux colis retournés qui ne l'ont pas.
            Nécessaire pour que les retours apparaissent dans l'agence source.
          </p>
          <button
            onClick={async () => {
              if (!window.confirm('Corriger tous les anciens colis retournés ?\n\nCela ajoutera le champ returnToCity manquant.')) return
              const start = Date.now()
              const q = query(collection(db, 'parcels'), where('status', 'in', ['Retourné', 'Retour en transit', 'Retour arrivé', 'Retour finalisé']))
              const snapshot = await getDocs(q)
              const batch = writeBatch(db)
              let count = 0
              snapshot.forEach(docSnap => {
                const p = docSnap.data()
                if (!p.returnToCity && p.createdByCity) {
                  batch.update(doc(db, 'parcels', docSnap.id), { returnToCity: p.createdByCity })
                  count++
                }
              })
              await batch.commit()
              alert(`✅ ${count} colis corrigés en ${((Date.now() - start) / 1000).toFixed(1)}s`)
            }}
            className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-5 rounded-xl transition text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Corriger les anciens retours
          </button>
        </div>

        {/* Quick seed: 10 Casa -> Marrakech */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-amber-800/40">
          <h2 className="font-bold text-amber-300 text-sm uppercase tracking-wider mb-1">Accès rapide - 10 expéditions Casa {'->'} Marrakech</h2>
          <p className="text-gray-500 text-xs mb-3">1 Simple · 3 C/Espèces · 2 C/Chèque · 2 C/Traite · 2 C/BL · statut Initialisé</p>
          <button
            onClick={handleSeedCasaMkh}
            disabled={seedingQuick || loading}
            className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white font-bold py-3 px-5 rounded-xl transition text-sm"
          >
            {seedingQuick ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {seedingQuick ? 'Création…' : 'Créer 10 expéditions'}
          </button>
          {quickResults.length > 0 && (
            <div className="mt-3 space-y-1">
              {quickResults.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs ${
                  r.ok ? 'bg-green-950 border border-green-900' : 'bg-red-950 border border-red-900'
                }`}>
                  {r.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  }
                  <span className="text-gray-300 font-semibold">{r.label}</span>
                  {r.ok && <span className="ml-auto font-mono text-green-400 shrink-0">{r.trackingId}</span>}
                  {!r.ok && <span className="ml-auto text-red-400 shrink-0 max-w-55 truncate">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSeed}
            disabled={running || loading || selectedStages.size === 0 || selectedPairs.size === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-4 rounded-2xl transition text-base"
          >
            {running ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {running ? 'Génération en cours…' : 'Générer les colis de test'}
          </button>
          <button
            onClick={handleClearParcels}
            disabled={clearing}
            className="flex items-center gap-2 bg-red-900 hover:bg-red-800 disabled:opacity-40 text-red-200 font-bold py-4 px-5 rounded-2xl transition"
          >
            {clearing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            Vider
          </button>
        </div>

        {/* Résultats */}
        {results.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-4">
              <h2 className="font-bold text-gray-200 text-sm uppercase tracking-wider">Résultats</h2>
              <span className="text-green-400 text-sm font-bold">{ok} ?</span>
              {err > 0 && <span className="text-red-400 text-sm font-bold">{err} ✗</span>}
            </div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs ${
                  r.ok ? 'bg-green-950 border border-green-900' : 'bg-red-950 border border-red-900'
                }`}>
                  {r.ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  }
                  <span className="text-gray-400 min-w-0 truncate">{r.stage}</span>
                  <span className="text-gray-600">·</span>
                  <span className="font-mono text-gray-300">{r.pair}</span>
                  {r.ok && <span className="ml-auto font-mono text-green-400 shrink-0">{r.trackingId}</span>}
                  {!r.ok && <span className="ml-auto text-red-400 shrink-0 max-w-[200px] truncate">{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {cleared && (
          <div className="bg-green-950 border border-green-800 rounded-2xl p-4 text-center text-green-300 text-sm font-semibold">
            ? Tous les colis ont été supprimés
          </div>
        )}
      </div>
    </div>
  )
}
