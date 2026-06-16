#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `Customer source manifest checker

Usage:
  node scripts/import/customerSourceManifestCheck.mjs \\
    --manifest docs/customers/yoyoosun/source-manifest.json \\
    --raw-dir docs/customers/yoyoosun/raw-source-files

Options:
  --manifest <path>  Optional. Defaults to docs/customers/yoyoosun/source-manifest.json.
  --raw-dir <path>   Optional. Defaults to docs/customers/yoyoosun/raw-source-files.
  --out <dir>        Optional. Write source-manifest-check.json/md evidence.
  --help             Print this help.

This checker validates the tracked customer source inventory only. It never connects to a database, reads server config, writes formal tables, writes business_records, generates SQL, generates migrations, or executes a real import.`

export const DEFAULT_SOURCE_MANIFEST = 'docs/customers/yoyoosun/source-manifest.json'
export const DEFAULT_RAW_SOURCE_DIR = 'docs/customers/yoyoosun/raw-source-files'
export const MANIFEST_CHECK_OUTPUT_FILES = [
  'source-manifest-check.json',
  'source-manifest-check.md',
]

const SOURCE_EXTENSIONS = new Set(['.xlsx', '.pdf', '.png', '.jpg', '.jpeg'])
const STRUCTURED_EXTRACT_EXTENSIONS = new Set(['.xlsx'])
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

export function parseCliArgs(argv) {
  const options = {
    manifest: DEFAULT_SOURCE_MANIFEST,
    rawDir: DEFAULT_RAW_SOURCE_DIR,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }
    if (!token.startsWith('--')) {
      throw new CliError(`Unexpected argument: ${token}`, 2)
    }

    const equalIndex = token.indexOf('=')
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex)
    const inlineValue = equalIndex === -1 ? undefined : token.slice(equalIndex + 1)
    const value = inlineValue ?? argv[index + 1]
    if (inlineValue === undefined) {
      index += 1
    }
    if (value === undefined || value.startsWith('--')) {
      throw new CliError(`Missing value for --${key}`, 2)
    }

    if (key === 'manifest') {
      options.manifest = value
    } else if (key === 'raw-dir') {
      options.rawDir = value
    } else if (key === 'out') {
      options.out = value
    } else {
      throw new CliError(`Unknown option: --${key}`, 2)
    }
  }

  return options
}

export async function runManifestCheck(options = {}) {
  const manifestPath = options.manifest ?? DEFAULT_SOURCE_MANIFEST
  const rawDir = options.rawDir ?? DEFAULT_RAW_SOURCE_DIR
  const result = await loadAndValidateSourceManifest({ manifestPath, rawDir })
  const report = buildManifestReport(result)

  if (options.out) {
    await mkdir(options.out, { recursive: true })
    await writeJson(path.join(options.out, 'source-manifest-check.json'), result.summary)
    await writeFile(path.join(options.out, 'source-manifest-check.md'), report, 'utf8')
  }

  return {
    ...result,
    report,
  }
}

export async function loadAndValidateSourceManifest(options = {}) {
  const manifestPath = resolveRepoPath(options.manifestPath ?? DEFAULT_SOURCE_MANIFEST)
  const rawDir = resolveRepoPath(options.rawDir ?? DEFAULT_RAW_SOURCE_DIR)
  const raw = await readFile(manifestPath)
  const manifestSha256 = sha256(raw)
  const manifest = JSON.parse(raw.toString('utf8'))

  const entries = validateManifestShape(manifest)
  const sourceIds = new Set()
  const sourcePaths = new Set()
  const enrichedSources = []
  const errors = []

  for (const [index, source] of entries.entries()) {
    const label = source.sourceId || `sources[${index}]`
    if (sourceIds.has(source.sourceId)) {
      errors.push(`${label}: duplicate sourceId`)
    }
    sourceIds.add(source.sourceId)
    if (sourcePaths.has(source.path)) {
      errors.push(`${label}: duplicate path ${source.path}`)
    }
    sourcePaths.add(source.path)

    const absolutePath = resolveRepoPath(source.path)
    const extension = path.extname(source.path).toLowerCase()
    if (!SOURCE_EXTENSIONS.has(extension)) {
      errors.push(`${label}: unsupported source extension ${extension}`)
    }

    let sourceStat
    let fileRaw
    try {
      sourceStat = await stat(absolutePath)
      fileRaw = await readFile(absolutePath)
    } catch (error) {
      errors.push(`${label}: cannot read ${source.path}: ${error.message}`)
      continue
    }

    if (!sourceStat.isFile()) {
      errors.push(`${label}: source path is not a file`)
    }
    const actualSha256 = sha256(fileRaw)
    if (actualSha256 !== source.sha256) {
      errors.push(`${label}: sha256 mismatch, expected ${source.sha256}, got ${actualSha256}`)
    }
    if (source.sizeBytes !== fileRaw.length) {
      errors.push(`${label}: sizeBytes mismatch, expected ${source.sizeBytes}, got ${fileRaw.length}`)
    }

    const structuredExtract = source.structuredExtract ?? {}
    if (structuredExtract.enabled === true && !STRUCTURED_EXTRACT_EXTENSIONS.has(extension)) {
      errors.push(`${label}: structuredExtract is only supported for .xlsx sources`)
    }

    enrichedSources.push({
      ...source,
      absolutePath,
      actualSha256,
      actualSizeBytes: fileRaw.length,
    })
  }

  const rawFiles = await listRawSourceFiles(rawDir)
  const manifestPathSet = new Set(entries.map((source) => normalizeRepoPath(source.path)))
  for (const rawFile of rawFiles) {
    if (!manifestPathSet.has(normalizeRepoPath(rawFile.relativePath))) {
      errors.push(`raw source file is not listed in manifest: ${rawFile.relativePath}`)
    }
  }

  if (errors.length > 0) {
    throw new CliError(`source manifest validation failed:\n- ${errors.join('\n- ')}`)
  }

  const summary = {
    manifestPath: normalizeRepoPath(path.relative(repoRoot, manifestPath)),
    manifestSha256,
    version: manifest.version,
    customerKey: manifest.customerKey,
    sourceCount: enrichedSources.length,
    structuredExtractCount: enrichedSources.filter((source) => source.structuredExtract?.enabled === true).length,
    manualReferenceCount: enrichedSources.filter((source) => source.structuredExtract?.enabled !== true).length,
    rawDir: normalizeRepoPath(path.relative(repoRoot, rawDir)),
    rawFileCount: rawFiles.length,
    countsBySourceKind: countBy(enrichedSources, 'sourceKind'),
    countsByMediaType: countBy(enrichedSources, 'mediaType'),
    noRealImport: true,
    canExecuteRealImport: false,
    generatedBy: 'scripts/import/customerSourceManifestCheck.mjs',
  }

  return {
    manifest,
    manifestPath,
    manifestSha256,
    rawDir,
    sources: enrichedSources,
    rawFiles,
    summary,
  }
}

export function selectStructuredExtractSources(sources) {
  return sources
    .filter((source) => source.structuredExtract?.enabled === true)
    .sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'))
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new CliError('source manifest must be a JSON object')
  }
  if (manifest.version !== 1) {
    throw new CliError('source manifest version must be 1')
  }
  if (manifest.customerKey !== 'yoyoosun') {
    throw new CliError('source manifest customerKey must be yoyoosun')
  }
  if (!manifest.boundaries || manifest.boundaries.canExecuteRealImport !== false) {
    throw new CliError('source manifest boundaries.canExecuteRealImport must be false')
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new CliError('source manifest sources must be a non-empty array')
  }

  for (const [index, source] of manifest.sources.entries()) {
    const prefix = `sources[${index}]`
    requireString(source.sourceId, `${prefix}.sourceId`)
    requireString(source.path, `${prefix}.path`)
    requireString(source.sha256, `${prefix}.sha256`)
    requireString(source.mediaType, `${prefix}.mediaType`)
    requireString(source.sourceKind, `${prefix}.sourceKind`)
    if (!Number.isInteger(source.sizeBytes) || source.sizeBytes <= 0) {
      throw new CliError(`${prefix}.sizeBytes must be a positive integer`)
    }
    if (!Array.isArray(source.sourceTypes) || source.sourceTypes.length === 0) {
      throw new CliError(`${prefix}.sourceTypes must be a non-empty array`)
    }
    if (!Array.isArray(source.domains) || source.domains.length === 0) {
      throw new CliError(`${prefix}.domains must be a non-empty array`)
    }
    if (!source.structuredExtract || typeof source.structuredExtract !== 'object') {
      throw new CliError(`${prefix}.structuredExtract must be an object`)
    }
  }

  return manifest.sources
}

async function listRawSourceFiles(rawDir) {
  const entries = await readdir(rawDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const absolutePath = path.join(rawDir, entry.name)
      return {
        absolutePath,
        relativePath: path.relative(repoRoot, absolutePath),
      }
    })
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError(`${label} must be a non-empty string`)
  }
}

function countBy(items, key) {
  const counts = {}
  for (const item of items) {
    const value = item[key] ?? 'unknown'
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

function buildManifestReport(result) {
  const summary = result.summary
  const lines = [
    '# Source Manifest Check / 来源清单校验',
    '',
    '## Decision / 结论',
    '',
    '- source manifest matches tracked raw source files.',
    '- `canExecuteRealImport` remains `false`.',
    '- PDF and images remain manual references unless explicitly marked for a future reviewed parser.',
    '',
    '## Inputs / 输入',
    '',
    `- manifest: \`${summary.manifestPath}\``,
    `- manifestSha256: \`${summary.manifestSha256}\``,
    `- rawDir: \`${summary.rawDir}\``,
    '',
    '## Counts / 统计',
    '',
    `- sourceCount: ${summary.sourceCount}`,
    `- structuredExtractCount: ${summary.structuredExtractCount}`,
    `- manualReferenceCount: ${summary.manualReferenceCount}`,
    `- rawFileCount: ${summary.rawFileCount}`,
    '',
    '## Structured Extract Sources / 可结构化提取来源',
    '',
    ...selectStructuredExtractSources(result.sources).map((source) => `- ${source.sourceId}: \`${source.path}\``),
    '',
  ]
  return `${lines.join('\n')}\n`
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath)
}

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/')
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2))
    if (options.help) {
      console.log(USAGE)
      return
    }
    const result = await runManifestCheck(options)
    console.log(`sourceCount: ${result.summary.sourceCount}`)
    console.log(`structuredExtractCount: ${result.summary.structuredExtractCount}`)
    console.log('canExecuteRealImport: false')
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message)
      process.exitCode = error.exitCode
      return
    }
    throw error
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
