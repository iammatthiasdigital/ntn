import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // The ?mock=1 harness and its seed data exist in dev only: production
  // bundles carry the hosted block alone.
  define: { __MOCK__: JSON.stringify(mode !== "production") },
  // No preload polyfill: the bundle makes no requests of its own.
  build: { modulePreload: { polyfill: false } },
  server: {
    host: "127.0.0.1",
  },
}))
