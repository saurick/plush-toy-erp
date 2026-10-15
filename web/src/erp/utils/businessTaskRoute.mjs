export function mobileBusinessRole(pathname = '') {
  return /^\/m\/([a-z_]+)\/(?:handle|tasks)(?:\/|$)/u.exec(pathname)?.[1] || ''
}

export function canonicalBusinessPath(path = '') {
  return String(path).replace(/^\/m\/[a-z_]+\/handle\//u, '/erp/')
}

export function mobileBusinessPath(path, roleKey) {
  if (typeof path !== 'string' || !/^[a-z_]+$/u.test(roleKey || '')) return path
  if (/^\/erp\/(?:task-board|dashboard)(?:[?#]|$)/u.test(path)) {
    const search = path.includes('?') ? `?${path.split('?')[1]}` : ''
    return `/m/${roleKey}/tasks${new URLSearchParams(search).get('tracking') === 'visible' ? search : ''}`
  }
  return path.startsWith('/erp/') ? `/m/${roleKey}/handle/${path.slice(5)}` : path
}
