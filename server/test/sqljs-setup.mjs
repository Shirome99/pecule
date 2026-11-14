// Remplace better-sqlite3 par l'adaptateur sql.js de l'app mobile (client/src/local/shims) pour toute la suite d'API.
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '..', '..', 'client');
const shim = path.join(clientDir, 'src', 'local', 'shims', 'better-sqlite3.cjs');
const clientRequire = createRequire(path.join(clientDir, 'package.json'));

if (!globalThis.__peculeSqlite?.SQL) {
  const initSqlJs = clientRequire('sql.js');
  globalThis.__peculeSqlite = { SQL: await initSqlJs(), bytes: null };
}

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'better-sqlite3') return shim;
  return resolve.call(this, request, ...rest);
};
