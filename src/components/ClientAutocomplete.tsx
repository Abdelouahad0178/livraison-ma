import { useState, useEffect, useRef } from 'react'
import { Client } from '../firebase/clients'

interface ClientAutocompleteProps {
  type: 'expediteur' | 'destinataire'
  searchFunction: (term: string, filterCity?: string) => Promise<Client[]>
  onSelect: (client: Client | null) => void
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  filterCity?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export default function ClientAutocomplete({
  type,
  searchFunction,
  onSelect,
  value,
  onChange,
  placeholder,
  className = '',
  filterCity,
  onKeyDown
}: ClientAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Client[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const searchClients = async () => {
      if (value.trim().length < 1) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      setLoading(true)
      try {
        const results = await searchFunction(value, filterCity)
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
      } catch (error) {
        console.error('Erreur recherche:', error)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(searchClients, 300)
    return () => clearTimeout(timer)
  }, [value, searchFunction, filterCity])

  const handleSelect = (client: Client) => {
    onChange(client.name)
    onSelect(client)
    setShowSuggestions(false)
  }

  const handleInputChange = (newValue: string) => {
    onChange(newValue)
    if (!newValue.trim()) {
      onSelect(null)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true)
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder || `Nom du ${type}...`}
        className={className}
        autoComplete="off"
      />

      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition"
            >
              <div className="font-semibold text-gray-900">{client.name}</div>
              <div className="text-xs text-gray-600 mt-1">
                📞 {client.tel} • 📍 {client.address || client.city}
              </div>
              {client.secteurName && (
                <div className="text-xs text-blue-600 mt-1">
                  🏘️ Secteur: {client.secteurName}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
