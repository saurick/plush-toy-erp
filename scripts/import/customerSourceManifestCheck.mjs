#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `Customer source manifest checker

Usage:
  node scripts/import/customerSourceManifestCheck.mjs \\
    --manifest <source-manifest.json> \\
    --raw-dir <materialized-source-directory>

Options:
  --manifest <path>  Required. Manifest v2 file; relative paths resolve from cwd.
  --raw-dir <path>   Required. Materialized source root; relative paths resolve from cwd.
  --customer <key>   Optional. Require the manifest customerKey to match this key.
  --out <dir>        Optional. Write source-manifest-check.json/md evidence.
  --help             Print this help.

This checker validates import-preparation sources only. It never downloads objects, connects to a database, writes formal tables, generates SQL or migrations, or executes a real import.`

export const MANIFEST_CHECK_OUTPUT_FILES = [
  'source-manifest-check.json',
  'source-manifest-check.md',
]

const SOURCE_MEDIA_TYPES = new Map([
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
])
const SOURCE_EXTENSIONS = new Set(SOURCE_MEDIA_TYPES.keys())
const STRUCTURED_EXTRACT_EXTENSIONS = new Set(['.xlsx'])
const MAX_STRUCTURED_XLSX_BYTES = 128 * 1024 * 1024
const MANIFEST_KEYS = new Set(['version', 'customerKey', 'description', 'boundaries', 'sources'])
const BOUNDARY_KEYS = new Set([
  'noRealImport',
  'canExecuteRealImport',
  'createsTenant',
  'changesSchema',
  'writesBusinessRecords',
  'writesFacts',
])
const SOURCE_KEYS = new Set([
  'sourceId',
  'relativePath',
  'sha256',
  'sizeBytes',
  'mediaType',
  'sourceKind',
  'sourceTypes',
  'domains',
  'classification',
  'usage',
  'sensitiveReviewRequired',
  'duplicateGroup',
  'structuredExtract',
  'storage',
])
const STRUCTURED_EXTRACT_KEYS = new Set(['enabled', 'mode', 'parser', 'reason'])
const STORAGE_KEYS = new Set(['provider', 'bucketAlias', 'objectKey'])
const FORBIDDEN_MANIFEST_STRING_PATTERNS = [
  /\b(?:https?|s3|minio):\/\//iu,
  /\b(?:X-Amz-(?:Credential|Signature|Security-Token)|AWSAccessKeyId|accessKey|secretKey|sessionToken)\s*[=:]/iu,
  /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u,
  /(?:^|[\s"'(])(?:\/Users\/|\/home\/|\/tmp\/|[A-Za-z]:[\\/])/u,
]

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

export function parseCliArgs(argv) {
  const options = { help: false }

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
    if (inlineValue === undefined && value !== undefined && !value.startsWith('--')) {
      index += 1
    }
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new CliError(`Missing value for --${key}`, 2)
    }

    if (key === 'manifest') {
      options.manifest = value
    } else if (key === 'raw-dir') {
      options.rawDir = value
    } else if (key === 'customer') {
      options.customer = value
    } else if (key === 'out') {
      options.out = value
    } else {
      throw new CliError(`Unknown option: --${key}`, 2)
    }
  }

  if (!options.help) {
    requireOption(options.manifest, '--manifest')
    requireOption(options.rawDir, '--raw-dir')
  }
  return options
}

export async function runManifestCheck(options = {}) {
  const baseDir = resolveBaseDir(options.baseDir)
  const manifestPath = options.manifest ?? options.manifestPath
  requireOption(manifestPath, '--manifest')
  requireOption(options.rawDir, '--raw-dir')
  const result = await loadAndValidateSourceManifest({
    manifestPath,
    rawDir: options.rawDir,
    customer: options.customer,
    baseDir,
  })
  const report = buildManifestReport(result)

  if (options.out) {
    const outDir = await resolveSafeEvidenceOutputDirectory({
      outputDir: options.out,
      baseDir,
      manifestResult: result,
      outputFiles: MANIFEST_CHECK_OUTPUT_FILES,
    })
    await mkdir(outDir, { recursive: true })
    await writeJson(path.join(outDir, 'source-manifest-check.json'), result.summary)
    await writePrivateEvidenceFile(path.join(outDir, 'source-manifest-check.md'), report)
  }

  return {
    ...result,
    report,
  }
}

export async function loadAndValidateSourceManifest(options = {}) {
  const baseDir = resolveBaseDir(options.baseDir)
  const manifestInput = options.manifestPath ?? options.manifest
  requireOption(manifestInput, '--manifest')
  requireOption(options.rawDir, '--raw-dir')
  const manifestPath = resolveInputPath(manifestInput, baseDir)
  const rawDir = resolveInputPath(options.rawDir, baseDir)

  let raw
  let manifestRealPath
  try {
    manifestRealPath = await realpath(manifestPath)
    raw = await readFile(manifestPath)
  } catch {
    throw new CliError('cannot read source manifest')
  }

  let manifest
  try {
    manifest = JSON.parse(raw.toString('utf8'))
  } catch {
    throw new CliError('source manifest must contain valid JSON')
  }

  const entries = validateManifestShape(manifest)
  if (options.customer !== undefined) {
    validateCustomerKey(options.customer, '--customer')
    if (options.customer !== manifest.customerKey) {
      throw new CliError('source manifest customerKey does not match --customer')
    }
  }

  let realRawDir
  try {
    realRawDir = await realpath(rawDir)
    if (!(await stat(realRawDir)).isDirectory()) {
      throw new Error('not a directory')
    }
  } catch {
    throw new CliError('cannot read raw source directory')
  }

  const manifestSha256 = sha256(raw)
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
    if (sourcePaths.has(source.relativePath)) {
      errors.push(`${label}: duplicate relativePath`)
    }
    sourcePaths.add(source.relativePath)

    let safeRelativePath
    try {
      safeRelativePath = validateLogicalRelativePath(source.relativePath, `${label}.relativePath`)
    } catch (error) {
      errors.push(error.message)
      continue
    }

    const extension = path.posix.extname(safeRelativePath).toLowerCase()
    if (!SOURCE_EXTENSIONS.has(extension)) {
      errors.push(`${label}: unsupported source extension`)
      continue
    }
    if (source.mediaType !== SOURCE_MEDIA_TYPES.get(extension)) {
      errors.push(`${label}: mediaType does not match source extension`)
    }
    if (source.structuredExtract.enabled === true && !STRUCTURED_EXTRACT_EXTENSIONS.has(extension)) {
      errors.push(`${label}: structuredExtract is only supported for .xlsx sources`)
    }
    if (source.storage && path.posix.extname(source.storage.objectKey).toLowerCase() !== extension) {
      errors.push(`${label}: storage objectKey extension does not match relativePath`)
    }
    if (source.storage) {
      try {
        validateImmutableObjectKey(source.storage.objectKey, source.sourceId, extension, `${label}.storage.objectKey`)
      } catch (error) {
        errors.push(error.message)
      }
    }

    const candidatePath = path.resolve(rawDir, ...safeRelativePath.split('/'))
    if (!isPathWithin(path.resolve(rawDir), candidatePath)) {
      errors.push(`${label}: relativePath escapes raw source directory`)
      continue
    }

    let absolutePath
    let sourceStat
    let actualFile
    try {
      absolutePath = await realpath(candidatePath)
      if (!isPathWithin(realRawDir, absolutePath)) {
        errors.push(`${label}: source symlink escapes raw source directory`)
        continue
      }
      sourceStat = await stat(absolutePath)
      if (!sourceStat.isFile()) {
        errors.push(`${label}: source path is not a file`)
        continue
      }
      if (
        source.structuredExtract.enabled === true &&
        extension === '.xlsx' &&
        sourceStat.size > MAX_STRUCTURED_XLSX_BYTES
      ) {
        errors.push(`${label}: structured xlsx exceeds the extraction size limit`)
        continue
      }
      actualFile = await hashSourceFile(absolutePath, {
        maxBytes: source.structuredExtract.enabled === true && extension === '.xlsx'
          ? MAX_STRUCTURED_XLSX_BYTES
          : undefined,
      })
    } catch {
      errors.push(`${label}: source file cannot be read`)
      continue
    }

    const actualSha256 = actualFile.sha256
    if (actualSha256 !== source.sha256) {
      errors.push(`${label}: sha256 mismatch, expected ${source.sha256}, got ${actualSha256}`)
    }
    if (source.sizeBytes !== actualFile.sizeBytes) {
      errors.push(`${label}: sizeBytes mismatch, expected ${source.sizeBytes}, got ${actualFile.sizeBytes}`)
    }

    enrichedSources.push({
      ...source,
      relativePath: safeRelativePath,
      absolutePath,
      actualSha256,
      actualSizeBytes: actualFile.sizeBytes,
    })
  }

  let rawFiles
  try {
    rawFiles = await listRawSourceFiles(rawDir, realRawDir)
  } catch (error) {
    if (error instanceof CliError) {
      throw error
    }
    throw new CliError('cannot inspect raw source directory')
  }
  const manifestPathSet = new Set(
    entries
      .map((source) => {
        try {
          return validateLogicalRelativePath(source.relativePath, 'relativePath')
        } catch {
          return null
        }
      })
      .filter(Boolean),
  )
  const unregisteredCount = rawFiles.filter((rawFile) => !manifestPathSet.has(rawFile.relativePath)).length
  if (unregisteredCount > 0) {
    errors.push(`raw source directory contains ${unregisteredCount} unregistered file(s)`)
  }

  if (errors.length > 0) {
    throw new CliError(`source manifest validation failed:\n- ${errors.join('\n- ')}`)
  }

  const summary = {
    manifestName: path.basename(manifestPath),
    manifestSha256,
    version: manifest.version,
    customerKey: manifest.customerKey,
    sourceCount: enrichedSources.length,
    structuredExtractCount: enrichedSources.filter((source) => source.structuredExtract.enabled === true).length,
    manualReferenceCount: enrichedSources.filter((source) => source.structuredExtract.enabled !== true).length,
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
    manifestRealPath,
    manifestSha256,
    rawDir,
    rawDirReal: realRawDir,
    sources: enrichedSources,
    rawFiles,
    summary,
  }
}

export async function resolveSafeEvidenceOutputDirectory({
  outputDir,
  baseDir,
  manifestResult,
  outputFiles,
}) {
  requireOption(outputDir, '--out')
  if (!manifestResult || !Array.isArray(manifestResult.sources) || !Array.isArray(outputFiles)) {
    throw new CliError('cannot validate evidence output boundary', 2)
  }
  const resolvedOutputDir = await resolveProspectivePath(
    resolveInputPath(outputDir, resolveBaseDir(baseDir)),
  )
  try {
    const outputStat = await stat(resolvedOutputDir)
    if (!outputStat.isDirectory()) {
      throw new CliError('evidence output path must be a directory', 2)
    }
  } catch (error) {
    if (error instanceof CliError) {
      throw error
    }
    if (error?.code !== 'ENOENT') {
      throw new CliError('cannot inspect evidence output directory', 2)
    }
  }
  if (isPathWithin(manifestResult.rawDirReal, resolvedOutputDir)) {
    throw new CliError('evidence output directory must be outside the raw source directory', 2)
  }

  const protectedPaths = new Set([
    manifestResult.manifestRealPath,
    ...manifestResult.sources.map((source) => source.absolutePath),
  ])
  for (const outputFile of outputFiles) {
    if (path.basename(outputFile) !== outputFile) {
      throw new CliError('evidence output file names must not contain directories', 2)
    }
    const candidateOutputPath = path.join(resolvedOutputDir, outputFile)
    try {
      const outputStat = await lstat(candidateOutputPath)
      if (outputStat.isSymbolicLink() || !outputStat.isFile()) {
        throw new CliError('evidence output entries must be regular files, not links or directories', 2)
      }
    } catch (error) {
      if (error instanceof CliError) {
        throw error
      }
      if (error?.code !== 'ENOENT') {
        throw new CliError('cannot inspect evidence output entry', 2)
      }
    }
    const outputPath = await resolveProspectivePath(candidateOutputPath)
    if (protectedPaths.has(outputPath)) {
      throw new CliError('evidence output would overwrite a source manifest or source file', 2)
    }
  }
  return resolvedOutputDir
}

export function selectStructuredExtractSources(sources) {
  return sources
    .filter((source) => source.structuredExtract?.enabled === true)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-Hans-CN'))
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new CliError('source manifest must be a JSON object')
  }
  assertAllowedKeys(manifest, MANIFEST_KEYS, 'source manifest')
  if (manifest.version !== 2) {
    throw new CliError('source manifest version must be 2')
  }
  validateCustomerKey(manifest.customerKey, 'source manifest customerKey')
  if (manifest.description !== undefined) {
    requireString(manifest.description, 'source manifest description')
  }
  validateBoundaries(manifest.boundaries)
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new CliError('source manifest sources must be a non-empty array')
  }

  for (const [index, source] of manifest.sources.entries()) {
    const prefix = `sources[${index}]`
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new CliError(`${prefix} must be an object`)
    }
    assertAllowedKeys(source, SOURCE_KEYS, prefix)
    requireStableKey(source.sourceId, `${prefix}.sourceId`)
    requireString(source.relativePath, `${prefix}.relativePath`)
    if (typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(source.sha256)) {
      throw new CliError(`${prefix}.sha256 must be a lowercase SHA-256 hex digest`)
    }
    requireString(source.mediaType, `${prefix}.mediaType`)
    requireString(source.sourceKind, `${prefix}.sourceKind`)
    if (!Number.isInteger(source.sizeBytes) || source.sizeBytes <= 0) {
      throw new CliError(`${prefix}.sizeBytes must be a positive integer`)
    }
    if (source.sourceTypes !== undefined) {
      requireStringArray(source.sourceTypes, `${prefix}.sourceTypes`)
    }
    if (source.domains !== undefined) {
      requireStringArray(source.domains, `${prefix}.domains`)
    }
    requireString(source.classification, `${prefix}.classification`)
    if (source.usage !== undefined) {
      requireString(source.usage, `${prefix}.usage`)
    }
    if (source.sensitiveReviewRequired !== undefined && typeof source.sensitiveReviewRequired !== 'boolean') {
      throw new CliError(`${prefix}.sensitiveReviewRequired must be a boolean`)
    }
    if (source.duplicateGroup !== undefined) {
      requireStableKey(source.duplicateGroup, `${prefix}.duplicateGroup`)
    }
    if (!source.structuredExtract || typeof source.structuredExtract !== 'object' || Array.isArray(source.structuredExtract)) {
      throw new CliError(`${prefix}.structuredExtract must be an object`)
    }
    assertAllowedKeys(source.structuredExtract, STRUCTURED_EXTRACT_KEYS, `${prefix}.structuredExtract`)
    if (typeof source.structuredExtract.enabled !== 'boolean') {
      throw new CliError(`${prefix}.structuredExtract.enabled must be a boolean`)
    }
    if (source.structuredExtract.enabled === true) {
      requireString(source.structuredExtract.mode, `${prefix}.structuredExtract.mode`)
      if (source.structuredExtract.parser !== undefined) {
        requireString(source.structuredExtract.parser, `${prefix}.structuredExtract.parser`)
      }
      if (source.structuredExtract.reason !== undefined) {
        throw new CliError(`${prefix}.structuredExtract.reason is only allowed when enabled is false`)
      }
    } else {
      requireString(source.structuredExtract.reason, `${prefix}.structuredExtract.reason`)
      if (source.structuredExtract.mode !== undefined || source.structuredExtract.parser !== undefined) {
        throw new CliError(`${prefix}.structuredExtract mode and parser are only allowed when enabled is true`)
      }
    }
    if (source.storage !== undefined) {
      validateStorageReference(source.storage, `${prefix}.storage`)
    }
  }

  const bucketAliases = new Set(
    manifest.sources.map((source) => source.storage?.bucketAlias).filter(Boolean),
  )
  if (bucketAliases.size > 1) {
    throw new CliError('source manifest storage references must use one bucketAlias per customer')
  }
  assertNoForbiddenManifestStrings(manifest)

  return manifest.sources
}

function validateBoundaries(boundaries) {
  if (!boundaries || typeof boundaries !== 'object' || Array.isArray(boundaries)) {
    throw new CliError('source manifest boundaries must be an object')
  }
  assertAllowedKeys(boundaries, BOUNDARY_KEYS, 'source manifest boundaries')
  if (boundaries.canExecuteRealImport !== false) {
    throw new CliError('source manifest boundaries.canExecuteRealImport must be false')
  }
  if (boundaries.noRealImport !== undefined && boundaries.noRealImport !== true) {
    throw new CliError('source manifest boundaries.noRealImport must be true when present')
  }
  for (const key of ['createsTenant', 'changesSchema', 'writesBusinessRecords', 'writesFacts']) {
    if (boundaries[key] !== undefined && boundaries[key] !== false) {
      throw new CliError(`source manifest boundaries.${key} must be false when present`)
    }
  }
}

function validateStorageReference(storage, label) {
  if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
    throw new CliError(`${label} must be an object`)
  }
  for (const key of Object.keys(storage)) {
    if (!STORAGE_KEYS.has(key)) {
      throw new CliError(`${label} contains forbidden or unsupported field: ${key}`)
    }
  }
  if (storage.provider !== 'minio') {
    throw new CliError(`${label}.provider must be minio`)
  }
  if (typeof storage.bucketAlias !== 'string' || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(storage.bucketAlias)) {
    throw new CliError(`${label}.bucketAlias must be a logical lowercase alias`)
  }
  validateLogicalRelativePath(storage.objectKey, `${label}.objectKey`)
  if (storage.objectKey.includes('://')) {
    throw new CliError(`${label}.objectKey must not be a URL`)
  }
}

function assertAllowedKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new CliError(`${label} contains forbidden or unsupported field: ${key}`)
    }
  }
}

function assertNoForbiddenManifestStrings(value, label = 'source manifest') {
  if (typeof value === 'string') {
    if (FORBIDDEN_MANIFEST_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new CliError(`${label} must not contain URLs, credentials, or local absolute paths`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenManifestStrings(item, `${label}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }
  for (const [key, item] of Object.entries(value)) {
    assertNoForbiddenManifestStrings(item, `${label}.${key}`)
  }
}

function validateImmutableObjectKey(objectKey, sourceId, extension, label) {
  const segments = objectKey.split('/')
  if (
    segments.length !== 4 ||
    segments[0] !== 'sources' ||
    segments[1] !== sourceId ||
    !/^v\d{4}$/u.test(segments[2]) ||
    segments[3] !== `original${extension}`
  ) {
    throw new CliError(`${label} must use sources/<sourceId>/vNNNN/original.<ext>`)
  }
}

async function listRawSourceFiles(rawDir, realRawDir) {
  const files = []
  const activeRealDirectories = new Set()

  async function walk(directory, logicalPrefix) {
    const realDirectory = await realpath(directory)
    if (!isPathWithin(realRawDir, realDirectory)) {
      throw new CliError('raw source directory contains a symlink that escapes its root')
    }
    if (activeRealDirectories.has(realDirectory)) {
      throw new CliError('raw source directory contains a recursive directory symlink')
    }
    activeRealDirectories.add(realDirectory)
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const logicalPath = logicalPrefix ? `${logicalPrefix}/${entry.name}` : entry.name
      const candidate = path.join(directory, entry.name)
      let targetPath = candidate
      let targetStat
      if (entry.isSymbolicLink()) {
        targetPath = await realpath(candidate)
        if (!isPathWithin(realRawDir, targetPath)) {
          throw new CliError('raw source directory contains a symlink that escapes its root')
        }
        targetStat = await stat(targetPath)
      }
      if (entry.isDirectory() || targetStat?.isDirectory()) {
        await walk(targetPath, logicalPath)
        continue
      }
      if (!entry.isFile() && !targetStat?.isFile()) {
        continue
      }
      files.push({
        absolutePath: targetPath,
        relativePath: normalizeLogicalPath(logicalPath),
      })
    }
    activeRealDirectories.delete(realDirectory)
  }

  await walk(rawDir, '')
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'))
}

function validateLogicalRelativePath(value, label) {
  requireString(value, label)
  if (value.includes('\\')) {
    throw new CliError(`${label} must use POSIX separators`)
  }
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new CliError(`${label} must be relative`)
  }
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new CliError(`${label} contains an unsafe path segment`)
  }
  const normalized = path.posix.normalize(value)
  if (normalized !== value || normalized === '.') {
    throw new CliError(`${label} must be a normalized relative path`)
  }
  return normalized
}

function validateCustomerKey(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/u.test(value)) {
    throw new CliError(`${label} must be a stable lowercase key`)
  }
}

function requireStableKey(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u.test(value)) {
    throw new CliError(`${label} must be a stable key`)
  }
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new CliError(`${label} must be a non-empty array`)
  }
  value.forEach((item, index) => requireString(item, `${label}[${index}]`))
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError(`${label} must be a non-empty string`)
  }
}

function requireOption(value, optionName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CliError(`Missing required ${optionName}`, 2)
  }
}

function resolveBaseDir(baseDir) {
  if (baseDir === undefined) {
    return process.cwd()
  }
  requireString(baseDir, 'baseDir')
  return path.resolve(process.cwd(), baseDir)
}

function resolveInputPath(filePath, baseDir) {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(baseDir, filePath)
}

function isPathWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function normalizeLogicalPath(filePath) {
  return filePath.split(path.sep).join('/')
}

async function resolveProspectivePath(targetPath) {
  let current = path.resolve(targetPath)
  const missingSegments = []
  while (true) {
    try {
      const existingRealPath = await realpath(current)
      return path.join(existingRealPath, ...missingSegments.reverse())
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw new CliError('cannot resolve evidence output path', 2)
      }
      const parent = path.dirname(current)
      if (parent === current) {
        throw new CliError('cannot resolve evidence output path', 2)
      }
      missingSegments.push(path.basename(current))
      current = parent
    }
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
    '- source manifest matches the materialized source directory.',
    '- `canExecuteRealImport` remains `false`.',
    '- no source paths, local absolute paths, storage URLs, or credentials are included in this report.',
    '',
    '## Manifest / 清单',
    '',
    `- name: \`${summary.manifestName}\``,
    `- sha256: \`${summary.manifestSha256}\``,
    `- customerKey: \`${summary.customerKey}\``,
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
    ...selectStructuredExtractSources(result.sources).map(
      (source) => `- ${source.sourceId}: \`${source.actualSha256}\``,
    ),
    '',
  ]
  return `${lines.join('\n')}\n`
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function hashSourceFile(filePath, options = {}) {
  const hash = createHash('sha256')
  let sizeBytes = 0
  for await (const chunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
    sizeBytes += chunk.length
    if (options.maxBytes !== undefined && sizeBytes > options.maxBytes) {
      throw new CliError('source file exceeds the extraction size limit', 2)
    }
    hash.update(chunk)
  }
  return {
    sha256: hash.digest('hex'),
    sizeBytes,
  }
}

async function writeJson(filePath, value) {
  await writePrivateEvidenceFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function writePrivateEvidenceFile(filePath, content) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  let handle
  try {
    handle = await open(tempPath, 'wx', 0o600)
    await handle.writeFile(content)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(tempPath, filePath)
  } catch {
    if (handle) {
      await handle.close().catch(() => {})
    }
    await rm(tempPath, { force: true }).catch(() => {})
    throw new CliError('cannot write private evidence output', 2)
  }
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
