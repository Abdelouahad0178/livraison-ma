/**
 * 🤖 Contrôleur — règles de détection des erreurs des utilisateurs (fonctions PURES, testées :
 * src/utils/controlRules.test.ts). Chaque règle reproduit une logique déjà en place dans le site.
 * Une anomalie = { rule, severity, parcelId, nic, city, user, userRole, amount, at, proof }.
 * Les règles « d'état » (encaissé non reçu, reçu non envoyé, en cours de livraison, lots) décrivent la
 * situation AU MOMENT du rapport ; les autres portent sur des événements datés DANS la période.
 */
'use strict'

const CITIES = ['Casablanca', 'Rabat', 'Agadir', 'Marrakech', 'Guelmim', 'Ait Melloul']
/** Début du vrai calcul de l'argent (05/10/2026 08:00, heure du Maroc) — avant : période d'essais. */
const MONEY_START = Date.parse('2026-10-05T07:00:00Z')
const H = 3600e3

const RULES = {
  pointe_non_livre:      { severity: 'rouge',  label: 'Valeur pointée alors que l\'expédition n\'est pas livrée', who: 'Encaisseur central' },
  livre_mauvaise_agence: { severity: 'rouge',  label: 'Livrée par une agence qui n\'est pas la destination', who: 'Chef d\'agence / agent pro / aide agent' },
  livre_sans_historique: { severity: 'orange', label: '« Livré » sans ligne de livraison dans l\'historique', who: 'Chef d\'agence' },
  encaisse_non_recu:     { severity: 'rouge',  label: 'Encaissé par le livreur mais pas reçu par le chef d\'exploitation (> 24 h)', who: 'Livreur / chef d\'exploitation' },
  recu_non_envoye:       { severity: 'rouge',  label: 'Reçu par le chef d\'exploitation mais pas envoyé au chef d\'agence (> 24 h)', who: 'Chef d\'exploitation' },
  livre_port_non_collecte: { severity: 'orange', label: 'Livrée mais port dû jamais collecté (> 24 h)', who: 'Livreur / chef d\'exploitation' },
  ville_incoherente:     { severity: 'orange', label: 'Ville du destinataire hors liste ou différente de la destination', who: 'Saisie / admin' },
  saisie_autre_jour:     { severity: 'jaune',  label: 'Saisie datée d\'une autre journée que la saisie réelle', who: 'Agent / chef d\'agence' },
  en_livraison_48h:      { severity: 'jaune',  label: '« En cours de livraison » depuis plus de 48 h', who: 'Livreur / chef d\'exploitation' },
  lot_non_recu:          { severity: 'rouge',  label: 'Lot de valeurs non réceptionné (> 3 jours) ou reçu avec des manquants', who: 'Encaisseur central' },
  valeur_modifiee_apres_encaissement: { severity: 'orange', label: 'Montant ou type de la valeur modifié après l\'encaissement', who: 'Tous' },
  arrivee_mauvaise_agence: { severity: 'jaune', label: 'Arrivée confirmée par une agence qui n\'est pas la destination', who: 'Chef d\'agence' },
}

// ── Outils ──────────────────────────────────────────────────────────────────
const ms = v => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v?.toMillis === 'function') return v.toMillis()
  if (typeof v?.toDate === 'function') return v.toDate().getTime()
  if (typeof v?._seconds === 'number') return v._seconds * 1000
  if (typeof v?.seconds === 'number') return v.seconds * 1000
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const nicOf = p => p.senderNic || p.sender?.nic || p.trackingId || p.id
/** Journée d'opération (08:00 → 08:00, heure du Maroc = UTC+1) : AAAA-MM-JJ. */
const opDay = t => { const d = new Date(t + 1 * H - 8 * H); return d.toISOString().slice(0, 10) }
const inPeriod = (t, from, to) => t !== null && t >= from && t <= to

/** Libellés des fonctions (jamais déduites : prises sur le compte de la personne). */
const ROLE_LABEL = {
  livreur: 'livreur', 'livreur-gare': 'guichet (En gare)', chauffeur: 'chauffeur', chef_agence: 'chef d\'agence', agentpro: 'agent pro',
  aide_agent: 'aide agent', chef_exploitation: 'chef d\'exploitation', encaisseur_central: 'encaisseur central', analyseur_cheque: 'analyseur chèques',
  admin: 'admin', directeur: 'directeur', caissier: 'caissier',
}
let currentUsers = new Map()
function build(rule, p, fields) {
  // ⚠️ Fonction et ville de la PERSONNE = celles de son compte (userId), jamais déduites de l'expédition
  const acc = fields.userId ? currentUsers.get(fields.userId) : null
  const role = acc?.role || fields.userRole || ''
  return {
    rule, severity: RULES[rule].severity,
    parcelId: p?.id || null, nic: p ? nicOf(p) : (fields.nic || ''),
    city: fields.city || p?.destinationCity || p?.originCity || '',
    user: fields.user || acc?.name || '—', userRole: role, userRoleLabel: ROLE_LABEL[role] || role || '', userCity: acc?.city || fields.userCity || '',
    amount: Math.round(num(fields.amount) * 100) / 100,
    at: fields.at ? new Date(fields.at).toISOString() : null,
    proof: fields.proof || '',
  }
}

/**
 * Applique toutes les règles.
 * @param ctx { parcels: [{...data, id, _createTime}], lots: [], envoiItemKeys: Set<'kind:parcelId'>, users: Map<uid,{name,role,city}>,
 *              from: ms, to: ms, now: ms, city?: string }
 */
function runRules(ctx) {
  const { parcels = [], lots = [], envoiItemKeys = new Set(), users = new Map(), from, to, now = Date.now(), city } = ctx
  const out = []
  currentUsers = users
  const userOf = id => (id && users.get(id)) || null
  const who = id => { const u = userOf(id); return u ? `${u.name} (${ROLE_LABEL[u.role] || u.role || '?'}${u.city ? `, ${u.city}` : ''})` : '' }

  for (const p of parcels) {
    if (city && city !== 'all' && ![p.originCity, p.destinationCity].includes(city)) continue
    const status = p.status
    const history = Array.isArray(p.history) ? p.history : []
    const dest = p.destinationCity || ''
    const delivered = status === 'Livré'
    const deliveredAt = ms(p.deliveredAt) ?? ms([...history].reverse().find(h => h?.status === 'Livré')?.timestamp)

    // 1. Valeur pointée avant la livraison
    const controlledAt = ms(p.controlledAt)
    if (p.controlled === true && inPeriod(controlledAt, from, to) && !delivered && (!p.codStatus || p.codStatus === 'pending')) {
      out.push(build('pointe_non_livre', p, { user: p.controlledBy, userId: p.controlledById, userRole: 'encaisseur_central', amount: p.codAmount, at: controlledAt,
        city: (userOf(p.controlledById)?.city) || dest, proof: `Pointée le ${new Date(controlledAt).toISOString()} alors que le statut est « ${status} »` }))
    }

    // 2. Livrée par une agence qui n'est pas la destination (livreur, gare et chef d'exploitation non concernés)
    if (delivered && inPeriod(deliveredAt, from, to) && p.deliveredById) {
      const u = userOf(p.deliveredById)
      if (u && ['chef_agence', 'agentpro', 'aide_agent'].includes(u.role) && u.city && u.city !== dest) {
        out.push(build('livre_mauvaise_agence', p, { user: u.name || p.deliveredBy, userId: p.deliveredById, at: deliveredAt, city: u.city,
          proof: `Livrée par ${u.name} (${u.city}) alors que la destination est ${dest}` }))
      }
    }

    // 3. « Livré » sans ligne d'historique
    if (delivered && !history.some(h => h?.status === 'Livré')) {
      const t = deliveredAt ?? ms(p.createdAt)
      if (inPeriod(t, from, to)) out.push(build('livre_sans_historique', p, { user: p.deliveredBy || '—', userId: p.deliveredById, at: t,
        proof: 'Statut « Livré » mais aucune ligne « Livré » dans l\'historique (qui et quand inconnus)' }))
    }

    // 4. Encaissé par le LIVREUR (ou la gare), pas reçu par le chef d'exploitation (> 24 h) — une collecte faite par
    //    le chef d'exploitation / chef d'agence lui-même vaut réception (l'argent est déjà chez lui)
    const byChef = id => ['chef_exploitation', 'chef_agence', 'agentpro', 'admin'].includes(userOf(id)?.role)
    const portCollectedAt = ms(p.portCollectedAt)
    if (p.portType === 'port_du' && !p.portPayeMethod && p.portStatus === 'collected' && portCollectedAt !== null && !byChef(p.portCollectedById)
        && portCollectedAt >= MONEY_START && now - portCollectedAt > 24 * H && !p.portExpReceivedAt && !p.portChefReceivedAt) {
      out.push(build('encaisse_non_recu', p, { user: p.portCollectedBy, userId: p.portCollectedById, amount: p.price, at: portCollectedAt, city: dest,
        proof: `Port dû ${num(p.price)} DH (${p.originCity || '?'} → ${dest}) encaissé par ${who(p.portCollectedById) || p.portCollectedBy || '—'} il y a ${Math.round((now - portCollectedAt) / H)} h, jamais reçu` }))
    }
    const codCollectedAt = ms(p.codCollectedAt)
    if (p.codStatus === 'collected' && codCollectedAt !== null && codCollectedAt >= MONEY_START && !byChef(p.codCollectedById)
        && now - codCollectedAt > 24 * H && !p.codExpReceivedAt) {
      out.push(build('encaisse_non_recu', p, { user: p.codCollectedBy, userId: p.codCollectedById, amount: p.codAmount, at: codCollectedAt, city: dest,
        proof: `Valeur ${num(p.codAmount)} DH (${p.originCity || '?'} → ${dest}) encaissée par ${who(p.codCollectedById) || p.codCollectedBy || '—'} il y a ${Math.round((now - codCollectedAt) / H)} h, jamais reçue` }))
    }

    // 5. Reçu par le chef d'exploitation, pas envoyé au chef d'agence (> 24 h)
    const portExpAt = ms(p.portExpReceivedAt)
    if (portExpAt !== null && portExpAt >= MONEY_START && now - portExpAt > 24 * H && p.portExpReceivedRole !== 'chef_agence'
        && !p.portChefReceivedAt && !envoiItemKeys.has(`port_du:${p.id}`)) {
      out.push(build('recu_non_envoye', p, { user: p.portExpReceivedBy, userId: p.portExpReceivedById, amount: p.price, at: portExpAt, city: dest,
        proof: `Port dû reçu par ${p.portExpReceivedBy || '—'} il y a ${Math.round((now - portExpAt) / H)} h, dans aucun envoi` }))
    }
    const codExpAt = ms(p.codExpReceivedAt)
    if (codExpAt !== null && codExpAt >= MONEY_START && now - codExpAt > 24 * H && p.codExpReceivedRole !== 'chef_agence'
        && p.codStatus !== 'remis' && p.codStatus !== 'regle' && !envoiItemKeys.has(`cod:${p.id}`)) {
      out.push(build('recu_non_envoye', p, { user: p.codExpReceivedBy, userId: p.codExpReceivedById, amount: p.codAmount, at: codExpAt, city: dest,
        proof: `Valeur reçue par ${p.codExpReceivedBy || '—'} il y a ${Math.round((now - codExpAt) / H)} h, dans aucun envoi` }))
    }

    // 6. Livrée mais port dû jamais collecté (> 24 h après la livraison)
    if (delivered && p.portType === 'port_du' && !p.portPayeMethod && num(p.price) > 0
        && p.portStatus !== 'collected' && p.portStatus !== 'received'
        && inPeriod(deliveredAt, from, to) && deliveredAt >= MONEY_START && now - deliveredAt > 24 * H) {
      out.push(build('livre_port_non_collecte', p, { user: p.deliveryDriverName, userId: p.deliveryDriverId, amount: p.price, at: deliveredAt, city: dest,
        proof: `Livrée il y a ${Math.round((now - deliveredAt) / H)} h, port dû ${num(p.price)} DH non collecté` }))
    }

    // 7. Ville du destinataire hors liste ou ≠ destination
    const rc = String(p.receiver?.city || '').trim()
    const editAt = ms(p.lastAdminEditAt)
    const t7 = inPeriod(editAt, from, to) ? editAt : ms(p.createdAt)
    if (rc && (!CITIES.includes(rc) || norm(rc) !== norm(dest)) && inPeriod(t7, from, to)) {
      const byAdmin = t7 === editAt
      out.push(build('ville_incoherente', p, { user: byAdmin ? p.lastAdminEditBy : p.agentName, userId: byAdmin ? null : p.agentId, userRole: byAdmin ? 'admin' : p.agentRole, at: t7,
        proof: `Ville du destinataire « ${rc} »${CITIES.includes(rc) ? '' : ' (hors liste)'} — destination « ${dest} »` }))
    }

    // 8. Saisie datée d'une autre journée que la saisie réelle
    const created = ms(p.createdAt)
    const realCreate = ms(p._createTime)
    if (created !== null && realCreate !== null && inPeriod(realCreate, from, to) && opDay(created) !== opDay(realCreate)) {
      out.push(build('saisie_autre_jour', p, { user: p.agentName, userId: p.agentId, userRole: p.agentRole, at: realCreate, city: p.createdByCity || p.originCity,
        proof: `Saisie réelle le ${opDay(realCreate)} (journée), datée du ${opDay(created)}` }))
    }

    // 9. « En cours de livraison » depuis plus de 48 h
    if (status === 'En cours de livraison') {
      const since = ms(p.deliveryAssignedAt) ?? ms([...history].reverse().find(h => h?.status === 'En cours de livraison')?.timestamp)
      if (since !== null && since >= MONEY_START && now - since > 48 * H) {
        out.push(build('en_livraison_48h', p, { user: p.deliveryDriverName, userId: p.deliveryDriverId, at: since, city: dest,
          proof: `Chez ${p.deliveryDriverName || '—'} depuis ${Math.round((now - since) / H)} h` }))
      }
    }

    // 11. Valeur modifiée après l'encaissement
    const paidAt = codCollectedAt ?? (delivered ? deliveredAt : null)
    if (paidAt !== null) {
      for (const h of Array.isArray(p.codAmountHistory) ? p.codAmountHistory : []) {
        const t = ms(h?.changedAt)
        if (t !== null && t > paidAt && inPeriod(t, from, to)) {
          out.push(build('valeur_modifiee_apres_encaissement', p, { user: h.changedBy, at: t, amount: h.newAmount,
            proof: `Montant ${num(h.oldAmount)} → ${num(h.newAmount)} DH après l'encaissement` }))
        }
      }
      const typeAt = ms(p.codTypeChangedAt)
      if (typeAt !== null && typeAt > paidAt && inPeriod(typeAt, from, to)) {
        out.push(build('valeur_modifiee_apres_encaissement', p, { user: p.codTypeChangedBy, userId: p.codTypeChangedById, at: typeAt, amount: p.codAmount,
          proof: `Type ${p.codTypeChangedFrom || '—'} → ${p.codPaymentType || p.serviceType} après l'encaissement` }))
      }
    }

    // 12. Arrivée confirmée par une agence qui n'est pas la destination (sauf destination changée ensuite par l'admin)
    const arrivedAt = ms(p.chefPointedAt) ?? ms(p.destinationArrivedAt)
    const arrivedBy = p.chefPointedById || p.destinationAgentId
    if (arrivedBy && inPeriod(arrivedAt, from, to)) {
      const u = userOf(arrivedBy)
      const destChangedAfter = (Array.isArray(p.adminChanges) ? p.adminChanges : []).some(c => c?.field === 'Ville destination' && ms(c.changedAt) > arrivedAt)
      if (u && u.city && ['chef_agence', 'agentpro', 'chef_exploitation'].includes(u.role) && u.city !== dest && !destChangedAfter) {
        out.push(build('arrivee_mauvaise_agence', p, { user: u.name, userId: arrivedBy, at: arrivedAt, city: u.city,
          proof: `Arrivée confirmée par ${u.name} (${u.city}) — destination ${dest}` }))
      }
    }
  }

  // 10. Lots de valeurs
  for (const l of lots) {
    if (city && city !== 'all' && ![l.fromCity, l.toCity].includes(city)) continue
    const created = ms(l.createdAt)
    if (l.status === 'cree' && created !== null && now - created > 72 * H) {
      out.push(build('lot_non_recu', null, { nic: l.number, city: l.toCity, user: l.createdBy, userId: l.createdById, userRole: 'encaisseur_central', amount: l.totals?.total, at: created,
        proof: `Lot ${l.number} (${l.fromCity} → ${l.toCity}, ${(l.parcelIds || []).length} exp.) non réceptionné depuis ${Math.round((now - created) / 24 / H)} jours` }))
    }
    const recAt = ms(l.receivedAt)
    if (l.status === 'recu_partiel' && inPeriod(recAt, from, to)) {
      const missing = (l.missingIds || []).map(id => (l.nics || [])[(l.parcelIds || []).indexOf(id)] || id)
      out.push(build('lot_non_recu', null, { nic: l.number, city: l.toCity, user: l.createdBy, userId: l.createdById, userRole: 'encaisseur_central', at: recAt,
        proof: `Lot ${l.number} reçu par ${l.receivedBy || '—'} avec ${missing.length} manquant(s) : ${missing.join(', ')}` }))
    }
  }

  const order = { rouge: 0, orange: 1, jaune: 2 }
  return groupRepeated(out).sort((a, b) => order[a.severity] - order[b.severity] || (b.count || 1) - (a.count || 1) || String(a.city).localeCompare(String(b.city)))
}

/**
 * 🪶 Rapport ALLÉGÉ : les erreurs répétitives (situations qui durent) sont regroupées en UNE ligne par
 * erreur + utilisateur + agence : nombre d'expéditions, montant total, plus ancienne date, quelques N° EXP.
 * Les erreurs ponctuelles (une action fautive) restent détaillées une par une.
 */
const GROUPED_RULES = new Set(['encaisse_non_recu', 'recu_non_envoye', 'en_livraison_48h', 'livre_port_non_collecte', 'arrivee_mauvaise_agence', 'saisie_autre_jour', 'livre_sans_historique'])
const NICS_SHOWN = 15
function groupRepeated(list) {
  const single = []
  const groups = new Map()
  for (const a of list) {
    if (!GROUPED_RULES.has(a.rule)) { single.push(a); continue }
    const k = `${a.rule}|${a.user}|${a.city}`
    const g = groups.get(k)
    if (!g) { groups.set(k, { ...a, count: 1, nics: [a.nic], oldest: a.at }); continue }
    g.count++
    g.amount = Math.round((g.amount + (a.amount || 0)) * 100) / 100
    if (g.nics.length < NICS_SHOWN && !g.nics.includes(a.nic)) g.nics.push(a.nic)
    if (a.at && (!g.oldest || a.at < g.oldest)) g.oldest = a.at
  }
  const grouped = [...groups.values()].map(g => g.count === 1 ? { ...g, nics: undefined, oldest: undefined } : {
    ...g,
    parcelId: null,
    nic: `${g.count} exp.`,
    at: g.oldest,
    proof: `${g.count} expédition(s) — la plus ancienne le ${String(g.oldest || '').slice(0, 10)} : ${g.nics.join(', ')}${g.count > g.nics.length ? ` (+${g.count - g.nics.length})` : ''}`,
    oldest: undefined,
  })
  return [...single, ...grouped].map(a => { const { nics, oldest, ...rest } = a; void nics; void oldest; return { count: 1, ...rest } })
}

/** Totaux pour le résumé : par gravité, par règle, par agence, par utilisateur. */
function summarize(anomalies) {
  // Les lignes regroupées comptent pour le NOMBRE d'expéditions qu'elles représentent
  const count = (key) => { const m = {}; anomalies.forEach(a => { const k = key(a) || '—'; m[k] = (m[k] || 0) + (a.count || 1) }); return m }
  return {
    total: anomalies.reduce((s, a) => s + (a.count || 1), 0),
    lines: anomalies.length,
    bySeverity: count(a => a.severity),
    byRule: count(a => a.rule),
    byCity: count(a => a.city),
    byUser: count(a => a.user),
    amount: Math.round(anomalies.reduce((s, a) => s + (a.amount || 0), 0) * 100) / 100,
  }
}

module.exports = { RULES, CITIES, MONEY_START, runRules, summarize, opDay }
