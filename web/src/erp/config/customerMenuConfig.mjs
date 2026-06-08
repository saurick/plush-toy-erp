import { yoyoosunMenuConfig } from '../../../../config/customers/yoyoosun/menuConfig.mjs'

const bundledCustomerMenuConfigs = Object.freeze({
  yoyoosun: yoyoosunMenuConfig,
})

function normalizeCustomerKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeStringList(values = []) {
  if (!Array.isArray(values)) {
    return []
  }
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value)
}

function readRuntimeCustomerConfig() {
  if (typeof window === 'undefined') {
    return null
  }
  const runtimeConfig = window.__PLUSH_ERP_CUSTOMER_CONFIG__
  return runtimeConfig && typeof runtimeConfig === 'object'
    ? runtimeConfig
    : null
}

function readRuntimeCustomerKey() {
  if (typeof window !== 'undefined') {
    const windowKey = normalizeCustomerKey(window.__PLUSH_ERP_CUSTOMER_KEY__)
    if (windowKey) {
      return windowKey
    }
  }
  return normalizeCustomerKey(import.meta.env?.VITE_ERP_CUSTOMER_KEY)
}

export function getActiveCustomerMenuConfig() {
  const runtimeConfig = readRuntimeCustomerConfig()
  if (runtimeConfig?.desktopMenu) {
    return runtimeConfig
  }

  const customerKey =
    normalizeCustomerKey(runtimeConfig?.customerKey) || readRuntimeCustomerKey()
  return bundledCustomerMenuConfigs[customerKey] || null
}

function buildItemRegistry(sections = []) {
  const registry = new Map()
  sections.forEach((section) => {
    const items = section.items || []
    items.forEach((item) => {
      if (item?.key && !registry.has(item.key)) {
        registry.set(item.key, { item, sectionTitle: section.title })
      }
    })
  })
  return registry
}

function applyItemOverride(item, overrides = {}) {
  const override = overrides[item.key]
  if (!override || typeof override !== 'object') {
    return item
  }
  return {
    ...item,
    label:
      typeof override.label === 'string' && override.label.trim()
        ? override.label.trim()
        : item.label,
    shortLabel:
      typeof override.shortLabel === 'string' && override.shortLabel.trim()
        ? override.shortLabel.trim()
        : item.shortLabel,
    description:
      typeof override.description === 'string' && override.description.trim()
        ? override.description.trim()
        : item.description,
  }
}

function applyHiddenItems(
  sections = [],
  hiddenItemKeys = [],
  itemOverrides = {}
) {
  const hidden = new Set(hiddenItemKeys)
  return sections
    .map((section) => ({
      ...section,
      items: (section.items || [])
        .filter((item) => !hidden.has(item.key))
        .map((item) => applyItemOverride(item, itemOverrides)),
    }))
    .filter((section) => section.items.length > 0)
}

export function applyCustomerMenuConfig(
  baseSections = [],
  customerMenuConfig = getActiveCustomerMenuConfig()
) {
  const desktopMenu = customerMenuConfig?.desktopMenu
  if (!desktopMenu || typeof desktopMenu !== 'object') {
    return baseSections
  }

  const hiddenItemKeys = normalizeStringList(desktopMenu.hiddenItemKeys)
  const itemOverrides =
    desktopMenu.itemOverrides && typeof desktopMenu.itemOverrides === 'object'
      ? desktopMenu.itemOverrides
      : {}

  if (!Array.isArray(desktopMenu.sections)) {
    return applyHiddenItems(baseSections, hiddenItemKeys, itemOverrides)
  }

  const hidden = new Set(hiddenItemKeys)
  const registry = buildItemRegistry(baseSections)
  const used = new Set()
  const configuredSections = desktopMenu.sections
    .map((sectionConfig) => {
      const itemKeys = normalizeStringList(sectionConfig?.items)
      const items = itemKeys
        .filter((key) => !hidden.has(key) && !used.has(key))
        .map((key) => {
          const matched = registry.get(key)
          if (!matched) {
            return null
          }
          used.add(key)
          return applyItemOverride(matched.item, itemOverrides)
        })
        .filter(Boolean)

      if (items.length === 0) {
        return null
      }

      const firstSourceSection = registry.get(itemKeys[0])?.sectionTitle
      return {
        title:
          typeof sectionConfig?.title === 'string' && sectionConfig.title.trim()
            ? sectionConfig.title.trim()
            : firstSourceSection || '未分组',
        items,
      }
    })
    .filter(Boolean)

  return configuredSections.length > 0
    ? configuredSections
    : applyHiddenItems(baseSections, hiddenItemKeys, itemOverrides)
}
