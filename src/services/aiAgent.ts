/**
 * 🤖 AI AGENT VOCAL INTELLIGENT
 * Comprend : Français, Arabe, Darija Marocaine (mélangés)
 * Extrait automatiquement les données d'expédition
 */

export interface ExtractionResult {
  confidence: number
  data: {
    senderName?: string
    senderTel?: string
    senderAddress?: string
    senderCity?: string
    senderNic?: string
    receiverName?: string
    receiverTel?: string
    receiverAddress?: string
    receiverCity?: string
    weight?: number
    nbColis?: number
    parcelContent?: string
    serviceType?: 'simple' | 'especes' | 'cheque' | 'traite' | 'retour_bl'
    portType?: 'port_paye' | 'port_du'
    portPrice?: number
    codAmount?: number
  }
  suggestions?: string[]
  needsConfirmation?: string[]
}

const SYSTEM_PROMPT = `🚨 CRITIQUE: Tu DOIS comprendre et traiter l'ARABE et la DARIJA MAROCAINE ! 🚨

Tu es un expert en extraction de données d'expédition au Maroc.

═══ RÈGLE ABSOLUE ═══
L'utilisateur parle en :
1. DARIJA MAROCAINE (dialecte) - Exemple: "3andi colis mn Mohamed"
2. ARABE LITTÉRAL - Exemple: "عندي طرد من أحمد"
3. FRANÇAIS mélangé
4. TOUT MÉLANGÉ - Exemple: "عندي colis من Mohamed"

⚠️ SI TU VOIS DES CARACTÈRES ARABES (ع، غ، خ، etc.) = C'EST DE L'ARABE/DARIJA !
⚠️ SI TU VOIS "3", "7", "9" dans les mots = C'EST DE LA DARIJA TRANSLITTÉRÉE !

TU DOIS EXTRAIRE LES DONNÉES MÊME SI C'EST EN ARABE PUR !

═══ TRADUCTION ARABE ➜ FRANÇAIS (MEMORISE!) ═══
عندي / 3andi = J'AI
من / mn / men = DE (provenance)
ل / إلى / l / ila = À (destination)
غادي / ghadi = VA À / ALLER
ديال / dyal = DE (possession)
في / f / fi = DANS / À
رقم / rqam = NUMÉRO
تليفون / telephone = TÉLÉPHONE
وزن / wazn = POIDS
كيلو / kilo = KILOGRAMME
طرد / colis = COLIS
يخلص / ykhales = IL PAIE
خلصتو / khalsatou = PAYÉ
فلوس / flous = ARGENT
درهم / dirham = DIRHAM (monnaie)
اسمه / سميتو / smitou = IL S'APPELLE
ساكن / saken = IL HABITE
زنقة / zanqa = RUE
حي / hay = QUARTIER
عنوان / 3nwan = ADRESSE

═══ VILLES EN ARABE ═══
الدار البيضاء = Casablanca
الرباط = Rabat
مراكش = Marrakech
فاس = Fès
طنجة = Tanger
أكادير = Agadir
مكناس = Meknès
وجدة = Oujda

═══ VOCABULAIRE DARIJA ESSENTIEL ═══
POSSESSION & AVOIR:
- "3andi" / "عندي" / "andi" = j'ai
- "3andou" / "عندو" = il a
- "dyal" / "ديال" / "dial" = de (possession)

DIRECTION & DESTINATION:
- "mn" / "men" / "من" = de (provenance)
- "l" / "lel" / "ل" / "ila" = à (destination)
- "ghadi" / "غادي" / "gadi" = va à / aller à
- "f" / "fi" / "في" = dans / à (localisation)

PERSONNES & TITRES:
- "smitou" / "سميتو" = il s'appelle (masculin)
- "smitha" / "سميتها" = elle s'appelle (féminin)
- "smiya" / "اسمه" = son nom est
- "rajel" / "راجل" = homme / monsieur
- "mra" / "مرا" = femme / madame
- "ssi" / "سي" = monsieur (titre respect)
- "lalla" / "لالة" = madame (titre respect)
- "khti" / "ختي" = ma sœur (familier femme)
- "khouya" / "خويا" = mon frère (familier homme)
- "3ammi" / "عمي" = oncle / monsieur (respect)
- "khali" / "خالي" = oncle maternel

COLIS & POIDS:
- "colis" / "colit" / "الطرد" / "trd" = colis
- "wazn" / "الوزن" / "le poids" = poids
- "kilo" / "كيلو" = kilogramme
- "tqil" / "ثقيل" = lourd

PAIEMENT:
- "khalsatou" / "خلصتو" / "khalas" = payé / payer
- "makhlouss" / "مخلوص" = déjà payé
- "ykhales" / "يخلص" = il paie / va payer
- "flous" / "فلوس" / "flouss" = argent
- "cash" / "كاش" = espèces
- "dirham" / "درهم" = dirham (monnaie marocaine)

ADRESSE & LOCALISATION:
- "saken" / "ساكن" / "kay sken" / "sakin" = il habite
- "3nwan" / "عنوان" / "3inwan" / "adresse" = adresse
- "zanqa" / "زنقة" / "zenqa" = rue
- "derb" / "درب" = ruelle / impasse
- "hay" / "حي" / "7ay" = quartier
- "rqam" / "رقم" / "numero" = numéro
- "3mara" / "عمارة" / "3imara" = immeuble
- "taba9" / "طابق" / "etage" = étage
- "bab" / "باب" / "porte" = porte
- "9rib" / "قريب" / "grib" / "7da" = près de

TÉLÉPHONE:
- "telephone" / "تيليفون" / "tiliphone" = téléphone
- "numero" / "رقم" / "rqam" = numéro
- "portable" / "بورطابل" = mobile
- "06" / "07" / "05" = préfixes téléphone marocain
- "talifon dyalo" / "تليفون ديالو" = son téléphone

N° EXPÉDITEUR:
- "numero expediteur" / "رقم المرسل" = numéro expéditeur
- "N EXP" / "numero client" = N° client
- "code client" / "كود الكليان" = code client
- "rqam dyal l3amila" / "رقم ديال العميل" = numéro du client
- "numero dyalo" = son numéro

NATURE DU COLIS:
- "fih" / "فيه" / "contenu" = il contient
- "chnya" / "شنية" / "ch7al" = quoi / combien
- "vetements" / "حوايج" / "7wayej" = vêtements
- "parfum" / "عطر" / "3atr" = parfum
- "chaussures" / "صباط" / "sabbat" = chaussures
- "documents" / "وراق" / "wra9" / "papiers" = documents
- "electronique" / "إلكترونيك" = électronique
- "alimentaire" / "ماكلة" / "makla" = nourriture

PORT DÛ:
- "port du" / "بور ديو" = port dû
- "destinataire ykhales" / "المرسل إليه يخلص" = destinataire paie
- "li ywaslo ykhales" / "اللي يوصلو يخلص" = celui qui reçoit paie
- "machi makhlouss" / "ماشي مخلوص" = pas payé
- "ba9i makhalassh" / "باقي ماخلصش" = pas encore payé
- "khalouh 3lih" / "خلوه عليه" = laissez-le lui (à payer)

RETOUR DE FOND (COD):
- "retour fond" / "ريتور فون" = retour de fond
- "cod" / "كود" / "COD" = contre remboursement
- "contre especes" / "كونتر إسبيس" / "konter espece" = contre espèces
- "flous" / "فلوس" / "flouss" / "cash" = argent
- "yjib" / "يجيب" / "yjib m3ah" = il ramène avec lui
- "yred" / "يرد" / "yredd" = il rend / retourne
- "3andou" / "عندو" / "يعطيه" = il donne
- "montant" / "مونتان" / "mablagh" = montant
- "l9ad" / "القاد" / "la9ad" = montant exact
- "bzaf" / "بزاف" = beaucoup
- "chwiya" / "شوية" = un peu

NOMBRES & QUANTITÉS:
- "wa7ed" / "واحد" / "wa7d" = un / 1
- "jouj" / "جوج" / "zouj" = deux / 2
- "tlata" / "تلاتة" = trois / 3
- "reb3a" / "ربعة" = quatre / 4
- "khamsa" / "خمسة" = cinq / 5
- "setta" / "ستة" = six / 6
- "seb3a" / "سبعة" = sept / 7
- "tmanya" / "تمنية" = huit / 8
- "tes3oud" / "تسعود" = neuf / 9
- "3achra" / "عشرة" = dix / 10
- "miya" / "مية" / "mya" = cent / 100
- "alf" / "ألف" = mille / 1000

URGENCE & IMPORTANCE:
- "mzarreb" / "مزربة" / "mezrab" = urgent
- "sari3" / "سريع" / "sari" = rapide / vite
- "deghdegha" / "دغدغة" = immédiat / tout de suite
- "daba" / "دابا" / "daba daba" = maintenant / tout de suite
- "mohim" / "مهم" / "muhim" = important
- "fragile" / "frajiل" / "khayef" = fragile
- "khass" / "خاص" / "khassni" = il faut / je dois
- "darouri" / "ضروري" = nécessaire
- "3ajel" / "عاجل" = pressé / urgent

TEMPS & DATES:
- "lyoum" / "اليوم" / "l7al" = aujourd'hui
- "ghedda" / "غدا" / "ghedwa" = demain
- "lbar7" / "البارح" / "lbare7" = hier
- "dak saa" / "داك الساعة" = à cette heure
- "nhar" / "نهار" = jour
- "sbah" / "صباح" = matin
- "3chiya" / "عشية" = soir
- "lil" / "الليل" = nuit
- "had semana" / "هاد السيمانة" = cette semaine

ACTIONS & VERBES:
- "dir" / "دير" / "deer" = faire
- "khed" / "خد" / "akhod" = prendre
- "3ti" / "عطي" / "a3ti" = donner
- "jib" / "جيب" / "ajib" = apporter / ramener
- "sir" / "سير" / "msir" = aller / partir
- "ja" / "جا" / "jay" = venir
- "wsel" / "وصل" / "wasel" = arriver
- "seft" / "صفط" / "seftet" = envoyer
- "tsel" / "تصل" = recevoir / arriver
- "shel" / "شحل" / "sha7el" = charger / porter

ÉTAT & DESCRIPTION:
- "mezyan" / "مزيان" / "mzyan" = bien / bon
- "khayeb" / "خايب" / "khayb" = mauvais
- "jdid" / "جديد" = nouveau / neuf
- "9dim" / "قديم" / "gdim" = ancien / vieux
- "kbir" / "كبير" / "kebir" = grand
- "sghir" / "صغير" / "seghir" = petit
- "tqil" / "ثقيل" / "te9il" = lourd
- "khfif" / "خفيف" / "khfef" = léger
- "skhoun" / "سخون" = chaud
- "bared" / "بارد" / "bard" = froid

═══ EXEMPLES COMPLETS EN DARIJA ═══

EXEMPLE 1:
"3andi colis mn Mohamed numero 4525672 dyal Casablanca telephone 0612345678 ghadi l Rabat l Fatima f hay nahda rue 12 telephone 0698765432 wazn 2 kilo port paye 50 dirham"

→ Extraction:
- Expéditeur: Mohamed, N°4525672, Casa, 0612345678
- Destinataire: Fatima, Rabat, hay nahda rue 12, 0698765432
- Poids: 2kg, port payé, 50 DH
- Type: simple

EXEMPLE 2:
"عندي طرد من أحمد ديال طنجة 0623456789 غادي ل مراكش ل خديجة في حي المسيرة زنقة 25 رقم تيليفون 0687654321 وزن 3 كيلو كونتر اسبيس 200 درهم"

→ Extraction:
- Expéditeur: Ahmed, Tanger, 0623456789
- Destinataire: Khadija, Marrakech, hay massira zanqa 25, 0687654321
- Poids: 3kg, contre espèces 200 DH
- Type: especes, codAmount: 200

EXEMPLE 3:
"3andi bon mn Youssef smitou numero client 8956234 men Fes telephone 0645678901 ghadi ila Agadir destinataire smitou Hassan f derb sultan numero 15 telephone 0656789012 tqil 5 kilo contre cheque 500 dirham port du"

→ Extraction:
- Expéditeur: Youssef, N°8956234, Fès, 0645678901
- Destinataire: Hassan, Agadir, derb sultan numero 15, 0656789012
- Poids: 5kg, contre chèque 500 DH, port dû
- Type: cheque, codAmount: 500

EXEMPLE 4 (Avec nature et adresse complète):
"3andi colis rqam dyal l3amila 7845123 mn Amina dyal Rabat talifon dyalha 0623456789 fih 7wayej ghadi l Meknes l Zineb sakin f hay riad 3mara 12 taba9 3 bab 5 numero dyalha 0687654321 wazn 4 kilo destinataire ykhales port 60 dirham yjib m3ah 300 dirham"

→ Extraction:
- Expéditeur: Amina, N°7845123, Rabat, 0623456789
- Destinataire: Zineb, Meknès, hay riad immeuble 12 étage 3 porte 5, 0687654321
- Nature: Vêtements
- Poids: 4kg, port dû 60 DH, retour fond 300 DH
- Type: especes, codAmount: 300

EXEMPLE 5 (🔴 TOUT EN ARABE - MEMORISE CE FORMAT!):
"عندي كوليت من سعيد رقم ديال العميل 9632587 من الدار البيضاء تليفون ديالو 0612349876 فيه صباط و عطر غادي ل طنجة ل نادية ساكن في حي المسيرة زنقة 8 قريب البنك رقم ديالها 0698761234 وزن 2 كيلو باقي ماخلصش يخلص 40 درهم و يجيب معاه 150 درهم فلوس"

TRADUCTION MOT À MOT:
عندي (j'ai) كوليت (colis) من (de) سعيد (Said) رقم ديال العميل (numero client) 9632587 من (de) الدار البيضاء (Casablanca) تليفون ديالو (son telephone) 0612349876 فيه (contient) صباط (chaussures) و (et) عطر (parfum) غادي (va) ل (à) طنجة (Tanger) ل (à) نادية (Nadia) ساكن (habite) في (dans) حي المسيرة (hay massira) زنقة (rue) 8 قريب (près) البنك (banque) رقم ديالها (son numero) 0698761234 وزن (poids) 2 كيلو (kilo) باقي ماخلصش (pas encore payé) يخلص (il paie) 40 درهم (dirham) و (et) يجيب معاه (ramène avec lui) 150 درهم فلوس (dirham argent)

→ Extraction JSON:
{
  "confidence": 0.9,
  "data": {
    "senderName": "Saïd",
    "senderNic": "9632587",
    "senderCity": "Casablanca",
    "senderTel": "0612349876",
    "receiverName": "Nadia",
    "receiverCity": "Tanger",
    "receiverAddress": "hay massira zanqa 8 près de la banque",
    "receiverTel": "0698761234",
    "weight": 2,
    "parcelContent": "Chaussures et parfum",
    "portType": "port_du",
    "portPrice": 40,
    "serviceType": "especes",
    "codAmount": 150
  }
}

EXEMPLE 6 (🔴 ARABE SIMPLE):
"عندي طرد من أحمد 0612345678 غادي ل فاطمة في الرباط 0698765432"

TRADUCTION: J'ai colis de Ahmed 0612345678 va à Fatima dans Rabat 0698765432

→ Extraction JSON:
{
  "confidence": 0.85,
  "data": {
    "senderName": "Ahmed",
    "senderTel": "0612345678",
    "receiverName": "Fatima",
    "receiverCity": "Rabat",
    "receiverTel": "0698765432"
  }
}

═══ RÈGLES D'EXTRACTION ═══
1. TÉLÉPHONES: 06, 07, 05 + 8 chiffres = téléphone marocain
2. ORDRE: Premier nom mentionné = généralement expéditeur
3. MOTS-CLÉS DESTINATAIRE: "ghadi l", "ila", "pour", "l" (suivi d'un nom)
4. N° EXPÉDITEUR: "numero expediteur", "N EXP", "numero client", ou nombre 6-8 chiffres
5. PORT PAYÉ: "port paye", "khalsatou", "makhlouss" → portType: "port_paye"
6. PORT DÛ: "port du", "ykhales", "destinataire khales" → portType: "port_du"
7. TYPE SERVICE:
   - "contre especes" / "especes" / "cash" / "كاش" / "فلوس" → "especes"
   - "contre cheque" / "cheque" / "شيك" → "cheque"
   - "contre traite" / "traite" → "traite"
   - "retour BL" / "bon livraison" → "retour_bl"
   - Si COD > 0 mais pas de type → "especes"
   - Sinon → "simple"
8. RETOUR FOND (COD): "retour fond", "cash", "flous", "contre especes" + montant
9. ADRESSE: Tout après "f" / "fi" / "hay" / "rue" / "zanqa" / "derb" jusqu'au prochain élément
10. CONFIDENCE: >0.8 si clair, 0.5-0.7 si partiel, <0.5 si ambigu

Retourne UNIQUEMENT un JSON valide avec cette structure exacte.`

/**
 * 🧠 Extrait les données d'expédition via Claude AI
 *
 * EN PRODUCTION: Utilise Firebase Cloud Function (sécurisé)
 * EN LOCAL: Utilise API Claude directement (avec clé .env.local)
 */
export async function extractParcelDataFromSpeech(
  transcript: string,
  apiKey?: string
): Promise<ExtractionResult> {
  try {
    // Si pas de clé API, utiliser l'extraction basique
    if (!apiKey) {
      console.warn('⚠️ Pas de clé API Claude - extraction basique activée')
      return basicExtraction(transcript)
    }


    // 🔐 EN PRODUCTION : Utiliser Firebase Cloud Function (sécurisé)
    if (import.meta.env.PROD) {

      // Importer Firebase Functions
      const { getFunctions, httpsCallable } = await import('firebase/functions')

      // ⚠️ IMPORTANT : Spécifier la région europe-west1 où la fonction est déployée
      const functions = getFunctions(undefined, 'europe-west1')

      // Appeler la Cloud Function
      const extractParcelData = httpsCallable(functions, 'extractParcelData')
      const result = await extractParcelData({ transcript })


      return (result.data as any).result
    }

    // 💻 EN LOCAL : Appel direct à l'API Claude (développement uniquement)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extrait les données d'expédition de cette phrase (darija/français/arabe mélangés) :

"${transcript}"

Retourne un JSON avec cette structure exacte :
{
  "confidence": 0.0-1.0,
  "data": {
    "senderName": "...",
    "senderNic": "12345678",
    "senderTel": "...",
    "senderCity": "...",
    "senderAddress": "...",
    "receiverName": "...",
    "receiverTel": "...",
    "receiverCity": "...",
    "receiverAddress": "...",
    "weight": number,
    "nbColis": 1,
    "serviceType": "simple" | "especes" | "cheque" | "traite" | "retour_bl",
    "portType": "port_paye" ou "port_du",
    "portPrice": number,
    "codAmount": number
  },
  "needsConfirmation": ["liste des champs incertains"]
}

ATTENTION:
- senderNic: N° expéditeur (6-8 chiffres)
- serviceType: TOUJOURS définir selon le type de colis
- receiverAddress: TOUJOURS extraire l'adresse complète si mentionnée`
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Erreur API Claude:', error)
      throw new Error(`API Error: ${response.status}`)
    }

    const result = await response.json()

    // Parser la réponse de manière robuste
    const content = result.content?.[0]?.text || '{}'

    // Nettoyer les balises markdown
    let cleanContent = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    // Extraire uniquement le JSON (du premier { au dernier })
    const firstBrace = cleanContent.indexOf('{')
    const lastBrace = cleanContent.lastIndexOf('}')

    if (firstBrace === -1 || lastBrace === -1 || firstBrace > lastBrace) {
      throw new Error('Pas de JSON valide dans la réponse')
    }

    const jsonOnly = cleanContent.substring(firstBrace, lastBrace + 1)
    const extracted = JSON.parse(jsonOnly)


    return extracted

  } catch (error) {
    console.error('❌ Erreur extraction IA:', error)

    // Fallback : extraction basique
    return basicExtraction(transcript)
  }
}

/**
 * 📝 Extraction basique (fallback sans IA)
 */
function basicExtraction(transcript: string): ExtractionResult {
  const data: any = {}
  const text = transcript.toLowerCase()

  // Extraire numéros de téléphone
  const phoneRegex = /0[567]\d{8}/g
  const phones = transcript.match(phoneRegex) || []
  if (phones[0]) data.senderTel = phones[0]
  if (phones[1]) data.receiverTel = phones[1]

  // Extraire poids
  const weightMatch = text.match(/(\d+\.?\d*)\s*(kg|kilo|kilos)/i)
  if (weightMatch) data.weight = parseFloat(weightMatch[1])

  // Extraire montants
  const amountMatch = text.match(/(\d+\.?\d*)\s*(dh|dirham|dirhams)/i)
  if (amountMatch) data.portPrice = parseFloat(amountMatch[1])

  // Détecter type de port
  if (text.includes('payé') || text.includes('khals')) {
    data.portType = 'port_paye'
  } else if (text.includes('dû') || text.includes('destinataire')) {
    data.portType = 'port_du'
  }

  // Villes communes
  const cities = ['casablanca', 'casa', 'rabat', 'marrakech', 'fes', 'tanger', 'agadir', 'meknes']
  for (const city of cities) {
    if (text.includes(city)) {
      if (!data.senderCity) data.senderCity = city === 'casa' ? 'Casablanca' : city.charAt(0).toUpperCase() + city.slice(1)
      else if (!data.receiverCity) data.receiverCity = city === 'casa' ? 'Casablanca' : city.charAt(0).toUpperCase() + city.slice(1)
    }
  }

  return {
    confidence: 0.3,
    data,
    needsConfirmation: Object.keys(data)
  }
}

/**
 * 🎤 Mode conversationnel : l'IA pose des questions
 */
export async function conversationalMode(
  userMessage: string,
  conversationHistory: Array<{ role: string, content: string }>,
  apiKey: string
): Promise<string> {
  try {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        system: `Tu es un assistant vocal pour BG EXPRESS.
        Pose des questions courtes et claires en darija/français pour collecter :
        - Expéditeur (nom, tél, ville)
        - Destinataire (nom, tél, ville, adresse)
        - Poids, port

        Sois naturel et utilise la darija marocaine familière.`,
        messages
      })
    })

    const result = await response.json()
    return result.content?.[0]?.text || 'Pardon, je n\'ai pas compris'

  } catch (error) {
    console.error('❌ Erreur mode conversationnel:', error)
    return 'Erreur de connexion'
  }
}
