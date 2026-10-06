import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Version shown at the bottom of every page: package version + the commit it
// was built from (tells two builds of the same version apart) + build date.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {
  /* not a git checkout */
}
const build = { version: pkg.version, commit, date: new Date().toISOString().slice(0, 10) };

// Tauri's dev host (set by `tauri dev` when targeting a physical device);
// undefined for normal desktop dev.
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_BUILD__: JSON.stringify(build) },

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
