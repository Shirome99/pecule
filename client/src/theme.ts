// Thème Clair / Sombre / Système : le choix est gardé dans localStorage et posé sur <html data-theme>.
export type Theme = 'light' | 'dark' | 'system';
const KEY = 'pecule_theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch { return 'system'; }
}

/** « Système » retire l'attribut : le CSS suit alors prefers-color-scheme. */
export function applyTheme(t: Theme = getTheme()) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

export function setTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
  applyTheme(t);
}
