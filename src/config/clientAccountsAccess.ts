import { permissionsOf } from '../utils/userPermissions'

/** 📝 Comptes clients (fiche d'ouverture de compte) : droit coché par l'ADMIN dans la fiche employé (01/11/2026 — avant :
 *  liste d'e-mails écrite ici). */
export const canManageClientAccounts = (profile: any) => permissionsOf(profile).clientAccounts === true
