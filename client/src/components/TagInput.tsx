import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { api, type Tag } from '../api';

/** Même normalisation que le serveur : « #Vacances Maroc » → « vacances-maroc ». */
export const normalizeTag = (s: string) => s.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-')
  .replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Saisie de tags : Entrée, virgule ou espace valide un tag ; suggestions parmi les tags existants. */
export default function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [text, setText] = useState('');
  const [known, setKnown] = useState<Tag[]>([]);
  const listId = useId();

  useEffect(() => { api.get<Tag[]>('/tags').then(setKnown).catch(() => {}); }, []);

  function commit(raw = text) {
    const tags = raw.split(/[\s,]+/).map(normalizeTag).filter((t) => t && !value.includes(t));
    if (tags.length) onChange([...value, ...tags].slice(0, 10));
    setText('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      if (!text.trim()) { if (e.key !== 'Enter') e.preventDefault(); return; }
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
  }

  return (
    <div className="field">
      <span id={`${listId}-label`}>Tags (facultatif)</span>
      <div className="tag-input">
        {value.map((t) => (
          <span key={t} className="tag">
            #{t}
            <button type="button" className="chip-x" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Retirer #${t}`}>✕</button>
          </span>
        ))}
        <input
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={() => commit()}
          list={listId} placeholder={value.length ? '' : '#vacances, #pro…'} aria-labelledby={`${listId}-label`}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
        />
        <datalist id={listId}>
          {known.filter((t) => !value.includes(t.name)).map((t) => <option key={t.name} value={t.name} />)}
        </datalist>
      </div>
    </div>
  );
}
