import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  base: '/text-extractor-hub/',
  plugins: [
    TanStackRouterVite(),
    react(),
  ],
  build: {
    outDir: 'dist',
  }
})