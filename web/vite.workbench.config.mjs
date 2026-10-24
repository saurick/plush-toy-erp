import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { getDeploymentTarget } from '../scripts/deploy/deployment-targets.mjs'
import workbenchTarget from '../server/deploy/workbench/target.json' with { type: 'json' }
import { createDevDocsMetadataPlugin } from './vite.docs.mjs'

const root = import.meta.dirname

export default defineConfig({
  root,
  define: {
    'import.meta.env.PLUSH_STANDALONE_WORKBENCH': true,
    'import.meta.env.PLUSH_WORKBENCH_BUSINESS_ORIGIN': JSON.stringify(
      new URL(getDeploymentTarget(workbenchTarget.businessTarget).publicEntry.endpoint).origin
    ),
  },
  plugins: [react(), createDevDocsMetadataPlugin()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  build: {
    outDir: 'build-workbench',
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      input: path.join(root, 'workbench.html'),
      output: {
        // The authenticated server exposes this one icon before login.
        assetFileNames: (asset) => asset.names.includes('favicon-dev.svg')
          ? 'favicon-dev.svg'
          : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
