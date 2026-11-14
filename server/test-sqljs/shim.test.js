// Adaptateur better-sqlite3 → sql.js (client/src/local/shims) : les cas que la suite d'API ne couvre pas.
// Lancé seulement par `npm run test:sqljs` (vitest.sqljs.config.mjs).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3'); // redirigé vers l'adaptateur par test/sqljs-setup.mjs

function fresh() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id) ON DELETE CASCADE, v INTEGER)`);
  db.takeDirty();
  return db;
}

describe('adaptateur sql.js', () => {
  it('est bien l’adaptateur (et non better-sqlite3)', () => {
    expect(typeof fresh().takeDirty).toBe('function');
  });

  it('get / all / run avec paramètres positionnels, tableau ou nommés', () => {
    const db = fresh();
    const ins = db.prepare('INSERT INTO parent (name) VALUES (?)');
    expect(ins.run('a')).toEqual({ changes: 1, lastInsertRowid: 1 });
    expect(ins.run(['b']).lastInsertRowid).toBe(2);
    db.prepare('INSERT INTO parent (name) VALUES (@name)').run({ name: 'c' });
    expect(db.prepare('SELECT name FROM parent WHERE id = ?').get(3)).toEqual({ name: 'c' });
    expect(db.prepare('SELECT * FROM parent WHERE id = ?').get(99)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS n FROM parent').all()).toEqual([{ n: 3 }]);
    expect(db.prepare('SELECT name FROM parent WHERE name = ?').get(undefined)).toBeUndefined();
    // une lecture ne rapporte aucune modification
    expect(db.prepare('SELECT 1').run().changes).toBe(0);
  });

  it('les requêtes préparées et les PRAGMA survivent à un export', () => {
    const db = fresh();
    const ins = db.prepare('INSERT INTO parent (name) VALUES (?)');
    ins.run('avant');
    const bytes = db.serialize();
    expect(bytes).toBeInstanceOf(Uint8Array);
    ins.run('après'); // requête préparée avant l'export : re-préparée automatiquement
    expect(db.prepare('SELECT COUNT(*) AS n FROM parent').get().n).toBe(2);
    // foreign_keys toujours actif après l'export
    expect(() => db.prepare('INSERT INTO child (parent_id, v) VALUES (?, ?)').run(999, 1)).toThrow(/FOREIGN KEY/);
    db.prepare('INSERT INTO child (parent_id, v) VALUES (?, ?)').run(1, 1);
    db.prepare('DELETE FROM parent WHERE id = 1').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM child').get().n).toBe(0); // ON DELETE CASCADE
  });

  it('transactions : validation, annulation, et savepoint pour une transaction imbriquée', () => {
    const db = fresh();
    const ins = db.prepare('INSERT INTO parent (name) VALUES (?)');
    db.transaction(() => { ins.run('x'); ins.run('y'); })();
    expect(() => db.transaction(() => { ins.run('z'); throw new Error('stop'); })()).toThrow('stop');
    const outer = db.transaction(() => {
      ins.run('extérieur');
      try { db.transaction(() => { ins.run('intérieur'); throw new Error('non'); })(); } catch { /* annule seulement l'intérieur */ }
      expect(db.inTransaction).toBe(true);
    });
    outer();
    expect(db.inTransaction).toBe(false);
    expect(db.prepare('SELECT name FROM parent ORDER BY id').all().map((r) => r.name)).toEqual(['x', 'y', 'extérieur']);
    expect(() => db.serialize()).not.toThrow();
  });

  it('signale les modifications (pour n’enregistrer la base que si besoin)', () => {
    const db = fresh();
    db.prepare('SELECT * FROM parent').all();
    db.prepare('UPDATE parent SET name = ? WHERE id = ?').run('rien', 42);
    expect(db.takeDirty()).toBe(false);
    db.prepare('INSERT INTO parent (name) VALUES (?)').run('a');
    expect(db.takeDirty()).toBe(true);
    expect(db.takeDirty()).toBe(false);
  });

  it('rouvre une base à partir de ses octets', () => {
    const db = fresh();
    db.prepare('INSERT INTO parent (name) VALUES (?)').run('gardé');
    globalThis.__peculeSqlite.bytes = db.serialize();
    const copy = new Database(':memory:');
    expect(copy.prepare('SELECT name FROM parent').get()).toEqual({ name: 'gardé' });
  });
});
