import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
