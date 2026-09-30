import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
        materials: resolve(__dirname, 'materials.html'),
        lab: resolve(__dirname, 'lab.html'),
        studio: resolve(__dirname, 'ai-studio.html'),
        visualiser: resolve(__dirname, 'visualiser.html'),
        services: resolve(__dirname, 'services.html'),
        journal: resolve(__dirname, 'journal.html'),
        contact: resolve(__dirname, 'contact.html'),
        catalogue: resolve(__dirname, 'catalogue.html'),
        estimator: resolve(__dirname, 'estimator.html'),
        profile: resolve(__dirname, 'profile.html'),
      },
    },
  },
})
