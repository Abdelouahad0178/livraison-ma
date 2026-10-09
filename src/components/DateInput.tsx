import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

/**
 * 📅 Champ date TOUJOURS au format jj/mm/aaaa, quel que soit le navigateur / la langue de Windows.
 * Remplace <input type="date"> (dont l'ordre jour/mois dépend du PC et ne peut pas être imposé) :
 * - même valeur que le champ natif : chaîne 'AAAA-MM-JJ' (ou '') ;
 * - même onChange : e.target.value = 'AAAA-MM-JJ' (émis quand la date saisie est complète et valide,
 *   ou '' quand le champ est vidé) ;
 * - saisie au clavier avec les « / » ajoutés automatiquement + bouton 📅 qui ouvre le calendrier natif.
 * Les classes de mise en page (largeur, flex, marges, grille) vont sur l'enveloppe, le reste sur le champ.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'defaultValue'> & {
  value?: string
  onChange?: (e: { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } }) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
/** 'AAAA-MM-JJ' → 'JJ/MM/AAAA' */
const isoToFr = (iso?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
/** 'JJ/MM/AAAA' complet et valide → 'AAAA-MM-JJ', sinon null */
const frToIso = (fr: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fr)
  if (!m) return null
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (y < 1900 || dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}
/** Ajoute les « / » au fil de la saisie (chiffres uniquement, 8 au plus). */
const mask = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

// Classes de mise en page à porter par l'enveloppe (sinon le champ ne prend pas la bonne place)
const LAYOUT = /^(?:[a-z0-9]+:)*-?(?:w-|min-w-|max-w-|flex-|basis-|grow|shrink|col-span|col-start|col-end|row-span|self-|justify-self|order-|m[trblxy]?-|hidden$|block$|inline-block$|inline$)/

const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput(
  { value, onChange, className = '', style, min, max, name, disabled, placeholder, ...rest }, ref,
) {
  const [text, setText] = useState(isoToFr(value))
  const pickerRef = useRef<HTMLInputElement>(null)

  // Valeur modifiée de l'extérieur (filtre réinitialisé, valeur chargée…) → réaffichage
  useEffect(() => {
    if (frToIso(text) !== (value || null) && !(text === '' && !value)) setText(isoToFr(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = (iso: string) => {
    if (iso === (value || '')) return
    const target = { value: iso, name }
    onChange?.({ target, currentTarget: target })
  }

  const tokens = className.split(/\s+/).filter(Boolean)
  const wrapCls = tokens.filter(t => LAYOUT.test(t)).join(' ')
  const inputCls = tokens.filter(t => !LAYOUT.test(t)).join(' ')

  return (
    <span className={`relative inline-block align-middle ${wrapCls}`}>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        name={name}
        disabled={disabled}
        placeholder={placeholder || 'jj/mm/aaaa'}
        value={text}
        maxLength={10}
        className={`${inputCls} w-full`}
        style={{ ...style, paddingRight: '2.25rem' }}
        onChange={e => {
          const next = mask(e.target.value)
          setText(next)
          if (next === '') emit('')
          else { const iso = frToIso(next); if (iso) emit(iso) }
        }}
        onBlur={e => {
          // Saisie incomplète / invalide : on revient à la dernière date valide
          if (text && !frToIso(text)) setText(isoToFr(value))
          rest.onBlur?.(e)
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        title="Choisir dans le calendrier"
        aria-label="Choisir dans le calendrier"
        onClick={() => {
          const el = pickerRef.current
          if (!el) return
          try { (el as any).showPicker ? (el as any).showPicker() : el.click() } catch { el.focus() }
        }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-60 hover:opacity-100 disabled:opacity-30 cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {/* Calendrier natif invisible (ouvert par le bouton) — seul son sélecteur est utilisé */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        min={min as any}
        max={max as any}
        disabled={disabled}
        onChange={e => { setText(isoToFr(e.target.value)); emit(e.target.value) }}
        className="absolute right-1.5 bottom-0 w-6 h-0 opacity-0 pointer-events-none"
      />
    </span>
  )
})

export default DateInput
