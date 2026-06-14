# 🔄 POLITIQUE DES MODIFICATIONS - WORKFLOW COMPLET

## 📊 VUE D'ENSEMBLE

### Acteurs
1. **Destinataire** : Reçoit le colis
2. **Expéditeur** (Fournisseur) : Envoie le colis
3. **Transporteur** (Agent/Chef d'agence) : Gère la livraison

---

## 🔀 WORKFLOW 1 : Destinataire → Expéditeur

### Étapes
```
[Destinataire]
    ↓ Crée demande modification
    ↓ (ex: changer adresse de livraison)
    
[Demande: status = "pending_expediteur"]
    ↓
    
[Expéditeur]
    ↓ Voit la demande
    ↓ ACCEPTE ou REFUSE
    
Si ACCEPTÉ:
    [Demande: status = "approved_by_expediteur"]
    ↓
    [Système applique modification AUTO]
    ↓
    [Colis mis à jour]
    ↓
    [Demande: status = "completed"]
    
Si REFUSÉ:
    [Demande: status = "rejected_by_expediteur"]
    [Raison du refus enregistrée]
```

### Champs de la demande
```javascript
{
  id: "req_123",
  type: "destinataire_to_expediteur",
  
  // Qui
  requestedBy: "destinataire",
  requestedByClientId: "dest_xyz",
  requestedByName: "Café XYZ",
  
  targetClientId: "exp_abc",  // Expéditeur qui doit répondre
  
  // Quoi
  parcelId: "parcel_456",
  modificationType: "adresse",
  currentValue: "123 Rue A",
  newValue: "456 Rue B",
  note: "Nouvelle adresse de livraison",
  
  // État
  status: "pending_expediteur",  // pending_expediteur | approved_by_expediteur | rejected_by_expediteur | completed
  
  // Réponse
  reviewedByExpAt: timestamp,
  reviewedByExpName: "Restaurant ABC",
  expediteurNote: "OK pour changement adresse",
  
  // Dates
  createdAt: timestamp,
  completedAt: timestamp,
  
  // Auto-application
  autoApplied: true,
  appliedAt: timestamp
}
```

---

## 🔀 WORKFLOW 2 : Expéditeur → Transporteur

### Étapes
```
[Expéditeur]
    ↓ Veut modifier son colis
    ↓ DOIT créer demande (obligatoire)
    
[Demande: status = "pending_transporteur"]
    ↓
    
[Transporteur/Chef]
    ↓ Voit la demande
    ↓ ACCEPTE ou REFUSE
    
Si ACCEPTÉ:
    [Demande: status = "approved_by_transporteur"]
    ↓
    [Système applique modification AUTO]
    ↓
    [Colis mis à jour]
    ↓
    [Demande: status = "completed"]
    
Si REFUSÉ:
    [Demande: status = "rejected_by_transporteur"]
    [Raison du refus enregistrée]
```

### Champs de la demande
```javascript
{
  id: "req_789",
  type: "expediteur_to_transporteur",
  
  // Qui
  requestedBy: "expediteur",
  requestedByClientId: "exp_abc",
  requestedByName: "Restaurant ABC",
  
  targetAgencyCity: "Casablanca",  // Agence qui doit valider
  
  // Quoi
  parcelId: "parcel_456",
  modificationType: "telephone",
  currentValue: "0612345678",
  newValue: "0698765432",
  note: "Nouveau numéro destinataire",
  
  // État
  status: "pending_transporteur",  // pending_transporteur | approved_by_transporteur | rejected_by_transporteur | completed
  
  // Réponse
  reviewedByAgentAt: timestamp,
  reviewedByAgentName: "Chef Agence Casa",
  agentNote: "Modification validée",
  
  // Dates
  createdAt: timestamp,
  completedAt: timestamp,
  
  // Auto-application
  autoApplied: true,
  appliedAt: timestamp
}
```

---

## 🔄 APPLICATION AUTOMATIQUE

### Types de modifications applicables automatiquement

1. **Adresse destinataire** → `receiver.address`
2. **Téléphone destinataire** → `receiver.tel`
3. **Nom destinataire** → `receiver.name`
4. **Montant COD** → `codAmount`
5. **Type de paiement** → `serviceType`

### Fonction d'application
```javascript
async function applyModification(request) {
  const parcel = await getParcel(request.parcelId)
  
  const updates = {}
  
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
      updates.codAmount = parseFloat(request.newValue)
      break
      
    case 'type_paiement':
      updates.serviceType = request.newValue
      break
  }
  
  updates.updatedAt = serverTimestamp()
  updates.lastModificationRequestId = request.id
  
  await updateDoc(doc(db, 'parcels', request.parcelId), updates)
  
  await updateDoc(doc(db, 'modificationRequests', request.id), {
    autoApplied: true,
    appliedAt: serverTimestamp(),
    status: 'completed'
  })
}
```

---

## 🎯 INTERFACES UTILISATEUR

### Pour Destinataire
```
Mes demandes:
- [Nouvelle demande] → Crée demande vers expéditeur
- Liste demandes:
  * En attente expéditeur (⏳)
  * Acceptée par expéditeur (✅)
  * Refusée par expéditeur (❌)
  * Appliquée (🔄)
```

### Pour Expéditeur
```
Mes demandes:
- [Nouvelle demande] → Crée demande vers transporteur
- Demandes reçues de destinataires:
  * [Accepter] [Refuser] pour chaque demande en attente
- Mes demandes au transporteur:
  * En attente transporteur (⏳)
  * Acceptée (✅)
  * Refusée (❌)
```

### Pour Transporteur
```
Demandes de modification:
- Demandes des expéditeurs:
  * [Accepter] [Refuser]
- Historique:
  * Acceptées (✅)
  * Refusées (❌)
  * Appliquées automatiquement (🔄)
```

---

## 🔐 PERMISSIONS FIRESTORE

```javascript
// Créer demande destinataire → expéditeur
allow create: if signedIn() 
  && isDestinataire()
  && request.resource.data.type == 'destinataire_to_expediteur'

// Créer demande expéditeur → transporteur
allow create: if signedIn()
  && ownsClient(request.resource.data.requestedByClientId)
  && request.resource.data.type == 'expediteur_to_transporteur'

// Répondre à une demande (expéditeur)
allow update: if signedIn()
  && ownsClient(resource.data.targetClientId)
  && request.resource.data.diff(resource.data).affectedKeys()
     .hasOnly(['status', 'reviewedByExpAt', 'reviewedByExpName', 'expediteurNote'])

// Valider demande (transporteur)
allow update: if isAgentOrChef()
  && request.resource.data.diff(resource.data).affectedKeys()
     .hasOnly(['status', 'reviewedByAgentAt', 'reviewedByAgentName', 'agentNote'])
```

---

## 📝 NOTIFICATIONS

### Destinataire notifié quand :
- ✅ Expéditeur accepte sa demande
- ❌ Expéditeur refuse sa demande
- 🔄 Modification appliquée

### Expéditeur notifié quand :
- 📥 Destinataire fait une demande
- ✅ Transporteur accepte sa demande
- ❌ Transporteur refuse sa demande
- 🔄 Modification appliquée

### Transporteur notifié quand :
- 📥 Expéditeur fait une demande
- 🔄 Modification appliquée automatiquement

---

## 🚀 PROCHAINES ÉTAPES

1. ✅ Modifier structure demandes (type, workflow)
2. ✅ Créer fonction application automatique
3. ✅ Interface expéditeur pour répondre aux demandes
4. ✅ Interface transporteur pour valider
5. ✅ Mettre à jour règles Firestore
6. ✅ Tests complets du workflow

---

**Ce système assure que toutes les modifications passent par validation et sont appliquées automatiquement une fois approuvées !** 🎯
