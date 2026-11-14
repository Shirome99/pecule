import type { CapacitorConfig } from '@capacitor/cli';

// App mobile Pécule : le build `npm run build:mobile` (dist-mobile) est embarqué dans l'app Android / iOS.
// Toutes les données restent sur l'appareil : aucune URL de serveur n'est configurée.
const config: CapacitorConfig = {
  appId: 'app.pecule.budget',
  appName: 'Pécule',
  webDir: 'dist-mobile',
  backgroundColor: '#123b3a',
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000, // masqué plus tôt par l'app dès qu'elle est prête
      backgroundColor: '#123b3a',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
    },
    // bord à bord : la WebView suit viewport-fit=cover et env(safe-area-inset-*) reçoit les bonnes valeurs
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover' },
    LocalNotifications: { iconColor: '#d9902f' },
  },
  android: {
    // l'app n'appelle que l'API Anthropic (facultatif) en HTTPS
    allowMixedContent: false,
  },
};

export default config;
