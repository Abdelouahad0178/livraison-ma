/**
 * Script de création de l'environnement de test
 *
 * Ce script crée :
 * - Deux villes de test "TEST-AGADIR" et "TEST-CASABLANCA"
 * - Des comptes utilisateurs pour chaque rôle dans chaque ville
 * - Des clients de test pour les deux villes
 * - Des expéditions de test (locales et inter-villes)
 *
 * Usage:
 *   1. Modifier la configuration Firebase (lignes 19-27)
 *   2. Exécuter: npx tsx scripts/creer-environnement-test.ts
 */

import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, collection, addDoc } from 'firebase/firestore'

// Configuration Firebase (à adapter selon votre projet)
const firebaseConfig = {
  // Copiez votre config depuis src/firebase/config.ts
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_AUTH_DOMAIN",
  projectId: "VOTRE_PROJECT_ID",
  storageBucket: "VOTRE_STORAGE_BUCKET",
  messagingSenderId: "VOTRE_MESSAGING_SENDER_ID",
  appId: "VOTRE_APP_ID"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const VILLE_TEST_1 = 'TEST-AGADIR'
const VILLE_TEST_2 = 'TEST-CASABLANCA'
const MOT_DE_PASSE = 'Test123456!'

// Comptes à créer
const COMPTES_TEST = [
  // Agence TEST-AGADIR
  {
    email: 'test-chef-agadir@arelanc.ma',
    name: 'Chef Test Agadir',
    role: 'chef_agence',
    city: VILLE_TEST_1,
  },
  {
    email: 'test-agentpro-agadir@arelanc.ma',
    name: 'Agent Pro Test Agadir',
    role: 'agentpro',
    city: VILLE_TEST_1,
  },
  {
    email: 'test-agent-agadir@arelanc.ma',
    name: 'Agent Test Agadir',
    role: 'agent',
    city: VILLE_TEST_1,
  },
  {
    email: 'test-aide-agadir@arelanc.ma',
    name: 'Aide Test Agadir',
    role: 'aide_agent',
    city: VILLE_TEST_1,
  },
  {
    email: 'test-chauffeur-agadir@arelanc.ma',
    name: 'Chauffeur Test Agadir',
    role: 'chauffeur',
    city: VILLE_TEST_1,
    chauffeurType: 'local',
  },
  {
    email: 'test-caissier-agadir@arelanc.ma',
    name: 'Caissier Test Agadir',
    role: 'caissier',
    city: VILLE_TEST_1,
  },

  // Agence TEST-CASABLANCA
  {
    email: 'test-chef-casa@arelanc.ma',
    name: 'Chef Test Casablanca',
    role: 'chef_agence',
    city: VILLE_TEST_2,
  },
  {
    email: 'test-agentpro-casa@arelanc.ma',
    name: 'Agent Pro Test Casablanca',
    role: 'agentpro',
    city: VILLE_TEST_2,
  },
  {
    email: 'test-agent-casa@arelanc.ma',
    name: 'Agent Test Casablanca',
    role: 'agent',
    city: VILLE_TEST_2,
  },
  {
    email: 'test-chauffeur-casa@arelanc.ma',
    name: 'Chauffeur Test Casablanca',
    role: 'chauffeur',
    city: VILLE_TEST_2,
    chauffeurType: 'local',
  },
  {
    email: 'test-caissier-casa@arelanc.ma',
    name: 'Caissier Test Casablanca',
    role: 'caissier',
    city: VILLE_TEST_2,
  },

  // Comptes globaux (multi-villes)
  {
    email: 'test-transport@arelanc.ma',
    name: 'Transport Test',
    role: 'chauffeur',
    city: VILLE_TEST_1, // Ville principale, mais accès multi-villes
    chauffeurType: 'transport',
  },
  {
    email: 'test-directeur@arelanc.ma',
    name: 'Directeur Test',
    role: 'directeur',
    city: VILLE_TEST_1, // Ville principale, mais accès multi-villes
  },
]

// Clients de test
const CLIENTS_TEST = [
  // Clients TEST-AGADIR
  {
    name: 'TEST-CLIENT-AGADIR-EXP',
    city: VILLE_TEST_1,
    phone: '0600000001',
    address: 'Adresse Test Agadir Expéditeur',
    nic: 'TESTAGADIR001',
    agencyCity: VILLE_TEST_1,
  },
  {
    name: 'TEST-CLIENT-AGADIR-1',
    city: VILLE_TEST_1,
    phone: '0600000002',
    address: 'Adresse Test Agadir Destinataire 1',
    nic: 'TESTAGADIR002',
    agencyCity: VILLE_TEST_1,
  },
  {
    name: 'TEST-CLIENT-AGADIR-2',
    city: VILLE_TEST_1,
    phone: '0600000003',
    address: 'Adresse Test Agadir Destinataire 2',
    nic: 'TESTAGADIR003',
    agencyCity: VILLE_TEST_1,
  },

  // Clients TEST-CASABLANCA
  {
    name: 'TEST-CLIENT-CASA-EXP',
    city: VILLE_TEST_2,
    phone: '0600000011',
    address: 'Adresse Test Casa Expéditeur',
    nic: 'TESTCASA001',
    agencyCity: VILLE_TEST_2,
  },
  {
    name: 'TEST-CLIENT-CASA-1',
    city: VILLE_TEST_2,
    phone: '0600000012',
    address: 'Adresse Test Casa Destinataire 1',
    nic: 'TESTCASA002',
    agencyCity: VILLE_TEST_2,
  },
  {
    name: 'TEST-CLIENT-CASA-2',
    city: VILLE_TEST_2,
    phone: '0600000013',
    address: 'Adresse Test Casa Destinataire 2',
    nic: 'TESTCASA003',
    agencyCity: VILLE_TEST_2,
  },
]

async function creerCompte(compte: typeof COMPTES_TEST[0]) {
  try {
    console.log(`📝 Création du compte: ${compte.email}...`)

    // Créer l'utilisateur dans Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      compte.email,
      MOT_DE_PASSE
    )

    const uid = userCredential.user.uid

    // Créer le profil dans Firestore
    await setDoc(doc(db, 'users', uid), {
      email: compte.email,
      name: compte.name,
      role: compte.role,
      city: compte.city,
      chauffeurType: compte.chauffeurType || null,
      createdAt: new Date(),
      isTestAccount: true, // Marqueur pour identifier les comptes de test
    })

    console.log(`✅ Compte créé: ${compte.email} (${compte.role})`)
    return uid

  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
      console.log(`⚠️  Compte existe déjà: ${compte.email}`)
    } else {
      console.error(`❌ Erreur: ${compte.email}`, error.message)
    }
    return null
  }
}

async function creerClient(client: typeof CLIENTS_TEST[0], agentId: string) {
  try {
    console.log(`📝 Création du client: ${client.name}...`)

    await addDoc(collection(db, 'clients'), {
      name: client.name,
      city: client.city,
      phone: client.phone,
      address: client.address,
      nic: client.nic,
      agentId: agentId,
      agencyCity: client.agencyCity,
      createdAt: new Date(),
      isTest: true, // Marqueur pour identifier les données de test
    })

    console.log(`✅ Client créé: ${client.name}`)

  } catch (error: any) {
    console.error(`❌ Erreur client: ${client.name}`, error.message)
  }
}

async function creerExpeditionLocale(agentId: string, ville: string, agentName: string) {
  try {
    console.log(`📦 Création d'expédition locale ${ville}...`)

    const isAgadir = ville === VILLE_TEST_1

    await addDoc(collection(db, 'parcels'), {
      trackingId: `TEST-${ville.replace('TEST-', '')}-${Date.now()}`,
      parcelNumber: `TEST-${Math.floor(Math.random() * 10000)}`,

      // Expéditeur
      sender: {
        name: isAgadir ? 'TEST-CLIENT-AGADIR-EXP' : 'TEST-CLIENT-CASA-EXP',
        city: ville,
        phone: isAgadir ? '0600000001' : '0600000011',
        address: isAgadir ? 'Adresse Test Agadir Expéditeur' : 'Adresse Test Casa Expéditeur',
        nic: isAgadir ? 'TESTAGADIR001' : 'TESTCASA001',
      },

      // Destinataire
      receiver: {
        name: isAgadir ? 'TEST-CLIENT-AGADIR-1' : 'TEST-CLIENT-CASA-1',
        city: ville,
        phone: isAgadir ? '0600000002' : '0600000012',
        address: isAgadir ? 'Adresse Test Agadir Destinataire 1' : 'Adresse Test Casa Destinataire 1',
      },

      // Détails
      originCity: ville,
      destinationCity: ville,
      status: 'Initialisé',
      serviceType: 'simple',
      portType: 'port_paye',

      weight: 1,
      nbColis: 1,
      price: 50,
      codAmount: 0,

      // Agent
      agentId: agentId,
      agentName: agentName,
      agentRole: 'agent',

      createdAt: new Date(),
      isTest: true,
    })

    console.log(`✅ Expédition locale ${ville} créée`)

  } catch (error: any) {
    console.error(`❌ Erreur expédition locale:`, error.message)
  }
}

async function creerExpeditionInterVilles(agentId: string, origine: string, destination: string, agentName: string) {
  try {
    console.log(`📦 Création d'expédition ${origine} → ${destination}...`)

    const isOriginAgadir = origine === VILLE_TEST_1

    await addDoc(collection(db, 'parcels'), {
      trackingId: `TEST-INTER-${Date.now()}`,
      parcelNumber: `TEST-${Math.floor(Math.random() * 10000)}`,

      // Expéditeur
      sender: {
        name: isOriginAgadir ? 'TEST-CLIENT-AGADIR-EXP' : 'TEST-CLIENT-CASA-EXP',
        city: origine,
        phone: isOriginAgadir ? '0600000001' : '0600000011',
        address: isOriginAgadir ? 'Adresse Test Agadir Expéditeur' : 'Adresse Test Casa Expéditeur',
        nic: isOriginAgadir ? 'TESTAGADIR001' : 'TESTCASA001',
      },

      // Destinataire
      receiver: {
        name: isOriginAgadir ? 'TEST-CLIENT-CASA-1' : 'TEST-CLIENT-AGADIR-1',
        city: destination,
        phone: isOriginAgadir ? '0600000012' : '0600000002',
        address: isOriginAgadir ? 'Adresse Test Casa Destinataire 1' : 'Adresse Test Agadir Destinataire 1',
      },

      // Détails
      originCity: origine,
      destinationCity: destination,
      status: 'Initialisé',
      serviceType: 'cheque',
      portType: 'port_du',
      codAmount: 500,

      weight: 2,
      nbColis: 1,
      price: 80,

      // Agent
      agentId: agentId,
      agentName: agentName,
      agentRole: 'agent',

      createdAt: new Date(),
      isTest: true,
    })

    console.log(`✅ Expédition inter-villes ${origine} → ${destination} créée`)

  } catch (error: any) {
    console.error(`❌ Erreur expédition inter-villes:`, error.message)
  }
}

async function main() {
  console.log('🚀 Démarrage de la création de l\'environnement de test...\n')

  console.log('📋 Étape 1: Création des comptes utilisateurs')
  console.log('=' .repeat(50))

  const compteIds: Record<string, string | null> = {}

  for (const compte of COMPTES_TEST) {
    const uid = await creerCompte(compte)
    compteIds[compte.role] = uid
    await new Promise(resolve => setTimeout(resolve, 1000)) // Pause 1s entre chaque création
  }

  console.log('\n📋 Étape 2: Création des clients de test')
  console.log('=' .repeat(50))

  // Trouver les agents pour chaque ville
  const agentAgadirId = Object.values(compteIds).find((uid, index) => {
    return COMPTES_TEST[index]?.email === 'test-agent-agadir@arelanc.ma' ? uid : null
  })

  const agentCasaId = Object.values(compteIds).find((uid, index) => {
    return COMPTES_TEST[index]?.email === 'test-agent-casa@arelanc.ma' ? uid : null
  })

  // Créer les clients
  for (const client of CLIENTS_TEST) {
    const agentId = client.agencyCity === VILLE_TEST_1 ? agentAgadirId : agentCasaId
    if (agentId) {
      await creerClient(client, agentId as string)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log('\n📋 Étape 3: Création d\'expéditions de test')
  console.log('=' .repeat(50))

  if (agentAgadirId && agentCasaId) {
    // Expéditions locales TEST-AGADIR
    await creerExpeditionLocale(agentAgadirId as string, VILLE_TEST_1, 'Agent Test Agadir')
    await new Promise(resolve => setTimeout(resolve, 500))

    // Expéditions locales TEST-CASABLANCA
    await creerExpeditionLocale(agentCasaId as string, VILLE_TEST_2, 'Agent Test Casablanca')
    await new Promise(resolve => setTimeout(resolve, 500))

    // Expéditions inter-villes AGADIR → CASA
    await creerExpeditionInterVilles(agentAgadirId as string, VILLE_TEST_1, VILLE_TEST_2, 'Agent Test Agadir')
    await new Promise(resolve => setTimeout(resolve, 500))

    // Expéditions inter-villes CASA → AGADIR
    await creerExpeditionInterVilles(agentCasaId as string, VILLE_TEST_2, VILLE_TEST_1, 'Agent Test Casablanca')

    console.log('\n✅ 4 expéditions de test créées (2 locales + 2 inter-villes)')
  } else {
    console.log('⚠️  Agents manquants, expéditions ignorées')
  }

  console.log('\n' + '=' .repeat(50))
  console.log('✅ Environnement de test créé avec succès !')
  console.log('=' .repeat(50))
  console.log('\n📖 Voir GUIDE_ENVIRONNEMENT_TEST.md pour les instructions\n')
  console.log('🔐 Tous les comptes utilisent le mot de passe:', MOT_DE_PASSE)
  console.log('🏙️  Villes de test:', VILLE_TEST_1, 'et', VILLE_TEST_2)
  console.log('\n')
}

// Exécuter
main().catch(console.error)
