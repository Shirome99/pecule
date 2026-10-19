import { useStore } from '../store';
import { currentMonth, monthLabel, shiftMonth } from '../format';

export default function MonthPicker() {
  const { month, setMonth } = useStore();
  const isCurrent = month === currentMonth();
  return (
    <div className="month-picker">
      <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">‹</button>
      <span className="month-picker-label">{monthLabel(month)}</span>
      <button
        className="icon-btn"
        onClick={() => setMonth(shiftMonth(month, 1))}
        aria-label="Mois suivant"
        disabled={isCurrent}
      >›</button>
    </div>
  );
}
