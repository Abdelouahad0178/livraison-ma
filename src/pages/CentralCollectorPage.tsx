import { useEffect, useMemo, useState } from 'react'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import {
  createCentralSupplierPayment,
  markCentralSupplierPaymentPaid,
  subscribeAllCentralCodDeposits,
  subscribeAllCentralSupplierPayments,
  subscribeAllParcels,
} from '../firebase/firestore'
import { Banknote, Building2, CheckCircle2, LogOut, Search, FileText, X, Save, Printer, Calendar, Filter } from 'lucide-react'

const money = (n: any) => (parseFloat(n) || 0).toLocaleString('fr-MA')
const asDate = (value: any) => {
  if (!value) return null
  if (value.toDate) return value.toDate()
  return new Date(value)
}
const fmtDate = (value: any) => {
  const d = asDate(value)
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-MA') : '-'
}
const senderKey = (p: any) => `${String(p.sender?.name || '').trim().toLowerCase()}|${String(p.sender?.tel || '').trim()}`
const parcelAgency = (p: any) => p?.centralDepositCity || p?.destinationCity || p?.receiver?.city || p?.originCity || p?.sender?.city || 'Agence non definie'
const supplierAgency = (p: any) => p?.originCity || p?.sender?.city || 'Agence non definie'
const supplierAgenciesText = (parcels: any) => [...new Set((parcels || []).map(supplierAgency).filter(Boolean))].join(', ') || '-'
const isParcelPaid = (p: any) => !!p.centralSupplierPaid || !!p.codSenderPaid || p.centralSupplierPaymentStatus === 'paid'
const isParcelPrepared = (p: any) => !isParcelPaid(p) && (p.centralSupplierPaymentStatus === 'prepared' || !!p.centralSupplierPaymentId)
const paymentStatus = (pay: any) => pay?.status || 'paid'
const normalizeSearch = (value: any) => String(value ?? '').toLowerCase().replace(/\s+/g, '')
const hasSearch = (values: any, q: any) => {
  if (!q) return true
  const compactQ = normalizeSearch(q)
  return values.some((v: any) => {
    const raw = String(v ?? '').toLowerCase()
    return raw.includes(q) || normalizeSearch(raw).includes(compactQ)
  })
}
const inDateRange = (value: any, preset: any, from: any, to: any) => {
  if (preset === 'all') return true
  const d = asDate(value)
  if (!d || Number.isNaN(d.getTime())) return false
  const now = new Date()
  let start: any = null
  let end = new Date(now)
  end.setHours(23, 59, 59, 999)
  if (preset === 'today') {
    start = new Date(now)
    start.setHours(0, 0, 0, 0)
  } else if (preset === 'week') {
    start = new Date(now)
    start.setDate(now.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (preset === 'custom') {
    start = from ? new Date(from + 'T00:00:00') : null
    end = to ? new Date(to + 'T23:59:59') : end
  }
  return (!start || d >= start) && (!end || d <= end)
}

export default function CentralCollectorPage() {
  const [profile, setProfile] = useState<any>(null)
  const [parcels, setParcels] = useState<any[]>([])
  const [deposits, setDeposits] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [cityFilter, setCityFilter] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('unpaid')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [modal, setModal] = useState<any>(null)
  const [selectedAgency, setSelectedAgency] = useState('')
  const [payingId, setPayingId] = useState('')

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    return onSnapshot(
      doc(db, 'users', uid),
      snap => setProfile(snap.exists() ? snap.data() : null),
      err => console.warn('CentralCollectorPage user profile listener error:', err.code)
    )
  }, [])

  useEffect(() => {
    const onError = (err: any) => console.error('CentralCollectorPage:', err)
    const unsubParcels = subscribeAllParcels(setParcels, onError)
    const unsubDeposits = subscribeAllCentralCodDeposits(setDeposits, onError)
    const unsubPayments = subscribeAllCentralSupplierPayments(setPayments, onError)
    return () => {
      unsubParcels()
      unsubDeposits()
      unsubPayments()
    }
  }, [])

  const depositedParcels = useMemo(() => parcels.filter(p =>
    parseFloat(p.codAmount || 0) > 0 && p.centralDeposited
  ), [parcels])

  const cities = useMemo(() => [...new Set(deposits.map(d => d.city).filter(Boolean))].sort(), [deposits])
  const parcelById = useMemo(() => new Map(parcels.map(p => [p.id, p])), [parcels])
  const q = query.trim().toLowerCase()
  const min = parseFloat(minAmount) || null
  const max = parseFloat(maxAmount) || null
  const amountOk = (amount: any) => {
    const n = parseFloat(amount) || 0
    if (min !== null && n < min) return false
    if (max !== null && n > max) return false
    return true
  }

  const filteredDeposits = deposits.filter(d => {
    if (cityFilter !== 'all' && d.city !== cityFilter) return false
    if (!inDateRange(d.createdAt, datePreset, dateFrom, dateTo)) return false
    if (!amountOk(d.amount)) return false
    if (!q) return true
    const linkedParcels = (d.parcelIds || []).map((id: any) => parcelById.get(id)).filter(Boolean)
    const values = [
      d.city, d.agentName, d.amount, d.note,
      ...(d.parcels || []).flatMap((p: any) => [
        p.id, p.trackingId, p.senderNic, p.sender?.nic, p.senderName, p.senderTel,
        p.receiverName, p.receiverTel, p.originCity, p.destinationCity,
      ]),
      ...linkedParcels.flatMap((p: any) => [
        p.trackingId, p.sender?.nic, p.sender?.name, p.sender?.tel,
        p.receiver?.name, p.receiver?.tel, p.originCity, p.destinationCity,
      ]),
    ]
    return hasSearch(values, q)
  })

  const filteredPayments = payments.filter(pay => {
    if (!inDateRange(pay.createdAt, datePreset, dateFrom, dateTo)) return false
    if (!amountOk(pay.amount)) return false
    if (cityFilter !== 'all') {
      const hasCity = (pay.parcels || []).some((p: any) => p.originCity === cityFilter || p.destinationCity === cityFilter)
      if (!hasCity) return false
    }
    if (!q) return true
    const linkedParcels = (pay.parcelIds || []).map((id: any) => parcelById.get(id)).filter(Boolean)
    const values = [
      pay.senderName, pay.senderTel, pay.senderNic, pay.chequeNum, pay.bankName, pay.amount, pay.note,
      ...(pay.parcels || []).flatMap((p: any) => [
        p.id, p.trackingId, p.senderNic, p.sender?.nic, p.senderName, p.senderTel,
        p.receiverName, p.receiverTel, p.originCity, p.destinationCity,
      ]),
      ...linkedParcels.flatMap((p: any) => [
        p.trackingId, p.sender?.nic, p.sender?.name, p.sender?.tel,
        p.receiver?.name, p.receiver?.tel, p.originCity, p.destinationCity,
      ]),
    ]
    return hasSearch(values, q)
  })

  const filteredParcelsForSuppliers = useMemo(() => depositedParcels.filter(p => {
    if (cityFilter !== 'all' && p.centralDepositCity !== cityFilter) return false
    if (!inDateRange(p.centralDepositAt || p.createdAt, datePreset, dateFrom, dateTo)) return false
    if (!amountOk(p.codAmount)) return false
    const paid = isParcelPaid(p)
    const prepared = isParcelPrepared(p)
    if (paymentFilter === 'unpaid' && (paid || prepared)) return false
    if (paymentFilter === 'prepared' && !prepared) return false
    if (paymentFilter === 'paid' && !paid) return false
    const values = [
      p.id, p.trackingId, p.sender?.name, p.sender?.nic, p.sender?.tel, p.receiver?.name, p.receiver?.tel,
      p.originCity, p.destinationCity, p.centralDepositCity, p.codAmount,
      p.centralChequeNum, p.centralChequeBank,
    ]
    return hasSearch(values, q)
  }), [depositedParcels, cityFilter, datePreset, dateFrom, dateTo, minAmount, maxAmount, paymentFilter, q])

  const supplierGroups = useMemo(() => {
    const map = new Map()
    filteredParcelsForSuppliers.forEach(p => {
      const key = senderKey(p)
      if (!map.has(key)) {
        map.set(key, {
          key,
          senderName: p.sender?.name || 'Expediteur sans nom',
          senderTel: p.sender?.tel || '',
          supplierAgencies: [],
          parcels: [],
          total: 0,
        })
      }
      const group = map.get(key)
      const agency = supplierAgency(p)
      if (agency && !group.supplierAgencies.includes(agency)) group.supplierAgencies.push(agency)
      group.parcels.push(p)
      group.total += parseFloat(p.codAmount) || 0
    })
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [filteredParcelsForSuppliers])

  const agencySections = useMemo(() => {
    const map = new Map()
    const ensure = (city: any) => {
      const key = city || 'Agence non definie'
      if (!map.has(key)) {
        map.set(key, {
          city: key,
          deposits: [],
          payments: [],
          supplierGroups: [],
          totalDeposits: 0,
          totalWaiting: 0,
          totalPaid: 0,
          parcelCount: 0,
        })
      }
      return map.get(key)
    }

    filteredDeposits.forEach(dep => {
      const section = ensure(dep.city)
      section.deposits.push(dep)
      section.totalDeposits += parseFloat(dep.amount) || 0
    })

    const parcelsByAgency = new Map()
    filteredParcelsForSuppliers.forEach(p => {
      const city = parcelAgency(p)
      if (!parcelsByAgency.has(city)) parcelsByAgency.set(city, [])
      parcelsByAgency.get(city).push(p)
      const section = ensure(city)
      section.totalWaiting += parseFloat(p.codAmount) || 0
      section.parcelCount += 1
    })

    parcelsByAgency.forEach((list, city) => {
      const bySupplier = new Map()
      list.forEach((p: any) => {
        const key = senderKey(p)
        if (!bySupplier.has(key)) {
          bySupplier.set(key, {
            key: `${city}|${key}`,
            city,
            senderName: p.sender?.name || 'Expediteur sans nom',
            senderTel: p.sender?.tel || '',
            supplierAgencies: [],
            parcels: [],
            total: 0,
          })
        }
        const group = bySupplier.get(key)
        const agency = supplierAgency(p)
        if (agency && !group.supplierAgencies.includes(agency)) group.supplierAgencies.push(agency)
        group.parcels.push(p)
        group.total += parseFloat(p.codAmount) || 0
      })
      ensure(city).supplierGroups = [...bySupplier.values()].sort((a, b) => b.total - a.total)
    })

    filteredPayments.forEach(pay => {
      const linkedParcels = (pay.parcelIds || []).map((id: any) => parcelById.get(id)).filter(Boolean)
      const cities = new Set([
        ...(pay.parcels || []).map((p: any) => p.centralDepositCity || p.destinationCity || p.originCity).filter(Boolean),
        ...linkedParcels.map(parcelAgency).filter(Boolean),
      ])
      if (cities.size === 0) cities.add('Agence non definie')
      cities.forEach(city => {
        const section = ensure(city)
        section.payments.push(pay)
        section.totalPaid += parseFloat(pay.amount) || 0
      })
    })

    return [...map.values()]
      .filter(section => section.deposits.length || section.payments.length || section.supplierGroups.length)
      .sort((a, b) => a.city.localeCompare(b.city))
  }, [filteredDeposits, filteredPayments, filteredParcelsForSuppliers, parcelById])

  const agencyNames = agencySections.map(section => section.city)
  const agencyKey = agencyNames.join('|')
  useEffect(() => {
    if (cityFilter !== 'all') {
      if (selectedAgency !== cityFilter) setSelectedAgency(cityFilter)
      return
    }
    if (!agencyNames.length) {
      if (selectedAgency) setSelectedAgency('')
      return
    }
    if (!selectedAgency || !agencyNames.includes(selectedAgency)) {
      setSelectedAgency(agencyNames[0])
    }
  }, [agencyKey, cityFilter, selectedAgency])
  const activeAgency = agencySections.find(section => section.city === selectedAgency) || agencySections[0] || null

  const totalDeposited = deposits.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  const totalWaiting = supplierGroups.reduce((s, g) => s + g.total, 0)
  const preparedPayments = payments.filter(p => paymentStatus(p) !== 'paid')
  const paidPayments = payments.filter(p => paymentStatus(p) === 'paid')
  const totalPaid = paidPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const totalPrepared = preparedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const unpaidCount = depositedParcels.filter(p => !isParcelPaid(p) && !isParcelPrepared(p)).length
  const clearFilters = () => {
    setQuery('')
    setCityFilter('all')
    setDatePreset('all')
    setDateFrom('')
    setDateTo('')
    setPaymentFilter('unpaid')
    setMinAmount('')
    setMaxAmount('')
  }

  const openPayment = (group: any) => setModal({
    group,
    chequeNum: '',
    bankName: '',
    chequeDate: new Date().toISOString().split('T')[0],
    note: '',
    loading: false,
    error: '',
  })

  const submitPayment = async () => {
    if (!modal?.group) return
    setModal((m: any) => ({ ...m, loading: true, error: '' }))
    try {
      await createCentralSupplierPayment({
        parcelIds: modal.group.parcels.map((p: any) => p.id),
        parcels: modal.group.parcels,
        amount: modal.group.total,
        senderName: modal.group.senderName,
        senderTel: modal.group.senderTel,
        chequeNum: modal.chequeNum.trim(),
        bankName: modal.bankName.trim(),
        chequeDate: modal.chequeDate,
        preparedBy: profile?.name || 'Encaisseur central',
        preparedById: auth.currentUser?.uid,
        note: modal.note.trim(),
      })
      setModal(null)
    } catch (err: any) {
      setModal((m: any) => ({ ...m, loading: false, error: err?.message || 'Erreur lors de la preparation du cheque.' }))
    }
  }

  const confirmPaymentPaid = async (pay: any) => {
    if (!pay?.id) return
    if (!window.confirm(`Marquer le cheque ${pay.chequeNum || ''} comme paye ?\nLes colis seront alors affiches payes dans la plateforme.`)) return
    setPayingId(pay.id)
    try {
      await markCentralSupplierPaymentPaid(
        pay.id,
        profile?.name || 'Encaisseur central',
        auth.currentUser?.uid,
      )
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la validation du paiement.')
    } finally {
      setPayingId('')
    }
  }

  const printGroup = (group: any) => {
    const rows = group.parcels.map((p: any) => `
      <tr>
        <td>${p.trackingId || '-'}</td>
        <td>${p.receiver?.name || '-'}</td>
        <td>${p.receiver?.tel || '-'}</td>
        <td>${p.originCity || p.sender?.city || '-'}</td>
        <td>${p.destinationCity || p.receiver?.city || '-'}</td>
        <td style="text-align:right;font-weight:bold">${money(p.codAmount)} DH</td>
      </tr>
    `).join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cheque ${group.senderName}</title>
      <style>body{font-family:Arial,sans-serif;margin:22px;font-size:12px}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#047857;color:white;text-align:left;padding:7px}td{border-bottom:1px solid #e5e7eb;padding:6px}.total{text-align:right;font-size:16px;font-weight:bold;margin-top:14px}</style>
    </head><body><h1>Etat remboursement fournisseur</h1><p>${group.senderName} ${group.senderTel ? '- ' + group.senderTel : ''}</p><p>Agence fournisseur: ${(group.supplierAgencies || []).join(', ') || '-'}</p>
    <table><thead><tr><th>Tracking</th><th>Client</th><th>Tel</th><th>Origine</th><th>Destination</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="total">Total cheque: ${money(group.total)} DH</p></body></html>`
    const w: any = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-4 sticky top-0 z-20">
        <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
          <Banknote className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black">Encaisseur central</h1>
          <p className="text-xs text-slate-500">Versements agences, details RETOUR FOND et cheques fournisseurs</p>
        </div>
        <button onClick={() => signOut(auth)} className="px-3 py-2 rounded-xl border border-red-100 text-red-600 hover:bg-red-50 text-sm font-bold flex items-center gap-2">
          <LogOut className="w-4 h-4" /> Deconnexion
        </button>
      </header>

      <main className="p-5 max-w-7xl mx-auto space-y-5">
        <section className="grid md:grid-cols-3 gap-3">
          {[
            ['Verse au compte societe', totalDeposited, deposits.length, 'bg-emerald-50 text-emerald-700 border-emerald-100'],
            ['A payer fournisseurs', totalWaiting, unpaidCount, 'bg-amber-50 text-amber-700 border-amber-100'],
            ['Cheques prepares', totalPrepared, preparedPayments.length, 'bg-blue-50 text-blue-700 border-blue-100'],
          ].map(([label, total, count, cls]) => (
            <div key={label} className={`rounded-2xl border p-4 ${cls}`}>
              <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
              <p className="text-3xl font-black mt-1">{money(total)} DH</p>
              <p className="text-xs font-semibold mt-1">{count} operation(s)</p>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-3 space-y-3">
          <div className="flex items-center gap-2 text-slate-700">
            <Filter className="w-4 h-4" />
            <p className="text-sm font-black">Filtres</p>
            <button onClick={clearFilters} className="ml-auto text-xs font-bold text-slate-500 hover:text-red-600">Reinitialiser</button>
          </div>
          <div className="grid md:grid-cols-[1.3fr_0.8fr_0.8fr] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher tracking, N EXP, fournisseur, client, agence..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:outline-none text-sm"
            />
          </div>
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold">
            <option value="all">Toutes les agences</option>
            {cities.map(city => <option key={city} value={city}>{city}</option>)}
          </select>
          <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold">
            <option value="unpaid">A payer</option>
            <option value="prepared">Cheques prepares</option>
            <option value="paid">Payes</option>
            <option value="all">Tous statuts</option>
          </select>
          </div>
          <div className="grid md:grid-cols-[1fr_0.65fr_0.65fr_0.55fr_0.55fr] gap-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <select value={datePreset} onChange={e => setDatePreset(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold">
                <option value="all">Toutes les dates</option>
                <option value="today">Aujourd'hui</option>
                <option value="week">7 jours</option>
                <option value="month">Ce mois</option>
                <option value="custom">Personnalise</option>
              </select>
            </div>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDatePreset('custom') }} className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDatePreset('custom') }} className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
            <input type="number" min="0" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Min DH" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
            <input type="number" min="0" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="Max DH" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
          </div>
        </section>

        <section className="space-y-4">
          {agencySections.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
              Aucune operation ne correspond aux filtres.
            </div>
          )}

          {agencySections.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h2 className="font-black text-slate-800">Agences</h2>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{agencySections.length}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {agencySections.map(section => {
                  const isActive = activeAgency?.city === section.city
                  return (
                    <button
                      key={section.city}
                      type="button"
                      onClick={() => setSelectedAgency(section.city)}
                      className={`text-left rounded-xl border px-3 py-3 transition ${
                        isActive
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100'
                          : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black truncate">{section.city}</p>
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}>
                          {section.parcelCount}
                        </span>
                      </div>
                      <div className={`mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold ${isActive ? 'text-blue-50' : 'text-slate-500'}`}>
                        <span>{money(section.totalDeposits)} DH verse</span>
                        <span className="text-right">{money(section.totalWaiting)} DH a payer</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeAgency && [activeAgency].map(section => (
            <div key={section.city} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-4 bg-slate-900 text-white flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48">
                  <h2 className="font-black text-lg">{section.city}</h2>
                  <p className="text-xs text-slate-300">{section.parcelCount} colis a payer · {section.deposits.length} versement(s) · {section.payments.length} cheque(s)</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="font-black text-emerald-300">{money(section.totalDeposits)} DH</p>
                    <p className="text-slate-300">verse</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="font-black text-amber-300">{money(section.totalWaiting)} DH</p>
                    <p className="text-slate-300">a payer</p>
                  </div>
                  <div className="rounded-xl bg-white/10 px-3 py-2">
                    <p className="font-black text-blue-300">{money(section.payments.filter((p: any) => paymentStatus(p) !== 'paid').reduce((s: any, p: any) => s + (parseFloat(p.amount) || 0), 0))} DH</p>
                    <p className="text-slate-300">prepares</p>
                  </div>
                </div>
              </div>

              <div className="grid xl:grid-cols-[1.15fr_0.85fr]">
                <div className="border-r border-slate-100">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-black">Fournisseurs a payer</h3>
                    <span className="ml-auto text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{section.supplierGroups.length}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {section.supplierGroups.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Aucun fournisseur a payer pour cette agence.</p>}
                    {section.supplierGroups.map((group: any) => {
                      const alreadyPaid = group.parcels.every(isParcelPaid)
                      const alreadyPrepared = group.parcels.every((p: any) => isParcelPaid(p) || isParcelPrepared(p))
                      return (
                        <div key={group.key} className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-slate-900 truncate">{group.senderName}</p>
                              <p className="text-xs font-bold text-blue-700 mt-1">Agence fournisseur: {(group.supplierAgencies || []).join(', ') || '-'}</p>
                              <p className="text-xs text-slate-500">{group.senderTel || '-'}{group.parcels[0]?.sender?.nic ? ` · N EXP ${group.parcels[0].sender.nic}` : ''} · {group.parcels.length} colis</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black text-emerald-700">{money(group.total)} DH</p>
                              <div className="flex gap-2 mt-2 justify-end">
                                <button onClick={() => printGroup(group)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600" title="Imprimer detail">
                                  <Printer className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => !alreadyPrepared && openPayment(group)}
                                  disabled={alreadyPrepared}
                                  className={`px-3 py-2 rounded-xl text-xs font-bold ${
                                    alreadyPrepared
                                      ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  }`}
                                >
                                  {alreadyPaid ? 'Deja paye' : alreadyPrepared ? 'Cheque prepare' : 'Preparer cheque'}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 rounded-xl border border-slate-100 overflow-hidden">
                            {group.parcels.slice(0, 6).map((p: any) => (
                              <div key={p.id} className="px-3 py-2 flex items-center gap-2 text-xs bg-slate-50 border-b last:border-b-0 border-slate-100">
                                <span className="font-mono text-blue-600">{p.trackingId}</span>
                                <span className="flex-1 truncate text-slate-600">{p.receiver?.name || '-'} · {p.destinationCity || p.receiver?.city || '-'}</span>
                                <span className="font-black text-emerald-700">{money(p.codAmount)} DH</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-1">
                  <div className="border-b md:border-b-0 md:border-r xl:border-r-0 xl:border-b border-slate-100">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-blue-600" />
                      <h3 className="font-black">Versements</h3>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {section.deposits.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Aucun versement.</p>}
                      {section.deposits.map((dep: any) => (
                        <div key={dep.id} className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800">{dep.agentName || '-'}</p>
                              <p className="text-xs text-slate-500">{fmtDate(dep.createdAt)} · {dep.parcelCount || dep.parcelIds?.length || 0} colis</p>
                            </div>
                            <p className="font-black text-blue-700">{money(dep.amount)} DH</p>
                          </div>
                          {(dep.parcels || []).slice(0, 3).map((p: any) => (
                            <p key={p.id || p.trackingId} className="text-xs text-slate-400 mt-1 truncate">{p.trackingId} · {p.senderName} → {p.receiverName} · {money(p.amount)} DH</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <h3 className="font-black">Cheques prepares</h3>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {section.payments.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">Aucun cheque prepare.</p>}
                      {section.payments.map((pay: any) => (
                        <div key={`${section.city}-${pay.id}`} className="p-4 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 truncate">{pay.senderName}</p>
                            <p className="text-xs font-bold text-blue-700">Agence fournisseur: {supplierAgenciesText(pay.parcels)}</p>
                            <p className="text-xs text-slate-500">Cheque {pay.chequeNum || '-'} · {pay.bankName || '-'} · {fmtDate(pay.createdAt)}</p>
                            <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-black ${paymentStatus(pay) === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {paymentStatus(pay) === 'paid' ? 'Paye systeme' : 'Prepare - attente paye'}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-green-700">{money(pay.amount)} DH</p>
                            {paymentStatus(pay) !== 'paid' && (
                              <button
                                onClick={() => confirmPaymentPaid(pay)}
                                disabled={payingId === pay.id}
                                className="mt-2 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-black"
                              >
                                {payingId === pay.id ? '...' : 'Paye'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="hidden">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <h2 className="font-black">Remboursements fournisseurs</h2>
              <span className="ml-auto text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{supplierGroups.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {supplierGroups.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Aucun fournisseur en attente.</p>}
              {supplierGroups.map(group => {
                const alreadyPaid = group.parcels.every(isParcelPaid)
                const alreadyPrepared = group.parcels.every((p: any) => isParcelPaid(p) || isParcelPrepared(p))
                return (
                <div key={group.key} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 truncate">{group.senderName}</p>
                      <p className="text-xs text-slate-500">{group.senderTel || '-'}{group.parcels[0]?.sender?.nic ? ` · N EXP ${group.parcels[0].sender.nic}` : ''} · {group.parcels.length} colis</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-emerald-700">{money(group.total)} DH</p>
                      <div className="flex gap-2 mt-2 justify-end">
                        <button onClick={() => printGroup(group)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600" title="Imprimer detail">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => !alreadyPrepared && openPayment(group)}
                          disabled={alreadyPrepared}
                          className={`px-3 py-2 rounded-xl text-xs font-bold ${
                            alreadyPrepared
                              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {alreadyPaid ? 'Deja paye' : alreadyPrepared ? 'Cheque prepare' : 'Preparer cheque'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-100 overflow-hidden">
                    {group.parcels.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2 text-xs bg-slate-50 border-b last:border-b-0 border-slate-100">
                        <span className="font-mono text-blue-600">{p.trackingId}</span>
                        <span className="flex-1 truncate text-slate-600">{p.receiver?.name || '-'} · {p.destinationCity || p.receiver?.city || '-'}</span>
                        <span className="font-black text-emerald-700">{money(p.codAmount)} DH</span>
                      </div>
                    ))}
                  </div>
                </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-blue-600" />
                <h2 className="font-black">Versements agences</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                {filteredDeposits.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Aucun versement trouve.</p>}
                {filteredDeposits.map(dep => (
                  <div key={dep.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800">{dep.city || '-'} · {dep.agentName || '-'}</p>
                        <p className="text-xs text-slate-500">{fmtDate(dep.createdAt)} · {dep.parcelCount || dep.parcelIds?.length || 0} colis</p>
                      </div>
                      <p className="font-black text-blue-700">{money(dep.amount)} DH</p>
                    </div>
                    {(dep.parcels || []).slice(0, 3).map((p: any) => (
                      <p key={p.id || p.trackingId} className="text-xs text-slate-400 mt-1 truncate">{p.trackingId} · {p.senderName} → {p.receiverName} · {money(p.amount)} DH</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <h2 className="font-black">Cheques prepares</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {filteredPayments.length === 0 && <p className="p-8 text-center text-slate-400 text-sm">Aucun cheque prepare.</p>}
                {filteredPayments.slice(0, 20).map(pay => (
                  <div key={pay.id} className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{pay.senderName}</p>
                      <p className="text-xs text-slate-500">Cheque {pay.chequeNum || '-'} · {pay.bankName || '-'} · {fmtDate(pay.createdAt)}</p>
                      <p className={`text-xs font-bold mt-1 ${paymentStatus(pay) === 'paid' ? 'text-green-700' : 'text-amber-700'}`}>
                        {paymentStatus(pay) === 'paid' ? 'Paye systeme' : 'Prepare - attente paye'}
                      </p>
                    </div>
                    <p className="font-black text-green-700">{money(pay.amount)} DH</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !modal.loading && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Banknote className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-black text-lg">Preparer cheque societe</h3>
                <p className="text-xs font-bold text-blue-700 mt-1">Agence fournisseur: {(modal.group.supplierAgencies || []).join(', ') || '-'}</p>
                <p className="text-xs text-slate-500">{modal.group.senderName} · {money(modal.group.total)} DH · {modal.group.parcels.length} colis</p>
              </div>
              <button onClick={() => setModal(null)} disabled={modal.loading} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-500">
                Numero cheque
                <input value={modal.chequeNum} onChange={e => setModal((m: any) => ({ ...m, chequeNum: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </label>
              <label className="text-xs font-bold text-slate-500">
                Banque
                <input value={modal.bankName} onChange={e => setModal((m: any) => ({ ...m, bankName: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </label>
              <label className="text-xs font-bold text-slate-500 col-span-2">
                Date cheque
                <input type="date" value={modal.chequeDate} onChange={e => setModal((m: any) => ({ ...m, chequeDate: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              </label>
              <label className="text-xs font-bold text-slate-500 col-span-2">
                Note
                <textarea value={modal.note} onChange={e => setModal((m: any) => ({ ...m, note: e.target.value }))} rows={2} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none resize-none" />
              </label>
            </div>
            {modal.error && <p className="mt-3 text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2 font-semibold">{modal.error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setModal(null)} disabled={modal.loading} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">Annuler</button>
              <button onClick={submitPayment} disabled={modal.loading} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center gap-2">
                <Save className="w-4 h-4" /> {modal.loading ? 'Enregistrement...' : 'Preparer cheque'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
