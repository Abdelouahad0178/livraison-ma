// Gestion des clients locaux (non enregistrés dans Firestore)
// Pour les clients de passage qui envoient 1-2 colis

export interface LocalClient {
  id: string
  name: string
  tel: string
  address?: string
  city?: string
  createdAt: number
  usageCount: number // Nombre de fois utilisé
}

const STORAGE_KEY = 'local_clients'
const MAX_CLIENTS = 500 // Limite pour éviter de surcharger localStorage

// Récupérer tous les clients locaux
export function getLocalClients(): LocalClient[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Erreur lecture clients locaux:', error)
    return []
  }
}

// Sauvegarder un client local
export function saveLocalClient(client: Omit<LocalClient, 'id' | 'createdAt' | 'usageCount'>): LocalClient {
  const clients = getLocalClients()

  // Vérifier si le client existe déjà (par nom et tél)
  const existing = clients.find(c =>
    c.name.toLowerCase() === client.name.toLowerCase() &&
    c.tel === client.tel
  )

  if (existing) {
    // Incrémenter le compteur d'utilisation
    existing.usageCount++
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients))
    return existing
  }

  // Créer un nouveau client local
  const newClient: LocalClient = {
    id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...client,
    createdAt: Date.now(),
    usageCount: 1
  }

  clients.push(newClient)

  // Limiter le nombre de clients (garder les plus récents et les plus utilisés)
  if (clients.length > MAX_CLIENTS) {
    clients.sort((a, b) => {
      // Trier par usage puis par date
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount
      }
      return b.createdAt - a.createdAt
    })
    clients.splice(MAX_CLIENTS) // Garder seulement les MAX_CLIENTS premiers
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients))
  return newClient
}

// Rechercher des clients locaux
export function searchLocalClients(query: string): LocalClient[] {
  if (!query || query.length < 2) return []

  const clients = getLocalClients()
  const q = query.toLowerCase()

  return clients.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.tel.includes(q) ||
    c.address?.toLowerCase().includes(q)
  ).slice(0, 10) // Limiter à 10 résultats
}

// Incrémenter l'utilisation d'un client local
export function incrementLocalClientUsage(clientId: string) {
  const clients = getLocalClients()
  const client = clients.find(c => c.id === clientId)
  if (client) {
    client.usageCount++
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients))
  }
}

// Nettoyer les clients locaux peu utilisés (optionnel)
export function cleanupLocalClients() {
  const clients = getLocalClients()
  const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000)

  // Supprimer les clients créés il y a plus de 6 mois avec usageCount = 1
  const filtered = clients.filter(c =>
    !(c.createdAt < sixMonthsAgo && c.usageCount === 1)
  )

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  return clients.length - filtered.length // Nombre de clients supprimés
}
