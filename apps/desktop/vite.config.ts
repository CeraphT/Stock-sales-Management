import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri's dev host (set by `tauri dev` when targeting a physical device);
// undefined for normal desktop dev.
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Tauri expects a fixed port and shouldn't clobber Rust's terminal output.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // Never let Vite try to watch Rust build artifacts.
      ignored: ["**/src-tauri/**"],
    },
    // @stockflow/core lives outside apps/desktop (packages/core) — let Vite
    // read the workspace root so the deep-import TS sources resolve.
    fs: { allow: ["../.."] },
  },

  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },

  // @stockflow/core is a source-only workspace package (exports .ts) — don't
  // pre-bundle it; let Vite/esbuild transpile it on the fly like app source.
  optimizeDeps: { exclude: ["@stockflow/core"] },
});
