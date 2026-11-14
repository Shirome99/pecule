// Moteur local de l'app mobile : SQLite (sql.js) + le code du serveur, exécutés sur l'appareil.
// api.ts lui passe chaque requête au lieu d'appeler le réseau ; la base est enregistrée après chaque modification.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { dbStore } from './storage';

type Backend = typeof import('virtual:pecule-backend').default;
export type LocalResponse = { status: number; headers: Record<string, string>; body: unknown };

const AI_KEY = 'pecule_ai_key';
const SAVED_AT = 'pecule_saved_at';

let booting: Promise<Backend> | null = null;
let saving: Promise<void> = Promise.resolve();
let queued = false;
/** Après une restauration ou un effacement, la base en mémoire ne doit plus rien écrire. */
let frozen = false;

export function getAiKey(): string {
  try { return localStorage.getItem(AI_KEY) ?? ''; } catch { return ''; }
}

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;
const sql = () => (sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl }));

async function boot(): Promise<Backend> {
  const SQL = await sql();
  const bytes = await dbStore.load();
  globalThis.__peculeSqlite = { SQL, bytes };
  globalThis.__peculeEnv = { ANTHROPIC_API_KEY: getAiKey() };
  const backend = (await import('virtual:pecule-backend')).default;
  // première ouverture ou migration du schéma : on enregistre tout de suite
  if (!bytes || backend.takeDirty()) await save(backend);
  // demande au navigateur de ne pas effacer les données en cas de manque de place
  navigator.storage?.persist?.().catch(() => {});
  return backend;
}

export const backend = () => (booting ??= boot());

/** Enregistre la base ; les demandes rapprochées sont regroupées et jamais exécutées en parallèle. */
function save(b: Backend): Promise<void> {
  if (frozen || queued) return saving;
  queued = true;
  saving = saving.then(async () => {
    queued = false;
    if (frozen) return;
    await dbStore.save(b.serialize());
    try { localStorage.setItem(SAVED_AT, new Date().toISOString()); } catch { /* sans importance */ }
  }).catch((err) => console.error('Enregistrement de la base impossible', err));
  return saving;
}

/** Exécute une requête de l'API sur l'appareil. */
export async function localFetch(method: string, url: string, body: unknown, token: string | null): Promise<LocalResponse> {
  const b = await backend();
  const res = await b.handle({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, body });
  if (b.takeDirty()) void save(b);
  return res;
}

/** Attend la fin des enregistrements en cours (mise en arrière-plan de l'app). */
export async function flush() {
  if (!booting) return;
  const b = await booting;
  if (b.takeDirty()) void save(b);
  await saving;
}

// ---------- sauvegarde / restauration ----------
const SQLITE_HEADER = 'SQLite format 3\0';

/** Copie complète de la base (fichier SQLite). */
export async function exportBackup(): Promise<Uint8Array> {
  const b = await backend();
  await saving;
  return b.serialize();
}

/** Vérifie qu'un fichier est bien une sauvegarde Pécule ; renvoie le nombre d'opérations qu'elle contient. */
export async function inspectBackup(bytes: Uint8Array): Promise<{ profiles: number; operations: number }> {
  if (new TextDecoder().decode(bytes.subarray(0, 16)) !== SQLITE_HEADER) throw new Error('Ce fichier n’est pas une sauvegarde Pécule.');
  const SQL = await sql();
  const db = new SQL.Database(bytes);
  try {
    const count = (table: string) => Number(db.exec(`SELECT COUNT(*) FROM ${table}`)[0]?.values[0][0] ?? 0);
    const ok = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'accounts', 'transactions')");
    if ((ok[0]?.values.length ?? 0) < 3) throw new Error('Ce fichier n’est pas une sauvegarde Pécule.');
    return { profiles: count('users'), operations: count('transactions') };
  } catch (e) {
    throw e instanceof Error && e.message.startsWith('Ce fichier') ? e : new Error('Sauvegarde illisible ou abîmée.');
  } finally {
    db.close();
  }
}

/** Remplace toutes les données de l'app par une sauvegarde (l'app doit ensuite redémarrer). */
export async function restoreBackup(bytes: Uint8Array) {
  await inspectBackup(bytes);
  await saving;
  frozen = true;
  await dbStore.save(bytes);
}

/** Efface toutes les données de l'app (l'app doit ensuite redémarrer). */
export async function eraseAll() {
  await saving;
  frozen = true;
  await dbStore.clear();
}

export function lastSavedAt(): string | null {
  try { return localStorage.getItem(SAVED_AT); } catch { return null; }
}

/** Clé API Anthropic saisie dans les Réglages : gardée sur l'appareil, jamais dans les sauvegardes. */
export async function setAiKey(key: string) {
  try {
    if (key) localStorage.setItem(AI_KEY, key);
    else localStorage.removeItem(AI_KEY);
  } catch { /* stockage indisponible */ }
  if (booting) (await booting).setAiKey(key);
}
