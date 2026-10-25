/** 📝 Comptes clients (fiche d'ouverture de compte) : comptes autorisés à voir l'onglet. */
export const CLIENT_ACCOUNTS_EMAILS = ['noura@gmail.com']

export const canManageClientAccounts = (email?: string | null) =>
  !!email && CLIENT_ACCOUNTS_EMAILS.includes(email.trim().toLowerCase())
