export function findTableScrollToolbar(wrapper) {
  const scope = wrapper?.closest('[data-table-scroll-scope]')
  return scope
    ? [...scope.querySelectorAll('[data-table-scroll-toolbar]')].find((node) => node.closest('[data-table-scroll-scope]') === scope)
    : null
}
