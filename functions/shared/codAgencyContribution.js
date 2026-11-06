// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/codAgencyContribution.ts — ne pas modifier.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils/codAgencyContribution.ts
var codAgencyContribution_exports = {};
__export(codAgencyContribution_exports, {
  COD_ALL_CITY: () => COD_ALL_CITY,
  COD_DAY_FIELDS: () => COD_DAY_FIELDS,
  COD_DIRS: () => COD_DIRS,
  COD_MODES: () => COD_MODES,
  COD_NO_ORIGIN: () => COD_NO_ORIGIN,
  COD_RESTE_FIELDS: () => COD_RESTE_FIELDS,
  COD_STAT_KEYS: () => COD_STAT_KEYS,
  COD_UNION_FIELDS: () => COD_UNION_FIELDS,
  codAgencyContributionOf: () => codAgencyContributionOf,
  codAgencyFromDays: () => codAgencyFromDays,
  codDayDeltas: () => codDayDeltas,
  codResteFromDays: () => codResteFromDays
});
module.exports = __toCommonJS(codAgencyContribution_exports);

// src/firebase/constants.ts
var CITIES = [
  "Casablanca",
  "Rabat",
  "Agadir",
  "Marrakech",
  "Guelmim",
  "Ait Melloul"
];
var TARIFS = {
  Casablanca: 25,
  Rabat: 30,
  Agadir: 45,
  Marrakech: 40,
  Guelmim: 55,
  "Ait Melloul": 45
  // provisoire (= Agadir), modifiable dans Admin › Tarifs
};
var TARIF_WEIGHT_RULES = [
  { max: 5, label: "0 - 5 kg", extra: 0 },
  { max: 10, label: "5 - 10 kg", extra: 10 },
  { max: 20, label: "10 - 20 kg", extra: 20 },
  { max: 30, label: "20 - 30 kg", extra: 35 },
  { max: Infinity, label: "+30 kg", extra: 55 }
];
var DEFAULT_TARIFF_CONFIG = {
  cityPrices: TARIFS,
  weightRules: TARIF_WEIGHT_RULES.map((r) => ({
    max: Number.isFinite(r.max) ? r.max : null,
    label: r.label,
    extra: r.extra
  })),
  extraPerAdditionalParcel: 5
};
var RETURN_STATUSES = [
  "Retourn\xE9",
  "Retour en transit",
  "Retour arriv\xE9",
  "Retour finalis\xE9"
];
var CLOSED_STATUSES = ["Livr\xE9", ...RETURN_STATUSES, "Annul\xE9"];
var COD_TYPE_ALIASES = {
  especes: "especes",
  cod_especes: "especes",
  cheque: "cheque",
  cod_cheque: "cheque",
  traite: "traite",
  cod_traite: "traite",
  retour_bl: "bon_livraison",
  bon_livraison: "bon_livraison"
};
function normalizeCodTypes(raw) {
  return String(raw ?? "").toLowerCase().split(",").map((s) => COD_TYPE_ALIASES[s.trim()]).filter(Boolean);
}
function codPaymentTypeOf(parcel) {
  const service = normalizeCodTypes(parcel?.serviceType);
  const collected = normalizeCodTypes(parcel?.codPaymentType);
  if (collected.length && (service.length === 0 || service.includes(collected[0]))) return collected[0];
  if (service.length) return service[0];
  return collected[0] || "";
}
var VALID_SERVICE_TYPE_KEYS = ["simple", "especes", "cheque", "traite", "retour_bl", "retourne", "oc"];
function normalizeServiceType(raw) {
  const s = String(raw ?? "").trim();
  if (!s.includes(",")) return s;
  const parts = s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const first = parts.find((x) => VALID_SERVICE_TYPE_KEYS.includes(x)) || parts[0] || "";
  console.warn(`[serviceType] valeur multiple "${s}" refus\xE9e \u2192 "${first}" (un seul type de retour de fonds par exp\xE9dition)`);
  return first;
}
function codPaymentTypeForService(serviceType) {
  return COD_TYPE_ALIASES[normalizeServiceType(serviceType).toLowerCase()] || "";
}

// src/config/operationalDay.ts
var OPERATIONAL_DAY_CONFIG = {
  /**
   * ⏰ Heure de début de la journée opérationnelle (format 24h)
   *
   * Toute expédition créée après cette heure appartient à la journée opérationnelle courante.
   *
   * Exemples:
   * - 0 = minuit (journée calendaire standard)
   * - 6 = 6h du matin
   * - 8 = 8h du matin (configuration actuelle)
   */
  START_HOUR: 8,
  START_MINUTE: 0,
  /**
   * ⏰ Heure de fin de la journée opérationnelle (format 24h, lendemain)
   *
   * Toute expédition créée avant cette heure appartient à la journée opérationnelle PRÉCÉDENTE.
   *
   * Exemples:
   * - 0 = minuit (se termine à 23:59:59 du même jour)
   * - 2 = 2h du matin (lendemain)
   * - 6 = 6h du matin (configuration actuelle)
   */
  END_HOUR: 6,
  END_MINUTE: 0,
  /**
   * 🏷️ Labels pour l'affichage UI
   */
  LABELS: {
    fr: {
      operationalDay: "Journ\xE9e du",
      currentDay: "Journ\xE9e en cours",
      previousDay: "Journ\xE9e pr\xE9c\xE9dente",
      nextDay: "Journ\xE9e suivante",
      timeRange: (start, end) => `${start} \u2192 ${end}`
    }
  }
};
var casaFormatter = null;
function casaWallClockExact(sourceDate) {
  casaFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Casablanca",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric"
  });
  const v = {};
  for (const part of casaFormatter.formatToParts(sourceDate)) if (part.type !== "literal") v[part.type] = Number(part.value);
  return new Date(v.year, v.month - 1, v.day, v.hour === 24 ? 0 : v.hour, v.minute, v.second);
}
var HOUR_MS = 36e5;
var casaOffsetByHour = /* @__PURE__ */ new Map();
function toCasablancaWallClock(sourceDate) {
  const t = sourceDate.getTime();
  if (Number.isNaN(t)) return new Date(Number.NaN);
  const tSec = t - (t % 1e3 + 1e3) % 1e3;
  const hour = Math.floor(tSec / HOUR_MS);
  let delta = casaOffsetByHour.get(hour);
  if (delta === void 0) {
    const start = hour * HOUR_MS;
    delta = casaWallClockExact(new Date(start)).getTime() - start;
    const end = start + HOUR_MS - 1e3;
    if (casaWallClockExact(new Date(end)).getTime() - end !== delta) return casaWallClockExact(sourceDate);
    if (casaOffsetByHour.size > 2e4) casaOffsetByHour.clear();
    casaOffsetByHour.set(hour, delta);
  }
  return new Date(tSec + delta);
}
function getOperationalDay(date) {
  const sourceDate = typeof date === "number" ? new Date(date) : new Date(date);
  const casablancaTime = toCasablancaWallClock(sourceDate);
  const hour = casablancaTime.getHours();
  const minute = casablancaTime.getMinutes();
  const currentMinutes = hour * 60 + minute;
  const endMinutes = OPERATIONAL_DAY_CONFIG.END_HOUR * 60 + OPERATIONAL_DAY_CONFIG.END_MINUTE;
  const d = new Date(casablancaTime);
  if (currentMinutes < endMinutes) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(OPERATIONAL_DAY_CONFIG.START_HOUR, OPERATIONAL_DAY_CONFIG.START_MINUTE, 0, 0);
  return d;
}
var OP_DAY_STRING_CACHE = /* @__PURE__ */ new Map();
function getOperationalDayString(date) {
  const ms = typeof date === "number" ? date : date.getTime();
  if (Number.isNaN(ms)) return getOperationalDay(date).toISOString().split("T")[0];
  const minute = Math.floor(ms / 6e4);
  let s = OP_DAY_STRING_CACHE.get(minute);
  if (s === void 0) {
    s = getOperationalDay(date).toISOString().split("T")[0];
    if (OP_DAY_STRING_CACHE.size >= 5e4) OP_DAY_STRING_CACHE.clear();
    OP_DAY_STRING_CACHE.set(minute, s);
  }
  return s;
}

// src/utils/codParts.ts
var COD_DOC_TYPES = ["cheque", "traite"];
var num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
var round2 = (n) => Math.round(n * 100) / 100;
function codDocTypeOf(p) {
  const fromService = codPaymentTypeForService(p?.serviceType);
  if (COD_DOC_TYPES.includes(fromService)) return fromService;
  const t = codPaymentTypeOf(p);
  return COD_DOC_TYPES.includes(t) ? t : "";
}
function isMixedCod(p) {
  return !!p && p.codMixed === true && num(p.codCashAmount) > 0 && !!codDocTypeOf(p) && num(p.codAmount) > 0;
}
function codTotalOf(p) {
  return num(p?.codAmount);
}
function codPartsOf(p, fallback = "especes") {
  const total = codTotalOf(p);
  if (total <= 0) return [];
  if (isMixedCod(p)) {
    const cash = Math.min(num(p.codCashAmount), total);
    const doc = round2(total - cash);
    const parts = [];
    if (doc > 0) parts.push({ type: codDocTypeOf(p), amount: doc });
    parts.push({ type: "especes", amount: round2(cash) });
    return parts;
  }
  const t = codPaymentTypeOf(p) || fallback;
  return t ? [{ type: t, amount: total }] : [];
}
function codAmountOfType(p, type, fallback = "especes") {
  return codPartsOf(p, fallback).filter((x) => x.type === type).reduce((s, x) => s + x.amount, 0);
}
function codSplitAmount(p, type, legacyType) {
  if (isMixedCod(p)) return codAmountOfType(p, type);
  return legacyType === type ? parseFloat(p?.codAmount) || 0 : 0;
}

// src/utils/moneyFlow.ts
var isCodSenderPaid = (p) => !!p?.centralSupplierPaid || !!p?.codSenderPaid || p?.centralSupplierPaymentStatus === "paid";

// src/config/siteDelays.ts
var DELAY_BOUNDS = {
  collectDays: { min: 7, max: 31, code: 14 },
  activeDays: { min: 45, max: 90, code: 45 }
};
var current = { collectDays: DELAY_BOUNDS.collectDays.code, activeDays: DELAY_BOUNDS.activeDays.code };

// src/utils/agencyCaisseRules.ts
var caisseCodLegacyType = (p) => p?.codPaymentType || p?.serviceType;
var caisseCodAmountOfType = (p, type) => codSplitAmount(p, type, caisseCodLegacyType(p));

// src/utils/billingAgency.ts
var DESTINATION_VISIBLE_STATUSES = ["En transit", "Arriv\xE9 en agence", "En cours de livraison", "Livr\xE9", "Retourn\xE9"];
var isVisibleInDestinationAgency = (p = {}) => {
  if (p?.wasReturned) return false;
  return !!(p?.visibleInDestinationAgency || p?.shipmentLoadedAt || p?.destinationArrivedAt || p?.destinationAgentId || p?.chauffeurId || DESTINATION_VISIBLE_STATUSES.includes(p?.status));
};
var isSentFromAgency = (p, city) => !!city && (p?.originCity === city || p?.sender?.city === city);
var isReceivedInAgency = (p, city) => !!city && (p?.destinationCity === city || p?.receiver?.city === city) && isVisibleInDestinationAgency(p);

// src/utils/agencyCodStats.ts
var COD_TYPE_KEYS = ["especes", "cheque", "traite"];
var round22 = (n) => Math.round(n * 100) / 100;
var hasCountedCod = (p) => {
  if (!((parseFloat(p?.codAmount) || 0) > 0)) return false;
  const s = String(p?.serviceType ?? "").trim().toLowerCase();
  if (s === "simple" || s === "retour_bl" || s === "bon_livraison") return false;
  return !(p?.wasReturned || RETURN_STATUSES.includes(p?.status));
};
var isCodCollected = (p) => !!p?.codStatus && p.codStatus !== "pending";
var typedAmounts = (p) => {
  const o = { especes: caisseCodAmountOfType(p, "especes"), cheque: caisseCodAmountOfType(p, "cheque"), traite: caisseCodAmountOfType(p, "traite") };
  return { ...o, total: o.especes + o.cheque + o.traite };
};
function computeAgencyCodStats(parcels, opts) {
  const { viewMode, directionFilter = "all", originCityFilter = "all", cities = CITIES } = opts;
  const dir = directionFilter === "sent" ? "sent" : directionFilter === "received" ? "received" : "all";
  const stats = {};
  cities.forEach((city) => {
    stats[city] = { city, especes: 0, cheque: 0, traite: 0, total: 0, nbExpeditions: 0, nbUnique: 0, nbMixtes: 0 };
  });
  if (!Array.isArray(parcels)) return Object.values(stats);
  for (const p of parcels) {
    if (!hasCountedCod(p)) continue;
    if (dir === "received" && originCityFilter !== "all" && p.originCity !== originCityFilter) continue;
    const a = typedAmounts(p);
    if (a.total <= 0) continue;
    const involved = [.../* @__PURE__ */ new Set([p.originCity, p.sender?.city, p.destinationCity, p.receiver?.city])].filter((c) => c && stats[c]);
    for (const c of involved) {
      const asDest = dir !== "sent" && isReceivedInAgency(p, c) && (viewMode === "theoretical" || isCodCollected(p));
      const asOrig = dir !== "received" && isSentFromAgency(p, c) && (viewMode === "theoretical" || isCodSenderPaid(p));
      const n = (asDest ? 1 : 0) + (asOrig ? 1 : 0);
      if (!n) continue;
      const s = stats[c];
      s.especes += a.especes * n;
      s.cheque += a.cheque * n;
      s.traite += a.traite * n;
      s.total += a.total * n;
      s.nbExpeditions += n;
      s.nbUnique += 1;
      if (isMixedCod(p)) s.nbMixtes += 1;
    }
  }
  return Object.values(stats).map((s) => ({ ...s, especes: round22(s.especes), cheque: round22(s.cheque), traite: round22(s.traite), total: round22(s.total) }));
}

// src/utils/dateFilter.ts
var PARCEL_DATE_CACHE = /* @__PURE__ */ new WeakMap();
var parcelDate = (p) => {
  if (!p || typeof p !== "object") return parcelDateRaw(p);
  const c = PARCEL_DATE_CACHE.get(p);
  if (c && c.wd === p.workDate && c.ca === p.createdAt && c.h === p.history) return new Date(c.ms);
  const d = parcelDateRaw(p);
  PARCEL_DATE_CACHE.set(p, { wd: p.workDate, ca: p.createdAt, h: p.history, ms: d.getTime() });
  return d;
};
var parcelDateRaw = (p) => {
  if (p.workDate) {
    return /* @__PURE__ */ new Date(p.workDate + "T12:00:00");
  }
  const ca = p.createdAt;
  if (ca?.toDate) return ca.toDate();
  const ts = p.history?.[0]?.timestamp;
  if (ts) return new Date(ts);
  return /* @__PURE__ */ new Date(0);
};

// src/utils/codAgencyContribution.ts
var COD_MODES = ["th", "ph"];
var COD_DIRS = ["rcv", "snd", "all"];
var COD_STAT_KEYS = ["especes", "cheque", "traite", "total", "nbExp", "nbUnique", "nbMix"];
var COD_RESTE_FIELDS = COD_TYPE_KEYS.map((k) => `reste_${k}_n`);
var COD_DAY_FIELDS = [...COD_MODES.flatMap((m) => COD_DIRS.flatMap((d) => COD_STAT_KEYS.map((k) => `${m}_${d}_${k}`))), ...COD_RESTE_FIELDS];
var COD_UNION_FIELDS = COD_MODES.flatMap((m) => COD_DIRS.map((d) => `u_${m}_${d}`));
var COD_ALL_CITY = "__toutes";
var COD_NO_ORIGIN = "?";
var MODE = { th: "theoretical", ph: "physical" };
var DIR = { rcv: "received", snd: "sent", all: "all" };
var r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function codAgencyContributionOf(p, agencyCities) {
  if (!p) return null;
  const involved = [.../* @__PURE__ */ new Set([p.originCity, p.sender?.city, p.destinationCity, p.receiver?.city])].filter((c) => typeof c === "string" && c && agencyCities.includes(c));
  if (!involved.length) return null;
  const d = parcelDate(p);
  if (!d || Number.isNaN(d.getTime())) return null;
  const cities = {};
  const union = {};
  const sets = {};
  for (const m of COD_MODES) {
    for (const dir of COD_DIRS) {
      const stats = computeAgencyCodStats([p], { viewMode: MODE[m], directionFilter: DIR[dir], cities: involved });
      const counted = [];
      for (const s of stats) {
        const v = cities[s.city] || (cities[s.city] = {});
        v[`${m}_${dir}_especes`] = r2(s.especes);
        v[`${m}_${dir}_cheque`] = r2(s.cheque);
        v[`${m}_${dir}_traite`] = r2(s.traite);
        v[`${m}_${dir}_total`] = r2(s.total);
        v[`${m}_${dir}_nbExp`] = s.nbExpeditions;
        v[`${m}_${dir}_nbUnique`] = s.nbUnique;
        v[`${m}_${dir}_nbMix`] = s.nbMixtes;
        if (s.total > 0) {
          union[`u_${m}_${dir}`] = 1;
          counted.push(s.city);
        }
      }
      if (counted.length) sets[`${m}_${dir}`] = counted.sort().join("|");
    }
  }
  for (const v of Object.values(cities)) {
    for (const k of COD_TYPE_KEYS) v[`reste_${k}_n`] = v[`th_rcv_${k}`] > 0 && !(v[`ph_rcv_${k}`] > 0) ? 1 : 0;
  }
  for (const [c, v] of Object.entries(cities)) if (!Object.values(v).some((x) => x)) delete cities[c];
  if (!Object.keys(cities).length) return null;
  return { day: getOperationalDayString(d), origin: p.originCity || COD_NO_ORIGIN, cityList: Object.keys(cities).sort(), cities, union, sets };
}
function codDayDeltas(c, sign) {
  if (!c) return [];
  const out = [];
  const origin = c.origin || COD_NO_ORIGIN;
  for (const [city, v] of Object.entries(c.cities)) {
    const nums2 = {};
    for (const f of COD_DAY_FIELDS) nums2[f] = r2(sign * (Number(v[f]) || 0));
    const nested2 = [];
    for (const m of COD_MODES) for (const k of COD_STAT_KEYS) {
      const n = Number(v[`${m}_rcv_${k}`]) || 0;
      if (n) nested2.push({ path: ["byOrigin", origin, `${m}_rcv_${k}`], n: r2(sign * n) });
    }
    out.push({ city, day: c.day, nums: nums2, nested: nested2 });
  }
  const nums = {};
  for (const f of COD_UNION_FIELDS) nums[f] = sign * (c.union && c.union[f] || 0);
  const nested = [];
  for (const [md, key] of Object.entries(c.sets || {})) {
    nested.push({ path: ["sets", md, key], n: sign });
    const [m, dir] = md.split("_");
    if (dir === "rcv") nested.push({ path: ["setsO", m, origin, key], n: sign });
  }
  if (Object.values(nums).some((x) => x) || nested.length) out.push({ city: COD_ALL_CITY, day: c.day, nums, nested });
  return out;
}
function codAgencyFromDays(docs, cities, opts) {
  const m = opts.viewMode === "physical" ? "ph" : "th";
  const dir = opts.directionFilter === "sent" ? "snd" : opts.directionFilter === "received" ? "rcv" : "all";
  const byOrigin = dir === "rcv" && opts.originCityFilter && opts.originCityFilter !== "all" ? opts.originCityFilter : null;
  const rows = new Map(cities.map((city) => [city, { city, especes: 0, cheque: 0, traite: 0, total: 0, nbExpeditions: 0, nbUnique: 0, nbMixtes: 0 }]));
  const combos = /* @__PURE__ */ new Map();
  const field = (k) => `${m}_${dir}_${k}`;
  for (const d of docs) {
    if (d.city === COD_ALL_CITY) {
      const sets = byOrigin ? d.setsO?.[m]?.[byOrigin] : d.sets?.[`${m}_${dir}`];
      for (const [key, n] of Object.entries(sets || {})) combos.set(key, (combos.get(key) || 0) + (Number(n) || 0));
      continue;
    }
    const row = rows.get(d.city);
    if (!row) continue;
    const src = byOrigin ? d.byOrigin?.[byOrigin] || {} : d;
    row.especes += Number(src[field("especes")]) || 0;
    row.cheque += Number(src[field("cheque")]) || 0;
    row.traite += Number(src[field("traite")]) || 0;
    row.total += Number(src[field("total")]) || 0;
    row.nbExpeditions += Number(src[field("nbExp")]) || 0;
    row.nbUnique += Number(src[field("nbUnique")]) || 0;
    row.nbMixtes += Number(src[field("nbMix")]) || 0;
  }
  const stats = [...rows.values()].map((s) => ({ ...s, especes: r2(s.especes), cheque: r2(s.cheque), traite: r2(s.traite), total: r2(s.total) }));
  const uniqueOf = (group) => {
    const g = new Set(group);
    let n = 0;
    for (const [key, count] of combos) if (key.split("|").some((c) => g.has(c))) n += count;
    return n;
  };
  return { stats, uniqueOf };
}
function codResteFromDays(docs, city, part) {
  let attendu = 0, encaisse = 0, count = 0;
  for (const d of docs) {
    if (d.city !== city) continue;
    attendu += Number(d[`th_rcv_${part}`]) || 0;
    encaisse += Number(d[`ph_rcv_${part}`]) || 0;
    count += Number(d[`reste_${part}_n`]) || 0;
  }
  return { attendu: r2(attendu), encaisse: r2(encaisse), reste: r2(attendu - encaisse), count };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  COD_ALL_CITY,
  COD_DAY_FIELDS,
  COD_DIRS,
  COD_MODES,
  COD_NO_ORIGIN,
  COD_RESTE_FIELDS,
  COD_STAT_KEYS,
  COD_UNION_FIELDS,
  codAgencyContributionOf,
  codAgencyFromDays,
  codDayDeltas,
  codResteFromDays
});
