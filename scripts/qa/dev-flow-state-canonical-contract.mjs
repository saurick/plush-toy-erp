import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ENT_SCHEMA_DIRECTORY = 'server/internal/data/model/schema'
const ENT_FIELD_DECLARATION_PATTERN = /field\.(?:String|Enum)\(\s*"([^"]+)"/gu
const STATUS_OWNER_FIELD_PATTERN = /(?:^status$|_status(?:_key)?$)/u
const STATUS_SNAPSHOT_FIELD_PATTERN = /^(?:from|to|original|previous)_/u

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function isStatusOwnerField(field) {
  return (
    STATUS_OWNER_FIELD_PATTERN.test(field) &&
    !STATUS_SNAPSHOT_FIELD_PATTERN.test(field)
  )
}

function schemaStatusOwnerIdentity({ path, field }) {
  return `${path}#${field}`
}

function normalizeSchemaStatusOwnerRef(value, context) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.path !== 'string' ||
    !value.path.startsWith(`${ENT_SCHEMA_DIRECTORY}/`) ||
    typeof value.field !== 'string' ||
    !isStatusOwnerField(value.field)
  ) {
    throw new Error(`${context} has an invalid schema status-owner reference`)
  }
  return Object.freeze({ path: value.path, field: value.field })
}

function collectEntSchemaStatusOwnerRefs(contractRef) {
  if (!contractRef || typeof contractRef !== 'object') return []
  if (contractRef.kind === 'ent_check_agreement') {
    return (contractRef.refs || []).flatMap(collectEntSchemaStatusOwnerRefs)
  }
  if (
    contractRef.kind !== 'ent_check' ||
    typeof contractRef.path !== 'string' ||
    !contractRef.path.startsWith(`${ENT_SCHEMA_DIRECTORY}/`) ||
    !isStatusOwnerField(contractRef.field)
  ) {
    return []
  }
  return [{ path: contractRef.path, field: contractRef.field }]
}

export function readCanonicalSchemaStatusOwners(repoRoot) {
  const schemaDirectory = resolve(repoRoot, ENT_SCHEMA_DIRECTORY)
  const owners = new Map()
  for (const entry of readdirSync(schemaDirectory, {
    withFileTypes: true,
  }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.go')) continue
    const path = `${ENT_SCHEMA_DIRECTORY}/${entry.name}`
    const source = readFileSync(resolve(schemaDirectory, entry.name), 'utf8')
    for (const match of source.matchAll(ENT_FIELD_DECLARATION_PATTERN)) {
      const field = match[1]
      if (!isStatusOwnerField(field)) continue
      const owner = Object.freeze({ path, field })
      const identity = schemaStatusOwnerIdentity(owner)
      if (owners.has(identity)) {
        throw new Error(`duplicate schema status-owner field: ${identity}`)
      }
      owners.set(identity, owner)
    }
  }
  return Object.freeze(
    [...owners.values()].sort((left, right) =>
      schemaStatusOwnerIdentity(left).localeCompare(
        schemaStatusOwnerIdentity(right)
      )
    )
  )
}

export function collectObservedSchemaStatusOwners(flows) {
  if (!Array.isArray(flows)) {
    throw new Error('observer flows are required')
  }
  const owners = new Map()
  for (const flow of flows) {
    if (!flow || typeof flow.key !== 'string' || flow.key.length === 0) {
      throw new Error('observer flow has no stable key')
    }
    const refs = [
      ...collectEntSchemaStatusOwnerRefs(flow.contractRef),
      ...(Array.isArray(flow.schemaStatusRefs) ? flow.schemaStatusRefs : []),
    ]
    for (const value of refs) {
      const ref = normalizeSchemaStatusOwnerRef(value, flow.key)
      const identity = schemaStatusOwnerIdentity(ref)
      const existing = owners.get(identity)
      if (existing) {
        throw new Error(
          `${identity} is mapped by both ${existing.flowKey} and ${flow.key}`
        )
      }
      owners.set(identity, Object.freeze({ ...ref, flowKey: flow.key }))
    }
  }
  return Object.freeze(
    [...owners.values()].sort((left, right) =>
      schemaStatusOwnerIdentity(left).localeCompare(
        schemaStatusOwnerIdentity(right)
      )
    )
  )
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
