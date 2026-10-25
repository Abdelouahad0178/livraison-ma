import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { auth } from '../../../firebase/config'
import {
  type ClientAccount, type Person, createClientAccount, nextAccountNumber, subscribeClientAccounts, updateClientAccount,
} from '../../../firebase/clientAccounts'
import { OPTIONS, printOuvertureCompte } from '../../../utils/printOuvertureCompte'

/**
 * 📝 Comptes clients — gestion simple : imprimer la fiche vierge, saisir la fiche remplie par le client,
 * retrouver un compte par N° de compte ou nom, le modifier et le réimprimer.
 */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' })
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const inp = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300'

// Champs du formulaire déclarés hors du composant (sinon ils seraient recréés à chaque frappe et perdraient le focus)
type Ctx = { form: ClientAccount; set: (k: keyof ClientAccount, v: any) => void; toggle: (k: keyof ClientAccount, o: string) => void }
const FormCtx = createContext<Ctx>(null as any)
const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs font-semibold border transition ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`

function Field({ label, k, wide }: { label: string; k: keyof ClientAccount; wide?: boolean }) {
  const { form, set } = useContext(FormCtx)
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <input className={inp} value={(form[k] as string) || ''} onChange={e => set(k, e.target.value)} />
    </label>
  )
}
function Single({ label, k, options }: { label: string; k: keyof ClientAccount; options: string[] }) {
  const { form, set } = useContext(FormCtx)
  return (
    <div>
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map(o => <button key={o} type="button" onClick={() => set(k, form[k] === o ? '' : o)} className={chip(form[k] === o)}>{o}</button>)}
      </div>
    </div>
  )
}
function Multi({ label, k, options }: { label: string; k: keyof ClientAccount; options: string[] }) {
  const { form, toggle } = useContext(FormCtx)
  const cur = (form[k] as string[] | undefined) || []
  return (
    <div>
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map(o => <button key={o} type="button" onClick={() => toggle(k, o)} className={chip(cur.includes(o))}>{cur.includes(o) ? '✓ ' : ''}{o}</button>)}
      </div>
    </div>
  )
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-bold text-blue-800 mb-3">{title}</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </section>
  )
}

const STATUTS: Record<string, { label: string; cls: string }> = {
  actif: { label: 'Actif', cls: 'bg-green-100 text-green-700' },
  en_attente: { label: 'En attente', cls: 'bg-amber-100 text-amber-700' },
  suspendu: { label: 'Suspendu', cls: 'bg-red-100 text-red-700' },
}

export default function ClientAccountsTab({ profile }: { profile: any }) {
  const city: string = profile?.city || ''
  const by = profile?.name || profile?.email || auth.currentUser?.email || ''
  const [rows, setRows] = useState<ClientAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<ClientAccount | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!city) return
    return subscribeClientAccounts(city, r => { setRows(r); setLoading(false) }, e => { setError(e?.message || String(e)); setLoading(false) })
  }, [city])

  const filtered = useMemo(() => {
    const q = norm(search).trim()
    if (!q) return rows
    return rows.filter(a => [a.accountNumber, a.raisonSociale, a.enseigne, a.gerant?.nom, a.ice, a.gsm, a.tel].some(x => norm(x).includes(q)))
  }, [rows, search])

  const openNew = () => setForm({
    accountNumber: nextAccountNumber(city, rows), city, agence: city, dateOuverture: today(), statut: 'en_attente',
    raisonSociale: '', services: [], codModes: [], portModes: [], reglementModes: [], documents: [],
  })

  const set = (k: keyof ClientAccount, v: any) => setForm(f => (f ? { ...f, [k]: v } : f))
  const setP = (k: 'gerant' | 'contactExp' | 'contactCompta', field: keyof Person, v: string) =>
    setForm(f => (f ? { ...f, [k]: { ...(f[k] || {}), [field]: v } } : f))
  const toggle = (k: keyof ClientAccount, o: string) =>
    setForm(f => {
      if (!f) return f
      const cur = (f[k] as string[] | undefined) || []
      return { ...f, [k]: cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o] }
    })

  const save = async (print = false) => {
    if (!form) return
    if (!form.raisonSociale.trim()) { alert('La raison sociale / nom du client est obligatoire.'); return }
    const num = form.accountNumber.trim()
    if (!num) { alert('Le N° de compte est obligatoire.'); return }
    if (rows.some(a => a.id !== form.id && a.accountNumber.trim().toUpperCase() === num.toUpperCase())) { alert(`Le N° de compte ${num} existe déjà.`); return }
    setSaving(true)
    try {
      const data = { ...form, accountNumber: num, city }
      if (form.id) await updateClientAccount(form.id, data, by)
      else data.id = await createClientAccount(data, by)
      setMsg(`✅ Compte ${num} — ${form.raisonSociale} enregistré.`)
      setTimeout(() => setMsg(''), 4000)
      if (print) printOuvertureCompte(data)
      setForm(null)
    } catch (e: any) {
      alert(`Erreur d'enregistrement : ${e?.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Formulaire (création / modification) ──
  if (form) {
    const people: [string, 'gerant' | 'contactExp' | 'contactCompta'][] = [['Gérant / représentant légal', 'gerant'], ['Contact expéditions', 'contactExp'], ['Contact comptabilité', 'contactCompta']]
    return (
      <FormCtx.Provider value={{ form, set, toggle }}>
      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <h2 className="text-lg font-bold text-gray-800">{form.id ? `✏️ Compte ${form.accountNumber}` : '➕ Nouveau compte client'}</h2>
          <button onClick={() => setForm(null)} className="text-sm text-gray-500 hover:text-gray-800">← Retour à la liste</button>
        </div>

        <Section title="Compte">
          <Field label="N° de compte" k="accountNumber" />
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Date d'ouverture</span>
            <input type="date" className={inp} value={form.dateOuverture || ''} onChange={e => set('dateOuverture', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500">Statut</span>
            <select className={inp} value={form.statut || 'en_attente'} onChange={e => set('statut', e.target.value)}>
              {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <Field label="Commercial" k="commercial" />
        </Section>

        <Section title="1. Identification du client">
          <div className="sm:col-span-2 lg:col-span-3"><Single label="Type" k="type" options={OPTIONS.type} /></div>
          <Field label="Raison sociale / Nom *" k="raisonSociale" wide />
          <Single label="Forme juridique" k="formeJuridique" options={OPTIONS.formeJuridique} />
          <Field label="Enseigne commerciale" k="enseigne" />
          <Field label="Activité" k="activite" />
          <Field label="Ville" k="ville" />
          <Field label="Adresse du siège" k="adresse" wide />
          <Field label="R.C N°" k="rc" />
          <Field label="Tribunal" k="tribunal" />
          <Field label="I.F" k="ifiscal" />
          <Field label="ICE" k="ice" />
          <Field label="Patente (T.P)" k="patente" />
          <Field label="CNSS" k="cnss" />
          <Field label="Capital (DH)" k="capital" />
          <Field label="Téléphone" k="tel" />
          <Field label="Gsm" k="gsm" />
          <Field label="E-mail" k="email" />
        </Section>

        <section className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-blue-800 mb-3">2. Responsables et adresse d'enlèvement</h3>
          <div className="space-y-3">
            {people.map(([lab, k]) => (
              <div key={k} className="grid sm:grid-cols-4 gap-2 items-end">
                {(['nom', 'cin', 'gsm', 'email'] as (keyof Person)[]).map(f => (
                  <label key={f} className="block">
                    <span className="text-xs font-semibold text-gray-500">{f === 'nom' ? lab : f === 'cin' ? 'N° CIN' : f === 'gsm' ? 'Gsm' : 'E-mail'}</span>
                    <input className={inp} value={form[k]?.[f] || ''} onChange={e => setP(k, f, e.target.value)} />
                  </label>
                ))}
              </div>
            ))}
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-gray-500">Adresse de ramassage</span>
                <input className={inp} value={form.ramassageAdresse || ''} onChange={e => set('ramassageAdresse', e.target.value)} />
              </label>
              <Field label="Horaires" k="ramassageHoraires" />
            </div>
          </div>
        </section>

        <Section title="3. Services, port et facturation (facturation mensuelle)">
          <div className="sm:col-span-2 lg:col-span-3"><Multi label="Services" k="services" options={OPTIONS.services} /></div>
          <div className="sm:col-span-2"><Multi label="COD accepté en" k="codModes" options={OPTIONS.codModes} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Volume mensuel (exp.)" k="volumeMensuel" />
            <Field label="Poids moyen (kg)" k="poidsMoyen" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3"><Multi label="Paiement du port" k="portModes" options={OPTIONS.portModes} /></div>
          <Single label="Délai de paiement" k="delaiPaiement" options={OPTIONS.delaiPaiement} />
          <div className="sm:col-span-2"><Multi label="Règlement des factures" k="reglementModes" options={OPTIONS.reglementModes} /></div>
          <Field label="Plafond de crédit (DH)" k="plafondCredit" />
        </Section>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm font-bold text-indigo-800 text-center tracking-wide">
          4. TARIFS CONVENUS — VOIR CONTRAT D'ENGAGEMENT
        </div>

        <Section title="5. Restitution des retours de fonds (COD)">
          <Single label="Mode" k="restitutionMode" options={OPTIONS.restitutionMode} />
          <Single label="Périodicité" k="restitutionPeriodicite" options={OPTIONS.restitutionPeriodicite} />
          <Field label="Banque / Agence" k="banque" />
          <Field label="Titulaire du compte" k="titulaire" />
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-gray-500">RIB (24 chiffres) — {String(form.rib || '').replace(/\D/g, '').length}/24</span>
            <input className={`${inp} font-mono tracking-wider`} value={form.rib || ''} inputMode="numeric"
              onChange={e => set('rib', e.target.value.replace(/[^\d ]/g, '').slice(0, 30))} />
          </label>
        </Section>

        <Section title="6. Documents joints">
          <div className="sm:col-span-2 lg:col-span-3"><Multi label="Reçus" k="documents" options={OPTIONS.documents} /></div>
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-semibold text-gray-500">Notes</span>
            <textarea className={inp} rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </label>
        </Section>

        <div className="flex flex-wrap gap-2 justify-end sticky bottom-0 bg-gray-50/90 backdrop-blur py-3">
          <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-white border border-gray-200">Annuler</button>
          <button disabled={saving} onClick={() => save(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 disabled:opacity-50">💾 Enregistrer et imprimer</button>
          <button disabled={saving} onClick={() => save(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">{saving ? 'Enregistrement…' : '💾 Enregistrer'}</button>
        </div>
      </div>
      </FormCtx.Provider>
    )
  }

  // ── Liste ──
  return (
    <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h2 className="text-lg font-bold text-gray-800">📝 Comptes clients — {city}</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => printOuvertureCompte(null)} className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50">🖨️ Imprimer la fiche vierge</button>
          <button onClick={openNew} className="px-3 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700">➕ Saisir une fiche remplie</button>
        </div>
      </div>
      {msg && <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2">{msg}</div>}
      <input className={`${inp} py-2.5`} placeholder="🔎 Rechercher par N° de compte ou nom du client…" value={search} onChange={e => setSearch(e.target.value)} />
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">Erreur de lecture : {error}</div>}
      {loading && !error ? (
        <div className="text-sm text-gray-400 py-8 text-center">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">{rows.length ? 'Aucun compte ne correspond à la recherche.' : 'Aucun compte client enregistré pour le moment.'}</div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2">N° compte</th>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">Gérant</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">Téléphone</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">Ouverture</th>
                <th className="text-left px-3 py-2">Statut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const st = STATUTS[a.statut || 'en_attente'] || STATUTS.en_attente
                return (
                  <tr key={a.id} className="border-t border-gray-50 hover:bg-blue-50/40">
                    <td className="px-3 py-2 font-mono font-bold text-blue-700 whitespace-nowrap">{a.accountNumber}</td>
                    <td className="px-3 py-2"><div className="font-semibold text-gray-800">{a.raisonSociale}</div>{a.enseigne && <div className="text-xs text-gray-400">{a.enseigne}</div>}</td>
                    <td className="px-3 py-2 hidden md:table-cell text-gray-600">{a.gerant?.nom || '—'}</td>
                    <td className="px-3 py-2 hidden sm:table-cell text-gray-600 whitespace-nowrap">{a.gsm || a.tel || '—'}</td>
                    <td className="px-3 py-2 hidden lg:table-cell text-gray-500 whitespace-nowrap">{a.dateOuverture ? a.dateOuverture.split('-').reverse().join('/') : '—'}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <button onClick={() => setForm({ ...a })} className="px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 rounded">✏️ Modifier</button>
                      <button onClick={() => printOuvertureCompte(a)} className="px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded">🖨️ Imprimer</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">{rows.length} compte(s) · la fiche imprimée renvoie au contrat d'engagement pour les tarifs.</p>
    </div>
  )
}
