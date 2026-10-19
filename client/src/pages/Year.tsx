import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type YearStats } from '../api';
import { useStore } from '../store';
import { money, moneyRound, monthLabel, shortDate } from '../format';

/** Vue annuelle : revenus, dépenses, épargne, taux d'épargne, catégories × mois et 5 plus grosses dépenses. */
export default function Year() {
  const { version } = useStore();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<YearStats | null>(null);

  useEffect(() => {
    api.get<YearStats>(`/stats/year?year=${year}`).then(setData).catch(() => setData(null));
  }, [year, version]);

  const empty = data && data.income === 0 && data.expenses === 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link to="/" className="link small back-link">‹ Aperçu</Link>
          <h1>Vue annuelle</h1>
        </div>
        <div className="month-picker">
          <button className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Année précédente">‹</button>
          <span className="month-picker-label" aria-live="polite">{year}</span>
          <button className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Année suivante" disabled={year >= thisYear}>›</button>
        </div>
      </header>

      {!data ? <p className="muted">Chargement…</p> : empty ? (
        <div className="empty"><p>Aucune opération en {year}.</p></div>
      ) : (
        <>
          <dl className="sheet-stats year-stats">
            <div className="sheet-stat"><dt>Revenus</dt><dd className="in">{moneyRound(data.income)}</dd></div>
            <div className="sheet-stat"><dt>Dépenses</dt><dd>{moneyRound(data.expenses)}</dd></div>
            <div className="sheet-stat"><dt>Épargne</dt><dd className={data.savings < 0 ? 'out' : 'in'}>{data.savings > 0 ? '+' : ''}{moneyRound(data.savings)}</dd></div>
            <div className="sheet-stat"><dt>Taux d'épargne</dt>
              <dd>{data.savings_rate === null ? '–' : `${data.savings_rate.toLocaleString('fr-FR')} %`}</dd>
            </div>
          </dl>

          <section className="panel">
            <h2 id="year-table">Dépenses par catégorie et par mois</h2>
            <div className="table-scroll year-table" tabIndex={0} aria-labelledby="year-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Catégorie</th>
                    {data.months.map((m) => <th scope="col" key={m.month}>{monthLabel(m.month, true)}</th>)}
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.id ?? 'none'}>
                      <th scope="row"><span aria-hidden>{c.icon}</span> {c.name}</th>
                      {c.months.map((v, i) => <td key={i} className={v ? '' : 'zero'}>{v ? moneyRound(v) : '–'}</td>)}
                      <td><strong>{moneyRound(c.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Dépenses</th>
                    {data.months.map((m) => <td key={m.month}>{m.expenses ? moneyRound(m.expenses) : '–'}</td>)}
                    <td><strong>{moneyRound(data.expenses)}</strong></td>
                  </tr>
                  <tr>
                    <th scope="row">Revenus</th>
                    {data.months.map((m) => <td key={m.month}>{m.income ? moneyRound(m.income) : '–'}</td>)}
                    <td><strong>{moneyRound(data.income)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>Les 5 plus grosses dépenses</h2>
            <ol className="top-list">
              {data.top.map((t) => (
                <li key={t.id}>
                  <span className="tx-main">
                    <span className="tx-label">{t.label}</span>
                    <span className="tx-meta">{shortDate(t.date)} · <span aria-hidden>{t.category_icon ?? '•'}</span> {t.category_name ?? 'Sans catégorie'}</span>
                  </span>
                  <span className="tx-amount">{money(t.amount)}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
