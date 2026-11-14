// Intégration native (Capacitor) : sans effet dans un navigateur, sauf saveFile qui retombe sur un téléchargement.
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

type HapticKind = 'light' | 'medium' | 'success' | 'warning' | 'error';

/** Petit retour tactile (téléphone uniquement). */
export async function haptic(kind: HapticKind = 'light') {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (kind === 'light') await Haptics.impact({ style: ImpactStyle.Light });
    else if (kind === 'medium') await Haptics.impact({ style: ImpactStyle.Medium });
    else await Haptics.notification({ type: kind === 'success' ? NotificationType.Success : kind === 'warning' ? NotificationType.Warning : NotificationType.Error });
  } catch { /* pas de vibreur : sans importance */ }
}

/** Enregistre un fichier : feuille de partage sur téléphone (Drive, mail, Fichiers…), téléchargement sinon. */
export async function saveFile(name: string, data: string | Uint8Array, mime: string) {
  if (isNative) {
    const [{ Filesystem, Directory, Encoding }, { Share }, { toBase64 }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'), import('./local/storage'),
    ]);
    const written = typeof data === 'string'
      ? await Filesystem.writeFile({ path: name, directory: Directory.Cache, data, encoding: Encoding.UTF8 })
      : await Filesystem.writeFile({ path: name, directory: Directory.Cache, data: toBase64(data) });
    try {
      await Share.share({ title: name, files: [written.uri], dialogTitle: 'Enregistrer ou envoyer' });
    } catch (err) {
      // fermer la feuille de partage n'est pas une erreur
      if (!/cancel/i.test(String((err as Error)?.message))) throw err;
    }
    return;
  }
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Couleur du texte des barres système selon le thème affiché. */
export function syncSystemBars() {
  if (!isNative) return;
  const forced = document.documentElement.getAttribute('data-theme');
  const dark = forced ? forced === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}

/** À l'ouverture : bouton retour Android, enregistrement en arrière-plan, écran de démarrage, barres système. */
export async function initNative(options: { onPause: () => void }) {
  if (!isNative) return;
  const [{ App }, { SplashScreen }] = await Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen')]);

  // retour : ferme d'abord la fenêtre ouverte, puis revient en arrière, puis quitte l'app
  App.addListener('backButton', ({ canGoBack }) => {
    if (document.querySelector('.modal')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } else if (canGoBack && window.location.pathname !== '/') {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
  App.addListener('pause', options.onPause);

  syncSystemBars();
  new MutationObserver(syncSystemBars).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncSystemBars);

  SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
}
