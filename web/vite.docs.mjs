import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isFileServingAllowed } from 'vite'
import { getDevDocsTitle } from './src/dev-workbench/config/devDocs.mjs'

// Keep document titles searchable before the corresponding body is requested.
export function createDevDocsMetadataPlugin() {
  let devServer
  let build = false
  return {
    name: 'plush-dev-docs-metadata',
    enforce: 'pre',
    configResolved(config) {
      build = config.command === 'build'
    },
    configureServer(server) {
      devServer = server
    },
    async load(id) {
      if (!id.endsWith('.md?dev-doc-meta')) return null
      const file = id.slice(0, -'?dev-doc-meta'.length)
      if (devServer && !isFileServingAllowed(file, devServer)) {
        throw new Error('Document is outside Vite serving permissions')
      }
      this.addWatchFile(file)
      const source = await readFile(file, 'utf8')
      const sourceURL = build
        ? `import.meta.ROLLUP_FILE_URL_${this.emitFile({
            type: 'asset',
            name: `${path.basename(file)}.txt`,
            source,
          })}`
        : JSON.stringify(`/@fs/${file}`)
      return `export default {
        title: ${JSON.stringify(getDevDocsTitle(source, file))},
        loadSource: async () => {
          const response = await fetch(${sourceURL});
          if (!response.ok) throw new Error('Document request failed');
          return response.text();
        }
      }`
    },
  }
}
