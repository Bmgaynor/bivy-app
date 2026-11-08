import {
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

// Regenerate the PNG icons in public/ after editing public/icon.svg:
//   npx pwa-assets-generator --config apps/web/pwa-assets.config.ts
export default defineConfig({
  preset: minimal2023Preset,
  images: ["apps/web/public/icon.svg"],
});
