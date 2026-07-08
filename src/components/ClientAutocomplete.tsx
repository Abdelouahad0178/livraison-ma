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
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

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

    const timer = setTimeout(searchClients, 800)
    return () => clearTimeout(timer)
  }, [value, searchFunction, filterCity])

  const handleSelect = (client: Client) => {
    onChange(client.name)
    onSelect(client)
    setShowSuggestions(false)
    setSelectedIndex(-1)
  }

  const handleInputChange = (newValue: string) => {
    onChange(newValue)
    if (!newValue.trim()) {
      onSelect(null)
    }
    setSelectedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || !suggestions || suggestions.length === 0) {
      // Si pas de liste, appeler le handler externe
      if (onKeyDown) onKeyDown(e)
      return
    }

    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          // Sélectionner l'élément survolé
          handleSelect(suggestions[selectedIndex])
        } else {
          // Focus sur le premier élément de la liste
          setSelectedIndex(0)
        }
        break

      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break

      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
        break

      case ' ':
        // Espace sélectionne seulement si un élément est survolé
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault()
          handleSelect(suggestions[selectedIndex])
        }
        break

      case 'Escape':
        e.preventDefault()
        setShowSuggestions(false)
        setSelectedIndex(-1)
        break

      default:
        // Autres touches: comportement normal + appeler handler externe
        if (onKeyDown) onKeyDown(e)
    }
  }

  // Scroll automatique vers l'élément sélectionné
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || `Nom du ${type}...`}
        className={className}
        autoComplete={showSuggestions ? "off" : "on"}
        name={showSuggestions ? `${type}-${Date.now()}` : type}
      />

      {/* Spinner désactivé pour ne pas gêner la saisie */}
      {/* {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )} */}

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-300 rounded-xl shadow-lg max-h-64 overflow-y-auto"
        >
          {suggestions.map((client, index) => (
            <button
              key={client.id}
              type="button"
              onClick={() => handleSelect(client)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-b-0 transition ${
                index === selectedIndex
                  ? 'bg-blue-100 border-l-4 border-l-blue-600'
                  : 'hover:bg-blue-50'
              }`}
            >
              <div className={`font-semibold ${index === selectedIndex ? 'text-blue-900' : 'text-gray-900'}`}>
                {client.name}
              </div>
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
