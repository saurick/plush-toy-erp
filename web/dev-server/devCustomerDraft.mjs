import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CUSTOMER_KEY_PATTERN } from '../../config/customers/index.mjs'
import {
  CUSTOMER_DRAFT_JSON_FILE,
  CUSTOMER_DRAFT_JSON_FORMAT,
} from '../../config/customers/customerDraftConfig.mjs'
import { referenceCustomerPackage } from '../../config/customers/reference-customer/customerPackage.mjs'
import { customerPackageSchema } from '../../config/schemas/customerPackageSchema.mjs'
import { buildRuntimePreviewManifest } from '../../scripts/qa/customer-config-runtime-manifest.mjs'
import {
  acquireDevCustomerConfigExecutionLock,
  releaseDevCustomerConfigExecutionLock,
} from '../../scripts/qa/dev-customer-config-operation-store.mjs'

const draftOverrideKeys = new Set([
  'moduleStates',
  'roleProfiles',
  'fieldPolicyOverrides',
  'runtimeProcessSelections',
  'workPoolRoleOverrides',
  'printTemplateDefaults',
])

function draftError(statusCode, code) {
  return Object.assign(new Error(code), { statusCode, draftCode: code })
}

function readDraftIdentity(input) {
  const customerKey = typeof input?.customerKey === 'string' ? input.customerKey.trim() : ''
  const customerName = typeof input?.customerName === 'string' ? input.customerName.trim() : ''
  if (
    !CUSTOMER_KEY_PATTERN.test(customerKey) ||
    customerKey.length > customerPackageSchema.draftCustomerKeyMaxLength ||
    ['current', 'tenant'].includes(customerKey)
  ) {
    throw draftError(400, 'invalid_customer_key')
  }
  if (
    !customerName ||
    customerName.length > customerPackageSchema.draftCustomerNameMaxLength ||
    Array.from(customerName).some((character) => character.charCodeAt(0) < 32)
  ) {
    throw draftError(400, 'invalid_customer_name')
  }
  return { customerKey, customerName }
}

function draftFiles({ customerKey, customerName }, template) {
  const { customerPackage: overrides, desktopMenu } = template || {}
  if (
    !template || Object.keys(template).length !== 2 ||
    !overrides || typeof overrides !== 'object' || Array.isArray(overrides) ||
    Object.entries(overrides).some(([key, value]) =>
      !draftOverrideKeys.has(key) || (key === 'workPoolRoleOverrides'
        ? !value || typeof value !== 'object' || Array.isArray(value)
        : !Array.isArray(value))
    )
  ) {
    throw draftError(422, 'draft_template_invalid')
  }
  const customerPackage = {
    customerKey,
    packageKey: `${customerKey}-package`,
    label: customerName,
    status: referenceCustomerPackage.status,
    runtimeEnabled: referenceCustomerPackage.runtimeEnabled,
    sourcePolicy: {
      ...referenceCustomerPackage.sourcePolicy,
      trackedConfigFormat: CUSTOMER_DRAFT_JSON_FORMAT,
      localTestApplyEnabled: false,
    },
    boundaries: referenceCustomerPackage.boundaries,
    workflows: [],
    businessFlows: [],
    stateMachines: [],
    processPolicies: [],
    extensionPoints: [],
    ...overrides,
    desktopMenu,
  }
  try {
    buildRuntimePreviewManifest(customerPackage)
  } catch {
    throw draftError(422, 'draft_template_invalid')
  }
  return new Map([
    [CUSTOMER_DRAFT_JSON_FILE, `${JSON.stringify(customerPackage, null, 2)}\n`],
    ['README.md', '# 客户配置草稿\n\n草稿从[标准客户样例](../reference-customer/README.md#new-customer-draft)生成。客户确认后的差异及依据记录在此。\n'],
  ])
}

function registerDraft(indexSource, customerKey) {
  const opening = 'const customerPackageEntries = Object.freeze([\n'
  const start = indexSource.indexOf(opening)
  const end = indexSource.indexOf('\n]);', start)
  if (start < 0 || end < 0 || indexSource.indexOf(opening, start + 1) !== -1) {
    throw draftError(409, 'draft_registry_changed')
  }
  const entries = indexSource.slice(start + opening.length, end).split('\n')
  const keys = entries.map((entry) =>
    entry.match(/^\s*Object\.freeze\(\["([a-z0-9-]+)", [A-Za-z_$][\w$]*(?:, "customerPackage\.json")?\]\),$/u)?.[1]
  )
  if (keys.some((key) => !key)) throw draftError(409, 'draft_registry_changed')

  const alias = `customerDraft_${customerKey.replaceAll('-', '_')}`
  const importLine = `import ${alias} from "./${customerKey}/${CUSTOMER_DRAFT_JSON_FILE}" with { type: "json" };`
  const entry = `  Object.freeze(["${customerKey}", ${alias}, "${CUSTOMER_DRAFT_JSON_FILE}"]),`
  const existing = keys.indexOf(customerKey)
  if (existing !== -1) {
    if (entries[existing] === entry && indexSource.includes(`${importLine}\n`)) return indexSource
    throw draftError(409, 'customer_key_taken')
  }
  if (indexSource.includes(alias)) throw draftError(409, 'draft_registry_changed')
  const insertAt = keys.findIndex((key) => key > customerKey)
  entries.splice(insertAt === -1 ? entries.length : insertAt, 0, entry)
  return `${importLine}\n${indexSource.slice(0, start + opening.length)}${entries.join('\n')}${indexSource.slice(end)}`
}

async function readRegularFile(file) {
  if (!(await lstat(file)).isFile()) throw draftError(409, 'draft_registry_changed')
  return readFile(file)
}

async function draftMatches(directory, files) {
  try {
    if (!(await lstat(directory)).isDirectory() || (await readdir(directory)).length !== files.size) return false
    for (const [file, content] of files) {
      if (!(await readRegularFile(path.join(directory, file))).equals(Buffer.from(content))) return false
    }
    return true
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.draftCode === 'draft_registry_changed') return false
    throw error
  }
}

export async function createDevCustomerDraft({ projectRoot, store, input, onRegistered }) {
  const identity = readDraftIdentity(input)
  const { customerKey } = identity
  const operationId = randomUUID()
  if (!acquireDevCustomerConfigExecutionLock(store, operationId)) {
    throw draftError(409, 'draft_workspace_busy')
  }

  let temporary
  try {
    const configDir = path.join(projectRoot, 'config')
    const customersDir = path.join(configDir, 'customers')
    if (!(await lstat(configDir)).isDirectory() || !(await lstat(customersDir)).isDirectory()) {
      throw draftError(409, 'draft_registry_changed')
    }
    const indexPath = path.join(customersDir, 'index.mjs')
    const originalIndex = (await readRegularFile(indexPath)).toString('utf8')
    const nextIndex = registerDraft(originalIndex, customerKey)
    const directory = path.join(customersDir, customerKey)
    let template
    try {
      const templateDir = path.join(customersDir, 'reference-customer')
      if (!(await lstat(templateDir)).isDirectory()) throw draftError(422, 'draft_template_invalid')
      const templateFile = path.join(templateDir, 'customer-draft.template.json')
      template = JSON.parse(await readRegularFile(templateFile))
    } catch {
      throw draftError(422, 'draft_template_invalid')
    }
    const files = draftFiles(identity, template)
    const isMatchingDraft = await draftMatches(directory, files)
    if (nextIndex === originalIndex) {
      if (!isMatchingDraft) throw draftError(409, 'customer_key_taken')
      return { status: 'success', customerKey, created: false }
    }

    temporary = await mkdtemp(path.join(configDir, '.customer-draft-'))
    const nextIndexFile = path.join(temporary, 'index.mjs')
    await writeFile(nextIndexFile, nextIndex, { mode: (await lstat(indexPath)).mode % 0o1000 })
    if (!isMatchingDraft) {
      const candidate = path.join(temporary, 'package')
      await mkdir(candidate)
      for (const [file, content] of files) await writeFile(path.join(candidate, file), content)
      try {
        await mkdir(directory)
      } catch (error) {
        if (error?.code === 'EEXIST') throw draftError(409, 'customer_key_taken')
        throw error
      }
      try {
        await rename(candidate, directory)
      } catch (error) {
        await rmdir(directory).catch(() => {})
        throw error
      }
    }
    if (!(await draftMatches(directory, files))) {
      throw draftError(409, 'draft_registry_changed')
    }
    onRegistered?.(nextIndex)
    if ((await readRegularFile(indexPath)).toString('utf8') !== originalIndex) {
      throw draftError(409, 'draft_registry_changed')
    }
    await rename(nextIndexFile, indexPath)
    if ((await readRegularFile(indexPath)).toString('utf8') !== nextIndex) {
      throw draftError(409, 'draft_registry_changed')
    }
    console.info('[dev-customer-config]', JSON.stringify({ action: 'create-draft', operationId, customerKey, outcome: 'registered' }))
    return { status: 'success', customerKey, created: true }
  } finally {
    try {
      if (temporary) await rm(temporary, { force: true, recursive: true })
    } finally {
      releaseDevCustomerConfigExecutionLock(store, operationId)
    }
  }
}
