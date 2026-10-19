import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Networth } from '../api';
import { moneyRound } from '../format';

/** Carte compacte de l'Aperçu : patrimoine net et variation sur un mois. */
export default function NetworthCard({ version }: { version: number }) {
  const [data, setData] = useState<Networth | null>(null);
  useEffect(() => {
    api.get<Networth>('/networth?months=2').then(setData).catch(() => setData(null));
  }, [version]);
  if (!data) return null;
  const change = data.change_1m ?? 0;
  return (
    <section className="panel mini-card nw-card">
      <div className="panel-head">
        <h2>
          Patrimoine net : {moneyRound(data.current.net)}
          {change !== 0 && <span className={`small ${change > 0 ? 'in' : 'out'}`}> {change > 0 ? '+' : ''}{moneyRound(change)} sur 1 mois</span>}
        </h2>
        <Link to="/patrimoine" className="link">Voir</Link>
      </div>
    </section>
  );
}
