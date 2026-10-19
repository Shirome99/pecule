import { useState } from 'react';
import type { Transaction } from '../api';
import { money, shortDate, signed } from '../format';
import TransactionForm from './TransactionForm';

export default function TxRow({ tx, showAccount = false, showDate = false }: { tx: Transaction; showAccount?: boolean; showDate?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (tx.transfer_id) {
    // virement : sens « départ → arrivée », montant neutre (ni revenu ni dépense)
    const [from, to] = tx.amount < 0 ? [tx.account_name, tx.peer_account_name] : [tx.peer_account_name, tx.account_name];
    return (
      <li>
        <button className="tx-row" onClick={() => setEditing(true)}>
          <span className="tx-icon transfer" aria-hidden>⇄</span>
          <span className="tx-main">
            <span className="tx-label">{tx.label}</span>
            <span className="tx-meta">{from} → {to}</span>
          </span>
          <span className="tx-amount transfer">{money(Math.abs(tx.amount))}</span>
        </button>
        {editing && <TransactionForm tx={tx} onClose={() => setEditing(false)} />}
      </li>
    );
  }
  return (
    <li>
      <button className="tx-row" onClick={() => setEditing(true)}>
        <span className="tx-icon" style={{ background: `${tx.category_color ?? '#9ca3af'}22`, color: tx.category_color ?? '#6b7280' }} aria-hidden>
          {tx.category_icon ?? '•'}
        </span>
        <span className="tx-main">
          <span className="tx-label">{tx.label}</span>
          <span className="tx-meta">
            {showDate && `${shortDate(tx.date)} · `}{tx.category_name ?? 'Sans catégorie'}{showAccount && ` – ${tx.account_name}`}
            {tx.tags?.map((t) => <span key={t} className="tx-tag"> #{t}</span>)}
          </span>
        </span>
        <span className={`tx-amount ${tx.amount > 0 ? 'in' : ''}`}>{signed(tx.amount)}</span>
      </button>
      {editing && <TransactionForm tx={tx} onClose={() => setEditing(false)} />}
    </li>
  );
}
