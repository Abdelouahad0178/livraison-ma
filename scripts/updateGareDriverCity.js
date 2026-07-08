// Script simple pour ajouter le champ city au livreur-gare
// À exécuter dans la console du navigateur sur la page Admin

async function updateGareDriverCity() {
  try {
    const { db } = await import('../src/firebase/config.js')
    const { collection, query, where, getDocs, updateDoc } = await import('firebase/firestore')

    console.log('🔍 Recherche du livreur-gare...')

    const q = query(
      collection(db, 'users'),
      where('email', '==', 'nouredine@gmail.com')
    )

    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      console.log('❌ Utilisateur non trouvé')
      return
    }

    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()

    console.log('✓ Trouvé:', userData.email, '- Role:', userData.role)

    const city = prompt('Entrez la ville du livreur-gare:', 'Agadir')

    if (!city) return

    await updateDoc(userDoc.ref, { city })

    console.log(`✅ Ville "${city}" ajoutée avec succès!`)
    alert(`✅ Ville "${city}" ajoutée!\nRechargez la page livreur-gare.`)

  } catch (error) {
    console.error('❌ Erreur:', error)
    alert('❌ Erreur: ' + error.message)
  }
}

updateGareDriverCity()
