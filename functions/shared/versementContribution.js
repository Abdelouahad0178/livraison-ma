// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/versementContribution.ts — ne pas modifier.
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

// src/utils/versementContribution.ts
var versementContribution_exports = {};
__export(versementContribution_exports, {
  versementContributionOf: () => versementContributionOf
});
module.exports = __toCommonJS(versementContribution_exports);

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
function getOperationalDayString(date) {
  const opDay = getOperationalDay(date);
  return opDay.toISOString().split("T")[0];
}

// src/firebase/constants.ts
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
var isPortDuMoneyBeforeStart = (p) => p?.portType === "port_du" && (p.portStatus === "collected" || p.portStatus === "received") && beforeStart(p.portCollectedAt ?? createdOf(p));
var isPortPayeMoneyBeforeStart = (p) => p?.portType === "port_paye" && beforeStart(createdOf(p));

// src/config/siteDelays.ts
var DELAY_BOUNDS = {
  collectDays: { min: 7, max: 31, code: 14 },
  activeDays: { min: 45, max: 90, code: 45 }
};
var current = { collectDays: DELAY_BOUNDS.collectDays.code, activeDays: DELAY_BOUNDS.activeDays.code };

// src/utils/agencyCaisseRules.ts
var toDateSafe = (v) => {
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v?.seconds === "number") return new Date(v.seconds * 1e3);
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return /* @__PURE__ */ new Date(v + "T12:00:00");
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};
var safeParseAmount = (value) => {
  if (value === null || value === void 0 || value === "") return 0;
  const num = parseFloat(String(value).replace(",", "."));
  return !isNaN(num) && isFinite(num) && num >= 0 ? num : 0;
};
var isReturnedForGroup = (p) => !!(p.returnedAt || p.wasReturned || p.status === "Retourn\xE9");
var isPortDuParcel = (p) => p.portType === "port_du" && !p.portPayeMethod;
var portNotCollected = (p) => !p.portStatus || p.portStatus === "pending";
var isPortCollectedBeforeReturn = (p) => {
  if (!isReturnedForGroup(p) || portNotCollected(p)) return false;
  const c = toDateSafe(p.portCollectedAt) ?? toDateSafe(p.portReceivedAt);
  const r = toDateSafe(p.returnedAt);
  return !c || !r || c.getTime() < r.getTime();
};
var isPortPayeParcel = (p) => p.portType === "port_paye" && !p.portPayeMethod;
var isRamasseGuichet = (p, city) => isPortPayeParcel(p) && p.originCity === city && !p.pickupDriverId && p.status !== "En cours de ramassage" && p.status !== "Annul\xE9" && safeParseAmount(p.price) > 0 && !isPortPayeMoneyBeforeStart(p);
var isAdminTransferred = (p) => !!(p?.portAdminTransferred || p?.adminTransferred);
var isPortDuHeldByAgency = (p, agencyHolderIds) => !agencyHolderIds || !!p?.portChefReceivedAt || p?.portStatus === "received" || !!p?.portCollectedById && agencyHolderIds.has(p.portCollectedById);
var collecteContributionFor = (p, city, agencyHolderIds) => {
  if (p?.portStatus !== "collected" && p?.portStatus !== "received") return null;
  let kind;
  let when;
  if (isPortDuParcel(p) && !isPortDuMoneyBeforeStart(p) && p.destinationCity === city && !isPortCollectedBeforeReturn(p)) {
    kind = "portDu";
    when = toDateSafe(p.portCollectedAt) ?? toDateSafe(p.portReceivedAt);
  } else if (isRamasseGuichet(p, city) && !isReturnedForGroup(p)) {
    kind = "portPaye";
    when = toDateSafe(p.portCollectedAt) ?? toDateSafe(p.portPayeExpReceivedAt) ?? (p.portStatus === "received" ? toDateSafe(p.portReceivedAt) : null);
  } else return null;
  if (!when) return null;
  const bucket = isAdminTransferred(p) ? "verse" : kind === "portDu" && !isPortDuHeldByAgency(p, agencyHolderIds) ? "nonRecu" : kind === "portPaye" && agencyHolderIds && p.portStatus !== "received" ? "nonRecu" : "aVerser";
  return { dayKey: getOperationalDayString(when), kind, bucket, amount: safeParseAmount(p.price) };
};

// src/utils/versementContribution.ts
function versementContributionOf(p, holdersOf) {
  if (!p) return null;
  const cities = [...new Set([p.destinationCity, p.originCity].filter(Boolean))];
  for (const city of cities) {
    const c = collecteContributionFor(p, city, holdersOf(city));
    if (c) return { city, ...c };
  }
  return null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  versementContributionOf
});
