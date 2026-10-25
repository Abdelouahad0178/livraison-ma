import { useRef, useState } from 'react'

type Period = { datePreset: string; dateFrom: string; dateTo: string }
type Options = Period & {
  role?: string
  setDatePreset: (value: string) => void
  setDateFrom: (value: string) => void
  setDateTo: (value: string) => void
}

export function useAgentArchiveSearch(options: Options) {
  const [includeArchived, setIncluded] = useState(false)
  const savedPeriod = useRef<Period | null>(null)

  function setIncludeArchived(included: boolean) {
    if (included === includeArchived) return
    if (options.role === 'agentpro') {
      if (included) {
        savedPeriod.current = {
          datePreset: options.datePreset, dateFrom: options.dateFrom, dateTo: options.dateTo,
        }
        options.setDatePreset('all')
        options.setDateFrom('')
        options.setDateTo('')
      } else if (savedPeriod.current) {
        // Preserve a period explicitly selected after activating archive search.
        if (options.datePreset === 'all' && !options.dateFrom && !options.dateTo) {
          options.setDatePreset(savedPeriod.current.datePreset)
          options.setDateFrom(savedPeriod.current.dateFrom)
          options.setDateTo(savedPeriod.current.dateTo)
        }
        savedPeriod.current = null
      }
    }
    setIncluded(included)
  }

  return {
    includeArchived, setIncludeArchived,
    archiveSearchOnly: options.role === 'agentpro' && includeArchived && options.datePreset === 'all',
  }
}
