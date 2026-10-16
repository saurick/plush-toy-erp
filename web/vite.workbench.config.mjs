import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const root = import.meta.dirname

export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  build: {
    outDir: 'build-workbench',
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: { input: path.join(root, 'workbench.html') },
  },
})
