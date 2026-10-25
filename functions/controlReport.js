/**
 * 🤖 Rapport du Contrôleur (Admin › 🤖 Rapports) — À LA DEMANDE, ADMIN SEULEMENT.
 * 1. lit les données utiles (expéditions récentes, pointages de la période, envois, lots, comptes) ;
 * 2. applique les règles (controlRules.js) → anomalies avec preuve ;
 * 3. Claude rédige le rapport (résumé, priorités) À PARTIR DES SEULES ANOMALIES TROUVÉES ;
 * 4. enregistre le rapport dans controlAiReports (lisible par l'admin seulement).
 * Lecture seule sur les expéditions : rien n'est modifié.
 */
'use strict'

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineString } = require('firebase-functions/params')
const admin = require('firebase-admin')
const Anthropic = require('@anthropic-ai/sdk').default
const { RULES, runRules, summarize } = require('./controlRules')

// Même paramètre que index.js (extractParcelData) : la clé est fournie par la configuration des fonctions
const CLAUDE_API_KEY = defineString('CLAUDE_API_KEY')
const DAY = 864e5
const MAX_DAYS = 31
const MAX_SAVED = 400

// Champs lus (le reste des expéditions est inutile aux règles)
const FIELDS = [
  'senderNic', 'trackingId', 'sender', 'receiver', 'originCity', 'destinationCity', 'createdByCity', 'createdAt', 'status',
  'agentName', 'agentRole', 'history', 'deliveredAt', 'deliveredBy', 'deliveredById', 'deliveryDriverName', 'deliveryAssignedAt',
  'portType', 'portPayeMethod', 'portStatus', 'price', 'portCollectedAt', 'portCollectedBy', 'portExpReceivedAt', 'portExpReceivedBy',
  'portExpReceivedRole', 'portChefReceivedAt', 'codAmount', 'codStatus', 'codCollectedAt', 'codCollectedBy', 'codCollectedById', 'portCollectedById', 'codExpReceivedAt',
  'codExpReceivedBy', 'codExpReceivedRole', 'codAmountHistory', 'codTypeChangedAt', 'codTypeChangedBy', 'codTypeChangedFrom',
  'codPaymentType', 'serviceType', 'controlled', 'controlledAt', 'controlledBy', 'controlledById', 'chefPointedAt', 'chefPointedById',
  'destinationArrivedAt', 'destinationAgentId', 'lastAdminEditAt', 'lastAdminEditBy', 'adminChanges',
  'agentId', 'deliveryDriverId', 'portExpReceivedById', 'codExpReceivedById', 'codTypeChangedById',
]

/** 'AAAA-MM-JJ' (journée d'opération) → début 08:00 heure du Maroc (UTC+1) = 07:00 UTC. */
const dayStart = d => Date.parse(`${d}T07:00:00Z`)

const SYSTEM = `Tu es le contrôleur interne de BG Express, société de messagerie au Maroc (agences : Casablanca, Marrakech, Agadir, Ait Melloul…).
Tu rédiges, en français, un rapport pour l'administrateur à partir d'une liste d'anomalies détectées par des règles automatiques.

Règles d'écriture :
- N'utilise QUE les données fournies. N'invente aucune expédition, aucun nom, aucun montant, aucune cause.
- Chaque anomalie a déjà sa preuve : ne la conteste pas, résume-la.
- Sois concret et court : l'admin doit savoir quoi faire et auprès de qui.
- Montants en DH. Cite les N° EXP et les noms tels quels.
- La FONCTION et la VILLE d'une personne sont UNIQUEMENT celles des champs « fonction » et « ville_personne ». Ne les déduis JAMAIS de l'agence ou du trajet de l'expédition (une aide agent de Casablanca reste une aide agent de Casablanca, même si l'expédition va à Marrakech). Si « fonction » est vide, ne donne aucune fonction.

Format : TEXTE SIMPLE uniquement (il est affiché et imprimé tel quel). N'utilise aucun symbole de mise en forme :
pas de #, pas de **, pas de tableaux. Titres en MAJUSCULES sur leur propre ligne, listes avec « 1. » ou « • ».

Structure du rapport :
1. RÉSUMÉ — 3 à 5 phrases : nombre d'anomalies, gravité, agences et utilisateurs les plus concernés, montant en jeu.
2. À FAIRE EN PRIORITÉ — 3 à 7 actions numérotées, des plus graves (rouge) aux moins graves, avec la personne à contacter.
3. PAR AGENCE — pour chaque agence : ce qui ne va pas, en 1 à 3 lignes.
4. PAR UTILISATEUR — les utilisateurs avec le plus d'erreurs et le type d'erreur répété (pour formation ou rappel).
5. POINTS D'ATTENTION — si une règle semble produire beaucoup de cas identiques, signale-le (habitude de travail ou paramètre à revoir).`

exports.generateControlReport = onCall({
  region: 'europe-west1',
  timeoutSeconds: 300,
  memory: '1GiB',
  maxInstances: 2,
  cors: ['https://arelanc.web.app', 'http://localhost:5173'],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.')
  const db = admin.firestore()
  const me = await db.collection('users').doc(request.auth.uid).get()
  if (!me.exists || me.data().role !== 'admin') throw new HttpsError('permission-denied', 'Réservé à l\'administrateur.')

  const { from: fromDay, to: toDay, city = 'all' } = request.data || {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay || '') || !/^\d{4}-\d{2}-\d{2}$/.test(toDay || '')) throw new HttpsError('invalid-argument', 'Période invalide.')
  const from = dayStart(fromDay)
  const to = dayStart(toDay) + DAY - 1
  if (to < from) throw new HttpsError('invalid-argument', 'La date de fin est avant la date de début.')
  if ((to - from) / DAY > MAX_DAYS) throw new HttpsError('invalid-argument', `Période de ${MAX_DAYS} jours au plus.`)
  const now = Date.now()

  // ── 1. Lecture ──
  const winStart = new Date(from - 10 * DAY) // allégé : situations ouvertes depuis 10 jours au plus avant la période
  const [usersSnap, recentSnap, pointedSnap, envoisSnap, lotsSnap] = await Promise.all([
    db.collection('users').select('name', 'role', 'city').get(),
    db.collection('parcels').where('createdAt', '>=', winStart).select(...FIELDS).get(),
    db.collection('parcels').where('controlled', '==', true)
      .where('controlledAt', '>=', new Date(from).toISOString()).where('controlledAt', '<=', new Date(to).toISOString())
      .orderBy('controlledAt', 'desc').select(...FIELDS).get(),
    db.collection('valeursEnvois').where('createdAt', '>=', winStart).get(),
    db.collection('valeursLots').where('createdAt', '>=', new Date(from - 30 * DAY).toISOString()).get(),
  ])
  const users = new Map(usersSnap.docs.map(d => [d.id, d.data()]))
  const byId = new Map()
  for (const d of [...recentSnap.docs, ...pointedSnap.docs]) byId.set(d.id, { id: d.id, ...d.data(), _createTime: d.createTime.toMillis() })
  const envoiItemKeys = new Set()
  envoisSnap.docs.forEach(d => {
    const e = d.data()
    if (e.status !== 'envoye' && e.status !== 'valide') return
    ;(e.items || []).forEach(i => envoiItemKeys.add(`${i.kind}:${i.parcelId}`))
  })
  const lots = lotsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // ── 2. Règles ──
  const anomalies = runRules({ parcels: [...byId.values()], lots, envoiItemKeys, users, from, to, now, city })
  const stats = summarize(anomalies)

  // ── 3. Rapport rédigé par Claude (à partir des anomalies seulement) ──
  let summary = null
  let aiError = null
  if (anomalies.length) {
    const sample = anomalies.slice(0, 80).map(a => ({
      gravite: a.severity, erreur: RULES[a.rule].label, exp: a.nic, agence_concernee: a.city, personne: a.user,
      fonction: a.userRoleLabel || '', ville_personne: a.userCity || '', nombre_expeditions: a.count || 1, montant: a.amount, date: a.at, preuve: a.proof,
    }))
    const payload = {
      periode: `${fromDay} → ${toDay}`, agence: city === 'all' ? 'toutes' : city,
      regles: Object.fromEntries(Object.entries(RULES).map(([k, r]) => [k, `${r.label} (${r.severity})`])),
      totaux: stats, anomalies_detail: sample,
      note: anomalies.length > sample.length ? `${anomalies.length - sample.length} anomalies supplémentaires non détaillées (comptées dans les totaux).` : '',
    }
    try {
      const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() })
      const msg = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: `Voici les anomalies détectées. Rédige le rapport.\n\n${JSON.stringify(payload)}` }],
      })
      if (msg.stop_reason === 'refusal') aiError = 'Rapport IA refusé par le modèle.'
      else summary = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || null
    } catch (err) {
      console.error('generateControlReport Claude:', err)
      aiError = `Rapport IA indisponible : ${err?.message || err}`
    }
  } else {
    summary = 'Aucune anomalie détectée sur la période pour les règles actives.'
  }

  // ── 4. Enregistrement ──
  const ref = await db.collection('controlAiReports').add({
    createdAt: new Date().toISOString(),
    createdBy: me.data().name || request.auth.token.email || 'Admin',
    createdById: request.auth.uid,
    from: fromDay, to: toDay, city,
    stats, summary, aiError,
    anomalies: anomalies.slice(0, MAX_SAVED),
    truncated: anomalies.length > MAX_SAVED,
    scanned: byId.size,
    statusById: {},
  })
  return { id: ref.id, total: anomalies.length }
})
