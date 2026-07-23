/**
 * 🔍 Configuration de recherche optimale pour chaque page
 *
 * Défini les champs à rechercher et leurs poids pour Fuse.js
 */

export const ADMIN_SEARCH_CONFIG = {
  keys: [
    // 🎯 Identifiants (poids maximum)
    { name: 'trackingId', weight: 3.0 },
    { name: 'senderNic', weight: 3.0 },
    { name: 'sender.nic', weight: 3.0 },

    // 📞 Contact (poids élevé)
    { name: 'sender.tel', weight: 2.0 },
    { name: 'receiver.tel', weight: 2.0 },

    // 👤 Noms (poids moyen)
    { name: 'sender.name', weight: 1.5 },
    { name: 'receiver.name', weight: 1.5 },

    // 📍 Adresses (poids moyen-bas)
    { name: 'receiver.address', weight: 1.0 },
    { name: 'sender.address', weight: 0.8 },

    // 🏙️ Villes (poids bas)
    { name: 'sender.city', weight: 0.5 },
    { name: 'receiver.city', weight: 0.5 },
    { name: 'originCity', weight: 0.5 },
    { name: 'destinationCity', weight: 0.5 },
  ],
  threshold: 0.3, // Balance entre précision et flexibilité
  debounceMs: 300,
  limit: 1000, // Limite à 1000 résultats pour performance
}

export const CHEF_AGENCE_SEARCH_CONFIG = {
  keys: [
    // 🎯 Priorité: livraison dans sa ville
    { name: 'trackingId', weight: 3.0 },
    { name: 'receiver.name', weight: 2.5 }, // Destinataire plus important
    { name: 'receiver.tel', weight: 2.5 },
    { name: 'receiver.address', weight: 2.0 },
    { name: 'sender.name', weight: 1.5 },
    { name: 'sender.tel', weight: 1.5 },
    { name: 'senderNic', weight: 2.0 },
  ],
  threshold: 0.3,
  debounceMs: 300,
  limit: 500,
}

export const ENCAISSEUR_SEARCH_CONFIG = {
  keys: [
    // 🎯 Priorité: COD et paiements
    { name: 'trackingId', weight: 3.0 },
    { name: 'sender.nic', weight: 2.5 },
    { name: 'sender.name', weight: 2.0 }, // Expéditeur pour remboursement
    { name: 'sender.tel', weight: 2.0 },
    { name: 'receiver.name', weight: 1.5 },
    { name: 'codAmount', weight: 2.5 }, // Important pour encaisseur
  ],
  threshold: 0.3,
  debounceMs: 300,
  limit: 500,
}

/**
 * 🎨 Labels pour affichage UI
 */
export const SEARCH_PLACEHOLDERS = {
  admin: '🔍 N° EXP, Nom, Tél, Adresse, Ville...',
  chef_agence: '🔍 N° EXP, Destinataire, Tél, Adresse...',
  encaisseur: '🔍 N° EXP, Expéditeur, Montant COD...',
}
