// Virements : deux lignes `transactions` liées par un transfer_id commun (sortie négative, entrée positive).
const { db } = require('./db');
const { owns, toCents } = require('./lib');

const getTransferLines = (transferId, userId) =>
  db.prepare('SELECT * FROM transactions WHERE transfer_id = ? AND user_id = ? ORDER BY amount').all(transferId, userId);

/** Crée (ou remplace si transferId est fourni) les deux lignes d'un virement, dans une transaction SQL. */
function saveTransfer(userId, t, transferId = null) {
  if (t.from_account_id === t.to_account_id) return { error: 'Choisis deux comptes différents' };
  if (!owns('accounts', t.from_account_id, userId) || !owns('accounts', t.to_account_id, userId))
    return { error: 'Compte invalide' };
  const cents = toCents(t.amount);
  const label = t.label || 'Virement';
  if (transferId) {
    const [out, inc] = getTransferLines(transferId, userId); // triées par montant : sortie puis entrée
    const upd = db.prepare('UPDATE transactions SET account_id=?, category_id=NULL, amount=?, label=?, date=? WHERE id=?');
    db.transaction(() => {
      upd.run(t.from_account_id, -cents, label, t.date, out.id);
      upd.run(t.to_account_id, cents, label, t.date, inc.id);
    })();
    return { transfer_id: transferId };
  }
  const id = crypto.randomUUID();
  const ins = db.prepare(
    'INSERT INTO transactions (user_id, account_id, category_id, amount, label, date, transfer_id) VALUES (?,?,NULL,?,?,?,?)'
  );
  db.transaction(() => {
    ins.run(userId, t.from_account_id, -cents, label, t.date, id);
    ins.run(userId, t.to_account_id, cents, label, t.date, id);
  })();
  return { transfer_id: id };
}

module.exports = { getTransferLines, saveTransfer };
