import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// Toasts réutilisables : succès, erreur, ou action (« Annuler »). Un seul à la fois, le plus récent remplace l'autre.
export type ToastKind = 'success' | 'error' | 'action';
export type ToastOptions = {
  message: string;
  kind?: ToastKind;
  action?: { label: string; onClick: () => void };
  /** durée d'affichage en ms (6 s par défaut) */
  duration?: number;
};

type Shown = ToastOptions & { id: number };
const Ctx = createContext<(t: ToastOptions) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Shown | null>(null);
  const next = useRef(0);
  const show = useCallback((t: ToastOptions) => setToast({ ...t, id: ++next.current }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration ?? 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const kind = toast?.kind ?? (toast?.action ? 'action' : 'success');
  return (
    <Ctx.Provider value={show}>
      {children}
      {/* la zone live existe toujours : les lecteurs d'écran annoncent chaque nouveau message */}
      <div className="toast-zone" role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}>
        {toast && (
          <div key={toast.id} className={`toast ${kind}`}>
            <span className="toast-msg">{toast.message}</span>
            {toast.action && (
              <button className="toast-btn" onClick={() => { toast.action!.onClick(); setToast(null); }}>{toast.action.label}</button>
            )}
            <button className="toast-close" onClick={() => setToast(null)} aria-label="Fermer le message">✕</button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
