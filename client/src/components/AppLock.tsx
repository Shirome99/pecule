import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { checkPin, hasPin, RELOCK_AFTER_MS } from '../lock';
import { haptic } from '../native';

export const PIN_LENGTH = 4;

/** Pavé numérique : saisie d'un code à 4 chiffres (déverrouillage et choix du code dans les Réglages). */
export function PinPad({ title, hint, error, onComplete }: {
  title: string; hint?: string; error?: string; onComplete: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');

  const press = useCallback((digit: string) => {
    void haptic('light');
    setPin((p) => (p + digit).slice(0, PIN_LENGTH));
  }, []);

  // code complet : on laisse voir le dernier point une fraction de seconde, puis on valide
  useEffect(() => {
    if (pin.length < PIN_LENGTH) return;
    const t = setTimeout(() => { setPin(''); onComplete(pin); }, 120);
    return () => clearTimeout(t);
  }, [pin, onComplete]);

  // clavier physique (ordinateur, émulateur)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <div className="pinpad">
      <h1>{title}</h1>
      {hint && <p className="muted">{hint}</p>}
      <div className={`pin-dots ${error ? 'shake' : ''}`} aria-label={`${pin.length} chiffre(s) saisi(s) sur ${PIN_LENGTH}`} role="status">
        {Array.from({ length: PIN_LENGTH }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <p className="form-error pin-error" role="alert">{error ?? ''}</p>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)}>{d}</button>
        ))}
        <span />
        <button type="button" onClick={() => press('0')}>0</button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Effacer un chiffre">⌫</button>
      </div>
    </div>
  );
}

/** Verrouille l'app au lancement et après un passage en arrière-plan, si un code est défini. */
export default function AppLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(hasPin);
  const [error, setError] = useState<string>();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS && hasPin()) setLocked(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const unlock = useCallback(async (pin: string) => {
    if (await checkPin(pin)) {
      setError(undefined);
      setLocked(false);
      void haptic('success');
    } else {
      setError('Code incorrect');
      void haptic('error');
    }
  }, []);

  return (
    <>
      {/* le contenu reste monté (saisie en cours conservée) mais invisible et inaccessible */}
      <div hidden={locked} className="app-root">{children}</div>
      {locked && (
        <div className="lock-screen">
          <img src="/favicon.svg" alt="" width={48} height={48} />
          <PinPad title="Pécule est verrouillé" hint="Saisis ton code pour continuer." error={error} onComplete={unlock} />
        </div>
      )}
    </>
  );
}
