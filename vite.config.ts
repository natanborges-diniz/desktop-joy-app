import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// VAPID public key — pode ficar no código (é a chave pública de Web Push)
const VAPID_PUBLIC_KEY =
  "BGi2gNRP8_4mYwoFYbrLgRWsnxq7QM7Klhywz-FmPQYwP86sVzoqYoUGozT-8qjFrkPVAA8rfvmuVo020HyglYI";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_VAPID_PUBLIC_KEY": JSON.stringify(VAPID_PUBLIC_KEY),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false, // registramos manualmente em main.tsx com guards
      devOptions: {
        enabled: false, // SW NÃO roda em dev — preserva preview do Lovable
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
      },
      manifest: false, // usamos public/manifest.webmanifest existente
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
}));
