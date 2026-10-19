import { useState } from 'react';
import type { Forecast } from '../api';
import { money, moneyRound } from '../format';
import Modal from './Modal';

const signedRound = (n: number) => (n > 0 ? '+' : '') + moneyRound(n);
const perDay = (n: number) => (n >= 10 ? moneyRound(Math.floor(n)) : money(n));

/** Sous le grand chiffre de l'Aperçu : combien dépenser par jour, et le solde estimé en fin de mois. */
export default function ForecastLine({ f }: { f: Forecast }) {
  const [open, setOpen] = useState(false);
  const lastDay = Number(f.last_day.slice(8));
  return (
    <div className="forecast">
      {f.overspend > 0 ? (
        <p className="forecast-main over">Tu dépasses de <strong>{moneyRound(f.overspend)}</strong> ce mois-ci</p>
      ) : (
        <p className="forecast-main">
          Tu peux dépenser <strong>{perDay(f.safe_per_day)}/jour</strong> jusqu'au {lastDay}
        </p>
      )}
      <p className="forecast-sub">
        Fin de mois estimée : <strong className={f.projected_end_balance < 0 ? 'out' : ''}>{signedRound(f.projected_end_balance)}</strong>
        <button className="link" onClick={() => setOpen(true)}>Comment c'est calculé ?</button>
      </p>
      {open && <ForecastDetails f={f} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Row({ label, value, hint, total = false }: { label: string; value: string; hint?: string; total?: boolean }) {
  return (
    <div className={`calc-row ${total ? 'total' : ''}`}>
      <dt>{label}{hint && <span className="muted small"> · {hint}</span>}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const plus = (n: number) => `+ ${money(n)}`;
const minus = (n: number) => `− ${money(n)}`;

function ForecastDetails({ f, onClose }: { f: Forecast; onClose: () => void }) {
  const variableTotal = f.variable_daily_rate * f.days_remaining;
  return (
    <Modal title="Comment c'est calculé ?" onClose={onClose}>
      <div className="form">
        <section>
          <h3>Reste à dépenser ce mois-ci</h3>
          <dl className="calc">
            <Row label="Revenus déjà reçus" value={plus(f.income)} />
            <Row label="Revenus récurrents à venir" value={plus(f.upcoming_income)} />
            <Row label="Dépenses déjà faites" value={minus(f.expenses)} />
            <Row label="Dépenses récurrentes à venir" value={minus(f.upcoming_expenses)} />
            <Row label="Épargne prévue" hint="virements récurrents vers l'épargne" value={minus(f.planned_savings)} />
            <Row label="Reste à dépenser" value={money(f.safe_to_spend)} total />
            {f.overspend > 0 ? (
              <Row label="Dépassement" value={money(f.overspend)} total />
            ) : (
              <Row label={`Par jour, sur ${f.days_remaining} jour${f.days_remaining > 1 ? 's' : ''}`} hint="aujourd'hui inclus" value={money(f.safe_per_day)} total />
            )}
          </dl>
        </section>
        <section>
          <h3>Fin de mois estimée</h3>
          <dl className="calc">
            <Row label="Solde actuel" hint="comptes courants, espèces et cartes" value={money(f.spendable_balance)} />
            <Row label="Revenus récurrents à venir" value={plus(f.upcoming_income)} />
            <Row label="Dépenses récurrentes à venir" value={minus(f.upcoming_expenses)} />
            {f.upcoming_savings_out !== 0 && <Row label="Virements d'épargne à venir" value={minus(f.upcoming_savings_out)} />}
            <Row
              label={`Dépenses du quotidien : ${money(f.variable_daily_rate)}/jour × ${f.days_remaining}`}
              hint={f.rate_basis === 'history' ? `médiane des ${f.history_months} derniers mois` : 'rythme de ce mois'}
              value={minus(variableTotal)}
            />
            <Row label="Solde estimé au dernier jour" value={money(f.projected_end_balance)} total />
          </dl>
        </section>
        <p className="muted small">Les virements entre tes comptes ne sont jamais comptés comme des revenus ou des dépenses.</p>
      </div>
    </Modal>
  );
}
