// Adaptateur « better-sqlite3 » au-dessus de sql.js (SQLite compilé en WebAssembly).
// Le code du serveur (server/src) tourne ainsi tel quel dans l'app mobile, sans réseau.
//
// Seule la partie de l'API utilisée par le serveur est fournie : prepare().get/all/run, exec, pragma, transaction.
// sql.js doit être initialisé avant le premier `new Database()` : globalThis.__peculeSqlite = { SQL, bytes }.
//
// Particularité de sql.js : export() ferme et rouvre la base, ce qui libère toutes les requêtes préparées et remet
// les PRAGMA (foreign_keys…) à leur valeur par défaut. Les requêtes sont donc re-préparées à la demande (génération)
// et les PRAGMA rejoués après chaque export.

const state = globalThis.__peculeSqlite || (globalThis.__peculeSqlite = { SQL: null, bytes: null });

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Uint8Array);

function normalizeValue(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  return v;
}

/** Paramètres à la manière de better-sqlite3 : (a, b), ([a, b]) ou ({ nom }) → format sql.js. */
function bindParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) params = params[0];
  if (params.length === 1 && isPlainObject(params[0])) {
    const named = {};
    for (const [k, v] of Object.entries(params[0])) {
      const value = normalizeValue(v);
      named[`@${k}`] = value; named[`:${k}`] = value; named[`$${k}`] = value;
    }
    return named;
  }
  return params.map(normalizeValue);
}

class Statement {
  constructor(db, source) {
    this.database = db;
    this.source = source;
    this.reader = /^\s*(SELECT|WITH|PRAGMA|VALUES)\b/i.test(source);
    this._stmt = null;
    this._generation = -1;
  }

  _prepared() {
    if (this._generation !== this.database._generation || !this._stmt) {
      this._stmt = this.database._raw.prepare(this.source);
      this._generation = this.database._generation;
    }
    return this._stmt;
  }

  _rows(params, limit) {
    const stmt = this._prepared();
    try {
      const bound = bindParams(params);
      if (Array.isArray(bound) ? bound.length : Object.keys(bound).length) stmt.bind(bound);
      const rows = [];
      while ((limit === undefined || rows.length < limit) && stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.reset();
    }
  }

  get(...params) { return this._rows(params, 1)[0]; }

  all(...params) { return this._rows(params); }

  run(...params) {
    this._rows(params);
    // sqlite3_changes() garde la valeur de la dernière écriture : une lecture n'a rien modifié
    const changes = this.reader ? 0 : this.database._raw.getRowsModified();
    if (changes > 0 || /^\s*(CREATE|ALTER|DROP)\b/i.test(this.source)) this.database._dirty = true;
    const lastInsertRowid = this.database._lastRowid();
    return { changes, lastInsertRowid };
  }
}

class Database {
  constructor() {
    if (!state.SQL) throw new Error('sql.js n’est pas initialisé (globalThis.__peculeSqlite.SQL)');
    this._raw = new state.SQL.Database(state.bytes || undefined);
    state.bytes = null; // les octets ne servent qu'à l'ouverture
    this._generation = 0;
    this._pragmas = [];
    this._depth = 0;
    this._dirty = false;
    this._rowidStmt = null;
    this.open = true;
    this.memory = true;
    state.db = this;
  }

  _lastRowid() {
    if (!this._rowidStmt || this._rowidGeneration !== this._generation) {
      this._rowidStmt = this._raw.prepare('SELECT last_insert_rowid() AS id');
      this._rowidGeneration = this._generation;
    }
    try { this._rowidStmt.step(); return this._rowidStmt.getAsObject().id; }
    finally { this._rowidStmt.reset(); }
  }

  prepare(source) { return new Statement(this, source); }

  exec(source) {
    this._raw.exec(source);
    this._dirty = true;
    return this;
  }

  pragma(source, options = {}) {
    // WAL n'a pas de sens pour une base en mémoire
    if (/^\s*journal_mode\b/i.test(source)) return options.simple ? 'memory' : [{ journal_mode: 'memory' }];
    if (/=/.test(source) && !this._pragmas.includes(source)) this._pragmas.push(source);
    const rows = this.prepare(`PRAGMA ${source}`).all();
    if (options.simple) return rows[0] ? Object.values(rows[0])[0] : undefined;
    return rows;
  }

  get inTransaction() { return this._depth > 0; }

  transaction(fn) {
    const db = this;
    const run = function (...args) {
      const savepoint = `pecule_sp_${db._depth}`;
      db._raw.exec(db._depth === 0 ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
      db._depth++;
      try {
        const result = fn.apply(this, args);
        db._depth--;
        db._raw.exec(db._depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
        return result;
      } catch (e) {
        db._depth--;
        db._raw.exec(db._depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        throw e;
      }
    };
    return Object.assign(run, { deferred: run, immediate: run, exclusive: run });
  }

  /** Le contenu de la base, pour l'enregistrer sur l'appareil ou en faire une sauvegarde. */
  serialize() {
    if (this._depth > 0) throw new Error('Export impossible pendant une transaction');
    const bytes = this._raw.export();
    this._generation++; // export() a libéré les requêtes préparées
    for (const p of this._pragmas) this._raw.exec(`PRAGMA ${p}`);
    return bytes;
  }

  /** Vrai si la base a changé depuis le dernier appel (remis à zéro). */
  takeDirty() {
    const d = this._dirty;
    this._dirty = false;
    return d;
  }

  close() { this._raw.close(); this.open = false; }
}

module.exports = Database;
module.exports.default = Database;
