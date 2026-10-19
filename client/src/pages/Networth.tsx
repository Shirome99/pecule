import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Networth as NW } from '../api';
import { useStore } from '../store';
import { money, moneyRound, monthLabel } from '../format';

// une couleur par famille (palette catégorielle validée : bleu, aqua, orange) ; le net est une ligne couleur encre
const SERIES = [
  { key: 'liquid', label: 'Liquidités', color: 'var(--viz-1)' },
  { key: 'investments', label: 'Placements', color: 'var(--viz-3)' },
  { key: 'debts', label: 'Dettes', color: 'var(--viz-2)' },
] as const;

const signedRound = (n: number) => (n > 0 ? '+' : '') + moneyRound(n);
const kEuros = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k` : String(v));

export default function Networth() {
  const { version } = useStore();
  const [data, setData] = useState<NW | null>(null);

  useEffect(() => {
    api.get<NW>('/networth?months=24').then(setData);
  }, [version]);

  if (!data) return <div className="page"><p className="muted">Chargement…</p></div>;
  const { current } = data;
  const assets = current.liquid + current.investments;
  const chart = data.months.map((p) => ({ ...p, label: monthLabel(p.month, true) + (p.month.endsWith('-01') ? ` ${p.month.slice(2, 4)}` : '') }));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link to="/" className="link small back-link">‹ Aperçu</Link>
          <h1>Patrimoine</h1>
        </div>
      </header>

      <section className="hero" aria-label="Patrimoine net">
        <p className="hero-label">Patrimoine net</p>
        <p className={`hero-figure ${current.net < 0 ? 'neg' : ''}`}>{moneyRound(current.net)}</p>
        <div className="hero-split">
          {data.change_1m !== null && <div>Sur 1 mois <strong className={data.change_1m >= 0 ? 'in' : 'out'}>{signedRound(data.change_1m)}</strong></div>}
          {data.change_12m !== null && <div>Sur 12 mois <strong className={data.change_12m >= 0 ? 'in' : 'out'}>{signedRound(data.change_12m)}</strong></div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Sur 24 mois</h2></div>
        <ul className="nw-legend">
          {SERIES.map((s) => (
            <li key={s.key}><span className="swatch" style={{ background: s.color }} />{s.label} <strong>{moneyRound(current[s.key])}</strong></li>
          ))}
          <li><span className="swatch line" />Patrimoine net <strong>{moneyRound(current.net)}</strong></li>
        </ul>
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--ink-2)" interval="preserveStartEnd" minTickGap={28} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--ink-2)" width={52} tickFormatter={kEuros} />
              <ReferenceLine y={0} stroke="var(--ink-2)" />
              <Tooltip
                formatter={(v, name) => [money(Number(v)), name]}
                labelFormatter={(_, payload) => (payload?.[0] ? monthLabel(payload[0].payload.month) : '')}
                cursor={{ stroke: 'var(--ink-2)', strokeDasharray: '3 3' }}
                contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', fontFamily: 'inherit', background: 'var(--surface)' }}
              />
              {/* actifs empilés au-dessus de zéro, dettes en dessous ; liseré couleur de fond entre les aires */}
              <Area type="linear" dataKey="liquid" name="Liquidités" stackId="assets" fill="var(--viz-1)" fillOpacity={0.9} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
              <Area type="linear" dataKey="investments" name="Placements" stackId="assets" fill="var(--viz-3)" fillOpacity={0.9} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
              <Area type="linear" dataKey="debts" name="Dettes" stackId="debts" fill="var(--viz-2)" fillOpacity={0.9} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} />
              <Line type="linear" dataKey="net" name="Patrimoine net" stroke="var(--ink)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <details className="schedule">
          <summary>Voir les données</summary>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Mois</th><th>Liquidités</th><th>Placements</th><th>Dettes</th><th>Net</th></tr></thead>
              <tbody>
                {[...data.months].reverse().map((p) => (
                  <tr key={p.month}>
                    <td>{monthLabel(p.month)}</td><td>{moneyRound(p.liquid)}</td><td>{moneyRound(p.investments)}</td>
                    <td>{moneyRound(p.debts)}</td><td><strong>{moneyRound(p.net)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Répartition</h2>
          <Link to="/comptes" className="link">Mes comptes</Link>
        </div>
        <ul className="nw-split">
          {SERIES.map((s) => {
            const value = current[s.key];
            // part des actifs pour liquidités et placements ; pour les dettes, rapport dettes / actifs
            const share = assets > 0 ? Math.abs(value) / assets : 0;
            return (
              <li key={s.key}>
                <div className="nw-split-top">
                  <span>{s.label}</span>
                  <span><strong>{moneyRound(value)}</strong> <span className="muted small">{Math.round(share * 100)} %{s.key === 'debts' ? ' des actifs' : ''}</span></span>
                </div>
                <div className="budget-track"><div className="budget-fill" style={{ width: `${Math.min(share, 1) * 100}%`, background: s.color }} /></div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
