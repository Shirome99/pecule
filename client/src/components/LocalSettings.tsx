// Réglages propres à l'app mobile : sauvegarde, code de verrouillage, rappel, clé IA, effacement.
import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Modal from './Modal';
import { PinPad } from './AppLock';
import { useStore } from '../store';
import { useToast } from './Toast';
import { hasPin, removePin, setPin } from '../lock';
import { getReminder, setReminder } from '../reminders';
import { haptic, isNative, saveFile } from '../native';
import { restoreFromFile } from '../backup';

const BACKUP_AT = 'pecule_backup_at';
const readBackupAt = () => { try { return localStorage.getItem(BACKUP_AT); } catch { return null; } };
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function PinSetup({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const toast = useToast();

  const complete = useCallback(async (pin: string) => {
    if (!first) { setFirst(pin); setError(undefined); return; }
    if (pin !== first) { setFirst(null); setError('Les deux codes ne correspondent pas : recommence.'); void haptic('error'); return; }
    await setPin(pin);
    void haptic('success');
    toast({ message: 'Code activé : il sera demandé à l’ouverture de l’app.', kind: 'success', duration: 3000 });
    onDone();
  }, [first, onDone, toast]);

  return (
    <Modal title="Code de verrouillage" onClose={onDone}>
      <PinPad key={first ? 'confirm' : 'choose'} title={first ? 'Confirme ton code' : 'Choisis un code à 4 chiffres'} error={error} onComplete={complete} />
    </Modal>
  );
}

export default function LocalSettings() {
  const { refreshAi } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupAt, setBackupAt] = useState(readBackupAt);
  const [pin, setPinState] = useState(hasPin);
  const [pinSetup, setPinSetup] = useState(false);
  const [reminder, setReminderState] = useState(getReminder);
  const [aiKey, setAiKeyInput] = useState('');
  const [aiSaved, setAiSaved] = useState(() => { try { return !!localStorage.getItem('pecule_ai_key'); } catch { return false; } });

  async function exportBackup() {
    try {
      const { exportBackup } = await import('@pecule/local');
      const today = new Date().toISOString().slice(0, 10);
      await saveFile(`pecule-sauvegarde-${today}.sqlite`, await exportBackup(), 'application/vnd.sqlite3');
      const now = new Date().toISOString();
      localStorage.setItem(BACKUP_AT, now);
      setBackupAt(now);
    } catch (err) { toast({ message: `Sauvegarde impossible : ${(err as Error).message}`, kind: 'error' }); }
  }

  async function onRestore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { await restoreFromFile(file, true); }
    catch (err) { toast({ message: (err as Error).message, kind: 'error' }); }
  }

  function turnPinOff() {
    if (!window.confirm('Retirer le code de verrouillage ?')) return;
    removePin();
    setPinState(false);
  }

  async function changeReminder(next: typeof reminder) {
    try {
      if (!(await setReminder(next))) {
        toast({ message: 'Notifications refusées : autorise-les dans les réglages du téléphone.', kind: 'error' });
        return;
      }
      setReminderState(next);
    } catch (err) { toast({ message: (err as Error).message, kind: 'error' }); }
  }

  async function saveAiKey(e: FormEvent) {
    e.preventDefault();
    const { setAiKey } = await import('@pecule/local');
    await setAiKey(aiKey.trim());
    setAiSaved(!!aiKey.trim());
    setAiKeyInput('');
    refreshAi();
    toast({ message: aiKey.trim() ? 'Clé enregistrée : les fonctions IA sont disponibles.' : 'Clé retirée.', kind: 'success', duration: 3000 });
  }

  async function removeAiKey() {
    const { setAiKey } = await import('@pecule/local');
    await setAiKey('');
    setAiSaved(false);
    refreshAi();
  }

  async function eraseEverything() {
    if (!window.confirm('Effacer toutes les données de Pécule sur cet appareil ? Tous les profils, comptes et opérations seront supprimés.')) return;
    if (!window.confirm('Dernière confirmation : cette action est définitive. Continuer ?')) return;
    const { eraseAll } = await import('@pecule/local');
    await eraseAll();
    for (const k of ['pecule_token', 'pecule_user', BACKUP_AT]) localStorage.removeItem(k);
    removePin();
    window.location.replace('/');
  }

  return (
    <>
      <section className="panel" aria-labelledby="backup-title">
        <h2 id="backup-title">Sauvegarde</h2>
        <p className="muted">
          Tes données sont seulement sur ce téléphone. Enregistre une sauvegarde de temps en temps (Drive, mail, ordinateur) :
          elle te permet de tout retrouver sur un nouveau téléphone.
        </p>
        <p className={`small ${backupAt ? 'muted' : 'warn-text'}`}>
          {backupAt ? `Dernière sauvegarde : ${dayLabel(backupAt)}` : 'Aucune sauvegarde pour le moment.'}
        </p>
        <div className="form-actions start">
          <button className="btn primary" onClick={exportBackup}>Enregistrer une sauvegarde</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Restaurer…</button>
        </div>
        <input ref={fileRef} type="file" hidden onChange={onRestore} aria-label="Fichier de sauvegarde à restaurer" />
      </section>

      <section className="panel" aria-labelledby="lock-title">
        <h2 id="lock-title">Code de verrouillage</h2>
        <p className="muted">
          {pin ? 'Le code est demandé à l’ouverture de l’app et après 30 secondes en arrière-plan.'
            : 'Protège l’ouverture de l’app par un code à 4 chiffres.'}
        </p>
        <div className="form-actions start">
          {pin ? (
            <>
              <button className="btn ghost" onClick={() => setPinSetup(true)}>Changer le code</button>
              <button className="btn ghost danger" onClick={turnPinOff}>Retirer le code</button>
            </>
          ) : <button className="btn primary" onClick={() => setPinSetup(true)}>Activer le code</button>}
        </div>
      </section>
      {pinSetup && <PinSetup onDone={() => { setPinSetup(false); setPinState(hasPin()); }} />}

      {isNative && (
        <section className="panel" aria-labelledby="reminder-title">
          <h2 id="reminder-title">Rappel quotidien</h2>
          <label className="switch-row">
            <span>Me rappeler de noter mes dépenses</span>
            <input type="checkbox" role="switch" checked={reminder.enabled}
              onChange={(e) => changeReminder({ ...reminder, enabled: e.target.checked })} />
          </label>
          {reminder.enabled && (
            <label className="field"><span>Heure du rappel</span>
              <select value={reminder.hour} onChange={(e) => changeReminder({ ...reminder, hour: Number(e.target.value) })}>
                {Array.from({ length: 16 }, (_, i) => i + 8).map((h) => <option key={h} value={h}>{h} h</option>)}
              </select>
            </label>
          )}
        </section>
      )}

      <section className="panel" aria-labelledby="ai-title">
        <h2 id="ai-title">Assistant IA (facultatif)</h2>
        <p className="muted">
          Lecture des tickets en photo et questions sur ton budget, avec ta propre clé API Anthropic. Ces fonctions ont
          besoin d’Internet ; tout le reste de l’app fonctionne sans. La clé reste sur ce téléphone et n’est jamais incluse
          dans les sauvegardes.
        </p>
        {aiSaved ? (
          <div className="form-actions start">
            <span className="chip static">Clé enregistrée</span>
            <button className="btn ghost danger" onClick={removeAiKey}>Retirer la clé</button>
          </div>
        ) : (
          <form className="form" onSubmit={saveAiKey}>
            <label className="field"><span>Clé API Anthropic</span>
              <input type="password" value={aiKey} onChange={(e) => setAiKeyInput(e.target.value)} placeholder="sk-ant-…"
                autoComplete="off" spellCheck={false} required />
            </label>
            <div className="form-actions"><button className="btn primary">Enregistrer la clé</button></div>
          </form>
        )}
      </section>

      <section className="panel" aria-labelledby="erase-title">
        <h2 id="erase-title">Effacer les données</h2>
        <p className="muted">Supprime tous les profils et toutes les opérations de cet appareil. Pense à faire une sauvegarde avant.</p>
        <div className="form-actions start">
          <button className="btn ghost danger" onClick={eraseEverything}>Tout effacer</button>
        </div>
      </section>
    </>
  );
}
