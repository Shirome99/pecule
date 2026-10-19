import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Insight } from '../api';

const ICONS: Record<Insight['type'], { icon: string; tone: string; label: string }> = {
  category_up: { icon: '↑', tone: 'out', label: 'En hausse' },
  category_down: { icon: '↓', tone: 'in', label: 'En baisse' },
  unusual: { icon: '!', tone: 'warn', label: 'Inhabituel' },
  budget_pace: { icon: '!', tone: 'warn', label: 'Budget' },
  good_news: { icon: '✓', tone: 'in', label: 'Bonne nouvelle' },
};

const linkTo = ({ month, category_id, q }: Insight['link']) => {
  const p = new URLSearchParams({ month });
  if (category_id) p.set('category', String(category_id));
  if (q) p.set('q', q);
  return `/transactions?${p}`;
};

/** Au plus 3 constats sur le mois ; la carte n'apparaît pas s'il n'y a rien à dire. */
export default function InsightsCard({ month, version }: { month: string; version: number }) {
  const [items, setItems] = useState<Insight[]>([]);

  useEffect(() => {
    api.get<Insight[]>(`/insights?month=${month}`).then(setItems).catch(() => setItems([]));
  }, [month, version]);

  if (items.length === 0) return null;
  return (
    <section className="panel" aria-labelledby="insights-title">
      <h2 id="insights-title">À retenir</h2>
      <ul className="insights">
        {items.map((i) => {
          const s = ICONS[i.type];
          return (
            <li key={i.text} className="insight">
              <span className={`insight-icon ${s.tone}`} aria-hidden>{s.icon}</span>
              <span className="insight-body">
                <span className="sr-only">{s.label} : </span>
                <span>{i.text}</span>
                <Link to={linkTo(i.link)} className="link small">Voir les opérations</Link>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
