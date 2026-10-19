import { useCallback } from 'react';
import { api } from './api';
import { useStore } from './store';
import { useToast } from './components/Toast';

/**
 * Supprime tout de suite côté serveur, puis propose « Annuler » pendant 6 s :
 * le serveur réinsère alors les lignes à l'identique (POST /api/undo avec le jeton renvoyé par DELETE).
 */
export function useUndoDelete() {
  const { refresh } = useStore();
  const toast = useToast();
  return useCallback(async (url: string, message: string) => {
    try {
      const { undo } = await api.del<{ undo?: string }>(url);
      refresh();
      if (!undo) return toast({ message });
      toast({
        message, kind: 'action',
        action: {
          label: 'Annuler',
          onClick: () => api.post('/undo', { token: undo })
            .then(() => { refresh(); toast({ message: 'C’est rétabli.', kind: 'success', duration: 3000 }); })
            .catch((err: Error) => toast({ message: err.message, kind: 'error' })),
        },
      });
    } catch (err) {
      toast({ message: (err as Error).message, kind: 'error' });
    }
  }, [refresh, toast]);
}
