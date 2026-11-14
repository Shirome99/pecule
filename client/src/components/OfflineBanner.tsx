import { useEffect, useState } from 'react';
import { LOCAL } from '../api';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // app mobile : les données sont sur l'appareil, rien ne manque hors ligne
  if (!offline || LOCAL) return null;
  return <div className="offline-banner" role="status">Hors ligne : tes données s'afficheront au retour du réseau</div>;
}
