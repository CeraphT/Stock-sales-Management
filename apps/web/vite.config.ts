import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // @stockflow/core lives outside apps/web (packages/core) — let Vite read
    // the workspace root so the deep-import TS sources resolve.
    fs: { allow: ["../.."] },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // @stockflow/core is a source-only workspace package (exports .ts) — don't
  // pre-bundle it; let Vite/esbuild transpile it on the fly like app source.
  optimizeDeps: { exclude: ["@stockflow/core"] },
});
