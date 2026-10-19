import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Subscriptions } from '../api';
import { money, moneyRound, today } from '../format';

/** Carte compacte de l'Aperçu : coût des abonnements détectés + alerte de hausse récente (60 jours). */
export default function SubscriptionsCard({ version }: { version: number }) {
  const [data, setData] = useState<Subscriptions | null>(null);
  useEffect(() => {
    api.get<Subscriptions>('/subscriptions').then(setData).catch(() => setData(null));
  }, [version]);
  if (!data || data.items.length === 0) return null;

  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const hikes = data.items.filter((s) => s.price_change && s.price_change.new_amount > s.price_change.old_amount
    && s.price_change.date >= since && s.price_change.date <= today());
  return (
    <section className="panel mini-card subs-card">
      <div className="panel-head">
        <h2>Abonnements : {moneyRound(data.monthly_total)}/mois, {moneyRound(data.annual_total)}/an</h2>
        <Link to="/abonnements" className="link">Voir</Link>
      </div>
      {hikes.map((s) => (
        <p key={s.key} className="sub-alert">
          <span className="badge duplicate">Prix en hausse</span>
          {s.label} : {money(s.price_change!.old_amount)} → {money(s.price_change!.new_amount)}
        </p>
      ))}
    </section>
  );
}
