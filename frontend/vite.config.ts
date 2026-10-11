import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html"), research: resolve(import.meta.dirname, "research.html") } } },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/artifacts": "http://127.0.0.1:8000"
    }
  }
});
