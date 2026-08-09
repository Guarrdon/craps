import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The game is served from /games/craps/, not the root, so the build must not
  // assume where it lives. One relative build then runs anywhere: the portal, a
  // plain folder, a dev server. Getting this wrong is the usual cause of a
  // blank page, and deploy.sh refuses a build that has it wrong.
  base: './',
  server: { open: true },
  build: { target: 'es2020' },
})
