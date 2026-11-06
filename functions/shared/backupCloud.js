// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/backupCloud.ts — ne pas modifier.
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

// src/utils/backupCloud.ts
var backupCloud_exports = {};
__export(backupCloud_exports, {
  BACKUP_COLLECTIONS: () => BACKUP_COLLECTIONS,
  BACKUP_COLLECTION_END: () => BACKUP_COLLECTION_END,
  BACKUP_FILE_PREFIX: () => BACKUP_FILE_PREFIX,
  BACKUP_FOLDER: () => BACKUP_FOLDER,
  BACKUP_STALE_DAYS: () => BACKUP_STALE_DAYS,
  MAX_CLOUD_BACKUPS: () => MAX_CLOUD_BACKUPS,
  backupCollectionStart: () => backupCollectionStart,
  backupDocLine: () => backupDocLine,
  backupFileName: () => backupFileName,
  backupFooter: () => backupFooter,
  backupHeader: () => backupHeader,
  backupStatusOf: () => backupStatusOf,
  backupsToDelete: () => backupsToDelete,
  readPagesWithRetry: () => readPagesWithRetry,
  serializeBackupValue: () => serializeBackupValue
});
module.exports = __toCommonJS(backupCloud_exports);

// src/firebase/backupCollections.ts
var BACKUP_COLLECTIONS = [
  "settings",
  "parcels",
  "parcels_archive",
  "users",
  "clients",
  "payments",
  "invoices",
  "caisseEntries",
  "agentRemises",
  "caissierRemarks",
  "caisseClotures",
  "caissierTransactions",
  "caissierRequests",
  "agentCashRecoveryRequests",
  "agentCodRequests",
  "agencyCashes",
  "vehicles",
  "sectors",
  "directorLogs",
  "cities",
  "workingDates",
  "clientMessages",
  "clientPortals",
  "portalAccounts",
  "reglements",
  "reglementsRapports",
  "bankDeposits",
  "centralCodDeposits",
  "centralSupplierPayments",
  "valeursEnvois",
  "deliverySheets",
  "arrivages",
  "lostParcels",
  "driverPortDuTransactions",
  "driverVersements",
  "clientPortDuTransactions",
  "deliveryDelays",
  "return_funds_cheques",
  "return_funds_especes",
  "retourDocuments",
  "adminTransfers",
  "bonRamasageBatches",
  "modificationRequests",
  // Ajoutées le 06/11/2026 (de vraies données qui n'étaient pas sauvegardées)
  "valeursLots",
  "valeursLotItems",
  "deliverySignatures",
  "controlReports",
  "controlAiReports",
  "backupImports",
  "agencies",
  "agentNotes",
  "centralCash",
  "versementExceptions",
  "clientGroups",
  "clientAccounts",
  // Gestion commerciale : saisies à la main dans bgexpress.web.app
  "commercialContracts",
  "commercialQuotes",
  "commercialInvoices",
  "commercialReminders",
  "commercialPurchases",
  "commercialEmployees",
  "commercialPayslips",
  "commercialTvaDeclarations",
  "commercialSettings",
  "commercialCounters"
];

// src/utils/backupFileWriter.ts
function serializeBackupValue(value) {
  if (value?.toDate && typeof value.toDate === "function") {
    return { __type: "timestamp", value: value.toDate().toISOString() };
  }
  if (value instanceof Date) return { __type: "date", value: value.toISOString() };
  if (Array.isArray(value)) return value.map(serializeBackupValue);
  if (value && typeof value === "object") {
    if (typeof value.path === "string" && value.firestore) return { __type: "reference", path: value.path };
    if (typeof value.latitude === "number" && typeof value.longitude === "number" && typeof value.isEqual === "function") {
      return { __type: "geopoint", latitude: value.latitude, longitude: value.longitude };
    }
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeBackupValue(nested)]));
  }
  return value;
}
var backupHeader = (exportedAt) => `{"app":"BG Express","schema":"firestore-backup-v1","exportedAt":${JSON.stringify(exportedAt)},"collections":{`;
var backupCollectionStart = (name, first) => `${first ? "" : ","}
${JSON.stringify(name)}:[`;
var backupDocLine = (item, first) => `${first ? "" : ","}
${JSON.stringify(item)}`;
var BACKUP_COLLECTION_END = "\n]";
var backupFooter = (counts, errors) => `
},"counts":${JSON.stringify(counts)},"errors":${JSON.stringify(errors)}}
`;
async function readPagesWithRetry(fetchPage, onPage, { pageSize = 500, retries = 3, retryDelayMs = 2e3, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let after = null;
  let total = 0;
  for (let guard = 0; guard < 1e5; guard++) {
    let docs = null;
    for (let attempt = 0; ; attempt++) {
      try {
        docs = await fetchPage(after, pageSize);
        break;
      } catch (err) {
        if (attempt >= retries) throw err;
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
    if (docs.length) {
      await onPage(docs);
      total += docs.length;
      after = docs[docs.length - 1].id;
    }
    if (docs.length < pageSize) break;
  }
  return total;
}

// src/utils/backupCloud.ts
var BACKUP_FOLDER = "auto-backups";
var BACKUP_FILE_PREFIX = `${BACKUP_FOLDER}/backup-bgexpress-`;
var MAX_CLOUD_BACKUPS = 10;
var BACKUP_STALE_DAYS = 8;
var DAY_MS = 864e5;
var backupFileName = (exportedAt) => `${BACKUP_FILE_PREFIX}${exportedAt.replace(/[:.]/g, "-").slice(0, 19)}.json`;
function backupsToDelete(names, max = MAX_CLOUD_BACKUPS) {
  const sorted = names.filter((n) => n.startsWith(BACKUP_FILE_PREFIX)).sort();
  return sorted.slice(0, Math.max(0, sorted.length - max));
}
function backupStatusOf(files, nowMs, maxDays = BACKUP_STALE_DAYS) {
  const list = files.filter((f) => f.name.startsWith(BACKUP_FILE_PREFIX)).sort((a, b) => a.name.localeCompare(b.name));
  const last = list[list.length - 1];
  const at = last?.timeCreated ? Date.parse(last.timeCreated) : NaN;
  if (!last || !Number.isFinite(at)) return { count: list.length, lastAt: null, ageDays: null, sizeBytes: 0, documents: null, errors: 0, stale: true };
  const ageDays = Math.floor((nowMs - at) / DAY_MS);
  const errors = Number(last.errors) || 0;
  return {
    count: list.length,
    lastAt: new Date(at).toISOString(),
    ageDays,
    sizeBytes: Number(last.size) || 0,
    documents: last.documents === void 0 ? null : Number(last.documents),
    errors,
    stale: nowMs - at > maxDays * DAY_MS || errors > 0
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BACKUP_COLLECTIONS,
  BACKUP_COLLECTION_END,
  BACKUP_FILE_PREFIX,
  BACKUP_FOLDER,
  BACKUP_STALE_DAYS,
  MAX_CLOUD_BACKUPS,
  backupCollectionStart,
  backupDocLine,
  backupFileName,
  backupFooter,
  backupHeader,
  backupStatusOf,
  backupsToDelete,
  readPagesWithRetry,
  serializeBackupValue
});
