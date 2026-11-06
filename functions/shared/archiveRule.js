// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/archiveRule.ts — ne pas modifier.
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

// src/utils/archiveRule.ts
var archiveRule_exports = {};
__export(archiveRule_exports, {
  ARCHIVED_BY_AUTO: () => ARCHIVED_BY_AUTO,
  ARCHIVE_MONEY_START_MS: () => ARCHIVE_MONEY_START_MS,
  DAY_MS: () => DAY_MS,
  SETTLED_ARCHIVE_DAYS: () => SETTLED_ARCHIVE_DAYS,
  UNARCHIVED_BY_AUTO: () => UNARCHIVED_BY_AUTO,
  archiveCreatedMs: () => archiveCreatedMs,
  isArchiveSettled: () => isArchiveSettled,
  isArchivedButUnsettled: () => isArchivedButUnsettled,
  isCodSettledForArchive: () => isCodSettledForArchive,
  isOldUnsettled: () => isOldUnsettled,
  isPortSettledForArchive: () => isPortSettledForArchive,
  isTrialPeriodParcel: () => isTrialPeriodParcel,
  oldUnsettledItem: () => oldUnsettledItem,
  shouldArchiveNow: () => shouldArchiveNow,
  shouldWakeArchived: () => shouldWakeArchived,
  unsettledReason: () => unsettledReason
});
module.exports = __toCommonJS(archiveRule_exports);
var DAY_MS = 864e5;
var ARCHIVE_MONEY_START_MS = Date.parse("2026-10-05T08:00:00+01:00");
var SETTLED_ARCHIVE_DAYS = 30;
var ARCHIVED_BY_AUTO = "auto-system";
var UNARCHIVED_BY_AUTO = "auto-system-reveil";
var num = (v) => {
  const n = Number.parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
function archiveCreatedMs(p) {
  const c = p?.createdAt;
  if (!c) return 0;
  if (typeof c.toMillis === "function") return c.toMillis();
  if (c instanceof Date) return c.getTime();
  if (typeof c === "number") return c;
  if (typeof c === "string") return Date.parse(c) || 0;
  if (typeof c._seconds === "number") return c._seconds * 1e3;
  if (typeof c.seconds === "number") return c.seconds * 1e3;
  return 0;
}
function isPortSettledForArchive(p) {
  if (num(p?.price) <= 0) return true;
  const t = String(p?.portType || "");
  if (t.startsWith("port_en_compte")) return true;
  if (p?.portPayeMethod) return true;
  return p?.portStatus === "collected" || p?.portStatus === "received";
}
function isCodSettledForArchive(p) {
  if (num(p?.codAmount) <= 0) return true;
  if (p?.codStatus === "remis" || p?.codStatus === "regle") return true;
  return !!p?.codSenderPaid || !!p?.centralSupplierPaid || p?.centralSupplierPaymentStatus === "paid";
}
function isArchiveSettled(p) {
  const st = p?.status;
  if (st === "Annul\xE9") return true;
  if (st === "Retour finalis\xE9") return isPortSettledForArchive(p);
  if (st === "Livr\xE9") return isPortSettledForArchive(p) && isCodSettledForArchive(p);
  return false;
}
var isTrialPeriodParcel = (p) => {
  const ms = archiveCreatedMs(p);
  return ms > 0 && ms < ARCHIVE_MONEY_START_MS;
};
function shouldArchiveNow(p, now, legacyForceDays) {
  if (!p || p.isArchived) return false;
  const ms = archiveCreatedMs(p);
  if (!(ms > 0)) return false;
  const age = now - ms;
  if (ms < ARCHIVE_MONEY_START_MS) {
    if (age > legacyForceDays * DAY_MS) return true;
    return age > SETTLED_ARCHIVE_DAYS * DAY_MS && p.status === "Livr\xE9" && !(num(p.codAmount) > 0);
  }
  return age > SETTLED_ARCHIVE_DAYS * DAY_MS && isArchiveSettled(p);
}
function shouldWakeArchived(before, after) {
  if (!before || !after) return false;
  if (before.isArchived !== true || after.isArchived !== true) return false;
  if (isTrialPeriodParcel(after)) return false;
  return isArchiveSettled(before) && !isArchiveSettled(after);
}
var isArchivedButUnsettled = (p) => !!p && p.isArchived === true && !isTrialPeriodParcel(p) && archiveCreatedMs(p) > 0 && !isArchiveSettled(p);
function isOldUnsettled(p, now, windowDays) {
  if (!p || p.isArchived) return false;
  const ms = archiveCreatedMs(p);
  if (!(ms >= ARCHIVE_MONEY_START_MS)) return false;
  if (!(now - ms > windowDays * DAY_MS)) return false;
  return !isArchiveSettled(p);
}
function unsettledReason(p) {
  const st = String(p?.status || "\u2014");
  if (st !== "Livr\xE9" && st !== "Retour finalis\xE9" && st !== "Annul\xE9") return `statut \xAB ${st} \xBB`;
  const parts = [];
  if (!isPortSettledForArchive(p)) parts.push("port non encaiss\xE9");
  if (st === "Livr\xE9" && !isCodSettledForArchive(p)) parts.push(p?.codStatus === "collected" ? "COD encaiss\xE9, pas encore re\xE7u par le chef d'agence" : "COD non encaiss\xE9");
  return parts.join(" + ") || "\xE0 v\xE9rifier";
}
function oldUnsettledItem(id, p) {
  const ms = archiveCreatedMs(p);
  return {
    id,
    nic: String(p?.senderNic || p?.sender?.nic || p?.trackingId || id),
    status: String(p?.status || ""),
    createdAt: ms ? new Date(ms).toISOString() : "",
    from: String(p?.originCity || ""),
    to: String(p?.destinationCity || ""),
    city: String(p?.wasReturned && p?.returnToCity || p?.destinationCity || p?.receiver?.city || ""),
    port: isPortSettledForArchive(p) ? 0 : num(p?.price),
    cod: isCodSettledForArchive(p) ? 0 : num(p?.codAmount),
    driver: String(p?.deliveryDriverName || ""),
    reason: unsettledReason(p)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ARCHIVED_BY_AUTO,
  ARCHIVE_MONEY_START_MS,
  DAY_MS,
  SETTLED_ARCHIVE_DAYS,
  UNARCHIVED_BY_AUTO,
  archiveCreatedMs,
  isArchiveSettled,
  isArchivedButUnsettled,
  isCodSettledForArchive,
  isOldUnsettled,
  isPortSettledForArchive,
  isTrialPeriodParcel,
  oldUnsettledItem,
  shouldArchiveNow,
  shouldWakeArchived,
  unsettledReason
});
