// Petit toast DOM sans dépendance (erreurs / confirmations visibles quel que soit le scroll du modal).
export function showToast(message: string, type: 'error' | 'success' = 'error', durationMs = 6000) {
  if (typeof document === 'undefined') return
  // ⚠️ PAS un <div> : la règle CSS anti-debug `body > div:not(#root) { display:none !important }`
  // (src/index.css) masquait tous les toasts ajoutés directement à <body>.
  const el = document.createElement('aside')
  el.setAttribute('role', type === 'error' ? 'alert' : 'status')
  el.textContent = message
  Object.assign(el.style, {
    display: 'block', position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
    zIndex: '99999', maxWidth: 'min(92vw, 520px)', padding: '12px 16px',
    borderRadius: '12px', fontSize: '14px', fontWeight: '600', lineHeight: '1.4',
    color: '#fff', background: type === 'error' ? '#dc2626' : '#16a34a',
    boxShadow: '0 10px 25px rgba(0,0,0,.25)', cursor: 'pointer', textAlign: 'center',
  } as Partial<CSSStyleDeclaration>)
  const remove = () => el.remove()
  el.addEventListener('click', remove)
  document.body.appendChild(el)
  setTimeout(remove, durationMs)
}
