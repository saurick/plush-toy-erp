function normalizeString(value = '') {
  return String(value || '').trim()
}

function normalizeStringList(values = []) {
  return Array.isArray(values)
    ? [...new Set(values.map(normalizeString).filter(Boolean))]
    : []
}

function permissionKeyOf(permission = {}) {
  return normalizeString(permission?.permission_key || permission?.key)
}

function permissionActionOf(permission = {}) {
  return normalizeString(permission?.action).toLowerCase()
}

function rawPermissionPages(permission = {}) {
  const pages = Array.isArray(permission?.usage?.pages)
    ? permission.usage.pages
    : []
  const seen = new Set()
  return pages
    .map((page, index) => ({
      key: normalizeString(page?.key),
      controlType: normalizeString(page?.control_type).toLowerCase(),
      index,
    }))
    .filter((page) => {
      if (!page.key || seen.has(page.key)) {
        return false
      }
      seen.add(page.key)
      return true
    })
}

export function normalizePermissionMenuOptions(menuOptions = []) {
  if (!Array.isArray(menuOptions)) {
    return []
  }
  return menuOptions
    .map((menu) => ({
      key: normalizeString(menu?.key),
      label: normalizeString(menu?.label) || '其他页面',
      path: normalizeString(menu?.path),
      requiredAny: normalizeStringList(menu?.required_any || menu?.requiredAny),
      requiredAll: normalizeStringList(menu?.required_all || menu?.requiredAll),
    }))
    .filter((menu) => menu.key && menu.path)
}

export function getPermissionMenuLinks(permission = {}, menuOptions = []) {
  const menuByKey = new Map(
    normalizePermissionMenuOptions(menuOptions).map((menu) => [menu.key, menu])
  )
  return rawPermissionPages(permission)
    .map((page) => ({
      ...page,
      menu: menuByKey.get(page.key),
    }))
    .filter((item) => Boolean(item.menu))
    .sort((left, right) => {
      const leftPageEntry = left.controlType === 'page' ? 0 : 1
      const rightPageEntry = right.controlType === 'page' ? 0 : 1
      return leftPageEntry - rightPageEntry || left.index - right.index
    })
    .map((item) => item.menu)
    .filter(Boolean)
}

export function getPrimaryPermissionMenuKey(permission = {}, menuOptions = []) {
  return getPermissionMenuLinks(permission, menuOptions)[0]?.key || ''
}

export function menuRequirementsSatisfied(menu = {}, permissionKeys = []) {
  const selected = new Set(normalizeStringList(permissionKeys))
  const requiredAny = normalizeStringList(
    menu?.required_any || menu?.requiredAny
  )
  const requiredAll = normalizeStringList(
    menu?.required_all || menu?.requiredAll
  )
  const anySatisfied =
    requiredAny.length === 0 ||
    requiredAny.some((permissionKey) => selected.has(permissionKey))
  const allSatisfied = requiredAll.every((permissionKey) =>
    selected.has(permissionKey)
  )
  return anySatisfied && allSatisfied
}

export function getMissingMenuPermissionKeys(menu = {}, permissionKeys = []) {
  const selected = new Set(normalizeStringList(permissionKeys))
  const requiredAny = normalizeStringList(
    menu?.required_any || menu?.requiredAny
  )
  const requiredAll = normalizeStringList(
    menu?.required_all || menu?.requiredAll
  )
  const missingAny = requiredAny.some((permissionKey) =>
    selected.has(permissionKey)
  )
    ? []
    : requiredAny.filter((permissionKey) => !selected.has(permissionKey))
  const missingAll = requiredAll.filter(
    (permissionKey) => !selected.has(permissionKey)
  )
  return { missingAny, missingAll }
}

export function buildLocalPermissionDraftAccess({
  menuOptions = [],
  permissionKeys = [],
  roleKey = '',
} = {}) {
  const menus = normalizePermissionMenuOptions(menuOptions)
  return {
    role_key: normalizeString(roleKey),
    source: 'local_permission_draft',
    is_final: false,
    is_preview: true,
    pages: menus.map((menu) => {
      const granted = menuRequirementsSatisfied(menu, permissionKeys)
      const { missingAny, missingAll } = getMissingMenuPermissionKeys(
        menu,
        permissionKeys
      )
      return {
        ...menu,
        required_any: menu.requiredAny,
        required_all: menu.requiredAll,
        missing_any: missingAny,
        missing_all: missingAll,
        rbac_granted: granted,
        effective: granted,
        reasons: granted
          ? []
          : [{ code: 'missing_rbac_permission', label: '还缺页面入口功能' }],
      }
    }),
  }
}

function isPageEntryPermission(permission = {}, menu = {}) {
  const permissionKey = permissionKeyOf(permission)
  if (!permissionKey) {
    return false
  }
  const required = [
    ...normalizeStringList(menu?.requiredAny),
    ...normalizeStringList(menu?.requiredAll),
  ]
  return required.includes(permissionKey)
}

function missingUnambiguousEntryKeys(menu = {}, selected = new Set()) {
  const missing = normalizeStringList(menu?.requiredAll).filter(
    (permissionKey) => !selected.has(permissionKey)
  )
  const requiredAny = normalizeStringList(menu?.requiredAny)
  if (
    requiredAny.length === 1 &&
    !requiredAny.some((permissionKey) => selected.has(permissionKey))
  ) {
    missing.push(requiredAny[0])
  }
  return normalizeStringList(missing)
}

export function reconcilePermissionSelection({
  previousKeys = [],
  requestedKeys = [],
  permissions = [],
  menuOptions = [],
} = {}) {
  const menus = normalizePermissionMenuOptions(menuOptions)
  const permissionByKey = new Map(
    (Array.isArray(permissions) ? permissions : [])
      .map((permission) => [permissionKeyOf(permission), permission])
      .filter(([permissionKey]) => Boolean(permissionKey))
  )
  const previous = new Set(normalizeStringList(previousKeys))
  const requested = new Set(normalizeStringList(requestedKeys))
  const addedPermissionKeys = [...requested].filter(
    (permissionKey) => !previous.has(permissionKey)
  )
  const removedPermissionKeys = [...previous].filter(
    (permissionKey) => !requested.has(permissionKey)
  )
  const autoAdded = []
  const autoRemoved = []

  addedPermissionKeys.forEach((permissionKey) => {
    const permission = permissionByKey.get(permissionKey)
    if (
      !permission ||
      ['access', 'read'].includes(permissionActionOf(permission))
    ) {
      return
    }
    const primaryMenu = getPermissionMenuLinks(permission, menus)[0]
    if (!primaryMenu || isPageEntryPermission(permission, primaryMenu)) {
      return
    }
    missingUnambiguousEntryKeys(primaryMenu, requested).forEach(
      (entryPermissionKey) => {
        if (
          permissionByKey.has(entryPermissionKey) &&
          !requested.has(entryPermissionKey)
        ) {
          requested.add(entryPermissionKey)
          autoAdded.push({
            permissionKey: entryPermissionKey,
            menuKey: primaryMenu.key,
          })
        }
      }
    )
  })

  removedPermissionKeys.forEach((permissionKey) => {
    const affectedMenus = menus.filter((menu) =>
      [...menu.requiredAny, ...menu.requiredAll].includes(permissionKey)
    )
    affectedMenus.forEach((menu) => {
      if (menuRequirementsSatisfied(menu, [...requested])) {
        return
      }
      const remainingPermissionKeys = [...requested]
      remainingPermissionKeys.forEach((candidateKey) => {
        const candidate = permissionByKey.get(candidateKey)
        if (
          !candidate ||
          ['access', 'read'].includes(permissionActionOf(candidate))
        ) {
          return
        }
        const links = getPermissionMenuLinks(candidate, menus)
        if (links.length === 1 && links[0]?.key === menu.key) {
          requested.delete(candidateKey)
          autoRemoved.push({
            permissionKey: candidateKey,
            menuKey: menu.key,
          })
        }
      })
    })
  })

  return {
    permissionKeys: [...requested],
    autoAdded,
    autoRemoved,
  }
}

export function getMenuPlacementMap(placement = {}) {
  const out = new Map()
  ;(Array.isArray(placement?.dashboardItems)
    ? placement.dashboardItems
    : []
  ).forEach((item) => {
    if (item?.path) out.set(item.path, '看板中心')
  })
  ;(Array.isArray(placement?.primaryItems)
    ? placement.primaryItems
    : []
  ).forEach((item) => {
    if (item?.path) out.set(item.path, '常用工作')
  })
  ;(Array.isArray(placement?.secondarySections)
    ? placement.secondarySections
    : []
  )
    .flatMap((section) => (Array.isArray(section?.items) ? section.items : []))
    .forEach((item) => {
      if (item?.path) out.set(item.path, '更多功能')
    })
  return out
}

export function getMenuPlacementOrderMap(placement = {}) {
  const out = new Map()
  let order = 0
  const addItems = (items = []) => {
    const normalizedItems = Array.isArray(items) ? items : []
    normalizedItems.forEach((item) => {
      if (item?.path && !out.has(item.path)) {
        out.set(item.path, order)
        order += 1
      }
    })
  }
  addItems(placement?.dashboardItems)
  addItems(placement?.primaryItems)
  const secondarySections = Array.isArray(placement?.secondarySections)
    ? placement.secondarySections
    : []
  secondarySections.forEach((section) => addItems(section?.items))
  return out
}
