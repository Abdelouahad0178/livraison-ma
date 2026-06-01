import { lazy, Suspense } from 'react'
import { Calendar, Search, X, Plus, MapPin, ChevronDown, Check, MessageCircle, Printer } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { CITIES } from '../../../firebase/constants'

const Barcode = lazy(() => import('react-barcode'))
const QRCodeSVG = lazy(() => import('../../../components/QRCodeSvg'))

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const EMPTY_FORM = {
  senderName: '', senderNic: '', senderAddress: '', senderTel: '', senderCity: '',
  receiverName: '', receiverAddress: '', receiverTel: '', receiverCity: '',
  weight: '', nbColis: '1', natureOfGoods: '', natureOfGoodsCustomPrice: '', codAmount: '',
  serviceType: 'simple', shipmentMode: 'personal',
  portType: 'port_paye', portPayeMethod: '', portPayeMontant: '',
  portPrice: '',
  clientId: '', clientName: '', autoDebit: false,
  deliverySectorId: '', deliveryDriverId: '',
  operationDate: todayStr(),
}

const SERVICE_TYPES = [
  { key: 'simple',    label: 'Simple',    emoji: '📦' },
  { key: 'especes',   label: 'C/Espèces', emoji: '💵' },
  { key: 'cheque',    label: 'C/Chèque',  emoji: '📋' },
  { key: 'traite',    label: 'C/Traite',  emoji: '📝' },
  { key: 'retour_bl', label: 'Retour BL', emoji: '🧾' },
]

export default function NewTab() {
  const {
    profile, ticketRef,
    form, setForm, f, loading, error, handleSubmit,
    clients, clientSearch, setClientSearch,
    showClientDropdown, setShowClientDropdown,
    showSenderDropdown, setShowSenderDropdown,
    filteredClientSearch, selectExistingClient,
    inlineNewClient, setInlineNewClient,
    destinationSectors, destinationDrivers,
    price, inputCls, selectCls,
    createdParcel, setCreatedParcel,
    whatsappLink, whatsappMsg,
    handleCreateInlineClient,
  } = useAgentCtx()

  const handlePrint = () => {
    const previousTitle = document.title
    const style = document.createElement('style')
    style.textContent = `
      @page { size: A5 portrait; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #ticket-print { width: 148mm !important; max-width: 148mm !important; margin: 0 auto !important; }
      }
    `
    document.head.appendChild(style)
    document.title = createdParcel ? `Bon-Ramassage-${createdParcel.trackingId}` : 'Bon-Ramassage'
    window.print()
    setTimeout(() => {
      document.title = previousTitle
      style.remove()
    }, 500)
  }

  if (createdParcel) {
    return (
      <div className="space-y-4 mt-4">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
          <p className="text-2xl mb-1">✅</p>
          <p className="text-green-700 font-bold text-lg">Colis enregistré avec succès !</p>
          <p className="text-green-600 font-mono text-sm mt-1">{createdParcel.trackingId}</p>
        </div>

        <div id="ticket-print" ref={ticketRef} className="bg-white border border-gray-300 text-[11px]" style={{ maxWidth: '148mm', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-300 px-3 py-2">
            <img src="/LOGO.jpg" alt="BG Express" style={{ height: '36px', objectFit: 'contain' }} />
            <div className="text-right">
              <div className="text-[10px] text-gray-500">Bon de Ramassage</div>
              {createdParcel.sender?.nic && (
                <div className="font-bold text-blue-600 text-xs font-mono tracking-widest">N EXP : {createdParcel.sender.nic}</div>
              )}
              <div className="font-bold text-blue-700 text-sm tracking-widest">{createdParcel.trackingId}</div>
              <div className="text-[9px] text-gray-400">{
                createdParcel.createdAt?.toDate
                  ? createdParcel.createdAt.toDate().toLocaleDateString('fr-MA')
                  : new Date().toLocaleDateString('fr-MA')
              }</div>
            </div>
          </div>

          {/* Type de service */}
          <div className="flex gap-4 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
            {SERVICE_TYPES.map(st => (
              <label key={st.key} className="flex items-center gap-1 text-[10px] font-semibold">
                <span className={`w-3 h-3 border border-gray-400 rounded-sm flex items-center justify-center text-[8px] ${createdParcel.serviceType === st.key ? 'bg-blue-600 border-blue-600 text-white' : ''}`}>
                  {createdParcel.serviceType === st.key ? '✓' : ''}
                </span>
                {st.label}
              </label>
            ))}
          </div>

          {/* Expéditeur / Destinataire */}
          <div className="grid grid-cols-2 border-b border-gray-300">
            <div className="border-r border-gray-300 px-3 py-2 space-y-1">
              <div className="font-bold text-[10px] uppercase tracking-wider text-blue-700 mb-1.5">Expéditeur</div>
              <div><span className="text-gray-500">Nom : </span><span className="font-semibold">{createdParcel.sender.name}</span></div>
              <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 mt-0.5">
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">N EXP :</span>
                <span className="font-bold text-blue-800 font-mono text-[11px]">{createdParcel.sender.nic || '—'}</span>
              </div>
              {createdParcel.sender.address && <div><span className="text-gray-500">Adresse : </span>{createdParcel.sender.address}</div>}
              <div><span className="text-gray-500">Ville : </span><span className="font-semibold">{createdParcel.sender.city}</span></div>
              <div><span className="text-gray-500">Tél : </span>{createdParcel.sender.tel}</div>
            </div>
            <div className="px-3 py-2 space-y-1">
              <div className="font-bold text-[10px] uppercase tracking-wider text-blue-700 mb-1.5">Destinataire</div>
              <div><span className="text-gray-500">Nom : </span><span className="font-semibold">{createdParcel.receiver.name}</span></div>
              {createdParcel.receiver.address && <div><span className="text-gray-500">Adresse : </span>{createdParcel.receiver.address}</div>}
              <div><span className="text-gray-500">Ville : </span><span className="font-bold text-blue-700">{createdParcel.receiver.city}</span></div>
              <div><span className="text-gray-500">Tél : </span>{createdParcel.receiver.tel}</div>
            </div>
          </div>

          {/* Nature + Nb colis */}
          <div className="grid grid-cols-2 border-b border-gray-300 bg-blue-50">
            <div className="border-r border-gray-300 px-3 py-2 flex items-center gap-2">
              <span className="text-lg">📦</span>
              <div>
                <div className="text-[9px] text-gray-500 uppercase">Nature de marchandise</div>
                <div className="font-bold text-[13px] text-blue-800">{createdParcel.natureOfGoods || '—'}</div>
              </div>
            </div>
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="text-lg">🔢</span>
              <div>
                <div className="text-[9px] text-gray-500 uppercase">Nombre de colis</div>
                <div className="font-bold text-[13px] text-blue-800">{createdParcel.nbColis || 1}</div>
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid grid-cols-3 border-b border-gray-300 text-center">
            <div className="border-r border-gray-200 px-2 py-1.5">
              <div className="text-gray-400 text-[9px] uppercase">Poids</div>
              <div className="font-bold text-sm">{createdParcel.weight} kg</div>
            </div>
            <div className="border-r border-gray-200 px-2 py-1.5">
              <div className="text-gray-400 text-[9px] uppercase">Prix</div>
              <div className="font-bold text-sm text-blue-700">{createdParcel.price} DH</div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-gray-400 text-[9px] uppercase">RETOUR FOND</div>
              <div className={`font-bold text-sm ${createdParcel.codAmount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                {createdParcel.codAmount > 0 ? `${createdParcel.codAmount} DH` : '—'}
              </div>
            </div>
          </div>

          {/* Barcode + QR */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <Suspense fallback={<div className="w-40 h-12 bg-gray-100 rounded" />}>
              <Barcode value={createdParcel.trackingId} width={1.3} height={48} fontSize={10} margin={0} />
            </Suspense>
            <div className="flex flex-col items-center gap-0.5 ml-2">
              <Suspense fallback={<div className="w-16 h-16 bg-gray-100 rounded" />}>
                <QRCodeSVG
                  value={`https://arelanc.web.app/track?id=${createdParcel.trackingId}`}
                  size={64}
                  level="M"
                  includeMargin={false}
                />
              </Suspense>
              <div className="text-[8px] text-gray-400">Suivi en ligne</div>
            </div>
          </div>

          {/* Signature */}
          <div className="grid grid-cols-2 border-t border-gray-300 text-[9px] text-gray-400">
            <div className="border-r border-gray-200 px-3 py-2">Cachet et Signature expéditeur</div>
            <div className="px-3 py-2">Cachet et Signature destinataire</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={handlePrint} className="flex items-center justify-center gap-2 bg-gray-800 text-white py-4 rounded-xl font-semibold hover:bg-gray-900 transition">
            <Printer className="w-4 h-4" /> Imprimer
          </button>
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-green-500 text-white py-4 rounded-xl font-semibold hover:bg-green-600 transition">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        </div>
        <button onClick={() => { setCreatedParcel(null); setForm({ ...EMPTY_FORM, senderCity: profile?.city || '', operationDate: todayStr() }) }}
          className="w-full flex items-center justify-center gap-2 border-2 border-blue-500 text-blue-600 py-4 rounded-xl font-semibold hover:bg-blue-50 transition"
        >
          <Plus className="w-4 h-4" /> Nouveau colis
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-4">
      <div className="bg-blue-600 p-5">
        <h2 className="text-white font-bold text-xl">Nouveau colis</h2>
        <p className="text-blue-200 text-sm mt-0.5">Remplissez les informations d'expédition</p>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        {/* Date d'opération */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Date d'opération</h3>
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
            <input
              type="date"
              value={form.operationDate}
              max={todayStr()}
              onChange={f('operationDate')}
              className="flex-1 bg-transparent text-sm font-semibold text-blue-800 outline-none"
            />
            {form.operationDate !== todayStr() && (
              <button type="button" onClick={() => setForm((p: any) => ({ ...p, operationDate: todayStr() }))}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium transition">
                Aujourd'hui
              </button>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Mode d'envoi</h3>
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => {
                setForm((p: any) => ({
                  ...p,
                  shipmentMode: 'personal',
                  clientId: '',
                  clientName: '',
                  autoDebit: false,
                  portType: p.portType === 'port_en_compte' ? 'port_paye' : p.portType,
                }))
                setClientSearch('')
                setInlineNewClient(null)
              }}
              className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                form.shipmentMode === 'personal'
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              <span className="block text-sm font-black">Personnel</span>
              <span className={`block text-xs mt-0.5 ${form.shipmentMode === 'personal' ? 'text-gray-200' : 'text-gray-400'}`}>Sans fiche client</span>
            </button>
            <button type="button"
              onClick={() => setForm((p: any) => ({ ...p, shipmentMode: 'client' }))}
              className={`rounded-xl border-2 px-3 py-3 text-left transition ${
                form.shipmentMode === 'client'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              <span className="block text-sm font-black">Client existant</span>
              <span className={`block text-xs mt-0.5 ${form.shipmentMode === 'client' ? 'text-blue-100' : 'text-gray-400'}`}>Choisir dans la liste</span>
            </button>
          </div>
        </section>
        {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">⚠️ {error}</div>}

        {/* Client lié */}
        <section className={form.shipmentMode === 'client' ? '' : 'hidden'}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Client lie <span className="text-gray-300 font-normal normal-case">(obligatoire)</span>
          </h3>
          {form.clientId ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
              <div>
                <span className="text-sm font-semibold text-blue-800">👤 {form.clientName}</span>
                {clients.find((c: any) => c.id === form.clientId)?.remise > 0 && (
                  <span className="ml-2 text-xs text-green-600 font-medium">
                    Remise {clients.find((c: any) => c.id === form.clientId)?.remise}%
                  </span>
                )}
              </div>
              <button type="button"
                onClick={() => setForm((p: any) => ({ ...p, clientId: '', clientName: '', autoDebit: false }))}
                className="text-blue-400 hover:text-blue-700 transition p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text" value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                onFocus={() => setShowClientDropdown(true)}
                onBlur={() => setTimeout(() => setShowClientDropdown(false), 150)}
                placeholder="Rechercher un client (nom, tél, nexp)…"
                className={`${inputCls} pl-10`}
              />
              {showClientDropdown && filteredClientSearch.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {(filteredClientSearch as any[]).slice(0, 5).map((c: any) => (
                    <button type="button" key={c.id}
                      onMouseDown={e => { e.preventDefault(); selectExistingClient(c) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0 transition">
                      <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                        {c.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.city}{c.tel && ` · ${c.tel}`}</p>
                      </div>
                      {c.accountType === 'compte' && (
                        <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">En compte</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="border-t border-dashed border-gray-200" />

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Expéditeur</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="N EXP" value={form.senderNic} onChange={f('senderNic')} className={`${inputCls} col-span-2`} />
            {/* Nom avec recherche client */}
            <div className="relative col-span-2">
              <input
                required
                placeholder="Nom complet (ou chercher un client…)"
                value={form.senderName}
                onChange={e => { f('senderName')(e); setShowSenderDropdown(true) }}
                onFocus={() => setShowSenderDropdown(true)}
                onBlur={() => setTimeout(() => setShowSenderDropdown(false), 150)}
                className={inputCls}
              />
              {showSenderDropdown && (() => {
                const q = form.senderName.trim().toLowerCase()
                const list = ((profile?.city
                  ? (clients as any[]).filter((c: any) => c.city === profile.city)
                  : (clients as any[])
                ) as any[]).filter((c: any) => !q || c.name?.toLowerCase().includes(q) || c.tel?.includes(q))
                return list.length > 0 ? (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                    {(list as any[]).slice(0, 6).map((c: any) => (
                      <button type="button" key={c.id}
                        onMouseDown={e => { e.preventDefault(); selectExistingClient(c) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-b border-gray-50 last:border-0 transition">
                        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                          {c.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400">{c.city}{c.tel && ` · ${c.tel}`}{c.address && ` · ${c.address}`}</p>
                        </div>
                        {c.accountType === 'compte' && (
                          <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">En compte</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : null
              })()}
            </div>
            <input required placeholder="Téléphone" value={form.senderTel} onChange={f('senderTel')} className={inputCls} />
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-700">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              {form.senderCity || '—'}
            </div>
            <input placeholder="Adresse" value={form.senderAddress} onChange={f('senderAddress')} className={`${inputCls} col-span-2`} />
          </div>
        </section>

        <div className="border-t border-dashed border-gray-200" />

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Destinataire</h3>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Nom complet" value={form.receiverName} onChange={f('receiverName')} className={inputCls} />
            <input required placeholder="Téléphone" value={form.receiverTel} onChange={f('receiverTel')} className={inputCls} />
            <div className="relative col-span-2">
              <select
                required
                value={form.receiverCity}
                onChange={e => setForm((p: any) => ({
                  ...p,
                  receiverCity: e.target.value,
                  deliverySectorId: '',
                  deliveryDriverId: '',
                }))}
                className={selectCls}
              >
                <option value="">Ville de destination</option>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <input placeholder="Adresse" value={form.receiverAddress} onChange={f('receiverAddress')} className={`${inputCls} col-span-2`} />
            {form.receiverCity && (
              <div className="col-span-2 bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-3">
                <div>
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">Secteur de livraison destination</p>
                  <p className="text-xs text-purple-500 mt-0.5">Choisissez selon l'adresse du client à {form.receiverCity}.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <select
                      value={form.deliverySectorId}
                      onChange={e => setForm((p: any) => ({
                        ...p,
                        deliverySectorId: e.target.value,
                        deliveryDriverId: '',
                      }))}
                      className={selectCls}
                    >
                      <option value="">Secteur à choisir par destination</option>
                      {(destinationSectors as any[]).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.code}{s.name && s.name !== s.code ? ` - ${s.name}` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <select
                      value={form.deliveryDriverId}
                      onChange={f('deliveryDriverId')}
                      className={selectCls}
                    >
                      <option value="">Livreur de destination</option>
                      {(destinationDrivers as any[]).map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}{d.tel ? ` - ${d.tel}` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                {destinationSectors.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Aucun secteur enregistré pour cette ville. L'agence destination pourra assigner le livreur après réception.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="border-t border-dashed border-gray-200" />

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Détails</h3>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="0.1" min="0.1" placeholder="Poids (kg) — optionnel" value={form.weight} onChange={f('weight')} className={inputCls} />
            <input required type="number" min="1" step="1" placeholder="Nb de colis" value={form.nbColis} onChange={f('nbColis')} className={inputCls} />
            <div className="col-span-2">
              <p className="text-xs text-gray-500 mb-1.5">Nature de marchandise</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'Palette', label: 'Palette', emoji: '📦' },
                  { key: 'Colis',   label: 'Colis',   emoji: '📮' },
                  { key: 'Bagages', label: 'Bagages', emoji: '🧳' },
                  { key: 'Autres',  label: 'Autres',  emoji: '✏️' },
                ].map(({ key, label, emoji }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((p: any) => ({ ...p, natureOfGoods: key === p.natureOfGoods ? '' : key }))}
                    className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-all
                      ${form.natureOfGoods === key
                        ? 'bg-blue-600 border-blue-600 text-white shadow'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'}`}
                  >
                    <span className="text-lg">{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>
              {form.natureOfGoods === 'Autres' && (
                <input
                  placeholder="Précisez la nature…"
                  value={form.natureOfGoodsCustom || ''}
                  onChange={e => setForm((p: any) => ({ ...p, natureOfGoodsCustom: e.target.value }))}
                  className={`${inputCls} mt-2`}
                />
              )}
            </div>
          </div>
        </section>

        <div className="border-t border-dashed border-gray-200" />

        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Type de port</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {SERVICE_TYPES.map(st => (
              <button
                type="button"
                key={st.key}
                onClick={() => setForm((p: any) => ({ ...p, serviceType: st.key, codAmount: st.key === 'simple' || st.key === 'retour_bl' ? '' : p.codAmount }))}
                className={`py-2.5 rounded-xl border-2 text-xs font-bold transition ${
                  form.serviceType === st.key
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
          {form.serviceType !== 'retour_bl' && form.serviceType !== 'simple' ? (
            <div className="mt-3">
              <input
                type="number" min="0"
                placeholder="RETOUR FOND (DH)"
                value={form.codAmount}
                onChange={f('codAmount')}
                className={inputCls}
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
              {form.serviceType === 'simple' ? 'Simple : aucun RETOUR FOND à encaisser.' : 'Retour BL : aucun montant RETOUR FOND.'}
            </p>
          )}
        </section>

        <div className="border-t border-dashed border-gray-200" />

        {/* Frais de port */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Frais de port</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'port_paye', label: 'Port Payé', desc: 'Expéditeur paie',   active: 'bg-blue-600 border-blue-500 text-white',    activeDesc: 'text-blue-100'   },
              { key: 'port_du',   label: 'Port Dû',   desc: 'Destinataire paie', active: 'bg-orange-500 border-orange-400 text-white', activeDesc: 'text-orange-100' },
            ].map(pt => {
              const isActive = pt.key === 'port_paye'
                ? (form.portType === 'port_paye' || form.portType === 'port_en_compte')
                : form.portType === pt.key
              return (
                <button type="button" key={pt.key}
                  onClick={() => setForm((p: any) => ({
                    ...p,
                    portType: pt.key,
                    shipmentMode: pt.key === 'port_du' && p.portType === 'port_en_compte' ? 'personal' : p.shipmentMode,
                  }))}
                  className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition text-left ${isActive ? pt.active : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {pt.label}
                  <p className={`text-xs font-normal mt-0.5 ${isActive ? pt.activeDesc : 'text-gray-400'}`}>{pt.desc}</p>
                </button>
              )
            })}
          </div>
          <div className="mt-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">
              Montant du port manuel
            </label>
            <input
              required
              type="number"
              min="0"
              step="0.5"
              placeholder={form.portType === 'port_du' ? 'Montant à payer par le destinataire (DH)' : 'Montant du port payé (DH)'}
              value={form.portPrice}
              onChange={e => setForm((p: any) => ({ ...p, portPrice: e.target.value, portPayeMontant: p.portType === 'port_paye' ? e.target.value : p.portPayeMontant }))}
              className={inputCls}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Le tarif automatique est désactivé : ce montant sera utilisé comme prix du port.
            </p>
          </div>
          {/* Sous-menu Port Payé */}
          {(form.portType === 'port_paye' || form.portType === 'port_en_compte') && (
            <div className="mt-2 space-y-2 pl-1">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'espece',  label: '💵 Espèce',    ptype: 'port_paye' },
                  { key: 'cheque',  label: '📋 Chèque',    ptype: 'port_paye' },
                  { key: 'compte',  label: '🏢 En Compte', ptype: 'port_en_compte' },
                ].map(m => {
                  const isSelected = m.key === 'compte'
                    ? form.portType === 'port_en_compte'
                    : form.portType === 'port_paye' && form.portPayeMethod === m.key
                  return (
                    <button type="button" key={m.key}
                      onClick={() => setForm((p: any) => ({
                        ...p,
                        portType: m.ptype,
                        portPayeMethod: m.key !== 'compte' ? m.key : p.portPayeMethod,
                        portPayeMontant: m.key === 'compte' ? '' : p.portPayeMontant,
                        shipmentMode: m.key === 'compte' ? 'client' : (p.portType === 'port_en_compte' ? 'personal' : p.shipmentMode),
                      }))}
                      className={`py-2 px-1 rounded-xl border text-xs font-semibold transition text-center ${isSelected ? (m.key === 'compte' ? 'bg-purple-100 border-purple-500 text-purple-700' : 'bg-blue-100 border-blue-500 text-blue-700') : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-blue-300'}`}>
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {form.clientId && form.portType === 'port_paye' && price > 0 && (
            <div
              className={`mt-2 flex items-center gap-2 cursor-pointer rounded-xl px-3 py-2 border transition ${
                form.autoDebit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
              }`}
              onClick={() => setForm((p: any) => ({ ...p, autoDebit: !p.autoDebit }))}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
                form.autoDebit ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
              }`}>
                {form.autoDebit && <Check className="w-3 h-3 text-white" />}
              </div>
              <p className="text-sm text-gray-600">
                Débiter <strong>{form.clientName}</strong> de <strong>{price} DH</strong> automatiquement
              </p>
            </div>
          )}

          {/* Compte client */}
          {form.portType === 'port_en_compte' && (
            <div className="mt-3 border border-purple-200 rounded-xl p-3 bg-purple-50">
              <p className="text-xs font-semibold text-purple-700 mb-2">Compte client <span className="text-red-500">*</span></p>
              {form.clientId ? (
                <div className="flex items-center justify-between bg-white border border-purple-200 rounded-lg px-3 py-2.5">
                  <div>
                    <span className="text-sm font-semibold text-purple-800">👤 {form.clientName}</span>
                    {(() => {
                      const cl = clients.find((c: any) => c.id === form.clientId)
                      return cl ? (
                        <span className="ml-2 text-xs text-gray-500">
                          Solde : <span className={cl.balance > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{(cl.balance || 0).toFixed(2)} DH</span>
                        </span>
                      ) : null
                    })()}
                  </div>
                  <button type="button"
                    onClick={() => { setForm((p: any) => ({ ...p, clientId: '', clientName: '' })); setInlineNewClient(null) }}
                    className="text-purple-400 hover:text-purple-700 transition p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : !inlineNewClient ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text" value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      placeholder="Rechercher un client…"
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:border-purple-400 focus:outline-none"
                    />
                  </div>
                  {(() => {
                    const list = clientSearch.trim()
                      ? (clients as any[]).filter((c: any) => {
                          const s = clientSearch.toLowerCase()
                          return c.name?.toLowerCase().includes(s) || c.tel?.includes(s)
                        })
                      : (clients as any[]).filter((c: any) => c.accountType === 'compte')
                    return (
                      <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-white">
                        {(list as any[]).slice(0, 6).map((c: any) => (
                          <button type="button" key={c.id}
                            onMouseDown={e => { e.preventDefault(); selectExistingClient(c) }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-purple-50 text-left border-b border-gray-50 last:border-0 transition">
                            <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold text-xs shrink-0">
                              {c.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                              <p className="text-xs text-gray-400">{c.city}{c.tel && ` · ${c.tel}`}</p>
                            </div>
                            <span className={`text-xs font-medium shrink-0 ${(c.balance || 0) > 0 ? 'text-orange-500' : 'text-gray-400'}`}>{(c.balance || 0).toFixed(0)} DH</span>
                          </button>
                        ))}
                        {list.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-3">Aucun client trouvé</p>
                        )}
                      </div>
                    )
                  })()}
                  <button type="button"
                    onClick={() => setInlineNewClient({ name: '', tel: '', city: '', loading: false, error: '' })}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-purple-600 font-semibold hover:bg-purple-100 py-2 rounded-lg border border-dashed border-purple-300 transition">
                    <Plus className="w-3.5 h-3.5" /> Nouveau client en compte
                  </button>
                </>
              ) : (
                <div className="bg-white border border-purple-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-purple-700">Nouveau client en compte</p>
                  {inlineNewClient.error && <p className="text-xs text-red-500">{inlineNewClient.error}</p>}
                  <input
                    type="text" placeholder="Nom complet *"
                    value={inlineNewClient.name}
                    onChange={e => setInlineNewClient((m: any) => ({ ...m, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" placeholder="Téléphone"
                      value={inlineNewClient.tel}
                      onChange={e => setInlineNewClient((m: any) => ({ ...m, tel: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none"
                    />
                    <div className="relative">
                      <select
                        value={inlineNewClient.city}
                        onChange={e => setInlineNewClient((m: any) => ({ ...m, city: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none appearance-none bg-white">
                        <option value="">Ville *</option>
                        {CITIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={() => setInlineNewClient(null)}
                      className="py-2 text-xs border border-gray-200 rounded-lg text-gray-500 font-semibold hover:bg-gray-50 transition">
                      Annuler
                    </button>
                    <button type="button"
                      onClick={handleCreateInlineClient}
                      disabled={inlineNewClient.loading}
                      className="py-2 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-semibold transition flex items-center justify-center gap-1.5">
                      {inlineNewClient.loading
                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <><Check className="w-3.5 h-3.5" /> Créer & sélectionner</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-4 rounded-xl font-bold text-base transition flex items-center justify-center gap-2"
        >
          {loading
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
            : '📦 Enregistrer le colis'
          }
        </button>
      </form>
    </div>
  )
}
