// Run only against the dedicated local Firestore emulator (never production).
import { readFileSync } from 'node:fs'
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { initializeApp, deleteApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore, doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, terminate, setLogLevel } from 'firebase/firestore'

const projectId = 'demo-livraison-permissions'
const host = '127.0.0.1:8189'
process.env.FIRESTORE_EMULATOR_HOST = host
setLogLevel('silent')
const adminApp = initializeAdmin({ projectId }, 'agent-pro-rules-seed')
const seed = adminFirestore(adminApp)
const apps = []
function client(uid) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only', appId: `emulator-${uid}` }, `rules-${uid}`)
  apps.push(app)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8189, { mockUserToken: { sub: uid, user_id: uid } })
  return db
}
const pro = client('pro-casa'), dest = client('pro-agadir'), noCity = client('pro-no-city'), admin = client('admin'), chef = client('chef'), driver = client('driver'), aide = client('aide'), blocked = client('blocked-chief'), chefNoCity = client('chief-no-city')
const chefDestination = client('chief-agadir')
let passed = 0
const results = []
function parcel(origin = 'Casablanca', destination = 'Agadir', extra = {}) {
  return { originCity: origin, destinationCity: destination, createdByCity: origin,
    agentId: 'pro-casa', agentRole: 'agentpro', sender: { name: 'Sender', city: origin }, receiver: { name: 'Receiver', city: destination },
    status: 'Initialisé', codAmount: 0, codStatus: 'pending', portType: 'port_du', portStatus: 'pending',
    price: 40, notes: '', history: [], shipmentLoadedAt: null, visibleInDestinationAgency: true, ...extra }
}
async function check(name, allowed, db, data, action, coll = 'parcels', fixedId = '') {
  const id = fixedId || `case-${results.length}`
  await seed.collection(coll).doc(id).set(data)
  let success = false
  let detail = ''
  try { await action(doc(db, coll, id)); success = true }
  catch (error) { if (!String(error.code || '').includes('permission-denied')) throw error; detail = error.message }
  results.push({ name, expected: allowed, actual: success })
  if (success === allowed) passed++
  else console.error(`FAIL: ${name} (expected ${allowed ? 'allowed' : 'denied'}) ${detail.slice(0, 900)}`)
}
try {
  const loaded = await fetch(`http://${host}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: readFileSync('firestore.rules', 'utf8') }] } }),
  })
  const compiled = await loaded.json()
  if (!loaded.ok || compiled.issues?.some(issue => issue.severity === 'ERROR')) throw new Error('Firestore rules did not compile')
  await Promise.all([
    seed.doc('users/pro-casa').set({ role: 'agentpro', city: 'Casablanca' }),
    seed.doc('users/pro-agadir').set({ role: 'agentpro', city: 'Agadir' }),
    seed.doc('users/pro-no-city').set({ role: 'agentpro' }),
    seed.doc('users/admin').set({ role: 'admin', city: 'Rabat' }),
    seed.doc('users/chef').set({ role: 'chef_agence', city: 'Casablanca' }),
    seed.doc('users/driver').set({ role: 'livreur', city: 'Casablanca' }),
    seed.doc('users/aide').set({ role: 'aide_agent', city: 'Casablanca' }),
    seed.doc('users/blocked-chief').set({ role: 'chef_agence', city: 'Casablanca', blocked: true }),
    seed.doc('users/chief-no-city').set({ role: 'chef_agence' }),
    seed.doc('users/chief-agadir').set({ role: 'chef_agence', city: 'Agadir' }),
    seed.doc('settings/editPermissions').set({ agentpro: ['price', 'portType', 'codAmount', 'sender', 'receiver'], parcelEditScope: { agentpro: { created: true, received: true } } }),
  ])
  const foreign = parcel('Agadir', 'Rabat')
  await check('foreign document can be read', true, pro, foreign, ref => getDoc(ref))
  await check('foreign archives can be read', true, pro, foreign, ref => getDoc(ref), 'parcels_archive')
  for (const [name, patch] of Object.entries({
    notes: { notes: 'changed' }, price: { price: 1 }, COD: { codAmount: 100 }, status: { status: 'Livré' },
    driver: { deliveryDriverId: 'other-driver' }, history: { history: [{ status: 'Livré' }] },
    identity: { createdByCity: 'Casablanca', originCity: 'Casablanca' },
    deliveryDate: { deliveredAt: '2026-10-25T12:00:00Z' }, signature: { signatureToken: 'changed' },
    arbitrary: { customField: 'changed' },
  })) await check(`foreign ${name} is read-only`, false, pro, foreign, ref => updateDoc(ref, patch))
  await check('foreign deletion denied even when agentId equals caller', false, pro, foreign, ref => deleteDoc(ref))
  await check('foreign nested-city spoof denied', false, pro, { ...foreign, sender: { city: 'Casablanca' } }, ref => updateDoc(ref, { notes: 'changed' }))
  await check('foreign archive update denied', false, pro, foreign, ref => updateDoc(ref, { notes: 'changed' }), 'parcels_archive')
  await check('source can edit notes', true, pro, parcel(), ref => updateDoc(ref, { notes: 'changed' }))
  await check('source can edit receiver', true, pro, parcel(), ref => updateDoc(ref, { receiver: { name: 'Changed', city: 'Agadir' } }))
  await check('source can edit another creator in its city', true, pro, parcel('Casablanca', 'Agadir', { agentId: 'colleague' }), ref => updateDoc(ref, { receiver: { name: 'Changed', city: 'Agadir' } }))
  await check('source can correct COD before loading', true, pro, parcel(), ref => updateDoc(ref, { codAmount: 100 }))
  await check('source cannot assign destination driver', false, pro, parcel(), ref => updateDoc(ref, { deliveryDriverId: 'driver-agadir' }))
  await check('source cannot set delivery date', false, pro, parcel(), ref => updateDoc(ref, { deliveredAt: '2026-10-25T12:00:00Z' }))
  await check('source cannot mark delivered', false, pro, parcel(), ref => updateDoc(ref, { status: 'Livré' }))
  await check('source cannot cancel delivery', false, pro, parcel('Casablanca', 'Agadir', { status: 'En cours de livraison' }), ref => updateDoc(ref, { status: 'En transit' }))
  await check('source can load transport to its destination', true, pro, parcel(), ref => updateDoc(ref, { chauffeurName: 'Transport', chauffeurPhone: '', status: 'En transit', shipmentLoadedAt: '2026-10-25T12:00:00Z', visibleInDestinationAgency: true, history: [{ status: 'En transit' }] }))
  await check('source cannot modify creation city', false, pro, parcel(), ref => updateDoc(ref, { createdByCity: 'Rabat' }))
  await check('source cannot overwrite central control fields', false, pro, parcel(), ref => updateDoc(ref, { controlled: true, controlledById: 'pro-casa' }))
  await check('source cannot change collected COD amount', false, pro, parcel('Casablanca', 'Agadir', { codAmount: 100, codStatus: 'collected' }), ref => updateDoc(ref, { codAmount: 1 }))
  await check('source cannot change collected port type', false, pro, parcel('Casablanca', 'Agadir', { portStatus: 'collected' }), ref => updateDoc(ref, { portType: 'port_en_compte_expediteur' }))
  await check('source cannot edit locked bon without an authorized correction', false, pro, parcel('Casablanca', 'Agadir', { shipmentLoadedAt: '2026-10-25T12:00:00Z' }), ref => updateDoc(ref, { receiver: { name: 'Changed', city: 'Agadir' }, arbitrary: true }))
  await check('destination can assign driver', true, dest, parcel(), ref => updateDoc(ref, { deliveryDriverId: 'driver-agadir' }))
  await check('destination can mark delivered', true, dest, parcel('Casablanca', 'Agadir', { status: 'En cours de livraison' }), ref => updateDoc(ref, { status: 'Livré', deliveredAt: '2026-10-25T12:00:00Z' }))
  await check('destination can confirm arrival', true, dest, parcel('Casablanca', 'Agadir', { status: 'En transit' }), ref => updateDoc(ref, { status: 'Arrivé en agence', destinationArrivedAt: '2026-10-25T12:00:00Z', history: [] }))
  await check('destination can collect COD without changing its amount', true, dest, parcel('Casablanca', 'Agadir', { status: 'Livré', codAmount: 100 }), ref => updateDoc(ref, { codStatus: 'collected', codPaymentType: 'especes', codCollectedAt: '2026-10-25T12:00:00Z', codCollectedBy: 'Destination' }))
  for (const patch of [{ codAmount: 100 }, { price: 10 }, { notes: 'changed' }, { receiver: { name: 'Changed', city: 'Agadir' } }, { createdByCity: 'Agadir' }, { deliveryDriverId: 'driver-agadir', price: 1 }]) {
    await check(`destination cannot change bon ${Object.keys(patch).join('+')}`, false, dest, parcel(), ref => updateDoc(ref, patch))
  }
  await check('local parcel bon editable', true, pro, parcel('Casablanca', 'Casablanca'), ref => updateDoc(ref, { notes: 'changed' }))
  await check('local parcel driver editable', true, pro, parcel('Casablanca', 'Casablanca'), ref => updateDoc(ref, { deliveryDriverId: 'driver-casa' }))
  const beforeReturn = parcel('Casablanca', 'Agadir', { status: 'Arrivé en agence', shipmentLoadedAt: '2026-10-25T10:00:00Z' })
  const snapshot = { status: beforeReturn.status, sender: beforeReturn.sender, receiver: beforeReturn.receiver,
    originCity: 'Casablanca', destinationCity: 'Agadir', codAmount: 0, deliveryDriverId: null }
  const returnPatch = { status: 'Retourné', wasReturned: true, sender: beforeReturn.receiver, receiver: beforeReturn.sender,
    originCity: 'Agadir', destinationCity: 'Casablanca', returnToCity: 'Casablanca', codAmount: 0, preReturn: snapshot,
    returnedAt: '2026-10-25T12:00:00Z', history: [{ status: 'Retourné' }] }
  await check('destination can initiate return without losing original ownership', true, dest, beforeReturn, ref => updateDoc(ref, returnPatch))
  await check('source cannot initiate return at another destination', false, pro, beforeReturn, ref => updateDoc(ref, returnPatch))
  const returned = { ...beforeReturn, ...returnPatch }
  await check('return departure agency can load return transport', true, dest, returned, ref => updateDoc(ref, { status: 'Retour en transit', returnShippedAt: '2026-10-25T13:00:00Z', history: [] }))
  await check('original source can finalize its received return', true, pro, returned, ref => updateDoc(ref, { status: 'Retour finalisé', returnFinalizedAt: '2026-10-25T13:00:00Z' }))
  await check('return departure agency can cancel a mistaken return from its snapshot', true, dest, returned, ref => updateDoc(ref, {
    ...snapshot, wasReturned: false, preReturn: null, returnedAt: null, returnReason: null, returnedByDriverId: null,
    returnedByDriverName: null, returnCancelledAt: '2026-10-25T13:00:00Z', returnCancelledBy: 'Destination', history: [] }))
  await seed.doc('parcels/signature-foreign').set({ ...parcel(), signatureToken: 'fixture-token' })
  const signature = { parcelId: 'signature-foreign', token: 'fixture-token', signature: 'fixture-image' }
  await check('source cannot change destination signature even with its token', false, pro, signature, ref => updateDoc(ref, { signature: 'changed' }), 'deliverySignatures')
  await check('source cannot delete destination signature', false, pro, signature, ref => deleteDoc(ref), 'deliverySignatures')
  await check('destination can update delivery signature', true, dest, signature, ref => updateDoc(ref, { signature: 'changed' }), 'deliverySignatures')
  await check('existing chief role keeps its own agency edits', true, chef, parcel(), ref => updateDoc(ref, { notes: 'changed' }))
  await check('existing chief role keeps COD corrections', true, chef, parcel(), ref => updateDoc(ref, { codAmount: 100 }))
  await check('existing chief role keeps destination assignments', true, chef, parcel('Agadir', 'Casablanca'), ref => updateDoc(ref, { deliveryDriverId: 'driver' }))
  await check('existing chief role keeps destination delivery', true, chef, parcel('Agadir', 'Casablanca', { status: 'En cours de livraison' }), ref => updateDoc(ref, { status: 'Livré', deliveredAt: '2026-10-25T12:00:00Z' }))
  await check('assigned delivery driver keeps its delivery permissions', true, driver, parcel('Agadir', 'Casablanca', { deliveryDriverId: 'driver', status: 'En cours de livraison' }), ref => updateDoc(ref, { status: 'Livré', deliveredAt: '2026-10-25T12:00:00Z' }))
  await check('Agent Pro cannot move itself to another authority city', false, pro, { role: 'agentpro', city: 'Casablanca' }, ref => updateDoc(ref, { city: 'Rabat' }), 'users', 'pro-casa')
  await check('Agent Pro cannot take over a foreign driver by changing its city', false, pro, { role: 'livreur', city: 'Agadir' }, ref => updateDoc(ref, { city: 'Casablanca' }), 'users')
  await check('Agent Pro can still manage its own city drivers', true, pro, { role: 'livreur', city: 'Casablanca' }, ref => updateDoc(ref, { name: 'Local driver' }), 'users')
  await check('missing agent city fails closed', false, noCity, parcel(), ref => updateDoc(ref, { notes: 'changed' }))
  await check('admin can edit foreign parcel', true, admin, foreign, ref => updateDoc(ref, { notes: 'changed', deliveryDriverId: 'driver' }))
  for (const [name, db, uid] of [['Agent Pro', pro, 'pro-casa'], ['agency chief', chef, 'chef']]) {
    await check(`${name} can delete own creation`, true, db, parcel('Casablanca', 'Agadir', { agentId: uid }), ref => deleteDoc(ref))
    await check(`${name} can delete a colleague creation in its agency`, true, db, parcel('Casablanca', 'Agadir', { agentId: 'colleague', agentRole: 'chef_agence' }), ref => deleteDoc(ref))
    await check(`${name} can delete local aide creation`, true, db, parcel('Casablanca', 'Agadir', { agentId: 'aide', agentRole: 'aide_agent' }), ref => deleteDoc(ref))
    const incoming = parcel('Agadir', 'Casablanca', { agentId: uid, destinationAgentId: uid })
    await check(`${name} can read a received shipment`, true, db, incoming, ref => getDoc(ref))
    await check(`${name} cannot delete a received shipment with its own agentId`, false, db, incoming, ref => deleteDoc(ref))
    await check(`${name} cannot delete a received aide shipment`, false, db, { ...incoming, agentId: 'aide', agentRole: 'aide_agent' }, ref => deleteDoc(ref))
    await check(`${name} cannot delete a foreign shipment`, false, db, foreign, ref => deleteDoc(ref))
    await check(`${name} cannot delete a foreign shipment with a spoofed sender city`, false, db, { ...foreign, sender: { city: 'Casablanca' } }, ref => deleteDoc(ref))
    await check(`${name} can delete a legacy source shipment`, true, db, parcel('Casablanca', 'Agadir', { createdByCity: null }), ref => deleteDoc(ref))
    await check(`${name} cannot delete a legacy received shipment`, false, db, { ...incoming, createdByCity: null }, ref => deleteDoc(ref))
    await check(`${name} cannot steal the recorded creation city`, false, db, incoming, ref => updateDoc(ref, { createdByCity: 'Casablanca' }))
    await check(`${name} cannot change legacy origin to gain deletion rights`, false, db, { ...incoming, createdByCity: null }, ref => updateDoc(ref, { originCity: 'Casablanca' }))
    const reversed = parcel('Casablanca', 'Agadir', { createdByCity: 'Agadir', wasReturned: true, preReturn: { originCity: 'Agadir' } })
    await check(`${name} cannot delete a return just because current origin is its city`, false, db, reversed, ref => deleteDoc(ref))
    await check(`${name} cannot delete legacy return created in another city`, false, db, { ...reversed, createdByCity: null }, ref => deleteDoc(ref))
    await check(`${name} cannot delete loaded shipments`, false, db, parcel('Casablanca', 'Agadir', { shipmentLoadedAt: '2026-10-25T12:00:00Z' }), ref => deleteDoc(ref))
    for (const status of ['Livré', 'Retourné', 'Retour en transit']) {
      await check(`${name} cannot delete ${status} shipments`, false, db, parcel('Casablanca', 'Agadir', { status }), ref => deleteDoc(ref))
    }
    await check(`${name} cannot delete transferred archives`, false, db, parcel(), ref => deleteDoc(ref), 'parcels_archive')
  }
  await check('blocked agency chief cannot delete source shipment', false, blocked, parcel(), ref => deleteDoc(ref))
  await check('chief without city cannot delete source shipment', false, chefNoCity, parcel(), ref => deleteDoc(ref))
  await check('Agent Pro without city cannot delete source shipment', false, noCity, parcel(), ref => deleteDoc(ref))
  await check('admin keeps deletion of delivered foreign shipments', true, admin, { ...foreign, status: 'Livré' }, ref => deleteDoc(ref))
  await check('aide keeps deletion of its own unvalidated shipment', true, aide, parcel('Casablanca', 'Agadir', { agentId: 'aide', agentRole: 'aide_agent' }), ref => deleteDoc(ref))
  await check('aide cannot delete its validated shipment', false, aide, parcel('Casablanca', 'Agadir', { agentId: 'aide', agentRole: 'aide_agent', validatedByChef: true }), ref => deleteDoc(ref))
  const arrivedOutgoing = parcel('Casablanca', 'Agadir', {
    agentId: 'chef', status: 'Arrivé en agence', destinationArrivedAt: '2026-10-25T12:00:00Z',
    chefPointedAt: '2026-10-25T12:00:00Z', deliveryDriverId: 'driver-agadir',
  })
  for (const status of ['Livré', 'En cours de livraison', 'En livraison', 'En transit', 'Initialisé', 'Retourné', 'Retour en transit', 'Retour finalisé']) {
    await check(`source chief cannot change arrived shipment status to ${status}`, false, chef, arrivedOutgoing, ref => updateDoc(ref, { status, history: [{ status }] }))
  }
  for (const [name, patch] of Object.entries({
    driver: { deliveryDriverId: 'source-driver' },
    deliveryDate: { deliveredAt: '2026-10-25T13:00:00Z' },
    arrival: { destinationArrivedAt: null },
    pointing: { chefPointedAt: null },
    signature: { signatureToken: 'source-token' },
    returnDriver: { returnDeliveryDriverId: 'source-driver' },
    redirect: { destinationCity: 'Casablanca', receiver: { name: 'Receiver', city: 'Casablanca' } },
    mixedBonAndDelivery: { notes: 'changed', status: 'Livré' },
    spoofedOwnership: { destinationCity: 'Casablanca', status: 'Livré', deliveryDriverId: 'source-driver' },
  })) await check(`source chief cannot modify arrived delivery ${name}`, false, chef, arrivedOutgoing, ref => updateDoc(ref, patch))
  await check('source chief cannot cancel delivery', false, chef, { ...arrivedOutgoing, status: 'Livré', deliveredAt: '2026-10-25T13:00:00Z' }, ref => updateDoc(ref, { status: 'En cours de livraison', deliveredAt: null }))
  await check('source chief keeps non-delivery notes', true, chef, arrivedOutgoing, ref => updateDoc(ref, { notes: 'Source observation' }))
  await check('source chief keeps transport loading before arrival', true, chef, parcel('Casablanca', 'Agadir', { agentId: 'chef' }), ref => updateDoc(ref, {
    chauffeurName: 'Transport', chauffeurPhone: '', status: 'En transit', shipmentLoadedAt: '2026-10-25T12:00:00Z', visibleInDestinationAgency: true, history: [{ status: 'En transit' }],
  }))
  await check('source chief cannot confirm arrival at another destination', false, chef, parcel('Casablanca', 'Agadir', { agentId: 'chef', status: 'En transit' }), ref => updateDoc(ref, { status: 'Arrivé en agence', destinationArrivedAt: '2026-10-25T12:00:00Z', history: [] }))
  await check('arrival marker protects status even if status still says transit', false, chef, { ...arrivedOutgoing, status: 'En transit' }, ref => updateDoc(ref, { status: 'Initialisé' }))
  await check('chief without city cannot change delivery status', false, chefNoCity, arrivedOutgoing, ref => updateDoc(ref, { status: 'Livré' }))
  await check('destination chief can confirm arrival', true, chefDestination, parcel('Casablanca', 'Agadir', { status: 'En transit' }), ref => updateDoc(ref, { status: 'Arrivé en agence', destinationArrivedAt: '2026-10-25T12:00:00Z', history: [] }))
  await check('destination chief can choose delivery driver', true, chefDestination, arrivedOutgoing, ref => updateDoc(ref, { deliveryDriverId: 'destination-driver' }))
  await check('destination chief can mark delivered', true, chefDestination, arrivedOutgoing, ref => updateDoc(ref, { status: 'Livré', deliveredAt: '2026-10-25T13:00:00Z' }))
  await check('destination chief can start delivery', true, chefDestination, arrivedOutgoing, ref => updateDoc(ref, { status: 'En cours de livraison' }))
  await check('chief can deliver local shipment', true, chef, parcel('Casablanca', 'Casablanca', { agentId: 'chef', status: 'Arrivé en agence' }), ref => updateDoc(ref, { status: 'Livré', deliveredAt: '2026-10-25T13:00:00Z' }))
  await check('destination chief can initiate return', true, chefDestination, beforeReturn, ref => updateDoc(ref, returnPatch))
  await check('source chief cannot initiate return at another agency', false, chef, { ...beforeReturn, agentId: 'chef' }, ref => updateDoc(ref, returnPatch))
  await check('return departure chief can load transport', true, chefDestination, returned, ref => updateDoc(ref, { status: 'Retour en transit', returnShippedAt: '2026-10-25T13:00:00Z', history: [] }))
  await check('return destination chief can finalize return', true, chef, returned, ref => updateDoc(ref, { status: 'Retour finalisé', returnFinalizedAt: '2026-10-25T13:00:00Z' }))
  await check('return departure chief can cancel a mistaken return', true, chefDestination, returned, ref => updateDoc(ref, {
    ...snapshot, wasReturned: false, preReturn: null, returnedAt: null, returnReason: null, returnedByDriverId: null,
    returnedByDriverName: null, returnCancelledAt: '2026-10-25T13:00:00Z', returnCancelledBy: 'Destination', history: [],
  }))
  await check('source chief cannot change destination signature', false, chef, signature, ref => updateDoc(ref, { signature: 'changed' }), 'deliverySignatures')
  await check('source chief cannot delete destination signature', false, chef, signature, ref => deleteDoc(ref), 'deliverySignatures')
  await check('destination chief can update delivery signature', true, chefDestination, signature, ref => updateDoc(ref, { signature: 'changed' }), 'deliverySignatures')
  await check('admin keeps corrections to foreign delivery status', true, admin, arrivedOutgoing, ref => updateDoc(ref, { status: 'Livré', deliveredAt: '2026-10-25T13:00:00Z' }))
  const list = await getDocs(collection(pro, 'parcels'))
  if (list.empty) throw new Error('Cross-city listing unexpectedly empty')
  console.log(JSON.stringify({ emulator: host, project: projectId, passed, total: results.length, crossCityListing: true }))
  if (passed !== results.length) process.exitCode = 1
} finally {
  await Promise.all(apps.map(async app => { await terminate(getFirestore(app)); await deleteApp(app) }))
  await seed.terminate(); await deleteAdmin(adminApp)
}
