import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Dev only: proxy API + served uploads to the local backend so relative
  // URLs (API_BASE = "") work the same as in production (nginx proxy).
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/.uploads": "http://localhost:8000",
      "/uploads": "http://localhost:8000",
    },
  },
})
