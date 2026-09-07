import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@components": path.resolve(configDir, "src/components"),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3003',
    },
  },
  build: {
    outDir: "build",
  },
});
