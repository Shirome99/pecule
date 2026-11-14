// Point d'entrée du mode mobile, importé via l'alias `@pecule/local` (vite.config.ts) : en version web, l'alias
// pointe vers ./web.ts et rien de ce qui suit (SQLite, serveur embarqué, police) n'entre dans le build.
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import '@fontsource/instrument-sans/700.css';
import { flush } from './engine';
import { initNative } from '../native';
import { listenReminderTap } from '../reminders';

export * from './engine';

/** Au démarrage de l'app mobile : intégration native et enregistrement de la base en arrière-plan. */
export function initMobile() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
  void initNative({ onPause: () => void flush() });
  void listenReminderTap();
}
