// ── Barrel public API — tous les imports internes passent par ici ──────────────
// Les implémentations vivent dans leurs fichiers domaine respectifs.

export {
  CITIES, TARIFS, TARIF_WEIGHT_RULES, DEFAULT_TARIFF_CONFIG, normalizeTariffConfig, calculateTariff,
  STATUSES, COD_PAYMENT_TYPES, COD_STATUS, codCollectedLabel, STATUS_COLORS,
  MOD_TYPES, COD_TYPE_OPTIONS, DIRECTOR_PERMISSIONS, CAISSE_CATEGORIES,
  REGLEMENT_MODES, REGLEMENT_STATUSES,
} from './constants'

export {
  createClient, updateClient, deleteClient, subscribeClients,
  addPayment, deletePayment, subscribeClientParcels, subscribeClientPayments,
  createClientMessage, subscribeClientMessages, subscribeAllClientMessages,
  subscribeAgencyClientMessages, resolveClientMessage, deleteClientMessage,
  removeReplyFromMessage, markClientMessageReadByStaff, markClientMessageReadByClient,
  addClientMessageReply, addClientPortalReply,
  createModificationRequest, subscribeClientModificationRequests,
  subscribeAgencyModificationRequests, resolveModificationRequest, deleteModificationRequest,
  findPortalClient, ensurePortalClient,
} from './clients'

export {
  createAgentCodRequest, subscribeAllAgentCodRequests, subscribeAgentCodRequests,
  markAgentCodRequestRead, addAgentCodRequestReply, resolveAgentCodRequest,
} from './agentCodRequests'

export {
  FIRESTORE_PAGE_LIMITS,
  generateTrackingId, isParcelVisibleInDestinationAgency,
  createParcel, updateParcelStatus, getAllParcels, updateParcel,
  markParcelAsReturned, loadReturnedParcelOnTruck, validateParcelEntry, validateReturnArrival,
  deleteParcel, getArchivedParcels, archiveParcels, archiveParcelsByCriteria, archiveAllParcels,
  subscribeAllParcels, getParcelsPage, subscribeAgentParcels, getMoreAgentParcels,
  getAccurateAgencyStats, subscribeAgencyInbox, subscribeAgencyParcels,
  subscribePendingAideAgentParcels, claimParcel, searchParcelByTrackingId, createReturnParcel,
  searchParcelByTrackingGlobal, searchParcelByNicOptimized,
} from './parcels'

export {
  getDrivers, subscribeDrivers, subscribePendingCods, getDriverParcels,
  assignDriver, assignDriversBulk, getAgencyInbox,
  subscribeDriverParcels, subscribeDeliveryDriverParcels,
  assignDeliveryDriver, rejectDeliveryAssignment, getDeliveryDriverParcels,
  createSector, updateSector, deleteSector, subscribeSectors, subscribeAllSectors,
  createBonRamasageBatch, subscribeBonRamasageBatches, deleteBonRamasageBatch,
  createArrivage, subscribeArrivages, subscribeAllArrivedParcels,
  subscribeArrivedParcelsByCity, subscribeAllArrivages,
  createAutoArrivageForCity, saveArrivagePointage,
} from './delivery'

export {
  collectCod, collectCodAtDestination, collectCodAtSource,
  remitCod, settleCodToSender, markCodSentToSource, confirmCodReceivedBySource,
  markCodSentToChef, validateCodByChef,  // ⭐ Nouvelles fonctions
  batchSettleCods, fetchAllAgentCodParcels,
  collectPortDu, markPortDuReceivedByAgent, subscribeCodParcels,
} from './cod'

export {
  REMARK_TYPES, CAISSE_REQUEST_TYPES,
  createCaisseEntry, deleteCaisseEntry, updateCaisseEntry,
  deleteCaisseEntries, deleteAgentCashierHistory,
  createAgentRemise, subscribeAgentRemises,
  subscribeCaisseByCity, subscribeAllCaisse,
  createCaissierRemark, resolveRemark, deleteRemark,
  subscribeCaissierRemarks, subscribeAllCaissierRemarks,
  createCaisseCloture, subscribeAllCaisseClotures,
  createCaissierTransaction, subscribeCaissierTransactions, subscribeAllCaissierTransactions,
  createAgentCashRecoveryRequest, approveAgentCashRecoveryRequest,
  rejectAgentCashRecoveryRequest, subscribeAgentCashRecoveryRequests,
  createCaisseRequest, approveCaisseRequest, rejectCaisseRequest,
  completeCaisseRequest, completeRhSalaryCaisseRequest,
  subscribeCaisseRequests, subscribeAllCaisseRequests,
  updateAgencyCash, adjustAgencyCash,
  adjustCentralCash, subscribeCentralCash,
  createCaisseEntryAtomic, deleteCaisseEntryAtomic, updateCaisseEntryAtomic,
  depositAgentCashAtomic, directTransferAgentToCashierAtomic, approveRecoveryAtomic,
  subscribeAgencyCash, subscribeAllAgencyCashes,
  addDriverPortDuTransaction, submitDriverVersement, confirmDriverVersement,
  subscribeDriverOwnPortDuTransactions, deleteDriverPortDuTransaction,
  updateDriverPortDuTransaction, subscribeAllDriverPortDuTransactions,
  subscribeDriverPortDuTransactionsByCity,
  DRIVER_VERSEMENT_TYPES, DRIVER_VERSEMENT_PAYMENT_TYPES,
  createDriverVersement, confirmDriverVersementChef, rejectDriverVersementChef,
  subscribeDriverVersements, subscribeMyDriverVersements, subscribeAllDriverVersements,
  createAdminTransferFromAgent, createAdminTransferFromCaissier, createAdminTransferFromChefAgence,
  confirmAdminTransfer, rejectAdminTransfer,
  subscribeAdminTransfers, subscribeMyAdminTransfers, subscribeAdminTransfersByCity,
} from './caisse'

export {
  createReglement, updateReglement, deleteReglement,
  markReglementRejete, markReglementVerseBanque,
  subscribeReglements, subscribeAllReglements, subscribeSourceReglements,
  confirmReglementReceivedBySource, markReglementDocVerified,
  createRapport, submitRapport, validerRapport, rejeterRapport,
  subscribeRapports, subscribeAllReglementsGlobal, subscribeAllRapportsGlobal, subscribeMyRapports,
  markPortDuRemisPointeur, markPortDuReceivedByChef, markCodRefundedToClient, markParcelChefPointed,
  createRetourDocument, subscribeRetourDocuments, expedierRetourDocument,
  confirmRetourDocumentArrived, deleteRetourDocument,
} from './finance'

export {
  getAgentCode, getAllUsers, updateUser, deleteUserDoc,
  subscribeAllUsers, createClientPortalParcel,
} from './users'

export {
  createCentralCodDeposit, subscribeAllCentralCodDeposits,
  createCentralSupplierPayment, markCentralSupplierPaymentPaid,
  updateCentralSupplierPayment, deleteCentralSupplierPayment,
  subscribeAllCentralSupplierPayments,
} from './central'

export {
  createBankDeposit, subscribeBankDepositsByCity,
  subscribeAllBankDeposits, confirmBankDeposit, deleteBankDeposit,
} from './bankDeposits'

export {
  generateSignatureToken, subscribeDeliverySignature, submitDeliverySignature,
  confirmDeliveryAfterSignature, deleteDeliverySignature, updateDeliverySignature,
} from './signatures'

export {
  DEFAULT_OPERATION_LOCKS, subscribeOperationLocks,
  updateGlobalSiteLock, updateAgencyLock,
} from './operationLocks'

export {
  BACKUP_COLLECTIONS, exportSiteBackup, importSiteBackup,
} from './backup'

export {
  DIRECTOR_ACTION_ICONS, logDirectorAction, subscribeDirectorLogs,
} from './directorLogs'

export {
  createVehicle, updateVehicle, deleteVehicle, subscribeVehicles,
} from './vehicles'

export {
  subscribeTariffConfig, saveTariffConfig,
} from './tariffs'

export { findParcel } from './parcelsRead'
