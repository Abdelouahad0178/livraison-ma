# 🤖 GUIDE : Agent IA Vocal Intelligent

## 📋 **COMMENT ÇA MARCHE ?**

### **Mode Classique** (Gratuit)
- Vous parlez **champ par champ**
- Cliquez sur un input → parlez → il se remplit
- Déjà fonctionnel !

### **Mode IA** 🌟 (Nouveau !)
- Vous parlez **librement** en darija/français/arabe mélangés
- L'IA **comprend tout** et extrait les données
- Remplit **tout le formulaire automatiquement** !

---

## 🚀 **ÉTAPE 1 : Obtenir une clé API Claude**

### 1️⃣ **Créer un compte Anthropic** (2 minutes)
- Allez sur : https://console.anthropic.com/
- Cliquez sur "Sign Up"
- Utilisez votre email Google ou créez un compte

### 2️⃣ **Obtenir la clé API** (1 minute)
- Une fois connecté, allez dans "API Keys"
- Cliquez sur "Create Key"
- Copiez la clé (commence par `sk-ant-api03-...`)

### 3️⃣ **💰 TARIFICATION**
```
Claude 3.5 Sonnet (le modèle utilisé) :
- Input : $3 / 1 million tokens
- Output : $15 / 1 million tokens

🧮 CALCUL POUR BGEXPRESS :
- 1 expédition vocale ≈ 500 tokens input + 200 tokens output
- Coût par expédition ≈ $0.004 = 0.04 DH
- 100 expéditions/jour ≈ 4 DH/jour = 120 DH/mois
- 500 expéditions/jour ≈ 20 DH/jour = 600 DH/mois

💳 Anthropic offre $5 de crédit gratuit = ~1250 expéditions !
```

---

## 🔧 **ÉTAPE 2 : Configuration**

### **Option A : Configuration Locale** (Développement)

1. Créez le fichier `.env.local` à la racine du projet :
```bash
# .env.local
VITE_CLAUDE_API_KEY=sk-ant-api03-VOTRE_CLE_ICI
```

2. Redémarrez le serveur de développement :
```bash
npm run dev
```

### **Option B : Configuration Firebase** (Production)

Pour la production, ne mettez JAMAIS la clé dans .env.local !
Utilisez Firebase Functions pour sécuriser la clé.

**Créez : `functions/src/aiExtract.ts`**
```typescript
import * as functions from 'firebase-functions'
import Anthropic from '@anthropic-ai/sdk'

export const extractParcelData = functions.https.onCall(async (data, context) => {
  // Vérifier authentification
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Non authentifié')
  }

  const anthropic = new Anthropic({
    apiKey: functions.config().anthropic.key // Clé sécurisée
  })

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: data.transcript }]
  })

  return message.content[0].text
})
```

**Configuration de la clé :**
```bash
firebase functions:config:set anthropic.key="sk-ant-api03-..."
firebase deploy --only functions
```

---

## 📱 **ÉTAPE 3 : Utilisation**

### **Interface NewTab** (Nouvelle Expédition)

Le composant est déjà prêt ! Il suffit de l'intégrer.

**Modifiez : `src/pages/agent/tabs/NewTab.tsx`**

```typescript
// Ajoutez l'import
import VoiceInputAI from '../../../components/VoiceInputAI'

// Dans le composant, ajoutez avant le formulaire :
<div className="mb-4">
  <VoiceInputAI
    onResult={(field, value) => {
      setForm(prev => ({ ...prev, [field]: value }))
    }}
    onBulkFill={(data) => {
      // Remplir plusieurs champs en une fois
      setForm(prev => ({ ...prev, ...data }))
    }}
    onClientFound={handleClientFound}
  />
</div>
```

---

## 🎤 **ÉTAPE 4 : Tester !**

### **Exemple 1 : Darija pure**
```
🎤 "3andi colis mn Mohammed dyal Casa 
téléphone 0661234567 ghadi l Rabat 
l Fatima rue Al Massira 15 
wazn 2 kilos port khalsatou 50 dirham"
```

**Résultat IA :**
- ✅ Expéditeur : Mohammed
- ✅ Ville exp : Casablanca
- ✅ Tél exp : 0661234567
- ✅ Destinataire : Fatima
- ✅ Ville dest : Rabat
- ✅ Adresse : Rue Al Massira 15
- ✅ Poids : 2 kg
- ✅ Port : Payé 50 DH

### **Exemple 2 : Mélange français/darija**
```
🎤 "J'ai un colis de Hassan qui habite 
à Marrakech son numéro c'est 0612345678 
ghadi l Agadir l wa7ed smitou Omar 
adresse 3ando rue Mohamed V numéro 30 
le poids 5 kilos o port dû 100 dirhams"
```

**Résultat IA :**
- ✅ Expéditeur : Hassan
- ✅ Ville exp : Marrakech  
- ✅ Tél exp : 0612345678
- ✅ Destinataire : Omar
- ✅ Ville dest : Agadir
- ✅ Adresse : Rue Mohamed V 30
- ✅ Poids : 5 kg
- ✅ Port : Dû 100 DH

### **Exemple 3 : Arabe classique**
```
🎤 "عندي طرد من فاطمة من الدار البيضاء 
رقم الهاتف 0623456789 
متجه إلى الرباط لمحمد 
العنوان شارع الحسن الثاني رقم 42 
الوزن 3 كيلو والثمن مدفوع 70 درهم"
```

**Résultat IA :**
- ✅ Expéditeur : Fatima (فاطمة)
- ✅ Ville exp : Casablanca (الدار البيضاء)
- ✅ Tél exp : 0623456789
- ✅ Destinataire : Mohamed (محمد)
- ✅ Ville dest : Rabat (الرباط)
- ✅ Adresse : Rue Hassan II 42
- ✅ Poids : 3 kg
- ✅ Port : Payé 70 DH

---

## 🎯 **WORKFLOW COMPLET**

### **Version Simple (1 clic)**
1. Cliquez sur "Activer IA" 🤖
2. Cliquez sur le micro 🎤
3. Parlez librement (darija/français/arabe)
4. Cliquez "Extraire" ✨
5. Vérifiez les données
6. Cliquez "Valider" ✅
7. **Formulaire rempli !** 🎉

### **Version Avancée (conversationnelle)**
> En phase 2, l'IA posera des questions

```
IA: "Salam! Chkoun l'expéditeur?"
Vous: "Mohammed dyal Casa"
IA: "Wach 3ndo numéro?"
Vous: "0661234567"
IA: "Mzyan! O destinataire chkoun?"
Vous: "Fatima Rabat"
IA: "Adresse exacte?"
Vous: "Rue Mohammed V 25"
IA: "Wazn dyal colis?"
Vous: "3 kilos"
IA: "Port payé wla dû?"
Vous: "Payé 80 dirham"
IA: "Perfect! Ghadi nrempli l'formulaire daba"
```

---

## ⚙️ **CONFIGURATION AVANCÉE**

### **Personnaliser le Prompt IA**
Éditez `src/services/aiAgent.ts` ligne 17 pour adapter :
- Vocabulaire darija spécifique
- Noms de villes/quartiers
- Formats de données

### **Changer le Modèle**
```typescript
// aiAgent.ts ligne 72
model: 'claude-3-5-sonnet-20241022' // Plus intelligent, plus cher
model: 'claude-3-haiku-20240307'    // Plus rapide, moins cher
```

**Tarifs :**
- **Haiku** : $0.25/M input, $1.25/M output (5x moins cher)
- **Sonnet** : $3/M input, $15/M output (recommandé)
- **Opus** : $15/M input, $75/M output (le plus intelligent)

---

## 🐛 **DÉPANNAGE**

### ❌ "Clé API non configurée"
→ Vérifiez `.env.local` et redémarrez `npm run dev`

### ❌ "Reconnaissance vocale non supportée"
→ Utilisez Chrome, Edge ou Brave (pas Firefox/Safari)

### ❌ "Permission microphone refusée"
→ Cliquez sur 🔒 dans la barre d'adresse → Autoriser microphone

### ❌ "Erreur API Claude"
→ Vérifiez que votre clé est valide et a du crédit

### ⚠️ "Confiance faible"
→ L'IA n'est pas sûre. Vérifiez les données avant validation

---

## 📊 **SUIVI DES COÛTS**

Surveillez votre usage sur : https://console.anthropic.com/settings/usage

**Alertes recommandées :**
- Alerte à 50 DH/mois
- Limite à 200 DH/mois

---

## 🎓 **FORMATION ÉQUIPE**

### **Pour les agents :**
1. ✅ Activez le micro
2. ✅ Parlez naturellement en darija
3. ✅ L'IA comprend tout
4. ✅ Vérifiez les données
5. ✅ Validez

**Durée par expédition : 30 secondes** (vs 2-3 minutes manuellement)

**Gain de temps : 80% !** 🚀

---

## 💡 **PROCHAINES ÉTAPES**

### **Phase 2 : Mode Conversationnel**
- L'IA pose des questions
- Guide l'utilisateur étape par étape
- Corrige les erreurs en temps réel

### **Phase 3 : Apprentissage**
- L'IA apprend vos habitudes
- Suggestions automatiques
- Détection d'anomalies

---

## ❓ **QUESTIONS ?**

Contactez-moi pour :
- Formation de l'équipe
- Configuration Firebase Functions
- Optimisation des coûts
- Personnalisation avancée

**C'est parti ! 🚀**
