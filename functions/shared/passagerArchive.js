// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/passagerArchive.ts — ne pas modifier.
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

// src/utils/passagerArchive.ts
var passagerArchive_exports = {};
__export(passagerArchive_exports, {
  PASSAGER_ARCHIVED_BY: () => PASSAGER_ARCHIVED_BY,
  PASSAGER_ARCHIVE_DAYS: () => PASSAGER_ARCHIVE_DAYS,
  PASSAGER_MAX_SEEN: () => PASSAGER_MAX_SEEN,
  createdMsOf: () => createdMsOf,
  isOldEnoughForPassagerArchive: () => isOldEnoughForPassagerArchive,
  isPassagerArchiveCandidate: () => isPassagerArchiveCandidate,
  isPassagerParcel: () => isPassagerParcel,
  isPortSettled: () => isPortSettled,
  passagerArchiveCutoffMs: () => passagerArchiveCutoffMs,
  passagerArchiveFields: () => passagerArchiveFields,
  passagerNamesOf: () => passagerNamesOf
});
module.exports = __toCommonJS(passagerArchive_exports);
var PASSAGER_ARCHIVE_DAYS = 15;
var PASSAGER_MAX_SEEN = 2;
var PASSAGER_ARCHIVED_BY = "auto-system-passager-15j";
var PASSAGER_PORT_TYPES = ["port_du", "port_du_cheque", "port_paye"];
var isPortSettled = (p) => p?.portStatus === "collected" || p?.portStatus === "received";
var filled = (s) => String(s ?? "").trim() !== "";
function createdMsOf(p) {
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
var passagerArchiveCutoffMs = (now) => now - PASSAGER_ARCHIVE_DAYS * 864e5;
var isOldEnoughForPassagerArchive = (p, now) => {
  const ms = createdMsOf(p);
  return ms > 0 && ms < passagerArchiveCutoffMs(now);
};
function isPassagerArchiveCandidate(p) {
  if (!p || p.isArchived) return false;
  if (p.status !== "Livr\xE9") return false;
  if ((Number(p.codAmount) || 0) > 0 || p.codMixed) return false;
  if ((p.serviceType || "simple") !== "simple") return false;
  if (!PASSAGER_PORT_TYPES.includes(p.portType)) return false;
  if (!isPortSettled(p)) return false;
  return filled(p.senderNameNorm) && filled(p.receiverNameNorm);
}
var passagerNamesOf = (p) => [.../* @__PURE__ */ new Set([String(p.senderNameNorm), String(p.receiverNameNorm)])];
function isPassagerParcel(p, seen) {
  return [p.senderNameNorm, p.receiverNameNorm].every((n) => {
    const c = seen(String(n));
    return c > 0 && c <= PASSAGER_MAX_SEEN;
  });
}
var passagerArchiveFields = (now) => ({
  isArchived: true,
  archivedAt: new Date(now).toISOString(),
  archivedBy: PASSAGER_ARCHIVED_BY
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PASSAGER_ARCHIVED_BY,
  PASSAGER_ARCHIVE_DAYS,
  PASSAGER_MAX_SEEN,
  createdMsOf,
  isOldEnoughForPassagerArchive,
  isPassagerArchiveCandidate,
  isPassagerParcel,
  isPortSettled,
  passagerArchiveCutoffMs,
  passagerArchiveFields,
  passagerNamesOf
});
