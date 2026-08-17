import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: { outDir: "../cli/viewer", emptyOutDir: true },
  server: { port: 4174, proxy: { "/api": "http://localhost:4173" } },
});
