import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { peculeBackend } from './vite.backend.ts'

/** App mobile : pas de Google Fonts (la police est embarquée, l'app doit marcher hors ligne). */
const noRemoteFonts = (): Plugin => ({
  name: 'pecule-no-remote-fonts',
  transformIndexHtml: (html) => html.replace(/\s*<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, ''),
})

export default defineConfig(({ mode }) => {
  // `--mode mobile` : données sur l'appareil, serveur embarqué, empaqueté par Capacitor (dist-mobile)
  const mobile = mode === 'mobile'
  return {
    define: { 'import.meta.env.VITE_LOCAL': JSON.stringify(mobile ? '1' : '') },
    plugins: [
      react(),
      ...(mobile
        ? [peculeBackend(), noRemoteFonts()]
        : [VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
          manifest: {
            name: 'Pécule',
            short_name: 'Pécule',
            description: 'Sache chaque mois où part ton argent, et ce qu’il te reste.',
            lang: 'fr',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            background_color: '#eef1ef',
            theme_color: '#123b3a',
            icons: [
              { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            // le shell de l'app est servi hors ligne ; l'API n'est jamais mise en cache
            navigateFallback: '/index.html',
            navigateFallbackDenylist: [/^\/api\//],
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
                handler: 'StaleWhileRevalidate',
                options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
              },
            ],
          },
        })]),
    ],
    // mode local : vrai moteur (SQLite + serveur embarqué) en mobile, module vide en web
    resolve: { alias: { '@pecule/local': fileURLToPath(new URL(mobile ? './src/local/mobile.ts' : './src/local/web.ts', import.meta.url)) } },
    build: mobile ? { outDir: 'dist-mobile' } : undefined,
    // mode mobile en dev : dépendances pré-optimisées d'emblée (sinon Vite recharge la page à leur découverte)
    optimizeDeps: mobile ? { include: ['sql.js', '@capacitor/core', '@capacitor/app', '@capacitor/splash-screen', '@capacitor/haptics', '@capacitor/filesystem', '@capacitor/share', '@capacitor/local-notifications'] } : undefined,
    server: { proxy: mobile ? undefined : { '/api': process.env.API_PROXY || 'http://localhost:4000' } },
  }
})
