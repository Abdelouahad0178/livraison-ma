import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { Calendar, Search, X, Plus, MapPin, ChevronDown, Check, MessageCircle, Printer } from 'lucide-react'
import { useAgentCtx } from '../AgentCtx'
import { CITIES, ALL_SERVICE_TYPES, normalizeServiceType } from '../../../firebase/constants'
import { codSelectionOf, toggleCodService, isMixedCod, codCashPartOf, codDocPartOf, codPartsDetailLabel } from '../../../utils/codParts'
import type { Client } from '../../../firebase/clients'
// Autocomplétion et reconnaissance vocale désactivées pour optimiser performances
// import ClientAutocomplete from '../../../components/ClientAutocomplete'
// import { searchExpediteurs, searchDestinataires } from '../../../firebase/clients'
// import VoiceInputAI from '../../../components/VoiceInputAI'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db, auth } from '../../../firebase/config'
import { getWorkingDateStr } from '../../../utils/workingDate'
import { updateParcel, buildParcelCorrectionPatch, describeParcelSaveError } from '../../../firebase/parcels'
import { showToast } from '../../../utils/toast'
import { getGareDriverForCity } from '../../../firebase/delivery'
import { normIncludes } from '../../../utils/normText'
import { analyzeNbColisShortcut, nbColisDigitsOnly, NB_COLIS_SHORTCUT_HINT, NB_COLIS_SHORTCUT_TITLE } from '../../../utils/nbColisShortcut'
import { buildCityInitialsMap, matchCityInitials, CITY_INITIALS_DELAY_MS } from '../../../utils/cityInitials'
import { getEmptyParcelForm, isParcelFormEmpty } from '../emptyParcelForm'

const Barcode = lazy(() => import('react-barcode'))
const QRCodeSVG = lazy(() => import('../../../components/QRCodeSvg'))

// Fonction pour normaliser les nombres avec virgule → point
const normalizeDecimal = (value: string) => {
  return value.replace(/,/g, '.')
}

// Utiliser la date de travail au lieu de la date système
const todayStr = () => getWorkingDateStr()
// Date réelle du système (ordinateur), au format AAAA-MM-JJ
const systemTodayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Formulaire vide avec la date de travail ACTUELLE (source unique partagée avec AgentPage / HomeTab)
const getEmptyForm = getEmptyParcelForm

// 🏙️ Initiales des villes de destination : A = Agadir, AA = Ait Melloul, C, M, G, R…
const CITY_INITIALS = buildCityInitialsMap(CITIES)
const CITY_INITIALS_TITLE = 'Initiales (taper la lettre) : ' + Object.entries(CITY_INITIALS).map(([k, c]) => `${k} = ${c}`).join(' · ')

// Types disponibles pour création (sans retour_bl et retourne - ces types sont pour marquage uniquement)
const SERVICE_TYPES = ALL_SERVICE_TYPES.filter(t => t.key !== 'retour_bl' && t.key !== 'retourne')

// Libellé du statut du port (dû / payé / en compte) affiché sur le bon de ramassage
const PORT_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  port_du: { label: 'Port dû', className: 'text-orange-600' },
  port_paye: { label: 'Port payé', className: 'text-green-600' },
  port_en_compte_destinataire: { label: 'Port en compte (Dest.)', className: 'text-purple-600' },
  port_en_compte_expediteur: { label: 'Port en compte (Exp.)', className: 'text-indigo-600' },
}
const portTypeInfo = (portType: string) => PORT_TYPE_LABELS[portType] || PORT_TYPE_LABELS.port_paye

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

  // État pour la modal de confirmation/édition avant impression
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingParcel, setPendingParcel] = useState<any>(null)
  const [editableParcel, setEditableParcel] = useState<any>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  // 💵+📋 Types de retour de fonds cochés (Espèces + chèque/traite possible)
  const codSelection = codSelectionOf(form)


  // Ref pour le champ N EXP et le conteneur du ticket
  const nexpInputRef = useRef<HTMLInputElement>(null)
  const ticketContainerRef = useRef<HTMLDivElement>(null)
  const validateButtonRef = useRef<HTMLButtonElement>(null)
  const colisButtonRef = useRef<HTMLButtonElement>(null)
  const portDuButtonRef = useRef<HTMLButtonElement>(null)
  const receiverCityRef = useRef<HTMLSelectElement>(null)
  const receiverNameRef = useRef<HTMLInputElement>(null)
  const nbColisRef = useRef<HTMLInputElement>(null)

  // State pour tracker si l'autocomplétion vient de se produire
  const [autoCompleted, setAutoCompleted] = useState(false)
  // ↩️ Une tentative de création a été refusée (champ oublié : contrôle du navigateur OU contrôle
  // de l'application) → Entrée renvoie directement au bouton « Créer l'Expédition ».
  const [retryAfterRefusal, setRetryAfterRefusal] = useState(false)
  // 🎯 « + Saisie colis » : curseur directement dans le champ N° EXP (NIC), à l'ouverture de
  // l'onglet comme à chaque nouveau clic sur le bouton.
  useEffect(() => {
    // Le formulaire se construit en plusieurs temps au premier affichage (chargement de l'onglet,
    // clients, en-têtes…) : on recentre le champ N° EXP plusieurs fois pendant ~1,5 s, tant que
    // l'utilisateur n'a pas commencé à saisir ailleurs.
    const focusNexp = () => {
      const show = () => {
        const el = nexpInputRef.current
        if (!el) return
        const active = document.activeElement as HTMLElement | null
        if (active && active !== el && active !== document.body && active.closest('form') && active.tagName !== 'BUTTON') return // saisie déjà commencée
        el.style.scrollMarginTop = '140px' // ne pas finir sous l'en-tête fixe
        el.scrollIntoView({ block: 'center', behavior: 'auto' })
        el.focus({ preventScroll: true })
      }
      ;[60, 250, 600, 1100, 1600].forEach(ms => setTimeout(show, ms))
      setTimeout(() => nexpInputRef.current?.select?.(), 70)
    }
    focusNexp()
    window.addEventListener('focus-nexp', focusNexp)
    return () => window.removeEventListener('focus-nexp', focusNexp)
  }, [])
  useEffect(() => { if (createdParcel) setRetryAfterRefusal(false) }, [createdParcel])
  useEffect(() => { if (error) setRetryAfterRefusal(true) }, [error])
  // ⚡ Précharge le livreur-gare de la ville destinataire (mis en cache) : la création n'attend plus cette requête
  useEffect(() => {
    if (form.enGare && form.receiverCity) getGareDriverForCity(form.receiverCity).catch(() => {})
  }, [form.enGare, form.receiverCity])
  const [receiverAutoCompleted, setReceiverAutoCompleted] = useState(false)
  // 🧹 Message « Rien à vider » affiché DANS le formulaire, à côté du bouton, masqué après 4 s.
  // (Le toast DOM ajouté à <body> était masqué par la règle CSS `body > div:not(#root)`.)
  // (valeur = horodatage du clic : un nouveau clic relance bien les 4 s ; 0 = masqué)
  const [clearInfoAt, setClearInfoAt] = useState(0)
  useEffect(() => {
    if (!clearInfoAt) return
    const t = setTimeout(() => setClearInfoAt(0), 4000)
    return () => clearTimeout(t)
  }, [clearInfoAt])

  // States pour les popups de clients
  const [showSenderPopup, setShowSenderPopup] = useState(false)
  const [showReceiverPopup, setShowReceiverPopup] = useState(false)
  const [senderSearch, setSenderSearch] = useState('')
  const [receiverSearch, setReceiverSearch] = useState('')

  // Fonction pour créer un nouveau colis
  const handleNewParcel = () => {
    setCreatedParcel(null)
    setForm({ ...getEmptyForm(), senderCity: profile?.city || '' })
    setRetryAfterRefusal(false)
    // Focus sur N EXP après un court délai pour laisser le DOM se mettre à jour
    setTimeout(() => {
      nexpInputRef.current?.focus()
    }, 100)
  }

  // ⚡ Raccourci « Nb colis » (voir utils/nbColisShortcut) : 2ds45, 3ps40, 2dc45, 2ce45, 2cd45,
  // 2ds45e200c800, 2ds45p, 3ds45c1500k8…
  // Retourne 'applied' (reconnu et appliqué), 'error' (reconnu mais invalide : message sous le champ)
  // ou 'none' (saisie normale).
  const [nbColisError, setNbColisError] = useState('')
  const applyNbColisShortcut = (raw: string, input?: HTMLInputElement | null): 'applied' | 'error' | 'none' => {
    const res = analyzeNbColisShortcut(raw)
    if (!res) { setNbColisError(''); input?.setCustomValidity(''); return 'none' }
    if (res.error !== undefined) {
      setNbColisError(res.error)
      // Bloque la soumission tant que le raccourci n'est pas corrigé
      input?.setCustomValidity(res.error)
      return 'error'
    }
    setNbColisError('')
    input?.setCustomValidity('')
    const sc = res.shortcut
    setForm((p: any) => {
      const pt = sc.portType
      const isPaye = pt === 'port_paye'
      const next: any = {
        ...p,
        nbColis: sc.nbColis,
        natureOfGoods: sc.nature || 'Colis',
        ...(sc.weight ? { weight: sc.weight } : {}),
        ...(sc.cod
          ? { serviceType: sc.cod.serviceType, codAmount: sc.cod.codAmount, codMixed: sc.cod.codMixed, codCashAmount: sc.cod.codCashAmount }
          : { serviceType: 'simple', codAmount: '', codMixed: false, codCashAmount: '' }),
        portType: pt,
        shipmentMode: 'personal',
        portPrice: sc.amount,
        portPayeMethod: isPaye ? 'espece' : p.portPayeMethod,
        portPayeMontant: isPaye ? sc.amount : p.portPayeMontant,
      }
      // Mêmes effets que les boutons « Compte Exp » / « Compte Dest »
      if (pt === 'port_en_compte_expediteur') {
        next.shipmentMode = 'client'
        if (p.senderName && p.senderName.trim() !== '') { next.clientName = p.senderName; next.clientId = p.clientId || '' }
      }
      if (pt === 'port_en_compte_destinataire') {
        next.shipmentMode = 'client'
        if (p.receiverName && p.receiverName.trim() !== '') { next.clientName = p.receiverName; next.clientId = p.receiverClientId || '' }
      }
      return next
    })
    return 'applied'
  }

  // 📑 F9 = dupliquer la dernière expédition de la session (même expéditeur + même ville de destination)
  const submitSnapshotRef = useRef<any>(null)
  const lastParcelRef = useRef<any>(null)
  const [dupInfoAt, setDupInfoAt] = useState(0)
  useEffect(() => {
    if (!dupInfoAt) return
    const t = setTimeout(() => setDupInfoAt(0), 4000)
    return () => clearTimeout(t)
  }, [dupInfoAt])
  useEffect(() => {
    if (!createdParcel) return
    const snap = submitSnapshotRef.current || {}
    const isCompte = snap.shipmentMode === 'client' && !!(snap.clientId || snap.portType === 'port_en_compte_expediteur')
    lastParcelRef.current = {
      senderName: createdParcel.sender?.name ?? snap.senderName ?? '',
      senderTel: createdParcel.sender?.tel ?? snap.senderTel ?? '',
      senderAddress: createdParcel.sender?.address ?? snap.senderAddress ?? '',
      senderCity: createdParcel.sender?.city || snap.senderCity || '',
      receiverCity: createdParcel.receiver?.city || snap.receiverCity || '',
      ...(isCompte ? { shipmentMode: 'client', clientId: snap.clientId || '', clientName: snap.clientName || snap.senderName || '' } : {}),
    }
  }, [createdParcel])
  const duplicateLastParcel = () => {
    const last = lastParcelRef.current
    if (!last) { setDupInfoAt(Date.now()); return }
    setDupInfoAt(0)
    setCreatedParcel(null)
    setRetryAfterRefusal(false)
    setNbColisError('')
    nbColisRef.current?.setCustomValidity('')
    setForm({ ...getEmptyForm(), senderCity: last.senderCity || profile?.city || '', ...last })
    ;[100, 300].forEach(ms => setTimeout(() => { nexpInputRef.current?.focus(); nexpInputRef.current?.select?.() }, ms))
  }
  const duplicateLastParcelRef = useRef(duplicateLastParcel)
  duplicateLastParcelRef.current = duplicateLastParcel
  const blockF9Ref = useRef(false)
  blockF9Ref.current = showConfirmModal || showSenderPopup || showReceiverPopup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F9') return
      e.preventDefault()
      if (blockF9Ref.current) return // popup / modal ouvert
      const active = document.activeElement as HTMLElement | null
      // Focus dans une autre fenêtre modale (overlay fixe hors formulaire) → ignorer
      if (active && active !== document.body && !active.closest('form') && active.closest('.fixed')) return
      duplicateLastParcelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 🏙️ Ville de destination au clavier par initiales (A, AA, C, M, G, R)
  const cityInitialsRef = useRef({ buffer: '', at: 0 })
  const changeReceiverCity = (city: string) => setForm((p: any) => ({
    ...p,
    receiverCity: city,
    receiverClientId: '',
    receiverName: '',
    receiverTel: '',
    receiverAddress: '',
    deliverySectorId: '',
    deliveryDriverId: '',
  }))
  const handleReceiverCityKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const st = cityInitialsRef.current
      const now = Date.now()
      const prev = now - st.at <= CITY_INITIALS_DELAY_MS ? st.buffer : ''
      const r = matchCityInitials(CITY_INITIALS, prev, e.key)
      cityInitialsRef.current = { buffer: r.buffer, at: now }
      if (r.city) {
        e.preventDefault() // remplace la recherche native du navigateur
        if (r.city !== form.receiverCity) changeReceiverCity(r.city)
        return
      }
      if (r.buffer) { e.preventDefault(); return } // préfixe d'un code en attente
      return // lettre sans code : comportement natif
    }
    handleKeyNav(e)
  }

  // Navigation clavier pour le formulaire
  const handleKeyNav = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    const form = target.closest('form')
    if (!form) return

    // Récupérer TOUS les éléments focusables (inputs, selects, textareas ET boutons - y compris submit)
    const focusables = Array.from(
      form.querySelectorAll('input:not([type="hidden"]), select, textarea, button')
    ).filter((el: any) => !el.disabled && el.offsetParent !== null) // Visible et activé

    const currentIndex = focusables.indexOf(target)

    // Espace = cliquer sur le bouton (si c'est un bouton)
    if (e.key === ' ' && target.tagName === 'BUTTON') {
      e.preventDefault()
      target.click()
      return
    }

    // Entrée = élément suivant (sauf si on est sur le dernier élément ou un bouton submit)
    if (e.key === 'Enter' && !e.ctrlKey) {
      // Si c'est un bouton submit, laisser le comportement par défaut (soumettre le formulaire)
      if (target.tagName === 'BUTTON' && (target as HTMLButtonElement).type === 'submit') {
        return // Laisser le formulaire se soumettre normalement
      }

      // ↩️ Après un refus de création (champ oublié) : une fois le champ corrigé, Entrée ramène
      // directement au bouton « ✨ Créer l'Expédition 📦 » au lieu de reparcourir tout le formulaire.
      if ((error || retryAfterRefusal) && target.tagName !== 'BUTTON' && target.tagName !== 'TEXTAREA') {
        const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null
        if (submitBtn && !submitBtn.disabled) {
          e.preventDefault()
          submitBtn.focus()
          return
        }
      }

      // Logique spéciale : si on est sur le bouton Colis, aller directement à Port Dû
      if (target === colisButtonRef.current && portDuButtonRef.current) {
        e.preventDefault()
        portDuButtonRef.current.focus()
        return
      }

      e.preventDefault()
      if (currentIndex >= 0 && currentIndex < focusables.length - 1) {
        const next = focusables[currentIndex + 1] as HTMLElement
        next.focus()
      }
    }

    // Ctrl+Entrée = élément précédent
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      if (currentIndex > 0) {
        const prev = focusables[currentIndex - 1] as HTMLElement
        prev.focus()
      }
    }

    // Flèche Bas ou Flèche Droite = élément suivant
    if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && currentIndex >= 0 && currentIndex < focusables.length - 1) {
      e.preventDefault()
      const next = focusables[currentIndex + 1] as HTMLElement
      next.focus()
    }

    // Flèche Haut ou Flèche Gauche = élément précédent
    if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && currentIndex > 0) {
      e.preventDefault()
      const prev = focusables[currentIndex - 1] as HTMLElement
      prev.focus()
    }
  }

  // (Ancien focus automatique sur le bouton « Colis » à l'ouverture SUPPRIMÉ : il faisait défiler
  //  la page vers le bas et cachait le champ N° EXP. Le curseur va désormais dans le N° EXP.)

  // 🇲🇦 Vérifier si le N° EXP existe déjà dans TOUTE LA PLATEFORME (toutes les agences du Maroc)
  const checkDuplicateNic = async (nic: string) => {
    if (!nic || nic.trim() === '') return

    try {
      // 🌍 Chercher dans TOUTES les agences du Maroc (pas seulement l'agence locale)
      const q = query(
        collection(db, 'parcels'),
        where('sender.nic', '==', nic.trim()),
        limit(1)
      )
      const snapshot = await getDocs(q)

      if (!snapshot.empty) {
        const existingParcel = snapshot.docs[0].data()
        const existingCity = existingParcel.originCity || 'Ville inconnue'

        alert(`⚠️ ATTENTION - N° EXP DÉJÀ EXISTANT!\n\n🇲🇦 Le N° EXP "${nic}" existe DÉJÀ dans la plateforme.\n\n📍 Agence: ${existingCity}\n📦 Expédition: ${existingParcel.trackingId}\n👤 Expéditeur: ${existingParcel.sender?.name || '—'}\n\n❌ NE PAS DOUBLER L'EXPÉDITION!\n\nLe N° EXP sera effacé.`)

        // Effacer le N° EXP dupliqué
        setForm((prev: any) => ({ ...prev, senderNic: '' }))

        // Remettre le focus sur le champ pour resaisir
        setTimeout(() => {
          const nicField = document.getElementById('senderNic')
          if (nicField) nicField.focus()
        }, 100)

        return true
      }
      return false
    } catch (error) {
      console.error('Erreur vérification NIC:', error)
      return false
    }
  }

  // Raccourcis clavier pour les popups de clients
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 : Afficher le popup approprié selon la position du curseur
      if (e.key === 'F1') {
        e.preventDefault()

        // Déterminer si le focus est dans la section expéditeur ou destinataire
        const activeElement = document.activeElement as HTMLElement
        const senderSection = activeElement?.closest('[data-section="expediteur"]')
        const receiverSection = activeElement?.closest('[data-section="destinataire"]')

        if (senderSection) {
          // Curseur dans la section expéditeur
          setShowSenderPopup(true)
          setSenderSearch('')
        } else if (receiverSection) {
          // Curseur dans la section destinataire
          setShowReceiverPopup(true)
          setReceiverSearch('')
        } else {
          // Cas par défaut : afficher les deux
          setShowSenderPopup(true)
          setShowReceiverPopup(true)
          setSenderSearch('')
          setReceiverSearch('')
        }
      }
      // Esc : Fermer les popups
      if (e.key === 'Escape') {
        setShowSenderPopup(false)
        setShowReceiverPopup(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Autocomplétion par code client pour expéditeur
  const handleSenderNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const upperValue = value.toUpperCase().trim()

    // Chercher si un client correspond au code
    const matchingClient = clients.find((c: Client) =>
      c.code && c.code.toUpperCase() === upperValue
    )

    // Une seule mise à jour du formulaire
    if (matchingClient) {
      setForm((prev: any) => ({
        ...prev,
        senderName: matchingClient.name,
        senderTel: matchingClient.tel || '',
        senderAddress: matchingClient.address || '',
        // Ne pas toucher au N EXP qui est déjà saisi
      }))
      // Marquer que l'autocomplétion a eu lieu
      setAutoCompleted(true)
    } else {
      setForm((prev: any) => ({ ...prev, senderName: value }))
      setAutoCompleted(false)
    }
  }

  // Gestionnaire de touche pour le champ expéditeur
  const handleSenderNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && autoCompleted) {
      e.preventDefault()
      // Expéditeur saisi par son CODE client + Entrée → directement à la ville de destination
      // (téléphone / adresse déjà remplis par la fiche client). Saisie manuelle : inchangé.
      receiverCityRef.current?.focus()
      setAutoCompleted(false)
    } else {
      // Comportement normal de navigation
      handleKeyNav(e)
    }
  }

  // Autocomplétion par code client pour destinataire
  const handleReceiverNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const upperValue = value.toUpperCase().trim()

    // DEBUG: Vérifier les clients disponibles
    console.log('🔍 DEBUG - Recherche code:', upperValue)
    console.log('📊 Total clients disponibles:', clients.length)
    console.log('📝 Codes clients:', clients.filter(c => c.code).map(c => `${c.code} (${c.city})`))

    // Chercher si un client correspond au code
    const matchingClient = clients.find((c: Client) =>
      c.code && c.code.toUpperCase() === upperValue
    )

    console.log('✅ Client trouvé:', matchingClient ? `${matchingClient.name} (${matchingClient.city})` : 'AUCUN')

    // Une seule mise à jour du formulaire
    if (matchingClient) {
      setForm((prev: any) => ({
        ...prev,
        receiverName: matchingClient.name,
        receiverTel: matchingClient.tel || '',
        receiverAddress: matchingClient.address || '',
        receiverCity: matchingClient.city || '',
      }))
      // Marquer que l'autocomplétion a eu lieu
      setReceiverAutoCompleted(true)
    } else {
      setForm((prev: any) => ({ ...prev, receiverName: value }))
      setReceiverAutoCompleted(false)
    }
  }

  // Gestionnaire de touche pour le champ destinataire
  const handleReceiverNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('🔍 Enter pressé - receiverAutoCompleted:', receiverAutoCompleted)
    if (e.key === 'Enter' && receiverAutoCompleted) {
      e.preventDefault()
      // Destinataire saisi par son CODE client + Entrée → directement au nombre de colis
      // (ville, téléphone, adresse remplis par la fiche client). Saisie manuelle : inchangé.
      nbColisRef.current?.focus()
      nbColisRef.current?.select?.()
      setReceiverAutoCompleted(false)
    } else if (e.key === 'Enter') {
      console.log('❌ receiverAutoCompleted est false - navigation normale')
      // Comportement normal de navigation
      handleKeyNav(e)
    } else {
      // Comportement normal de navigation
      handleKeyNav(e)
    }
  }

  // Filtrer les clients pour les popups
  const filteredSenderClients = clients.filter((c: Client) => {
    const searchLower = senderSearch.toLowerCase()
    return (
      c.isExpediteur &&
      (normIncludes(c.name, searchLower) ||
       (c.code && normIncludes(c.code, searchLower)))
    )
  })

  const filteredReceiverClients = clients.filter((c: Client) => {
    const searchLower = receiverSearch.toLowerCase()
    return (
      c.isDestinataire &&
      (normIncludes(c.name, searchLower) ||
       (c.code && normIncludes(c.code, searchLower)))
    )
  })

  // Sélectionner un client expéditeur depuis la popup
  const selectSenderClient = (client: Client) => {
    setForm((prev: any) => ({
      ...prev,
      senderName: client.name,
      senderTel: client.tel || '',
      senderAddress: client.address || '',
    }))
    setShowSenderPopup(false)
    // Expéditeur choisi dans la liste (F1) → directement à la ville de destination
    setTimeout(() => {
      receiverCityRef.current?.focus()
    }, 100)
  }

  // Sélectionner un client destinataire depuis la popup
  const selectReceiverClient = (client: Client) => {
    setForm((prev: any) => ({
      ...prev,
      receiverName: client.name,
      receiverTel: client.tel || '',
      receiverAddress: client.address || '',
      receiverCity: client.city || '',
    }))
    setShowReceiverPopup(false)
    // Destinataire choisi dans la liste (F2) → directement à la saisie du nombre de colis
    setTimeout(() => {
      nbColisRef.current?.focus()
      nbColisRef.current?.select?.()
    }, 100)
  }

  // Gestionnaire Entrée pour sélection rapide dans popup expéditeurs
  const handleSenderSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredSenderClients.length === 1) {
      e.preventDefault()
      selectSenderClient(filteredSenderClients[0])
    }
  }

  // Gestionnaire Entrée pour sélection rapide dans popup destinataires
  const handleReceiverSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredReceiverClients.length === 1) {
      e.preventDefault()
      selectReceiverClient(filteredReceiverClients[0])
    }
  }

  // Pas de filtre - tous les clients sont disponibles

  // Intercepter la création du colis pour afficher la modal de confirmation
  useEffect(() => {
    if (createdParcel && !showConfirmModal && !pendingParcel && !isConfirmed) {
      // Un nouveau colis vient d'être créé
      setPendingParcel(createdParcel)
      setEditableParcel({ ...createdParcel })
      setShowConfirmModal(true)
      setIsConfirmed(false)
      // Réinitialiser createdParcel pour éviter de réafficher le bon directement
      setCreatedParcel(null)
    }
  }, [createdParcel, showConfirmModal, pendingParcel, isConfirmed, setCreatedParcel])

  // Focus automatique sur le conteneur du ticket pour activer Ctrl+Enter
  useEffect(() => {
    if (createdParcel && ticketContainerRef.current) {
      setTimeout(() => {
        ticketContainerRef.current?.focus()
      }, 100)
    }
  }, [createdParcel])

  // Focus automatique sur le bouton de validation de la modal
  useEffect(() => {
    if (showConfirmModal && validateButtonRef.current) {
      setTimeout(() => {
        validateButtonRef.current?.focus()
      }, 100)
    }
  }, [showConfirmModal])

  // Écouter les changements de date de travail
  useEffect(() => {
    const handleDateChange = () => {
      setForm((prev: any) => ({
        ...prev,
        operationDate: todayStr()
      }))
    }

    window.addEventListener('working-date-changed', handleDateChange)
    return () => window.removeEventListener('working-date-changed', handleDateChange)
  }, [])

  const handleVoiceResult = (field: string, value: string) => {
    setForm((prev: any) => ({
      ...prev,
      [field]: value
    }))
  }

  const handleClientFound = (client: Client, isSender: boolean) => {

    if (isSender) {
      // Remplir les champs expéditeur
      setForm((prev: any) => ({
        ...prev,
        senderName: client.name,
        senderTel: client.tel,
        senderAddress: client.address || '',
        senderCity: client.city || profile?.city || '',
        // senderNic: NE PAS auto-remplir - chaque expédition a son propre N° EXP
      }))
    } else {
      // Remplir les champs destinataire
      setForm((prev: any) => ({
        ...prev,
        receiverName: client.name,
        receiverTel: client.tel,
        receiverAddress: client.address || '',
        receiverCity: client.city || '',
        receiverClientId: client.id || '',
        deliverySectorId: client.secteurId || '',
        deliveryDriverId: client.livreurIds?.[0] || '',
      }))
    }
  }

  // 🤖 Remplissage en masse via IA
  const handleBulkFill = (data: Record<string, any>) => {

    setForm((prev: any) => {
      const updated = { ...prev }

      // Mapper les données extraites par l'IA vers le formulaire
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          // Conversion des types si nécessaire
          if (key === 'weight' || key === 'nbColis' || key === 'portPrice' || key === 'codAmount') {
            updated[key] = String(value)
          } else {
            updated[key] = value
          }
        }
      })

      return updated
    })
  }

  const handlePrint = () => {
    const previousTitle = document.title
    const style = document.createElement('style')
    style.textContent = `
      @page { size: A4 portrait; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        #ticket-print { width: 100% !important; display: flex !important; flex-direction: column !important; align-items: center !important; gap: 8mm !important; }
        .ticket-copy { width: 148mm !important; max-width: 148mm !important; margin: 0 auto !important; }
        .ticket-cut-line { width: 148mm !important; max-width: 148mm !important; }
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

  // Valider et passer à l'impression
  const handleConfirmPrint = async () => {
    if (editableParcel && !confirmSaving) {
      // 💾 Enregistrer dans Firestore les corrections faites dans ce modal
      // (auparavant elles n'étaient appliquées qu'au bon imprimé, jamais en base)
      const original = pendingParcel || editableParcel
      const numOr = (v: any, d = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d }
      const { _docPart, ...ep0 } = editableParcel as any
      void _docPart
      const ep: any = {
        ...ep0,
        codAmount: numOr(ep0.codAmount),
        ...(ep0.codMixed === true ? { codCashAmount: numOr(ep0.codCashAmount) } : {}),
        nbColis: Math.max(1, parseInt(String(ep0.nbColis ?? '1'), 10) || 1),
      }
      const patch = buildParcelCorrectionPatch(original, {
        sender:        ep.sender,
        receiver:      ep.receiver,
        weight:        ep.weight,
        nbColis:       ep.nbColis,
        natureOfGoods: ep.natureOfGoods,
        price:         ep.price,
        codAmount:     ep.codAmount,
        ...(ep.codMixed === true ? { codMixed: true, codCashAmount: ep.codCashAmount } : {}),
      }, { uid: auth.currentUser?.uid || null, name: profile?.name || 'Agent' })
      if (Object.keys(patch).length > 0 && original?.id) {
        setConfirmSaving(true)
        setConfirmError('')
        try {
          await updateParcel(original.id, patch)
          showToast('Corrections enregistrées.', 'success', 3000)
        } catch (err: any) {
          console.error('handleConfirmPrint updateParcel:', err)
          const msg = describeParcelSaveError(err, original)
          setConfirmError(msg)
          showToast(msg, 'error')
          setConfirmSaving(false)
          return
        }
        setConfirmSaving(false)
      }
      setConfirmError('')
      // Marquer comme confirmé pour éviter que le modal se rouvre
      setIsConfirmed(true)
      // Afficher le bon avec les données éditées
      setCreatedParcel({ ...(pendingParcel || {}), ...ep, ...(Object.keys(patch).length ? patch : {}) })
      setShowConfirmModal(false)
      setPendingParcel(null)
      setEditableParcel(null)
    }
  }

  // Annuler et revenir au formulaire
  const handleCancelConfirm = () => {
    setShowConfirmModal(false)
    setPendingParcel(null)
    setEditableParcel(null)
    setIsConfirmed(false)
    setConfirmError('')
  }

  // Modal de confirmation/édition avant impression
  // Prix figé si déjà encaissé (port payé → caisse) ou imputé à un client en compte
  const priceLockedInConfirm = !!editableParcel && (editableParcel.portType === 'port_paye' || !!editableParcel.clientId)
  if (showConfirmModal && editableParcel) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* En-tête */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 sticky top-0 z-10">
            <h2 className="text-2xl font-bold">✅ Colis créé avec succès !</h2>
            <p className="text-blue-100 text-sm mt-1">
              Vérifiez et modifiez les informations avant d'imprimer le bon de ramassage
            </p>
            <p className="text-white font-mono text-lg mt-2 font-bold">{editableParcel.trackingId}</p>
          </div>

          {/* Contenu éditable */}
          <div className="p-6 space-y-6">
            {/* Message d'info */}
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-bold text-yellow-900 mb-1">Dernière vérification avant impression</p>
                  <p className="text-sm text-yellow-800">
                    Modifiez les champs ci-dessous si nécessaire, puis cliquez sur "Valider et Imprimer"
                  </p>
                </div>
              </div>
            </div>

            {/* Expéditeur */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center gap-2">
                <span>📤</span> Expéditeur
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={editableParcel.sender.name || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, name: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">N° Expéditeur (NIC)</label>
                  <input
                    type="text"
                    value={editableParcel.sender.nic || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, nic: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={editableParcel.sender.tel || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, tel: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={editableParcel.sender.city || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, city: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Adresse</label>
                  <input
                    type="text"
                    value={editableParcel.sender.address || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      sender: { ...editableParcel.sender, address: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Destinataire */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-green-900 mb-3 flex items-center gap-2">
                <span>📥</span> Destinataire
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.name || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, name: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.tel || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, tel: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.city || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, city: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Adresse</label>
                  <input
                    type="text"
                    value={editableParcel.receiver.address || ''}
                    onChange={(e) => setEditableParcel({
                      ...editableParcel,
                      receiver: { ...editableParcel.receiver, address: e.target.value }
                    })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Détails du colis */}
            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
              <h3 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
                <span>📦</span> Détails du colis
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Poids (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editableParcel.weight || ''}
                    onChange={(e) => setEditableParcel({ ...editableParcel, weight: normalizeDecimal(e.target.value) })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre de colis</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editableParcel.nbColis ?? ''}
                    onChange={(e) => {
                      // ⚠️ Avant : value={nbColis || 1} → en effaçant le chiffre, le champ réaffichait « 1 »
                      // et on ne pouvait jamais le remplacer. Le champ peut maintenant être vidé puis ressaisi.
                      const value = e.target.value.replace(/[^0-9]/g, '')
                      setEditableParcel({ ...editableParcel, nbColis: value })
                    }}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => {
                      const n = parseInt(String(editableParcel.nbColis ?? ''), 10)
                      if (!n || n < 1) setEditableParcel({ ...editableParcel, nbColis: '1' })
                    }}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Nature de marchandise</label>
                  <input
                    type="text"
                    value={editableParcel.natureOfGoods || ''}
                    onChange={(e) => setEditableParcel({ ...editableParcel, natureOfGoods: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Prix (DH)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={priceLockedInConfirm}
                    title={priceLockedInConfirm ? "Port payé / client en compte : le montant est déjà passé en caisse ou au compte client. Corrigez-le via le chef d'agence." : undefined}
                    value={editableParcel.price || ''}
                    onChange={(e) => {
                      const normalized = normalizeDecimal(e.target.value)
                      setEditableParcel({ ...editableParcel, price: parseFloat(normalized) || 0 })
                    }}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                {editableParcel.codMixed === true ? (
                  <div className="col-span-full grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">💵 Montant espèces (DH)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editableParcel.codCashAmount ?? ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          // Saisie libre (ex. « 12,5 ») : on garde le texte, le total est recalculé
                          const raw = normalizeDecimal(e.target.value).replace(/[^0-9.]/g, '')
                          const docPart = editableParcel._docPart !== undefined
                            ? (parseFloat(editableParcel._docPart) || 0) : codDocPartOf(editableParcel)
                          setEditableParcel({ ...editableParcel, codCashAmount: raw, _docPart: String(docPart), codAmount: (parseFloat(raw) || 0) + docPart })
                        }}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">{editableParcel.serviceType === 'traite' ? '📝 Montant traite (DH)' : '📋 Montant chèque (DH)'}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editableParcel._docPart ?? String(Math.max(0, (parseFloat(editableParcel.codAmount) || 0) - (parseFloat(editableParcel.codCashAmount) || 0)))}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const raw = normalizeDecimal(e.target.value).replace(/[^0-9.]/g, '')
                          const cash = parseFloat(editableParcel.codCashAmount) || 0
                          setEditableParcel({ ...editableParcel, _docPart: raw, codAmount: cash + (parseFloat(raw) || 0) })
                        }}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2 text-xs font-bold text-gray-700">Total retour fond : {(parseFloat(editableParcel.codAmount) || 0).toLocaleString('fr-MA')} DH</div>
                  </div>
                ) : (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Retour fond (DH)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editableParcel.codAmount ?? ''}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      // Saisie libre (ex. « 1250,50 ») : converti en nombre à l'enregistrement
                      const raw = normalizeDecimal(e.target.value).replace(/[^0-9.]/g, '')
                      setEditableParcel({ ...editableParcel, codAmount: raw })
                    }}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                  />
                </div>
                )}
              </div>
            </div>
          </div>

          {/* Boutons d'action */}
          {confirmError && (
            <div className="mx-6 mb-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-sm font-medium">⚠️ {confirmError}</div>
          )}
          <div className="bg-gray-50 px-6 py-4 flex gap-3 sticky bottom-0">
            <button
              onClick={handleCancelConfirm}
              className="flex-1 py-3 px-6 border-2 border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-100 transition flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" /> Annuler
            </button>
            <button
              ref={validateButtonRef}
              onClick={handleConfirmPrint}
              disabled={confirmSaving}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-xl transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Printer className="w-5 h-5" /> {confirmSaving ? 'Enregistrement…' : 'Valider et Imprimer (Entrée)'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (createdParcel) {
    return (
      <div
        ref={ticketContainerRef}
        className="space-y-4 mt-4"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleNewParcel()
          }
        }}
      >
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
          <p className="text-2xl mb-1">✅</p>
          <p className="text-green-700 font-bold text-lg">Colis enregistré avec succès !</p>
          <p className="text-green-600 font-mono text-sm mt-1">{createdParcel.trackingId}</p>
        </div>

        <div id="ticket-print" ref={ticketRef} className="flex flex-col items-center gap-4">
        {['1', '2'].map((copyKey, copyIdx) => (
        <div key={copyKey} className="contents">
        {copyIdx === 1 && (
          <div className="ticket-cut-line w-full text-center text-gray-400 text-[9px] border-t border-dashed border-gray-300 pt-1" style={{ maxWidth: '148mm' }}>
            ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂
          </div>
        )}
        <div className="ticket-copy bg-white border border-gray-300 text-[11px]" style={{ maxWidth: '148mm', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
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
            {ALL_SERVICE_TYPES.filter(t => t.key !== 'retour_bl').map(st => {
              const types = createdParcel.serviceType?.split(',').filter(Boolean) || []
              const isSelected = types.includes(st.key) || (st.key === 'especes' && isMixedCod(createdParcel))
              return (
                <label key={st.key} className="flex items-center gap-1 text-[10px] font-semibold">
                  <span className={`w-3 h-3 border border-gray-400 rounded-sm flex items-center justify-center text-[8px] ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : ''}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                  {st.label}
                </label>
              )
            })}
            <label className="flex items-center gap-1 text-[10px] font-semibold">
              <span className={`w-3 h-3 border border-gray-400 rounded-sm flex items-center justify-center text-[8px] ${createdParcel.hasRetourBL ? 'bg-blue-600 border-blue-600 text-white' : ''}`}>
                {createdParcel.hasRetourBL ? '✓' : ''}
              </span>
              Retour BL
            </label>
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
              <div className={`font-bold text-[9px] uppercase mt-0.5 ${portTypeInfo(createdParcel.portType).className}`}>
                {portTypeInfo(createdParcel.portType).label}
              </div>
            </div>
            <div className="px-2 py-1.5">
              <div className="text-gray-400 text-[9px] uppercase">RETOUR FOND</div>
              <div className={`font-bold text-sm ${createdParcel.codAmount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                {createdParcel.codAmount > 0 ? `${createdParcel.codAmount} DH` : '—'}
              </div>
              {isMixedCod(createdParcel) && (
                <div className="text-[9px] font-semibold text-orange-700">{codPartsDetailLabel(createdParcel)}</div>
              )}
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
        </div>
        ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={handlePrint} className="flex items-center justify-center gap-2 bg-gray-800 text-white py-4 rounded-xl font-semibold hover:bg-gray-900 transition">
            <Printer className="w-4 h-4" /> Imprimer
          </button>
          <a href={whatsappLink} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-green-500 text-white py-4 rounded-xl font-semibold hover:bg-green-600 transition">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
        </div>
        <button onClick={handleNewParcel}
          className="w-full flex items-center justify-center gap-2 border-2 border-blue-500 text-blue-600 py-4 rounded-xl font-semibold hover:bg-blue-50 transition"
        >
          <Plus className="w-4 h-4" /> Nouveau colis (Ctrl+Entrée)
        </button>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50 rounded-3xl shadow-2xl overflow-hidden mt-4 border border-purple-200">
      <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-300 rounded-full blur-2xl transform -translate-x-1/2 translate-y-1/2"></div>
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 backdrop-blur-sm p-2 rounded-xl">
              <span className="text-3xl">✨</span>
            </div>
            <div>
              <h2 className="text-white font-bold text-2xl">Nouvelle Expédition</h2>
              <p className="text-pink-100 text-sm">Créez votre colis avec élégance</p>
            </div>
          </div>
        </div>
      </div>
      <form onSubmit={(e) => { submitSnapshotRef.current = { ...form }; return handleSubmit(e) }} onInvalidCapture={() => setRetryAfterRefusal(true)} autoComplete="off" className="p-4 space-y-2">
        {/* Date + Micro IA - Version compacte */}
        <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
          <span className="text-lg">📅</span>
          <input
            type="date"
            value={form.operationDate}
            max={todayStr()}
            onChange={f('operationDate')}
            className="flex-1 bg-transparent text-xs font-bold text-purple-700 outline-none"
          />
          {form.operationDate !== todayStr() && (
            <button type="button" onClick={() => setForm((p: any) => ({ ...p, operationDate: todayStr() }))}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium">Aujourd'hui</button>
          )}
          {/* 🧹 Vider tout le formulaire (nouvelle saisie) */}
          <button type="button" tabIndex={-1}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              // Formulaire déjà vide (seulement les valeurs par défaut) → pas de confirmation, simple message
              if (isParcelFormEmpty(form)) { setClearInfoAt(Date.now()); return }
              setClearInfoAt(0)
              if (window.confirm('Vider tous les champs du formulaire ?')) handleNewParcel()
            }}
            className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            title="Vider tous les champs du formulaire · F9 = dupliquer la dernière expédition (même expéditeur + ville)">
            🧹 Vider
          </button>
          {clearInfoAt > 0 && (
            <span role="status" aria-live="polite"
              className="shrink-0 rounded-md bg-green-600 px-2 py-0.5 text-xs font-semibold text-white shadow">
              Rien à vider : le formulaire est déjà vide
            </span>
          )}
          {dupInfoAt > 0 && (
            <span role="status" aria-live="polite"
              className="shrink-0 rounded-md bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white shadow">
              F9 : Aucune expédition précédente
            </span>
          )}
          {/* VoiceInputAI désactivé temporairement pour optimiser les performances */}
          {/* <VoiceInputAI onResult={handleVoiceResult} onBulkFill={handleBulkFill} onClientFound={handleClientFound} /> */}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 p-2 rounded-lg text-xs">⚠️ {error}</div>}

        {/* GRID 2 COLONNES : Expéditeur + Destinataire */}
        <div className="grid grid-cols-2 gap-3">
          {/* COLONNE 1 : EXPÉDITEUR */}
          <section className="bg-pink-50 border border-pink-200 rounded-lg p-3" data-section="expediteur">
            <h3 className="text-xs font-bold text-pink-700 mb-2 flex items-center gap-1.5">
              <span className="text-base">📤</span> Expéditeur
            </h3>
            <div className="space-y-2">
              {/* ⬆️ Date de saisie ≠ date du système : simple flèche vers la date (08:00 → minuit seulement) */}
              {form.operationDate && form.operationDate !== systemTodayStr() && new Date().getHours() >= 8 && (
                <div className="flex justify-center -mt-1" title="La date de saisie est différente de la date du système">
                  <span className="text-2xl leading-none animate-bounce select-none" aria-label="Vérifier la date de saisie">⬆️</span>
                </div>
              )}
              <input
                ref={nexpInputRef}
                id="senderNic"
                required
                placeholder="🔢 N° EXP (numéro de bon) *"
                value={form.senderNic}
                onChange={f('senderNic')}
                onBlur={(e) => {
                  // 🚀 VÉRIFICATION EN ARRIÈRE-PLAN (ne bloque pas la saisie)
                  const nic = e.target.value
                  if (nic && nic.trim()) {
                    // Lancer la vérification sans attendre (pas de await)
                    checkDuplicateNic(nic).catch(() => {})
                  }
                }}
                onKeyDown={handleKeyNav}
                className={`${inputCls} !border-2 !border-pink-400 font-bold text-base tracking-wide placeholder:font-semibold placeholder:text-pink-400 focus:!border-pink-600 focus:ring-4 focus:ring-pink-200`}
              />
              <input
                id="senderName"
                placeholder="Nom complet (ou code client)…"
                value={form.senderName}
                onChange={handleSenderNameChange}
                onKeyDown={handleSenderNameKeyDown}
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="senderTel"
                  placeholder="Téléphone"
                  value={form.senderTel}
                  onChange={f('senderTel')}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
                {profile?.role === 'agentpro' ? (
                  <select
                    id="senderCity"
                    value={form.senderCity}
                    onChange={e => setForm((p: any) => ({ ...p, senderCity: e.target.value }))}
                    onKeyDown={handleKeyNav}
                    className={selectCls}
                  >
                    <option value="">Ville d'expédition</option>
                    {CITIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-gray-200 bg-gray-100 text-xs font-semibold text-gray-700">
                    <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="truncate">{form.senderCity || '—'}</span>
                  </div>
                )}
              </div>
              <input
                id="senderAddress"
                placeholder="Adresse"
                value={form.senderAddress}
                onChange={f('senderAddress')}
                onKeyDown={handleKeyNav}
                className={inputCls}
              />
            </div>
          </section>

          {/* COLONNE 2 : DESTINATAIRE */}
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-3" data-section="destinataire">
            <h3 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
              <span className="text-base">📥</span> Destinataire
            </h3>
            <div className="space-y-2">
              <div className="relative">
                <select
                  ref={receiverCityRef}
                  id="receiverCity"
                  required
                  value={form.receiverCity}
                  onChange={e => changeReceiverCity(e.target.value)}
                  onKeyDown={handleReceiverCityKeyDown}
                  title={CITY_INITIALS_TITLE}
                  className={selectCls}
                >
                  <option value="">Ville de destination</option>
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-gray-400 pointer-events-none" />
              </div>
              <input
                ref={receiverNameRef}
                id="receiverName"
                placeholder="Nom complet (ou code client)…"
                value={form.receiverName}
                onChange={handleReceiverNameChange}
                onKeyDown={handleReceiverNameKeyDown}
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  id="receiverTel"
                  placeholder="Téléphone"
                  value={form.receiverTel}
                  onChange={f('receiverTel')}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
                <input
                  id="receiverAddress"
                  placeholder="Adresse"
                  value={form.receiverAddress}
                  onChange={f('receiverAddress')}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
              </div>

              {/* En gare - Version compacte */}
              <label className="flex items-center gap-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={form.enGare ?? true}
                  onChange={e => setForm((p: any) => ({
                    ...p,
                    enGare: e.target.checked,
                    deliverySectorId: e.target.checked ? '' : p.deliverySectorId,
                    deliveryDriverId: e.target.checked ? '' : p.deliveryDriverId,
                  }))}
                  onKeyDown={handleKeyNav}
                  className="w-3.5 h-3.5 text-orange-600 border border-amber-300 rounded"
                />
                <span className="text-base">🚉</span>
                <span className="font-bold text-amber-900 flex-1">En gare</span>
                {(form.enGare ?? true) && <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-bold">✓</span>}
              </label>
            </div>
          </section>
        </div>

        {/* Client lié - CACHÉ pour gagner de l'espace */}
        <section className="hidden">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Client expéditeur <span className="text-red-500 font-bold">*</span> <span className="text-green-600 font-normal normal-case">(compte portail créé automatiquement)</span>
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

        {/* Détails du colis */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <span className="text-base">📦</span> Détails du colis
          </h3>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              id="weight"
              type="text"
              inputMode="decimal"
              placeholder="Poids (kg)"
              value={form.weight}
              onChange={(e) => {
                const normalized = normalizeDecimal(e.target.value)
                setForm({ ...form, weight: normalized })
              }}
              onKeyDown={handleKeyNav}
              className={inputCls}
            />
            <div>
            <input
              ref={nbColisRef}
              id="nbColis"
              required
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="Nb colis (raccourci : 2ds45e500…)"
              title={NB_COLIS_SHORTCUT_TITLE}
              aria-invalid={nbColisError ? true : undefined}
              value={form.nbColis}
              onChange={(e) => {
                // ⚠️ Ne PAS filtrer ici : le raccourci « 2ds45 » doit pouvoir être tapé tel quel.
                // La normalisation en chiffres se fait sur Entrée / à la sortie du champ.
                const value = e.target.value.slice(0, 40)
                if (nbColisError) { setNbColisError(''); e.currentTarget.setCustomValidity('') }
                setForm((p: any) => ({ ...p, nbColis: value }))
              }}
              onKeyDown={(e) => {
                // ⚡ Raccourci étendu (port, retour de fonds, nature, poids) — voir utils/nbColisShortcut
                if (e.key === 'Enter' && !e.ctrlKey) {
                  // Lire la valeur brute du DOM (pas l'état React, qui peut être en retard)
                  const r = applyNbColisShortcut(e.currentTarget.value, e.currentTarget)
                  if (r === 'error') { e.preventDefault(); return } // rester dans le champ pour corriger
                  if (r === 'applied') {
                    e.preventDefault()
                    // Curseur directement sur « ✨ Créer l'Expédition 📦 »
                    const formEl = e.currentTarget.closest('form')
                    setTimeout(() => (formEl?.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.focus(), 50)
                    return
                  }
                  // Saisie normale : seulement des chiffres
                  const raw = e.currentTarget.value
                  const digits = nbColisDigitsOnly(raw)
                  if (digits !== raw) setForm((p: any) => ({ ...p, nbColis: digits }))
                }
                handleKeyNav(e)
              }}
              onBlur={(e) => {
                // Sortie du champ (Tab, clic) : appliquer le raccourci s'il est valide, sinon chiffres seuls
                const raw = e.currentTarget.value
                if (applyNbColisShortcut(raw, e.currentTarget) !== 'none') return
                const digits = nbColisDigitsOnly(raw)
                if (digits !== raw) setForm((p: any) => ({ ...p, nbColis: digits }))
              }}
              className={`${inputCls} w-full ${nbColisError ? '!border-red-500' : ''}`}
            />
            {nbColisError ? (
              <p role="alert" className="text-[10px] font-semibold text-red-600 mt-0.5 leading-tight">⚠️ {nbColisError}</p>
            ) : (
              <p className="text-[10px] text-gray-500 mt-0.5 leading-tight" title={NB_COLIS_SHORTCUT_TITLE}>
                {NB_COLIS_SHORTCUT_HINT}
              </p>
            )}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'Colis',   emoji: '📮', label: 'Colis' },
              { key: 'Palette', emoji: '📦', label: 'Palette' },
              { key: 'Bagages', emoji: '🧳', label: 'Bagages' },
              { key: 'Autres',  emoji: '✏️', label: 'Autres' },
            ].map(({ key, emoji, label }) => (
              <button
                key={key}
                ref={key === 'Colis' ? colisButtonRef : undefined}
                type="button"
                onClick={() => setForm((p: any) => ({ ...p, natureOfGoods: key === p.natureOfGoods ? '' : key }))}
                onKeyDown={handleKeyNav}
                className={`flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-medium transition ${
                  form.natureOfGoods === key
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-400'
                }`}
              >
                <span className="text-lg">{emoji}</span>
                <span className="mt-0.5">{label}</span>
              </button>
            ))}
          </div>
          {form.natureOfGoods === 'Autres' && (
            <input
              placeholder="Précisez la nature…"
              value={form.natureOfGoodsCustom || ''}
              onChange={e => setForm((p: any) => ({ ...p, natureOfGoodsCustom: e.target.value }))}
              onKeyDown={handleKeyNav}
              className={`${inputCls} mt-2`}
            />
          )}
        </div>

        {/* Frais de port */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <h3 className="text-xs font-bold text-orange-700 mb-2 flex items-center gap-1.5">
            <span className="text-base">💰</span> Frais de port
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
            {[
              { key: 'port_du',   emoji: '💰', label: 'Port Dû', active: 'bg-orange-500 text-white' },
              { key: 'port_paye', emoji: '💵', label: 'Port Payé', active: 'bg-blue-600 text-white' },
              { key: 'port_du_cheque', emoji: '📋', label: 'Port Dû Chèque', active: 'bg-purple-700 text-white' },
              { key: 'port_en_compte_expediteur', emoji: '💼', label: 'Compte Exp', active: 'bg-purple-600 text-white' },
              { key: 'port_en_compte_destinataire', emoji: '📥', label: 'Compte Dest', active: 'bg-teal-600 text-white' },
            ].map(pt => (
              <button type="button" key={pt.key}
                ref={pt.key === 'port_du' ? portDuButtonRef : undefined}
                onClick={() => {
                  setForm((p: any) => {
                    const isCompteType = pt.key === 'port_en_compte_expediteur' || pt.key === 'port_en_compte_destinataire'
                    const updates: any = {
                      portType: pt.key,
                      shipmentMode: isCompteType ? 'client' : (pt.key === 'port_du' && (p.portType === 'port_en_compte' || p.portType === 'port_en_compte_expediteur' || p.portType === 'port_en_compte_destinataire') ? 'personal' : p.shipmentMode),
                      portPayeMethod: pt.key === 'port_paye' ? 'espece' : p.portPayeMethod,
                    }

                    // Si "En Compte Expéditeur" est sélectionné et qu'il y a un expéditeur
                    if (pt.key === 'port_en_compte_expediteur' && p.senderName && p.senderName.trim() !== '') {
                      // Automatiquement définir l'expéditeur comme client en compte
                      updates.clientName = p.senderName
                      updates.clientId = p.clientId || '' // Garder l'ID si déjà présent
                    }

                    // Si "En Compte Destinataire" est sélectionné et qu'il y a un destinataire
                    if (pt.key === 'port_en_compte_destinataire' && p.receiverName && p.receiverName.trim() !== '') {
                      // Automatiquement définir le destinataire comme client en compte
                      updates.clientName = p.receiverName
                      updates.clientId = p.receiverClientId || '' // Garder l'ID si déjà présent
                    }

                    return { ...p, ...updates }
                  })
                }}
                onKeyDown={handleKeyNav}
                className={`flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-bold transition ${form.portType === pt.key ? pt.active : 'bg-white border-gray-200 text-gray-600'}`}>
                <span className="text-lg">{pt.emoji}</span>
                <span className="mt-0.5">{pt.label}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              type="text"
              inputMode="decimal"
              placeholder="Montant (DH)"
              value={form.portPrice}
              onChange={e => {
                const normalized = normalizeDecimal(e.target.value)
                setForm((p: any) => ({ ...p, portPrice: normalized, portPayeMontant: p.portType === 'port_paye' ? normalized : p.portPayeMontant }))
              }}
              onKeyDown={handleKeyNav}
              className={inputCls}
            />
            {form.portType === 'port_paye' && (
              <select
                value={form.portPayeMethod || 'espece'}
                onChange={e => setForm((p: any) => ({ ...p, portPayeMethod: e.target.value }))}
                onKeyDown={handleKeyNav}
                className={selectCls}
              >
                <option value="espece">💵 Espèce</option>
                <option value="cheque">📋 Chèque</option>
              </select>
            )}
          </div>
          {form.clientId && form.portType === 'port_paye' && price > 0 && (
            <label className={`flex items-center gap-1.5 cursor-pointer px-2 py-1.5 border rounded-lg text-xs mt-2 ${form.autoDebit ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <input
                type="checkbox"
                checked={form.autoDebit}
                onChange={e => setForm((p: any) => ({ ...p, autoDebit: e.target.checked }))}
                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
              />
              <span className="text-gray-600 font-medium">Débiter {form.clientName} ({price} DH)</span>
            </label>
          )}
        </div>

        {/* Type de service */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <h3 className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
            <span className="text-base">🏷️</span> Type de service
            <span className="ml-auto text-[10px] font-semibold text-green-800 bg-white border border-green-200 rounded-full px-2 py-0.5">
              ☝️ Espèces + un chèque ou une traite possibles
            </span>
          </h3>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {SERVICE_TYPES.map(st => {
              // 💵+📋 RF MIXTE : Espèces peut s'ajouter à UN chèque OU UNE traite.
              // Chèque et Traite restent exclusifs ; Simple exclut tout retour de fonds.
              const isSelected = codSelection.includes(st.key)

              return (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  key={st.key}
                  onClick={() => setForm((p: any) => toggleCodService(p, st.key))}
                  onKeyDown={handleKeyNav}
                  className={`flex flex-col items-center justify-center py-2 rounded-lg border text-xs font-bold transition ${
                    isSelected
                      ? 'bg-green-600 border-green-500 text-white'
                      : 'bg-white border-gray-200 text-gray-600'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span className={`inline-block w-3 h-3 rounded-full border-2 ${isSelected ? 'border-white bg-white shadow-[inset_0_0_0_2px_#16a34a]' : 'border-gray-300 bg-white'}`} />
                    <span className="text-lg">{st.emoji}</span>
                  </span>
                  <span className="mt-0.5">{st.label}</span>
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 px-2 py-1.5 bg-white border border-gray-200 rounded-lg cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={form.hasRetourBL}
                onChange={e => setForm((p: any) => ({ ...p, hasRetourBL: e.target.checked }))}
                onKeyDown={handleKeyNav}
                className="w-3.5 h-3.5 text-green-600 border-gray-300 rounded"
              />
              <span className="font-medium text-gray-700">🧾 Retour BL</span>
            </label>
            {normalizeServiceType(form.serviceType) !== 'simple' && !form.codMixed && (
              <input
                id="codAmount"
                type="text"
                inputMode="decimal"
                placeholder="RETOUR FOND (DH)"
                value={form.codAmount}
                onChange={(e) => {
                  const normalized = normalizeDecimal(e.target.value)
                  setForm({ ...form, codAmount: normalized })
                }}
                onKeyDown={handleKeyNav}
                className={inputCls}
              />
            )}
          </div>
          {form.codMixed && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[11px] font-semibold text-green-800">
                💵 Montant espèces (DH)
                <input
                  id="codCashAmount"
                  type="text"
                  inputMode="decimal"
                  placeholder="Montant espèces (DH)"
                  value={form.codCashAmount || ''}
                  onChange={(e) => setForm({ ...form, codCashAmount: normalizeDecimal(e.target.value) })}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
              </label>
              <label className="text-[11px] font-semibold text-green-800">
                {form.serviceType === 'traite' ? '📝 Montant traite (DH)' : '📋 Montant chèque (DH)'}
                <input
                  id="codAmount"
                  type="text"
                  inputMode="decimal"
                  placeholder={form.serviceType === 'traite' ? 'Montant traite (DH)' : 'Montant chèque (DH)'}
                  value={form.codAmount}
                  onChange={(e) => setForm({ ...form, codAmount: normalizeDecimal(e.target.value) })}
                  onKeyDown={handleKeyNav}
                  className={inputCls}
                />
              </label>
              <div className="col-span-2 text-xs font-bold text-green-900 bg-white border border-green-200 rounded-lg px-2 py-1">
                Total retour de fonds : {((parseFloat(form.codCashAmount) || 0) + (parseFloat(form.codAmount) || 0)).toLocaleString('fr-MA')} DH
                <span className="font-normal text-gray-600"> (💵 {(parseFloat(form.codCashAmount) || 0).toLocaleString('fr-MA')} + {form.serviceType === 'traite' ? '📝' : '📋'} {(parseFloat(form.codAmount) || 0).toLocaleString('fr-MA')})</span>
              </div>
            </div>
          )}
        </div>

        <button type="submit" disabled={loading}
          onKeyDown={handleKeyNav}
          className="w-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:from-pink-600 hover:via-purple-600 hover:to-indigo-600 disabled:opacity-60 text-white py-5 rounded-2xl font-bold text-lg transition-all transform hover:scale-[1.02] hover:shadow-2xl flex items-center justify-center gap-3 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <span className="relative z-10 flex items-center gap-3">
            {loading
              ? <><div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" /> <span className="text-lg">Création en cours...</span></>
              : <><span className="text-2xl">✨</span> <span className="text-lg">Créer l'Expédition</span> <span className="text-2xl">📦</span></>
            }
          </span>
        </button>
      </form>

      {/* Popup clients expéditeurs (F1) */}
      {showSenderPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-end z-50" onClick={() => setShowSenderPopup(false)}>
          <div className="bg-white rounded-l-2xl shadow-2xl w-[500px] h-full p-6 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">📤 Clients Expéditeurs</h2>
              <button onClick={() => setShowSenderPopup(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Rechercher par nom ou code..."
              value={senderSearch}
              onChange={(e) => setSenderSearch(e.target.value)}
              onKeyDown={handleSenderSearchKeyDown}
              className="w-full p-3 border-2 border-gray-300 rounded-lg mb-4 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredSenderClients.map((client: Client) => (
                <button
                  key={client.id}
                  onClick={() => selectSenderClient(client)}
                  className="w-full text-left p-4 bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 rounded-lg transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-800">{client.name}</span>
                    {client.code && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">#{client.code}</span>}
                  </div>
                  <div className="text-sm text-gray-600">
                    📞 {client.tel} • 🏠 {client.address}
                  </div>
                </button>
              ))}
              {filteredSenderClients.length === 0 && (
                <div className="text-center text-gray-500 py-8">Aucun client trouvé</div>
              )}
            </div>
            <div className="mt-4 text-sm text-gray-500 text-center">
              Appuyez sur <kbd className="px-2 py-1 bg-gray-200 rounded">Esc</kbd> pour fermer
            </div>
          </div>
        </div>
      )}

      {/* Popup clients destinataires (F1) */}
      {showReceiverPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-start z-50" onClick={() => setShowReceiverPopup(false)}>
          <div className="bg-white rounded-r-2xl shadow-2xl w-[500px] h-full p-6 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">📥 Clients Destinataires</h2>
              <button onClick={() => setShowReceiverPopup(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <input
              type="text"
              placeholder="Rechercher par nom ou code..."
              value={receiverSearch}
              onChange={(e) => setReceiverSearch(e.target.value)}
              onKeyDown={handleReceiverSearchKeyDown}
              className="w-full p-3 border-2 border-gray-300 rounded-lg mb-4 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredReceiverClients.map((client: Client) => (
                <button
                  key={client.id}
                  onClick={() => selectReceiverClient(client)}
                  className="w-full text-left p-4 bg-green-50 hover:bg-green-100 border-2 border-green-200 rounded-lg transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-800">{client.name}</span>
                    {client.code && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">#{client.code}</span>}
                  </div>
                  <div className="text-sm text-gray-600">
                    📞 {client.tel} • 🏙️ {client.city}
                  </div>
                </button>
              ))}
              {filteredReceiverClients.length === 0 && (
                <div className="text-center text-gray-500 py-8">Aucun client trouvé</div>
              )}
            </div>
            <div className="mt-4 text-sm text-gray-500 text-center">
              Appuyez sur <kbd className="px-2 py-1 bg-gray-200 rounded">Esc</kbd> pour fermer
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
