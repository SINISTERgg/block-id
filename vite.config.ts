import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Vendor chunk splitting.
 * Gives stable, independently-cacheable chunks so a change to one vendor
 * (or to app code) doesn't force browsers to re-download the whole 500 KB
 * entry bundle. Also lets the browser cache each vendor lib across deploys.
 *
 * Every node_modules module is assigned to a named chunk (a "family" when
 * related, otherwise its own package chunk). This prevents Rollup from
 * merging shared runtime helpers (e.g. Vite's modulepreload polyfill) into a
 * giant vendor chunk that ends up on the first-paint critical path.
 */
const manualChunks = (id: string): string | undefined => {
  // Vite's modulepreload polyfill AND its __vitePreload preload-helper are
  // virtual modules. If left unassigned, Rollup merges them into an arbitrary
  // manual chunk — importing the preload helper pulls that chunk (e.g. the PDF
  // exporter) onto the first-paint critical path. Pin both to their own tiny
  // "runtime" chunk so no heavy vendor ever rides along with them.
  const norm = id.replace(/\\/g, "/");
  if (norm.includes("modulepreload-polyfill") || norm.includes("preload-helper")) return "runtime";

  if (!id.includes("node_modules")) return undefined;
  const p = id.replace(/\\/g, "/").replace(/^.*?\/node_modules\//, "");

  if (/^(react|react-dom|react-is|scheduler)\//.test(p)) return "react-vendor";
  if (/^(react-router|react-router-dom)\//.test(p) || /^@remix-run\//.test(p)) return "router";
  if (/^@tanstack\//.test(p) || /^zustand\//.test(p)) return "state";
  if (/^@supabase\//.test(p)) return "supabase";
  if (/^ethers\//.test(p)) return "ethers";
  if (/^(framer-motion|motion-dom|motion-utils)\//.test(p)) return "animation";
  if (/^(recharts|victory-vendor)\//.test(p) || /^d3(-[^/]+)?\//.test(p)) return "charts";
  if (/^(jspdf|html2canvas|canvg|svg-pathdata)\//.test(p)) return "pdf";
  if (
    /^@radix-ui\//.test(p) ||
    /^(sonner|next-themes|react-day-picker|cmdk|vaul|input-otp|react-resizable-panels|embla-carousel-react|react-hook-form|@hookform|tailwind-merge|clsx|class-variance-authority|lucide-react)\//.test(p)
  )
    return "ui";

  // Everything else: one chunk per top-level package (e.g. lodash, core-js).
  // Grouping by package root keeps the chunk count sane and cacheable.
  const packageRoot = p.split("/").slice(0, p.startsWith("@") ? 2 : 1).join("/");
  return packageRoot || undefined;
};

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "DecentraID - Decentralized Identity Platform",
        short_name: "DecentraID",
        description: "W3C Verifiable Credentials & DID management on Ethereum Sepolia",
        theme_color: "#030304",
        background_color: "#030304",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-css",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-files",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/zkp\/.*\.(wasm|zkey)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "zkp-artifacts",
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
    reportCompressedSize: true,
    chunkSizeWarningLimit: 600,
  },
}));
