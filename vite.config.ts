import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" => o build funciona em qualquer host (GitHub Pages, Vercel, etc.)
export default defineConfig({
  plugins: [react()],
  base: "./",
});
