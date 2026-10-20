import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), { name: "local-parking-home", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/") { res.writeHead(302, { Location: "/parking.html" }); res.end(); }
      else next();
    });
  } }],
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, "index.html"), research: resolve(import.meta.dirname, "research.html"), parking: resolve(import.meta.dirname, "parking.html") } } },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/artifacts": "http://127.0.0.1:8000"
    }
  }
});
