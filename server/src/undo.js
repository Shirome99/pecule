// Annulation d'une suppression : la route qui supprime garde en mémoire de quoi tout réinsérer à l'identique
// (mêmes id, mêmes liens), le client a un jeton valable UNDO_TTL_MS pour demander la restauration.
const { db } = require('./db');

const UNDO_TTL_MS = 60_000; // le toast reste 6 s ; marge pour un réseau lent
const pending = new Map(); // token -> { userId, rows: { table: [row…] }, links: [{ sql, params }], expires }

function purge(now = Date.now()) {
  for (const [token, p] of pending) if (p.expires < now) pending.delete(token);
}

/**
 * Enregistre ce qui va être supprimé et renvoie le jeton d'annulation.
 * `rows` : lignes complètes par table, réinsérées dans l'ordre des clés (parents d'abord).
 * `links` : mises à jour à rejouer après réinsertion (ex. remettre la catégorie sur ses opérations).
 */
function remember(userId, rows, links = []) {
  purge();
  const token = crypto.randomUUID();
  pending.set(token, { userId, rows, links, expires: Date.now() + UNDO_TTL_MS });
  return token;
}

/** Réinsère les lignes. Renvoie false si le jeton est inconnu, expiré ou appartient à un autre utilisateur. */
function restore(userId, token) {
  purge();
  const p = pending.get(token);
  if (!p || p.userId !== userId) return false;
  db.transaction(() => {
    for (const [table, list] of Object.entries(p.rows)) {
      for (const row of list) {
        const cols = Object.keys(row);
        db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
          .run(...cols.map((c) => row[c]));
      }
    }
    for (const l of p.links) db.prepare(l.sql).run(...l.params);
  })();
  pending.delete(token);
  return true;
}

module.exports = { remember, restore, UNDO_TTL_MS };
