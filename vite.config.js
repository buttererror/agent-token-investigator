import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3333,
    proxy: {
      '/api': {
        target: 'http://localhost:3334',
        changeOrigin: true
      }
    }
  }
})
