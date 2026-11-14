// Version web (serveur Express) : le mode local n'est pas inclus. Mêmes exports que ./mobile.ts, jamais appelés
// puisque LOCAL est faux ; ce fichier évite seulement d'embarquer SQLite et le serveur dans le build web.
import type * as Mobile from './mobile';

const unavailable = (): never => { throw new Error('Mode local indisponible dans la version web'); };

export const initMobile: typeof Mobile.initMobile = unavailable;
export const localFetch: typeof Mobile.localFetch = unavailable;
export const flush: typeof Mobile.flush = unavailable;
export const exportBackup: typeof Mobile.exportBackup = unavailable;
export const inspectBackup: typeof Mobile.inspectBackup = unavailable;
export const restoreBackup: typeof Mobile.restoreBackup = unavailable;
export const eraseAll: typeof Mobile.eraseAll = unavailable;
export const setAiKey: typeof Mobile.setAiKey = unavailable;
export const getAiKey: typeof Mobile.getAiKey = unavailable;
export const lastSavedAt: typeof Mobile.lastSavedAt = unavailable;
export const backend: typeof Mobile.backend = unavailable;
