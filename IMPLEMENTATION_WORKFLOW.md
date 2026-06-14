# 🚀 IMPLÉMENTATION DU WORKFLOW DE MODIFICATIONS

## ✅ CE QUI EST DÉJÀ FAIT

1. ✅ Les destinataires peuvent créer des demandes
2. ✅ Les demandes sont liées au bon clientId (expéditeur)
3. ✅ Champ `requestedBy` et `requestedByName` ajoutés
4. ✅ Interface client pour créer demandes

---

## 🔨 CE QUI RESTE À FAIRE

### **PHASE 1 : Structure des données** ⏳

#### 1.1 Ajouter champs aux demandes existantes
```javascript
// Dans createModificationRequest
{
  // Nouveaux champs
  type: "expediteur_to_transporteur" | "destinataire_to_expediteur",
  
  // Pour workflow expéditeur
  reviewedByExpAt: null,
  reviewedByExpName: "",
  expediteurNote: "",
  expediteurResponse: "pending" | "approved" | "rejected",
  
  // Pour workflow transporteur
  reviewedByAgentAt: null,
  reviewedByAgentName: "",
  
  // Application automatique
  autoApplied: false,
  appliedAt: null,
  
  // Status amélioré
  status: "pending" | "approved" | "rejected" | "completed"
}
```

---

### **PHASE 2 : Fonction application automatique** ⏳

Créer `src/firebase/applyModification.ts` :

```javascript
export async function applyModificationToParcel(requestId: string) {
  const requestSnap = await getDoc(doc(db, 'modificationRequests', requestId))
  if (!requestSnap.exists()) throw new Error('Demande introuvable')
  
  const request = requestSnap.data()
  
  // Vérifier que la demande est approuvée
  if (request.status !== 'approved') {
    throw new Error('Demande non approuvée')
  }
  
  // Charger le colis
  const parcelSnap = await getDoc(doc(db, 'parcels', request.parcelId))
  if (!parcelSnap.exists()) throw new Error('Colis introuvable')
  
  // Appliquer la modification selon le type
  const updates: any = {}
  
  switch (request.modificationType) {
    case 'adresse':
      updates['receiver.address'] = request.newValue
      updates.receiverAddress = request.newValue
      break
      
    case 'telephone':
      updates['receiver.tel'] = request.newValue
      updates.receiverTel = request.newValue
      break
      
    case 'nom':
      updates['receiver.name'] = request.newValue
      updates.receiverName = request.newValue
      break
      
    case 'montant_cod':
      updates.codAmount = parseFloat(request.newValue) || 0
      break
      
    case 'type_paiement':
      updates.serviceType = request.newValue
      break
      
    case 'annulation':
      updates.status = 'Annulé'
      updates.cancelledAt = serverTimestamp()
      updates.cancelReason = request.note || 'Annulé sur demande client'
      break
  }
  
  updates.updatedAt = serverTimestamp()
  updates.lastModificationRequestId = requestId
  
  // Mettre à jour le colis
  await updateDoc(doc(db, 'parcels', request.parcelId), updates)
  
  // Marquer la demande comme appliquée
  await updateDoc(doc(db, 'modificationRequests', requestId), {
    autoApplied: true,
    appliedAt: serverTimestamp(),
    status: 'completed'
  })
  
  return { success: true }
}
```

---

### **PHASE 3 : Interface Expéditeur** ⏳

#### 3.1 Ajouter onglet "Demandes reçues"
Dans `ClientPortalPage.tsx`, ajouter un nouvel onglet pour les expéditeurs :

```javascript
// Si expéditeur, charger les demandes des destinataires
const [receivedRequests, setReceivedRequests] = useState([])

useEffect(() => {
  if (!isExpediteur) return
  
  // Charger demandes où requestedBy = "destinataire" ET targetClientId = client.id
  const q = query(
    collection(db, 'modificationRequests'),
    where('targetClientId', '==', client.id),
    where('requestedBy', '==', 'destinataire'),
    orderBy('createdAt', 'desc')
  )
  
  return onSnapshot(q, snap => {
    setReceivedRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  })
}, [client?.id, isExpediteur])
```

#### 3.2 Interface pour répondre
```jsx
{receivedRequests.map(req => (
  <div key={req.id}>
    <h4>{req.requestedByName} demande: {req.typeLabel}</h4>
    <p>De: {req.currentValue} → {req.newValue}</p>
    
    {req.status === 'pending' && (
      <div>
        <button onClick={() => approveRequest(req.id, 'expediteur')}>
          ✅ Accepter
        </button>
        <button onClick={() => rejectRequest(req.id, 'expediteur')}>
          ❌ Refuser
        </button>
      </div>
    )}
  </div>
))}
```

#### 3.3 Fonctions réponse
```javascript
async function approveRequest(requestId: string, role: 'expediteur' | 'transporteur') {
  await updateDoc(doc(db, 'modificationRequests', requestId), {
    status: 'approved',
    reviewedByExpAt: serverTimestamp(),
    reviewedByExpName: client.name,
    expediteurResponse: 'approved'
  })
  
  // Appliquer automatiquement
  await applyModificationToParcel(requestId)
}

async function rejectRequest(requestId: string, role: 'expediteur' | 'transporteur', reason: string) {
  await updateDoc(doc(db, 'modificationRequests', requestId), {
    status: 'rejected',
    reviewedByExpAt: serverTimestamp(),
    reviewedByExpName: client.name,
    expediteurResponse: 'rejected',
    expediteurNote: reason
  })
}
```

---

### **PHASE 4 : Interface Transporteur** ⏳

Dans `AgentPage.tsx` ou nouvelle interface :

```javascript
// Liste des demandes en attente de validation
<Tab>Demandes modifications</Tab>

{modRequests.filter(r => r.status === 'pending').map(req => (
  <div>
    <h4>{req.clientName} demande: {req.typeLabel}</h4>
    <p>Colis: {req.trackingId}</p>
    <p>De: {req.currentValue} → {req.newValue}</p>
    
    <button onClick={() => approveByAgent(req.id)}>
      ✅ Valider et appliquer
    </button>
    <button onClick={() => rejectByAgent(req.id)}>
      ❌ Refuser
    </button>
  </div>
))}
```

---

### **PHASE 5 : Règles Firestore** ⏳

Ajouter dans `firestore.rules` :

```javascript
match /modificationRequests/{requestId} {
  // Créer demande
  allow create: if signedIn();
  
  // Lire ses demandes
  allow read: if signedIn() 
    && (resource.data.clientId == userDoc().clientId
        || resource.data.targetClientId == userDoc().clientId
        || isStaff());
  
  // Répondre (expéditeur)
  allow update: if signedIn()
    && ownsClient(resource.data.targetClientId)
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['status', 'reviewedByExpAt', 'reviewedByExpName', 
                 'expediteurNote', 'expediteurResponse']);
  
  // Valider (transporteur)
  allow update: if isAgentOrChef()
    && request.resource.data.diff(resource.data).affectedKeys()
       .hasOnly(['status', 'reviewedByAgentAt', 'reviewedByAgentName', 
                 'agentNote', 'autoApplied', 'appliedAt']);
}
```

---

## 📊 ORDRE D'IMPLÉMENTATION RECOMMANDÉ

### **Priorité 1 (MAINTENANT)** 🔴
1. ✅ Fonction `applyModificationToParcel` 
2. ✅ Interface expéditeur pour répondre aux demandes
3. ✅ Règles Firestore pour permettre réponses

### **Priorité 2 (ENSUITE)** 🟠
4. ✅ Interface transporteur pour valider
5. ✅ Application automatique après validation
6. ✅ Notifications/badges pour demandes en attente

### **Priorité 3 (OPTIONNEL)** 🟡
7. ✅ Historique complet des modifications
8. ✅ Export/rapport des demandes
9. ✅ Statistiques de validation

---

## 🧪 TESTS À FAIRE

### Test 1 : Destinataire → Expéditeur
1. Destinataire crée demande changement adresse
2. Expéditeur voit demande
3. Expéditeur accepte
4. Adresse du colis mise à jour automatiquement
5. Destinataire voit demande "Acceptée"

### Test 2 : Expéditeur → Transporteur
1. Expéditeur crée demande changement téléphone
2. Transporteur voit demande
3. Transporteur valide
4. Téléphone du colis mis à jour automatiquement
5. Expéditeur voit demande "Validée"

### Test 3 : Refus
1. Destinataire demande modification
2. Expéditeur refuse avec raison
3. Colis non modifié
4. Destinataire voit demande "Refusée" avec raison

---

## 💡 VOULEZ-VOUS QUE JE COMMENCE L'IMPLÉMENTATION ?

**Option 1 :** Implémenter PHASE 1 + 2 + 3 (fonctions + interface expéditeur)  
**Option 2 :** Créer d'abord seulement la fonction d'application automatique  
**Option 3 :** Faire toutes les phases en une fois  

**Que préférez-vous ?** 🤔
