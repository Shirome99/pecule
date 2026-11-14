// Où vit la base de l'app : un fichier dans le dossier privé de l'app sur téléphone (Capacitor Filesystem),
// IndexedDB dans un navigateur. Les deux gardent les données sans réseau.
import { Capacitor } from '@capacitor/core';

export interface DbStore {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
  clear(): Promise<void>;
}

const FILE = 'pecule.sqlite';
const TMP = `${FILE}.tmp`;

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Téléphone : écriture dans un fichier temporaire puis renommage, pour ne jamais laisser une base à moitié écrite. */
const nativeStore: DbStore = {
  async load() {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    // si l'app a été fermée entre la suppression et le renommage, la version complète est dans le .tmp
    for (const path of [FILE, TMP]) {
      try {
        const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
        return typeof data === 'string' ? fromBase64(data) : new Uint8Array(await data.arrayBuffer());
      } catch { /* absent : on essaie le suivant */ }
    }
    return null; // premier lancement
  },
  async save(bytes) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: TMP, directory: Directory.Data, data: toBase64(bytes) });
    await Filesystem.deleteFile({ path: FILE, directory: Directory.Data }).catch(() => {});
    await Filesystem.rename({ from: TMP, to: FILE, directory: Directory.Data, toDirectory: Directory.Data });
  },
  async clear() {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path: FILE, directory: Directory.Data }).catch(() => {});
  },
};

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('pecule', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('files', mode);
      const req = run(tx.objectStore('files'));
      tx.oncomplete = () => { open.result.close(); resolve(req.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}

const browserStore: DbStore = {
  async load() {
    const value = await idb<unknown>('readonly', (s) => s.get(FILE));
    return value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  },
  async save(bytes) {
    await idb('readwrite', (s) => s.put(bytes, FILE));
  },
  async clear() {
    await idb('readwrite', (s) => s.delete(FILE));
  },
};

export const dbStore: DbStore = Capacitor.isNativePlatform() ? nativeStore : browserStore;
