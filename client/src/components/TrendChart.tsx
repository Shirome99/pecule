import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Stats } from '../api';
import { money, monthLabel } from '../format';

/** Revenus et dépenses des six derniers mois (Aperçu). Chargé à la demande avec Recharts. */
export default function TrendChart({ trend }: { trend: Stats['trend'] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={trend.map((t) => ({ ...t, label: monthLabel(t.month, true) }))} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--ink-2)" />
        <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--ink-2)" width={48}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k` : v)} />
        <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: 'var(--wash)' }}
          contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
        <Bar dataKey="income" name="Revenus" fill="var(--in)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Dépenses" fill="var(--out)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
