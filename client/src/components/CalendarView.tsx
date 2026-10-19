import { useEffect, useState } from 'react';
import type { Transaction } from '../api';
import { dayLabel, money, moneyRound, today } from '../format';
import Modal from './Modal';
import TxRow from './TxRow';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
// échelle séquentielle : --out mélangé à la surface (clair → foncé en clair, sombre → vif en sombre)
const LEVELS = [0, 12, 24, 38, 54];

function useNarrow() {
  const query = '(max-width: 720px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * Calendrier du mois : intensité selon les dépenses du jour, total sous chaque jour (desktop),
 * un clic affiche les opérations du jour (en dessous sur desktop, dans un panneau en bas sur mobile).
 */
export default function CalendarView({ month, txs, counted, showAccount }: {
  month: string; txs: Transaction[]; counted: (t: Transaction) => boolean; showAccount: boolean;
}) {
  const narrow = useNarrow();
  const [selected, setSelected] = useState<string | null>(null);
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // lundi = 0
  const date = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
  const spent = new Map<string, number>();
  for (const t of txs) if (counted(t) && t.amount < 0) spent.set(t.date, (spent.get(t.date) ?? 0) - t.amount);
  // niveaux par quartiles des jours avec dépense : un gros loyer n'écrase pas tous les autres jours
  const sorted = [...spent.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const level = (v: number) => {
    if (v <= 0) return 0;
    const below = sorted.filter((x) => x < v).length;
    return Math.min(LEVELS.length - 1, 1 + Math.floor((below / sorted.length) * (LEVELS.length - 1)));
  };
  const todayIso = today();
  const dayTxs = selected ? txs.filter((t) => t.date === selected) : [];

  const detail = selected && (
    <ul className="tx-list">{dayTxs.length ? dayTxs.map((t) => <TxRow key={t.id} tx={t} showAccount={showAccount} />) : <li className="muted">Aucune opération ce jour-là.</li>}</ul>
  );

  return (
    <section className="panel calendar" aria-label="Calendrier des dépenses">
      <div className="cal-grid" role="grid" aria-label={`Dépenses par jour, ${month}`}>
        <div role="row" className="cal-row">
          {WEEKDAYS.map((w) => <span key={w} role="columnheader" className="cal-weekday">{w}</span>)}
        </div>
        {Array.from({ length: Math.ceil((offset + days) / 7) }, (_, week) => (
          <div role="row" className="cal-row" key={week}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = week * 7 + i - offset + 1;
              if (d < 1 || d > days) return <span key={i} role="gridcell" className="cal-cell empty" />;
              const iso = date(d);
              const v = spent.get(iso) ?? 0;
              const n = txs.filter((t) => t.date === iso).length;
              const lvl = level(v);
              const label = `${dayLabel(iso)} : ${v ? `${money(v)} dépensés` : 'aucune dépense'}${n ? `, ${n} opération${n > 1 ? 's' : ''}` : ''}`;
              // nom accessible = texte visible complété de texte masqué (« Lundi 12 octobre : 45 € dépensés, 3 opérations »)
              const [weekday, , ...monthName] = dayLabel(iso).split(' ');
              const rest = `${n ? `, ${n} opération${n > 1 ? 's' : ''}` : ''}`;
              return (
                <span key={i} role="gridcell">
                  <button
                    className={`cal-cell lvl-${lvl} ${iso === selected ? 'on' : ''} ${iso > todayIso ? 'future' : ''}`}
                    style={{ '--heat': `${LEVELS[lvl]}%` } as React.CSSProperties}
                    onClick={() => setSelected(iso === selected ? null : iso)}
                    aria-pressed={iso === selected} title={label}
                  >
                    <span className="cal-day"><span className="sr-only">{weekday} </span>{d}<span className="sr-only"> {monthName.join(' ')} : </span></span>
                    {v > 0 ? (
                      <span className={narrow ? 'sr-only' : 'cal-total'}>{moneyRound(v)}<span className="sr-only"> dépensés{rest}</span></span>
                    ) : <span className="sr-only">aucune dépense{rest}</span>}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="cal-legend" aria-hidden>
        <span>Moins</span>
        {LEVELS.slice(1).map((l) => <span key={l} className="cal-swatch" style={{ '--heat': `${l}%` } as React.CSSProperties} />)}
        <span>Plus</span>
      </div>

      {selected && !narrow && (
        <div className="cal-detail">
          <h2 className="day-head"><span>{dayLabel(selected)}</span><span className="muted">{money(spent.get(selected) ?? 0)} dépensés</span></h2>
          {detail}
        </div>
      )}
      {selected && narrow && <Modal title={dayLabel(selected)} onClose={() => setSelected(null)}>{detail}</Modal>}
    </section>
  );
}
