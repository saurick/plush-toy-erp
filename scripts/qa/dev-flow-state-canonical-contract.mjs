import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function readContractSource(repoRoot, contractRef) {
  const absolutePath = resolve(repoRoot, contractRef.path)
  try {
    return readFileSync(absolutePath, 'utf8')
  } catch (error) {
    throw new Error(
      `cannot read canonical status contract ${contractRef.path}: ${error.message}`
    )
  }
}

function assertNonEmptyStates(states, contractRef) {
  if (!Array.isArray(states) || states.length === 0) {
    throw new Error(
      `canonical status contract ${contractRef.path} produced no states`
    )
  }
  if (
    states.some((state) => typeof state !== 'string' || state.length === 0) ||
    new Set(states).size !== states.length
  ) {
    throw new Error(
      `canonical status contract ${contractRef.path} produced invalid states`
    )
  }
  return Object.freeze(states)
}

function readEntCheck(repoRoot, contractRef) {
  const source = readContractSource(repoRoot, contractRef)
  const constraintMarker = `"${contractRef.constraint}"`
  const constraintIndex = source.indexOf(constraintMarker)
  if (constraintIndex < 0) {
    throw new Error(
      `canonical constraint ${contractRef.constraint} is missing from ${contractRef.path}`
    )
  }
  const declaration = source.slice(
    constraintIndex,
    source.indexOf('\n', constraintIndex) < 0
      ? source.length
      : source.indexOf('\n', constraintIndex)
  )
  const match = declaration.match(
    new RegExp(
      `${escapeRegExp(contractRef.field)}\\s+IN\\s*\\(([^)]+)\\)`,
      'u'
    )
  )
  if (!match) {
    throw new Error(
      `canonical constraint ${contractRef.constraint} does not declare ${contractRef.field} IN (...)`
    )
  }
  return assertNonEmptyStates(
    [...match[1].matchAll(/'([^']+)'/gu)].map((item) => item[1]),
    contractRef
  )
}

function readGoConstants(repoRoot, contractRef) {
  const source = readContractSource(repoRoot, contractRef)
  const pattern = new RegExp(
    `^\\s*${escapeRegExp(contractRef.prefix)}[A-Za-z0-9_]*\\s*=\\s*"([^"]+)"`,
    'u'
  )
  const states = []
  let started = false
  for (const line of source.split(/\r?\n/u)) {
    const match = line.match(pattern)
    if (match) {
      states.push(match[1])
      started = true
      continue
    }
    if (started && (line.trim() === '' || /^\s*[A-Za-z]/u.test(line))) {
      break
    }
  }
  return assertNonEmptyStates(
    states,
    contractRef
  )
}

function readMarkdownInlineSet(repoRoot, contractRef) {
  const source = readContractSource(repoRoot, contractRef)
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.includes(contractRef.marker))
  if (!line) {
    throw new Error(
      `canonical marker ${contractRef.marker} is missing from ${contractRef.path}`
    )
  }
  const tail = line.slice(line.indexOf(contractRef.marker) + contractRef.marker.length)
  const match = tail.match(
    /([a-z][a-z0-9_-]*(?:\s*\/\s*[a-z][a-z0-9_-]*)+)/u
  )
  if (!match) {
    throw new Error(
      `canonical marker ${contractRef.marker} has no inline status set`
    )
  }
  return assertNonEmptyStates(
    match[1].split('/').map((value) => value.trim()),
    contractRef
  )
}

export function readCanonicalStatusContract(repoRoot, contractRef) {
  if (!contractRef || typeof contractRef !== 'object') {
    throw new Error('canonical status contract reference is required')
  }
  switch (contractRef.kind) {
    case 'ent_check':
      return readEntCheck(repoRoot, contractRef)
    case 'go_const_prefix':
      return readGoConstants(repoRoot, contractRef)
    case 'markdown_inline_set':
      return readMarkdownInlineSet(repoRoot, contractRef)
    case 'ent_check_agreement': {
      if (!Array.isArray(contractRef.refs) || contractRef.refs.length < 2) {
        throw new Error('canonical status agreement requires at least two refs')
      }
      const [canonical, ...others] = contractRef.refs.map((ref) =>
        readCanonicalStatusContract(repoRoot, ref)
      )
      for (const states of others) {
        assert.deepEqual(
          states,
          canonical,
          'canonical status agreement refs have drifted'
        )
      }
      return canonical
    }
    default:
      throw new Error(
        `unsupported canonical status contract kind: ${String(contractRef.kind)}`
      )
  }
}

export function readCanonicalProcessContractCatalog(repoRoot) {
  const output = execFileSync('go', ['run', './cmd/contract-catalog'], {
    cwd: resolve(repoRoot, 'server'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const catalog = JSON.parse(output)
  if (
    !Array.isArray(catalog.processDefinitions) ||
    catalog.processDefinitions.length === 0 ||
    !catalog.branchTargets ||
    typeof catalog.branchTargets !== 'object'
  ) {
    throw new Error('canonical process contract catalog is incomplete')
  }
  return catalog
}
