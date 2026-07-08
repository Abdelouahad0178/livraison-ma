import * as admin from 'firebase-admin'
import * as dotenv from 'dotenv'

dotenv.config()

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const db = admin.firestore()

async function addCityToGareDriver() {
  try {
    console.log('🔍 Recherche du livreur-gare...')

    // Trouver le livreur-gare par email
    const usersSnapshot = await db
      .collection('users')
      .where('email', '==', 'nouredine@gmail.com')
      .get()

    if (usersSnapshot.empty) {
      console.log('❌ Aucun utilisateur trouvé avec cet email')
      return
    }

    const userDoc = usersSnapshot.docs[0]
    const userData = userDoc.data()

    console.log('✓ Utilisateur trouvé:', {
      id: userDoc.id,
      email: userData.email,
      role: userData.role,
      currentCity: userData.city || '(non défini)',
    })

    // Demander la ville
    const city = process.argv[2] || 'Agadir'

    console.log(`\n📝 Ajout du champ city = "${city}"...`)

    // Mettre à jour le document
    await userDoc.ref.update({
      city: city,
    })

    console.log('✅ Champ city ajouté avec succès!')
    console.log(`\nLe livreur-gare peut maintenant voir les colis vers ${city}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Erreur:', error)
    process.exit(1)
  }
}

// Exécuter
addCityToGareDriver()
