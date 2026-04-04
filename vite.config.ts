import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: ".", // project root
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        dm: path.resolve(__dirname, "src/dm/index.html"),
        player: path.resolve(__dirname, "src/player/index.html")
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});