import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// VAPID public key — pode ficar no código (é a chave pública de Web Push)
const VAPID_PUBLIC_KEY =
  "BGi2gNRP8_4mYwoFYbrLgRWsnxq7QM7Klhywz-FmPQYwP86sVzoqYoUGozT-8qjFrkPVAA8rfvmuVo020HyglYI";

// Build ID único por build → força novo Service Worker + banner de update.
const BUILD_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

// Injeta BUILD_ID no sw.js e gera version.json a cada build,
// sobrescrevendo os arquivos já copiados de /public para /dist.
function stampServiceWorker(): Plugin {
  return {
    name: "stamp-service-worker",
    apply: "build",
    closeBundle() {
      const srcPath = path.resolve(__dirname, "public/sw.js");
      const outPath = path.resolve(__dirname, "dist/sw.js");
      if (fs.existsSync(srcPath)) {
        const source = fs.readFileSync(srcPath, "utf8").replace(/__BUILD_ID__/g, BUILD_ID);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, source);
      }
      // version.json — usado pelo app pra detectar updates mesmo se sw.js
      // estiver cacheado pelo iOS.
      const versionPath = path.resolve(__dirname, "dist/version.json");
      fs.writeFileSync(versionPath, JSON.stringify({ buildId: BUILD_ID }));
    },
  };
}



// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_VAPID_PUBLIC_KEY": JSON.stringify(VAPID_PUBLIC_KEY),
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID),
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
    stampServiceWorker(),
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
