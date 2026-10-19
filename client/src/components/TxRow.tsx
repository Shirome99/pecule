import { useState } from 'react';
import type { Transaction } from '../api';
import { signed } from '../format';
import TransactionForm from './TransactionForm';

export default function TxRow({ tx, showAccount = false }: { tx: Transaction; showAccount?: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <li>
      <button className="tx-row" onClick={() => setEditing(true)}>
        <span className="tx-icon" style={{ background: `${tx.category_color ?? '#9ca3af'}22`, color: tx.category_color ?? '#6b7280' }} aria-hidden>
          {tx.category_icon ?? '•'}
        </span>
        <span className="tx-main">
          <span className="tx-label">{tx.label}</span>
          <span className="tx-meta">{tx.category_name ?? 'Sans catégorie'}{showAccount && ` – ${tx.account_name}`}</span>
        </span>
        <span className={`tx-amount ${tx.amount > 0 ? 'in' : ''}`}>{signed(tx.amount)}</span>
      </button>
      {editing && <TransactionForm tx={tx} onClose={() => setEditing(false)} />}
    </li>
  );
}
