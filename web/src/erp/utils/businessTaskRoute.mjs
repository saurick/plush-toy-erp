export function mobileBusinessRole(pathname = '') {
  return /^\/m\/([a-z_]+)(?:\/|$)/u.exec(pathname)?.[1] || ''
}

export function canonicalBusinessPath(path = '') {
  return String(path).replace(/^\/m\/[a-z_]+\/(?:tasks\/[1-9][0-9]*\/)?handle\//u, '/erp/')
}

export function mobileBusinessPath(path, roleKey) {
  if (path && typeof path === 'object' && typeof path.pathname === 'string' && path.pathname.startsWith('/erp')) {
    const original = `${path.pathname}${path.search || ''}${path.hash || ''}`
    const mapped = mobileBusinessPath(original, roleKey)
    if (mapped === original) return path
    const url = new URL(mapped, 'https://erp.invalid')
    return { ...path, pathname: url.pathname, search: url.search, hash: url.hash }
  }
  if (typeof path !== 'string' || !/^[a-z_]+$/u.test(roleKey || '')) return path
  if (/^\/erp(?:[?#]|$)/u.test(path) || /^\/erp\/(?:task-board|dashboard)(?:[?#]|$)/u.test(path)) {
    const url = new URL(path, 'https://erp.invalid')
    const search = url.searchParams.get('tracking') === 'visible'
      ? url.search
      : url.searchParams.has('link_task') ? `?${new URLSearchParams({ link_task: url.searchParams.get('link_task') })}` : ''
    return `/m/${roleKey}/tasks${search}${url.hash}`
  }
  if (/^\/erp\/help-center(?:[?#]|$)/u.test(path)) return `/m/${roleKey}/handle/${path.slice(5)}`
  return path.startsWith('/erp/') ? `/m/${roleKey}/tasks` : path
}
