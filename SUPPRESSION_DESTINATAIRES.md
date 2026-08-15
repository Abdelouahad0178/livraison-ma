# Suppression des clients destinataires

## Option 1: Script dans la console du navigateur

1. Ouvrez votre application dans le navigateur
2. Connectez-vous en tant qu'admin
3. Ouvrez la console du navigateur (F12)
4. Collez et exécutez le code suivant :

### Lister tous les clients destinataires

```javascript
(async () => {
  const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const { db } = await import('./src/firebase/db.ts');
  
  const q = query(
    collection(db, 'clients'),
    where('isDestinataire', '==', true)
  );
  
  const snapshot = await getDocs(q);
  console.log(`Total: ${snapshot.size} clients destinataires`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log({
      id: doc.id,
      nom: data.name,
      code: data.code || 'AUCUN',
      ville: data.city || '—'
    });
  });
})();
```

### Supprimer les destinataires SANS code

```javascript
(async () => {
  const { collection, query, where, getDocs, writeBatch, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const { db } = await import('./src/firebase/db.ts');
  
  const q = query(
    collection(db, 'clients'),
    where('isDestinataire', '==', true)
  );
  
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  let count = 0;
  
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.code || data.code.trim() === '') {
      console.log(`Suppression: ${data.name}`);
      batch.delete(doc(db, 'clients', docSnap.id));
      count++;
    }
  });
  
  if (count > 0) {
    await batch.commit();
    console.log(`✅ ${count} clients supprimés`);
  } else {
    console.log('Aucun client à supprimer');
  }
})();
```

### Supprimer TOUS les destinataires (⚠️ ATTENTION!)

```javascript
(async () => {
  if (!confirm('⚠️ ATTENTION! Supprimer TOUS les clients destinataires?')) {
    console.log('Annulé');
    return;
  }
  
  const { collection, query, where, getDocs, writeBatch, doc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const { db } = await import('./src/firebase/db.ts');
  
  const q = query(
    collection(db, 'clients'),
    where('isDestinataire', '==', true)
  );
  
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  
  snapshot.forEach(docSnap => {
    batch.delete(doc(db, 'clients', docSnap.id));
  });
  
  if (!snapshot.empty) {
    await batch.commit();
    console.log(`✅ ${snapshot.size} clients destinataires supprimés`);
  }
})();
```

## Option 2: Ajouter un bouton dans l'interface Admin

Je peux aussi ajouter un bouton dans la section Admin > Clients pour gérer cela de manière plus visuelle.

Dites-moi quelle option vous préférez!
