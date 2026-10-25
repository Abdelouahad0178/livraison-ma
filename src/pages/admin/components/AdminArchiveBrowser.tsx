import { useEffect, useRef, useState } from 'react'
import { Archive, RotateCcw, Search } from 'lucide-react'
import DateInput from '../../../components/DateInput'
import { CITIES, STATUS_COLORS } from '../../../firebase/constants'
import { browseAdminArchives, restoreAdminArchive, type AdminArchive, type ArchiveBrowseResult, type ArchiveFilters } from '../../../firebase/adminArchives'

const initialFilters: ArchiveFilters = {
  search: '', status: 'all', city: 'all', dateField: 'createdAt',
  dateFrom: '', dateTo: '', page: 0, pageSize: 50,
}
const inputClass = 'w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white'
const formatDay = (day: string) => day ? day.split('-').reverse().join('/') : '—'

export default function AdminArchiveBrowser({ revision = 0, onRestored }: {
  revision?: number
  onRestored?: () => Promise<void> | void
}) {
  const [filters, setFilters] = useState(initialFilters)
  const [result, setResult] = useState<ArchiveBrowseResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [restoring, setRestoring] = useState<string | null>(null)
  const [refreshRevision, setRefreshRevision] = useState(0)
  const lastRefresh = useRef(`${revision}:0`)
  const invalidRange = !!(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)

  useEffect(() => {
    let cancelled = false
    setError('')
    setLoading(true)
    if (invalidRange) { setLoading(false); return }
    const timer = setTimeout(async () => {
      const refreshKey = `${revision}:${refreshRevision}`
      const refresh = lastRefresh.current !== refreshKey
      try {
        const data = await browseAdminArchives({ ...filters, refresh })
        if (!cancelled) {
          lastRefresh.current = refreshKey
          setResult(data)
        }
      } catch {
        if (!cancelled) setError('Impossible de charger les archives. Vérifiez votre connexion puis réessayez.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, filters.search ? 350 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [filters, revision, refreshRevision, invalidRange])

  function updateFilter<K extends keyof ArchiveFilters>(key: K, value: ArchiveFilters[K]) {
    setFilters(previous => ({ ...previous, [key]: value, page: 0 }))
  }

  async function restore(parcel: AdminArchive) {
    if (!window.confirm(`Restaurer l’expédition ${parcel.senderNic || parcel.trackingId || parcel.id} ?`)) return
    setActionError('')
    setRestoring(parcel.id)
    try {
      await restoreAdminArchive(parcel)
      setRefreshRevision(value => value + 1)
      await onRestored?.()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Impossible de restaurer cette expédition.')
    } finally { setRestoring(null) }
  }

  const cities = [...new Set([...CITIES, ...(result?.cities || [])])].sort((a, b) => a.localeCompare(b, 'fr'))
  const statuses = result?.statuses || []
  const totalPages = Math.max(1, Math.ceil((result?.total || 0) / filters.pageSize))
  const page = result?.page || 0

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6" aria-label="Consulter les archives">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2" aria-live="polite">
          <Search className="w-5 h-5 text-blue-600" />
          Consulter les archives {loading ? '(chargement…)' : !error && !invalidRange && result ? `(${result.total.toLocaleString('fr-FR')} résultat${result.total === 1 ? '' : 's'})` : ''}
        </h2>
        <button type="button" disabled={loading || !!restoring} onClick={() => setRefreshRevision(value => value + 1)}
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 disabled:opacity-50">
          <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-4">Toutes les expéditions archivées, y compris celles conservées dans la liste principale.</p>
      <label htmlFor="archive-search" className="block text-xs font-semibold text-gray-600 mb-2">Rechercher une expédition</label>
      <input id="archive-search" type="search" value={filters.search}
        onChange={event => updateFilter('search', event.target.value)}
        placeholder="N° EXP, suivi, expéditeur, destinataire, téléphone…" className={`${inputClass} mb-4`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-3">
        <div className="min-w-0">
          <label htmlFor="archive-status" className="block text-xs font-semibold text-gray-600 mb-2">Statut</label>
          <select id="archive-status" value={filters.status} onChange={event => updateFilter('status', event.target.value)} className={inputClass}>
            <option value="all">Tous les statuts</option>
            {statuses.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="archive-city" className="block text-xs font-semibold text-gray-600 mb-2">Ville de départ ou d’arrivée</label>
          <select id="archive-city" value={filters.city} onChange={event => updateFilter('city', event.target.value)} className={inputClass}>
            <option value="all">Toutes les villes</option>
            {cities.map(city => <option key={city} value={city}>{city}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="archive-date-field" className="block text-xs font-semibold text-gray-600 mb-2">Filtrer les dates par</label>
          <select id="archive-date-field" value={filters.dateField} onChange={event => updateFilter('dateField', event.target.value as ArchiveFilters['dateField'])} className={inputClass}>
            <option value="createdAt">Date d’expédition</option>
            <option value="archivedAt">Date d’archivage</option>
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="archive-from" className="block text-xs font-semibold text-gray-600 mb-2">Du</label>
          <DateInput id="archive-from" value={filters.dateFrom} onChange={event => updateFilter('dateFrom', event.target.value)} className={inputClass} />
        </div>
        <div className="min-w-0">
          <label htmlFor="archive-to" className="block text-xs font-semibold text-gray-600 mb-2">Au (inclus)</label>
          <DateInput id="archive-to" value={filters.dateTo} onChange={event => updateFilter('dateTo', event.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-xs text-gray-500">{filters.dateField === 'createdAt' ? 'Date d’expédition : journée de travail, ou date de création si elle est absente.' : 'Date à laquelle l’expédition a été archivée.'} Les deux bornes sont incluses.</p>
        <button type="button" className="text-sm text-blue-700 font-medium" onClick={() => setFilters({ ...initialFilters })}>Réinitialiser les filtres</button>
      </div>
      {actionError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
      {invalidRange ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">La date de début doit précéder ou être égale à la date de fin.</p>
        : error ? <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error} <button type="button" className="font-semibold underline ml-2" onClick={() => setRefreshRevision(value => value + 1)}>Réessayer</button>
        </div>
        : loading ? <div role="status" className="flex items-center justify-center py-16 gap-3 text-gray-500">
          <RotateCcw className="w-5 h-5 animate-spin" /> Chargement des archives…
        </div>
        : result && result.parcels.length > 0 ? <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <caption className="sr-only">Expéditions archivées correspondant aux filtres</caption>
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>{['N° EXP / Suivi', 'Expéditeur', 'De', 'Destinataire', 'Vers', 'COD', 'Statut', 'Expédié le', 'Archivé le', 'Actions'].map(label => <th key={label} scope="col" className="px-3 py-3 text-left font-bold whitespace-nowrap">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.parcels.map(parcel => {
                  const colors = STATUS_COLORS[parcel.status] || { bg: 'bg-gray-100', text: 'text-gray-700' }
                  return <tr key={`${parcel.archiveSource}:${parcel.id}`} className="hover:bg-gray-50">
                    <td className="px-3 py-3"><div className="font-mono font-bold text-blue-700">{parcel.senderNic || parcel.trackingId || '—'}</div><div className="font-mono text-gray-500 mt-1">{parcel.trackingId}</div></td>
                    <td className="px-3 py-3">{parcel.sender.name || '—'}</td>
                    <td className="px-3 py-3 text-blue-700">{parcel.originCity || '—'}</td>
                    <td className="px-3 py-3">{parcel.receiver.name || '—'}</td>
                    <td className="px-3 py-3 text-orange-700">{parcel.destinationCity || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{parcel.codAmount > 0 ? `${parcel.codAmount.toLocaleString('fr-MA')} DH` : '—'}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-1 rounded-full whitespace-nowrap ${colors.bg} ${colors.text}`}>{parcel.status || '—'}</span></td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDay(parcel.shipmentDay)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDay(parcel.archiveDay)}</td>
                    <td className="px-3 py-3"><button type="button" disabled={!!restoring} onClick={() => restore(parcel)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> {restoring === parcel.id ? 'Restauration…' : 'Restaurer'}
                    </button></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 mt-4 text-sm text-gray-600">
            <label className="flex items-center gap-2">Par page
              <select aria-label="Résultats par page" value={filters.pageSize} onChange={event => updateFilter('pageSize', Number(event.target.value))} className="border border-gray-300 rounded-lg px-2 py-1">
                {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <span>{(page * result.pageSize + 1).toLocaleString('fr-FR')}–{Math.min((page + 1) * result.pageSize, result.total).toLocaleString('fr-FR')} sur {result.total.toLocaleString('fr-FR')}</span>
            <nav aria-label="Pagination des archives" className="flex items-center gap-3">
              <button type="button" disabled={page === 0} onClick={() => setFilters(previous => ({ ...previous, page: page - 1 }))} className="px-3 py-2 rounded-lg border disabled:opacity-40">Précédent</button>
              <span>Page {page + 1} / {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setFilters(previous => ({ ...previous, page: page + 1 }))} className="px-3 py-2 rounded-lg border disabled:opacity-40">Suivant</button>
            </nav>
          </div>
        </> : <div className="text-center py-12 text-gray-500">
          <Archive className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>Aucune archive ne correspond à ces filtres.</p>
          <button type="button" className="mt-3 text-sm text-blue-700 underline" onClick={() => setFilters({ ...initialFilters })}>Afficher toutes les archives</button>
        </div>}
    </section>
  )
}
