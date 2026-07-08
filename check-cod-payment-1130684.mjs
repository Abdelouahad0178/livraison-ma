import { initializeApp } from 'firebase/app'
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyD1cF5sIB0aKr_NLM7LX3Kzfl1_CArDi54",
  authDomain: "arelanc.firebaseapp.com",
  projectId: "arelanc",
  storageBucket: "arelanc.firebasestorage.app",
  messagingSenderId: "1014187887544",
  appId: "1:1014187887544:web:da68a50b7ebcc5a21c20c6",
  measurementId: "G-PBL4V6HQH9"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function checkParcel() {
  try {
    console.log('Recherche du colis avec N° EXP 1130684...')

    // Rechercher par sender.nic = "1130684"
    const parcelsRef = collection(db, 'parcels')
    const q = query(parcelsRef, where('sender.nic', '==', '1130684'))
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      console.log('❌ Aucun colis trouvé avec ce N° EXP')
      return
    }

    snapshot.forEach(doc => {
      const data = doc.data()
      console.log('\n✅ Colis trouvé:')
      console.log('  ID:', doc.id)
      console.log('  Tracking ID:', data.trackingId)
      console.log('  N° EXP:', data.sender?.nic)
      console.log('  COD Amount:', data.codAmount)
      console.log('  COD Payment Type:', JSON.stringify(data.codPaymentType))
      console.log('  COD Payment Type (typeof):', typeof data.codPaymentType)
      console.log('  COD Payment Type (length):', data.codPaymentType?.length)
      console.log('  COD Payment Type (charCodes):', data.codPaymentType ? [...data.codPaymentType].map(c => c.charCodeAt(0)) : null)
      console.log('  COD Status:', data.codStatus)
      console.log('  Destinataire:', data.receiver?.name)
      console.log('  Ville:', data.receiver?.city)
    })

  } catch (error) {
    console.error('Erreur:', error)
  }
}

checkParcel()
