import { useState, useEffect, useMemo } from 'react'
import {
  FileText, Search, Printer, Eye, Filter, Download, AlertCircle, CheckCircle2
} from 'lucide-react'
import {
  subscribeAgencyInvoices, subscribeClientInvoices,
  type Invoice
} from '../../../firebase/invoices'
import { subscribeClients } from '../../../firebase/clients'

export default function AgentInvoicesTab({ profileCity, uid }: any) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null)

  // Abonnements
  useEffect(() => {
    if (!profileCity) {
      return
    }

    const unsubInvoices = subscribeAgencyInvoices(profileCity, setInvoices)
    const unsubClients = subscribeClients(setClients)

    return () => {
      unsubInvoices()
      unsubClients()
    }
  }, [profileCity])

  // Clients de cette agence
  const agencyClients = useMemo(() => {
    return clients.filter(c => c.agencyCity === profileCity)
  }, [clients, profileCity])

  // Filtrage
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false
      if (clientFilter !== 'all' && inv.clientId !== clientFilter) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return (
          inv.invoiceNumber.toLowerCase().includes(term) ||
          inv.clientName.toLowerCase().includes(term) ||
          inv.items.some(item => item.trackingId.toLowerCase().includes(term))
        )
      }
      return true
    })
  }, [invoices, searchTerm, statusFilter, clientFilter])

  // Statistiques
  const stats = useMemo(() => {
    const pending = invoices.filter(i => i.status === 'pending')
    const paid = invoices.filter(i => i.status === 'paid')
    return {
      total: invoices.length,
      pending: pending.length,
      pendingAmount: pending.reduce((sum, i) => sum + i.totalAmount, 0),
      paid: paid.length,
      paidAmount: paid.reduce((sum, i) => sum + i.totalAmount, 0),
    }
  }, [invoices])

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-indigo-600" />
            Mes factures
          </h2>
          <p className="text-sm text-gray-500 mt-1">Factures de l'agence {profileCity}</p>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200">
          <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Total factures</div>
          <div className="text-xl font-bold text-gray-800">{stats.total}</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 shadow-sm border border-amber-200">
          <div className="text-xs text-amber-700 uppercase font-semibold mb-1">En attente</div>
          <div className="text-xl font-bold text-amber-800">{stats.pending}</div>
          <div className="text-xs text-amber-600 mt-1">{stats.pendingAmount.toLocaleString()} DH</div>
        </div>
        <div className="bg-green-50 rounded-xl p-3 shadow-sm border border-green-200">
          <div className="text-xs text-green-700 uppercase font-semibold mb-1">Payées</div>
          <div className="text-xl font-bold text-green-800">{stats.paid}</div>
          <div className="text-xs text-green-600 mt-1">{stats.paidAmount.toLocaleString()} DH</div>
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 shadow-sm border border-indigo-200">
          <div className="text-xs text-indigo-700 uppercase font-semibold mb-1">Montant total</div>
          <div className="text-xl font-bold text-indigo-800">
            {(stats.pendingAmount + stats.paidAmount).toLocaleString()} DH
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="paid">Payées</option>
            <option value="cancelled">Annulées</option>
          </select>
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les clients</option>
            {agencyClients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setSearchTerm('')
              setStatusFilter('all')
              setClientFilter('all')
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Liste des factures */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">N° Facture</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Colis</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Montant</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500 text-sm">
                    Aucune facture trouvée
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm font-semibold text-indigo-600">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-800">{invoice.clientName}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {invoice.createdAt?.toDate?.().toLocaleDateString('fr-MA')}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{invoice.items.length}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-gray-800">
                      {invoice.totalAmount.toLocaleString()} DH
                    </td>
                    <td className="px-3 py-2">
                      {invoice.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          En attente
                        </span>
                      )}
                      {invoice.status === 'paid' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Payée
                        </span>
                      )}
                      {invoice.status === 'cancelled' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                          Annulée
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewingInvoice(invoice)}
                          className="p-1.5 hover:bg-indigo-50 rounded-lg transition text-indigo-600"
                          title="Voir détails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => printInvoice(invoice)}
                          className="p-1.5 hover:bg-gray-50 rounded-lg transition text-gray-600"
                          title="Imprimer"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de visualisation */}
      {viewingInvoice && (
        <ViewInvoiceModal
          invoice={viewingInvoice}
          onClose={() => setViewingInvoice(null)}
        />
      )}
    </div>
  )
}

// Modal de visualisation (réutilisée de AdminInvoicesTab)
function ViewInvoiceModal({ invoice, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 p-5 border-b bg-indigo-50 shrink-0">
          <FileText className="w-6 h-6 text-indigo-600" />
          <div className="flex-1">
            <h2 className="font-bold text-gray-800">Facture {invoice.invoiceNumber}</h2>
            <div className="text-xs text-indigo-600">{invoice.clientName}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-xl transition">
            <span className="text-2xl text-gray-600">×</span>
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Client</div>
              <div className="font-semibold text-gray-800">{invoice.clientName}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Agence</div>
              <div className="font-semibold text-gray-800">{invoice.agencyCity}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Date de création</div>
              <div className="font-semibold text-gray-800">
                {invoice.createdAt?.toDate?.().toLocaleDateString('fr-MA')}
              </div>
            </div>
            {invoice.dueDate && (
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Date d'échéance</div>
                <div className="font-semibold text-gray-800">
                  {invoice.dueDate?.toDate?.().toLocaleDateString('fr-MA')}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Créée par</div>
              <div className="font-semibold text-gray-800">{invoice.createdByName}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Statut</div>
              {invoice.status === 'pending' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                  En attente
                </span>
              )}
              {invoice.status === 'paid' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                  Payée
                </span>
              )}
              {invoice.status === 'cancelled' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                  Annulée
                </span>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Notes</div>
              <div className="text-sm text-gray-700">{invoice.notes}</div>
            </div>
          )}

          {invoice.status === 'paid' && (
            <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-xs text-green-700 uppercase font-semibold mb-2">Informations de paiement</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Date de paiement:</span>
                  <span className="font-semibold">
                    {invoice.paidAt?.toDate?.().toLocaleDateString('fr-MA')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Méthode:</span>
                  <span className="font-semibold">{invoice.paymentMethod}</span>
                </div>
                {invoice.paymentReference && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Référence:</span>
                    <span className="font-semibold">{invoice.paymentReference}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">N° EXP</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Destinataire</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Ville</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoice.items.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm font-semibold text-indigo-600">
                      {item.senderNic || item.trackingId}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {item.createdAt ? (
                        item.createdAt.toDate
                          ? item.createdAt.toDate().toLocaleDateString('fr-MA')
                          : new Date(item.createdAt).toLocaleDateString('fr-MA')
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">{item.recipientName || '-'}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{item.recipientCity || '-'}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-right">
                      {item.portAmount.toLocaleString()} DH
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-right font-bold text-gray-800">
                    Total
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-indigo-900 text-lg">
                    {invoice.totalAmount.toLocaleString()} DH
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="p-5 border-t shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition"
          >
            Fermer
          </button>
          <button
            onClick={() => printInvoice(invoice)}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// Fonction de conversion nombre en lettres (français)
function numberToWords(num: number): string {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf']
  const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix']

  if (num === 0) return 'zéro'

  const convert = (n: number): string => {
    if (n < 10) return units[n]
    if (n < 20) return teens[n - 10]
    if (n < 100) {
      const ten = Math.floor(n / 10)
      const unit = n % 10
      if (ten === 7 || ten === 9) {
        return tens[ten - 1] + '-' + teens[unit]
      }
      return tens[ten] + (unit ? '-' + units[unit] : '')
    }
    if (n < 1000) {
      const hundred = Math.floor(n / 100)
      const rest = n % 100
      return (hundred > 1 ? units[hundred] + ' ' : '') + 'cent' + (hundred > 1 && rest === 0 ? 's' : '') + (rest ? ' ' + convert(rest) : '')
    }
    if (n < 1000000) {
      const thousand = Math.floor(n / 1000)
      const rest = n % 1000
      return (thousand > 1 ? convert(thousand) + ' ' : '') + 'mille' + (rest ? ' ' + convert(rest) : '')
    }
    return n.toString()
  }

  const integerPart = Math.floor(num)
  const decimalPart = Math.round((num - integerPart) * 100)

  let result = convert(integerPart) + ' dirhams'
  if (decimalPart > 0) {
    result += ' et ' + convert(decimalPart) + ' centimes'
  }
  return result
}

// Fonction d'impression (identique à AdminInvoicesTab)
function printInvoice(invoice: any) {
  const logoUrl = window.location.origin + '/LOGO.jpg'

  // Calculs TTC -> HT et TVA
  const totalTTC = invoice.totalAmount
  const totalHT = totalTTC / 1.10
  const totalTVA = totalTTC - totalHT
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Facture-${invoice.invoiceNumber}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { height: 100%; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; min-height: 100vh; display: flex; flex-direction: column; position: relative; }
    .content { flex: 1; padding-bottom: 60px; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #1e3a8a; }
    .header img { height: 60px; object-fit: contain; }
    .header h1 { color: #1e3a8a; font-size: 24pt; margin-bottom: 5px; text-align: center; flex: 1; }
    .header .subtitle { color: #666; font-size: 9pt; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .info-box { border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
    .info-box .label { font-size: 8pt; color: #666; text-transform: uppercase; margin-bottom: 3px; }
    .info-box .value { font-weight: bold; font-size: 11pt; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 8px; text-align: left; font-size: 9pt; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 9pt; }
    .text-right { text-align: right; }
    .total-row { background: #f0f0f0; font-weight: bold; font-size: 12pt; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 8pt; color: #666; background: white; }
    @media print {
      .footer { position: fixed; bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="content">
  <div class="header">
    <img src="${logoUrl}" alt="Logo">
    <div style="flex: 1; text-align: center;">
      <h1 style="margin: 0;">FACTURE</h1>
      <div class="subtitle">N° ${invoice.invoiceNumber}</div>
    </div>
    <div style="width: 60px;"></div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="label">Client</div>
      <div class="value">${invoice.clientName}</div>
    </div>
    <div class="info-box">
      <div class="label">Agence</div>
      <div class="value">${invoice.agencyCity}</div>
    </div>
    <div class="info-box">
      <div class="label">Date de création</div>
      <div class="value">${invoice.createdAt?.toDate?.().toLocaleDateString('fr-MA')}</div>
    </div>
    ${invoice.dueDate ? `
    <div class="info-box">
      <div class="label">Date d'échéance</div>
      <div class="value">${invoice.dueDate?.toDate?.().toLocaleDateString('fr-MA')}</div>
    </div>
    ` : ''}
  </div>

  ${invoice.notes ? `
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; padding: 10px; margin-bottom: 20px; border-radius: 5px;">
    <div style="font-size: 8pt; color: #666; text-transform: uppercase; margin-bottom: 5px;">Notes</div>
    <div style="font-size: 9pt;">${invoice.notes}</div>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>N° EXP</th>
        <th>Date</th>
        <th>Destinataire</th>
        <th>Ville</th>
        <th class="text-right">Montant (DH)</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.items.map((item: any) => `
        <tr>
          <td>${item.senderNic || item.trackingId}</td>
          <td>${item.createdAt ? (item.createdAt.toDate ? item.createdAt.toDate().toLocaleDateString('fr-MA') : new Date(item.createdAt).toLocaleDateString('fr-MA')) : '-'}</td>
          <td>${item.recipientName || '-'}</td>
          <td>${item.recipientCity || '-'}</td>
          <td class="text-right">${item.portAmount.toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div style="margin-top: 30px; page-break-inside: avoid;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt;">TOTAL HT</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt; width: 150px;">${totalHT.toFixed(2)} DH</td>
      </tr>
      <tr>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt;">TVA 10%</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; font-size: 11pt;">${totalTVA.toFixed(2)} DH</td>
      </tr>
      <tr style="background: #f0f0f0;">
        <td style="text-align: right; padding: 12px; font-weight: bold; font-size: 13pt;">TOTAL TTC</td>
        <td style="text-align: right; padding: 12px; font-weight: bold; font-size: 13pt;">${totalTTC.toFixed(2)} DH</td>
      </tr>
    </table>

    <div style="padding: 15px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px;">
      <p style="margin: 0; font-size: 10pt; font-weight: bold; text-align: justify;">
        Arrêté la présente facture à la somme de ${numberToWords(totalTTC)} (${totalTTC.toFixed(2)} DH) dont TVA est ${totalTVA.toFixed(2)} DH.
      </p>
    </div>
  </div>

  ${invoice.status === 'paid' ? `
  <div style="background: #d1fae5; border: 1px solid #6ee7b7; padding: 10px; margin-top: 20px; border-radius: 5px;">
    <div style="font-weight: bold; color: #065f46; margin-bottom: 5px;">✓ PAYÉE</div>
    <div style="font-size: 9pt; color: #047857;">
      Date: ${invoice.paidAt?.toDate?.().toLocaleDateString('fr-MA')} |
      Méthode: ${invoice.paymentMethod}
      ${invoice.paymentReference ? ` | Réf: ${invoice.paymentReference}` : ''}
    </div>
  </div>
  ` : ''}
  </div>

  <div class="footer">
    BG EXPRESS - BLOC H RUE 2 N°982 AIT MELLOUL - 0661 97 86 12 - bgexpress2024@gmail.com
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=860,height=1100')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
