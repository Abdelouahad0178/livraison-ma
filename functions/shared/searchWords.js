// ⚠️ FICHIER GÉNÉRÉ par scripts/build-functions-shared.mjs depuis src/utils/searchWords.ts — ne pas modifier.
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

// src/utils/searchWords.ts
var searchWords_exports = {};
__export(searchWords_exports, {
  chequeKeyOf: () => chequeKeyOf,
  chequeNumbersOf: () => chequeNumbersOf,
  searchDocOf: () => searchDocOf,
  searchTokensOf: () => searchTokensOf,
  wordQueryMatches: () => wordQueryMatches,
  wordQueryOf: () => wordQueryOf,
  wordsOf: () => wordsOf
});
module.exports = __toCommonJS(searchWords_exports);
var fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var wordsOf = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2).slice(0, 12);
var prefixesOf = (w) => {
  const out = [w];
  for (let n = 3; n < w.length && n <= 20; n++) out.push(w.slice(0, n));
  return out;
};
var chequeKeyOf = (v) => String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
function chequeNumbersOf(p) {
  const docs = Array.isArray(p?.codDocuments) ? p.codDocuments.map((d) => d?.numero) : [];
  return [...docs, p?.codReceivedChequeNum, p?.portDuChequeNumero, p?.portPayeChequeNumero, p?.centralChequeNum].map(chequeKeyOf).filter((k) => k.length >= 3);
}
function searchTokensOf(p) {
  const set = /* @__PURE__ */ new Set();
  const names = [["s", p?.sender?.name ?? p?.senderName], ["r", p?.receiver?.name ?? p?.receiverName], ["k", p?.clientName]];
  for (const [f, name] of names) for (const w of wordsOf(name)) for (const x of prefixesOf(w)) set.add(`${f}:${x}`);
  for (const k of chequeNumbersOf(p)) {
    set.add(`c:${k}`);
    for (let n = 4; n < k.length; n++) set.add(`c:${k.slice(0, n)}`);
  }
  return [...set].sort();
}
var toMs = (v) => {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v._seconds === "number") return v._seconds * 1e3;
  if (typeof v.seconds === "number") return v.seconds * 1e3;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};
var searchDocOf = (p) => ({ w: searchTokensOf(p), d: toMs(p?.createdAt) });
function wordQueryOf(term, scope = "all") {
  const words = wordsOf(term);
  const fields = scope === "sender" ? ["s"] : scope === "receiver" ? ["r"] : ["s", "r", "k"];
  const best = [...words].sort((a, b) => b.length - a.length)[0];
  const raw = String(term ?? "").trim();
  const ck = chequeKeyOf(raw);
  const cheque = scope === "all" && !/\s/.test(raw) && ck.length >= 4 && /\d/.test(ck) ? ck : null;
  const any = [...best && best.length >= 3 ? fields.map((f) => `${f}:${best}`) : [], ...cheque ? [`c:${cheque}`] : []];
  return any.length ? { any, words: best && best.length >= 3 ? words : [], fields, cheque } : null;
}
function wordQueryMatches(w, q) {
  const set = new Set(w);
  if (q.cheque && set.has(`c:${q.cheque}`)) return true;
  return q.words.length > 0 && q.fields.some((f) => q.words.every((x) => set.has(`${f}:${x}`)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  chequeKeyOf,
  chequeNumbersOf,
  searchDocOf,
  searchTokensOf,
  wordQueryMatches,
  wordQueryOf,
  wordsOf
});
