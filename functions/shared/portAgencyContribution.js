// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/portAgencyContribution.ts — ne pas modifier.
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

// src/utils/portAgencyContribution.ts
var portAgencyContribution_exports = {};
__export(portAgencyContribution_exports, {
  PORT_ALL_CITY: () => PORT_ALL_CITY,
  PORT_DAY_FIELDS: () => PORT_DAY_FIELDS,
  PORT_PH_KEYS: () => PORT_PH_KEYS,
  PORT_TH_KEYS: () => PORT_TH_KEYS,
  portAgencyContributionOf: () => portAgencyContributionOf
});
module.exports = __toCommonJS(portAgencyContribution_exports);

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

// src/utils/billingAgency.ts
var isCompteExpediteurType = (t) => t === "port_en_compte_expediteur" || t === "port_en_compte";
var DESTINATION_VISIBLE_STATUSES = ["En transit", "Arriv\xE9 en agence", "En cours de livraison", "Livr\xE9", "Retourn\xE9"];
var isVisibleInDestinationAgency = (p = {}) => {
  if (p?.wasReturned) return false;
  return !!(p?.visibleInDestinationAgency || p?.shipmentLoadedAt || p?.destinationArrivedAt || p?.destinationAgentId || p?.chauffeurId || DESTINATION_VISIBLE_STATUSES.includes(p?.status));
};
var isSentFromAgency = (p, city) => !!city && (p?.originCity === city || p?.sender?.city === city);
var isReceivedInAgency = (p, city) => !!city && (p?.destinationCity === city || p?.receiver?.city === city) && isVisibleInDestinationAgency(p);
var isInAgencyScope = (p, city, direction = "all") => direction === "sent" ? isSentFromAgency(p, city) : direction === "received" ? isReceivedInAgency(p, city) : isSentFromAgency(p, city) || isReceivedInAgency(p, city);
var agencyPortAmounts = (p, city) => {
  const out = { portPaye: 0, portDu: 0, portDuCheque: 0, enCompteExp: 0, enCompteDest: 0 };
  if (!city) return out;
  const price = parseFloat(p?.price) || 0;
  const t = p?.portType;
  const isOrig = p?.originCity === city || p?.sender?.city === city;
  const isDest = p?.destinationCity === city || p?.receiver?.city === city;
  if (isOrig && t === "port_paye") out.portPaye = price;
  if (isOrig && isCompteExpediteurType(t)) out.enCompteExp = price;
  if (isDest && t === "port_du") out.portDu = price;
  if (isDest && t === "port_du_cheque") out.portDuCheque = price;
  if (isDest && t === "port_en_compte_destinataire") out.enCompteDest = price;
  return out;
};

// src/utils/moneyFlow.ts
var MONEY_START = /* @__PURE__ */ new Date("2026-10-05T08:00:00+01:00");
var toTime = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  const d = typeof v?.toDate === "function" ? v.toDate() : typeof v?.seconds === "number" ? new Date(v.seconds * 1e3) : v instanceof Date ? v : new Date(v);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
};
var createdOf = (p) => p?.createdAt ?? p?.history?.[0]?.timestamp;
var beforeStart = (v) => {
  const t = toTime(v);
  return t !== null && t < MONEY_START.getTime();
};
var isPortPayeMoneyBeforeStart = (p) => p?.portType === "port_paye" && beforeStart(createdOf(p));

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

// src/config/siteDelays.ts
var DELAY_BOUNDS = {
  collectDays: { min: 7, max: 31, code: 14 },
  activeDays: { min: 45, max: 90, code: 45 }
};
var current = { collectDays: DELAY_BOUNDS.collectDays.code, activeDays: DELAY_BOUNDS.activeDays.code };

// src/config/guichetHolders.ts
var LINKED_EXPLOITATION_OF = {
  sB9GAnS6IQZWdb3O0rVa9XJMg4q2: "cvRsdyLS9xacqg0jXCVlR0O2W0f2"
};
var linkedExploitationOf = (uid) => uid ? LINKED_EXPLOITATION_OF[uid] || null : null;

// src/utils/agencyCaisseRules.ts
var safeParseAmount = (value) => {
  if (value === null || value === void 0 || value === "") return 0;
  const num = parseFloat(String(value).replace(",", "."));
  return !isNaN(num) && isFinite(num) && num >= 0 ? num : 0;
};
var isPortPayeParcel = (p) => p.portType === "port_paye" && !p.portPayeMethod;
var isRamasseGuichet = (p, city) => isPortPayeParcel(p) && p.originCity === city && !p.pickupDriverId && p.status !== "En cours de ramassage" && p.status !== "Annul\xE9" && safeParseAmount(p.price) > 0 && !isPortPayeMoneyBeforeStart(p);
var isGuichetPortPayeCollected = (p) => p?.portStatus === "received" || !!p?.portPayeExpReceivedAt || !!linkedExploitationOf(p?.portCollectedById);

// src/utils/agencyFollowUp.ts
var round2 = (n) => Math.round(n * 100) / 100;
var portPayeInCaisse = (p, originCity) => !isRamasseGuichet(p, originCity) || isGuichetPortPayeCollected(p);
var safeParseFloat = (value) => {
  if (value === null || value === void 0 || value === "") return 0;
  const num = parseFloat(String(value).replace(",", "."));
  return !isNaN(num) && isFinite(num) && num >= 0 ? num : 0;
};
function computeAgencyPortStats(parcels, opts) {
  const { viewMode, directionFilter = "all", originCityFilter = "all", cities = CITIES } = opts;
  if (!Array.isArray(parcels)) return [];
  const stats = {};
  cities.forEach((city) => {
    stats[city] = { city, portPaye: 0, portDu: 0, portDuCheque: 0, enCompteExp: 0, enCompteDest: 0, totalPort: 0, nbExpeditions: 0, nbUnique: 0 };
  });
  const agencyDir = directionFilter === "sent" ? "sent" : directionFilter === "received" ? "received" : "all";
  parcels.forEach((p) => {
    const originCity = p.originCity;
    const destCity = p.destinationCity;
    const matchesOriginFilter = directionFilter !== "received" || originCityFilter === "all" || originCity === originCityFilter;
    const involvedCities = [.../* @__PURE__ */ new Set([originCity, p.sender?.city, destCity, p.receiver?.city])].filter((c) => c && stats[c]);
    if (viewMode === "theoretical") {
      if (matchesOriginFilter) {
        for (const c of involvedCities) {
          if (!isInAgencyScope(p, c, agencyDir)) continue;
          const a = agencyPortAmounts(p, c);
          stats[c].portPaye += a.portPaye;
          stats[c].portDu += a.portDu;
          stats[c].portDuCheque += a.portDuCheque;
          stats[c].enCompteExp += a.enCompteExp;
          stats[c].enCompteDest += a.enCompteDest;
        }
      }
    } else {
      const price = safeParseFloat(p.price);
      const portType = p.portType;
      const portStatus = p.portStatus;
      const collected = portStatus === "collected" || portStatus === "received";
      if (portType === "port_du" && collected && price > 0 && destCity && stats[destCity]) {
        stats[destCity].portDu += price;
      }
      if (portType === "port_du_cheque" && collected && price > 0 && destCity && stats[destCity]) {
        stats[destCity].portDuCheque += price;
      }
      if (portType === "port_paye" && !p.portPayeMethod && collected && price > 0 && originCity && stats[originCity] && portPayeInCaisse(p, originCity)) {
        stats[originCity].portPaye += price;
      }
    }
    if (matchesOriginFilter) {
      for (const c of involvedCities) {
        const sent = agencyDir !== "received" && isSentFromAgency(p, c);
        const received = agencyDir !== "sent" && isReceivedInAgency(p, c);
        stats[c].nbExpeditions += (sent ? 1 : 0) + (received ? 1 : 0);
        if (sent || received) stats[c].nbUnique += 1;
      }
    }
  });
  return Object.values(stats).map((stat) => {
    const totalPort = stat.portPaye + stat.portDu + stat.portDuCheque + stat.enCompteExp + stat.enCompteDest;
    return {
      ...stat,
      portPaye: round2(stat.portPaye),
      portDu: round2(stat.portDu),
      portDuCheque: round2(stat.portDuCheque),
      enCompteExp: round2(stat.enCompteExp),
      enCompteDest: round2(stat.enCompteDest),
      totalPort: round2(totalPort)
    };
  });
}

// src/utils/portAgencyContribution.ts
var PORT_TH_KEYS = ["portPaye", "portDu", "portDuCheque", "enCompteExp", "enCompteDest"];
var PORT_PH_KEYS = ["portPaye", "portDu", "portDuCheque"];
var PORT_DAY_FIELDS = [...PORT_TH_KEYS.map((k) => `th_${k}`), ...PORT_PH_KEYS.map((k) => `ph_${k}`), "nbExp", "nbUnique"];
var PORT_ALL_CITY = "__toutes";
var r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function portAgencyContributionOf(p, agencyCities) {
  if (!p) return null;
  const involved = [.../* @__PURE__ */ new Set([p.originCity, p.sender?.city, p.destinationCity, p.receiver?.city])].filter((c) => typeof c === "string" && c && agencyCities.includes(c));
  if (!involved.length) return null;
  const d = parcelDate(p);
  if (!d || Number.isNaN(d.getTime())) return null;
  const th = computeAgencyPortStats([p], { viewMode: "theoretical", cities: involved });
  const ph = computeAgencyPortStats([p], { viewMode: "physical", cities: involved });
  const cities = {};
  let union = 0;
  th.forEach((t, i) => {
    const q = ph[i];
    const v = {};
    PORT_TH_KEYS.forEach((k) => {
      v[`th_${k}`] = r2(t[k]);
    });
    PORT_PH_KEYS.forEach((k) => {
      v[`ph_${k}`] = r2(q[k]);
    });
    v.nbExp = t.nbExpeditions;
    v.nbUnique = t.nbUnique;
    if (Object.values(v).some((x) => x)) cities[t.city] = v;
    if (t.nbUnique) union = 1;
  });
  if (!Object.keys(cities).length) return null;
  return { day: getOperationalDayString(d), cities, union };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PORT_ALL_CITY,
  PORT_DAY_FIELDS,
  PORT_PH_KEYS,
  PORT_TH_KEYS,
  portAgencyContributionOf
});
