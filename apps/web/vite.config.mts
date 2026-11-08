/// <reference types="vitest" />
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Served as a project site under the bradgaynor.com user site, next to the
// compliance pages from apps/site (see .github/workflows/pages.yml).
const BASE = "/bivy-app/app/";

export default defineConfig({
  root: import.meta.dirname,
  base: BASE,
  cacheDir: "../../node_modules/.vite/apps/web",
  resolve: {
    alias: {
      "@bivy-app/sms-format": fileURLToPath(
        new URL("../../libs/sms-format/src/index.ts", import.meta.url),
      ),
    },
  },
  server: { port: 4200, host: "localhost" },
  preview: { port: 4200, host: "localhost" },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "icon.svg",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        name: "Bivy",
        short_name: "Bivy",
        description: "Compose a Bivy weather question to text.",
        start_url: `${BASE}index.html`,
        scope: BASE,
        display: "standalone",
        background_color: "#f7f6f2",
        theme_color: "#2f6b4f",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Everything the app needs, so it opens in airplane mode
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
  build: {
    outDir: "../../dist/apps/web",
    emptyOutDir: true,
    reportCompressedSize: false,
  },
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
    include: ["src/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
  },
});
