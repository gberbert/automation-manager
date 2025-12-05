import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      // workbox options removed because we are using injectManifest
      manifest: {
        id: '/',
        scope: '/',
        name: 'Automation Manager',
        short_name: 'AutoManager',
        description: 'Automate your LinkedIn posts with AI',
        categories: ['productivity', 'utilities'],
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // --- NOVO: CONFIGURAÇÃO DE SHARE TARGET ---
        share_target: {
          action: "/repost",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [
              {
                name: "media",
                accept: [
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  "image/gif",
                  ".jpg",
                  ".jpeg",
                  ".png",
                  ".webp",
                  ".gif"
                ]
              }
            ]
          }
        },
        // ------------------------------------------
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})