import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Declared here rather than pulling in @types/node, whose globals would apply
// to the whole project and let browser code reference `process` unchallenged.
declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves the app from /<repo>/ rather than the domain root, so
// the deploy workflow sets this. Left as "/" everywhere else, including local
// dev and any host that serves from the root.
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered by hand in src/main.tsx, which also polls for new
      // builds and reloads when one takes over. Two registrations of the
      // same worker would race.
      injectRegister: null,
      includeAssets: ["favicon.svg"],
      manifest: {
        // Must match the base, or the installed PWA opens outside its own
        // scope and loses the service worker — which on this app means
        // losing offline mode, the whole point of it.
        start_url: base,
        scope: base,
        name: "Effé Barbering Shop",
        short_name: "Effé",
        description: "Offline-first point of sale for the shop floor",
        theme_color: "#07080A",
        background_color: "#07080A",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        // App shell only — transaction data flows through IndexedDB + the
        // sync engine (src/lib/sync.ts), never through the SW cache.
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        navigateFallback: `${base}index.html`,
        // A new build must replace the old one without being asked
        // twice: the tablet is not somewhere anyone will think to hard
        // refresh, and a stale app that still logs sales is worse than
        // one that visibly fails.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  }
});
