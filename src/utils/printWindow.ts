/**
 * 🖨️ Fenêtre d'impression « réservée ».
 *
 * Les impressions lisent d'abord les documents COMPLETS des expéditions (la liste affichée vient
 * de parcelsLite) : le window.open() des fonctions d'impression arrivait donc APRÈS des lectures
 * Firestore (et parfois des alert()). Le navigateur ne considère plus alors l'ouverture comme
 * déclenchée par le clic et BLOQUE la fenêtre (bloqueur de pop-up) : rien ne s'imprimait.
 *
 * reservePrintWindow() est appelé de façon SYNCHRONE dans le gestionnaire du clic : il ouvre tout
 * de suite une fenêtre « Préparation de l'impression… » ; openPrintWindow() (utilisé par les
 * fonctions d'impression à la place de window.open) la réutilise. releasePrintWindow() la ferme
 * si finalement rien n'a été imprimé.
 */
let reserved: Window | null = null
let reservedAt = 0
const RESERVE_TTL_MS = 120_000

export function reservePrintWindow(features = 'width=1200,height=800'): Window | null {
  releasePrintWindow()
  try {
    const w = window.open('', '_blank', features)
    if (w) {
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Impression…</title></head>
<body style="font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;color:#1e40af">
<div style="text-align:center"><div style="font-size:28px">🖨️</div><p style="font-weight:bold">Préparation de l'impression…</p></div></body></html>`)
      w.document.close()
      reserved = w
      reservedAt = Date.now()
    }
    return w
  } catch {
    return null
  }
}

/** Fenêtre d'impression : la fenêtre réservée si elle existe encore, sinon window.open(). */
export function openPrintWindow(features?: string): Window | null {
  const w = reserved
  reserved = null
  if (w && !w.closed && Date.now() - reservedAt < RESERVE_TTL_MS) {
    try { w.document.open() } catch { /* nouvelle fenêtre ci-dessous */ }
    return w
  }
  return window.open('', '_blank', features)
}

/** Ferme la fenêtre réservée si elle n'a pas été utilisée (impression annulée / vide / erreur). */
export function releasePrintWindow() {
  const w = reserved
  reserved = null
  try { if (w && !w.closed) w.close() } catch { /* ignore */ }
}
