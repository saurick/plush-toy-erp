import { DEV_FLOW_EXPLORER_ROUTE } from '../config/devRoutes.mjs'
import {
  addBusinessChainMapNode,
  expandBusinessChainMap,
  focusBusinessChainMap,
  showBusinessChainWhole,
} from '../config/devBusinessChainMap.mjs'

export const DEV_FLOW_EXPLORER_BLANK_HREF = `${DEV_FLOW_EXPLORER_ROUTE}?new=blank`

export function buildDevFlowExplorerLocation(chainKey, nodeKey) {
  const params = new URLSearchParams({ chain: chainKey })
  if (nodeKey) params.set('node', nodeKey)
  return {
    pathname: DEV_FLOW_EXPLORER_ROUTE,
    search: `?${params}`,
  }
}

export function resolveDevFlowExplorerEntry(params, catalog) {
  if (params.size === 1 && params.get('new') === 'blank') return { entry: null, startBlank: true }
  for (const key of params.keys()) {
    if (!['chain', 'node'].includes(key) || params.getAll(key).length !== 1) {
      return { error: '探索入口无效，请从「业务链路」重新选择。' }
    }
  }
  if (!params.size) return { entry: null }
  const chain = catalog.businessChains.find(
    (item) => item.key === params.get('chain')
  )
  if (!chain) return { error: '找不到这条业务链路，请重新选择。' }
  const nodeKey = params.get('node')
  if (params.has('node') && !chain.nodes.some((node) => node.key === nodeKey)) {
    return { error: '这个节点不属于所选链路，请重新选择。' }
  }
  return { entry: { chainKey: chain.key, nodeKey } }
}

export function applyDevFlowExplorerEntry(draft, library, entry) {
  if (!entry.nodeKey) {
    return showBusinessChainWhole(draft, library, entry.chainKey)
  }
  const source = library.byId.get(`node:${entry.nodeKey}`)
  const node = library.byId.get(source.representedBy || source.id)
  const ids = node.splitInto || [node.id]
  let next = focusBusinessChainMap(draft, library, ids[0], 'all')
  for (const id of ids.slice(1)) {
    next = expandBusinessChainMap(
      addBusinessChainMapNode(next, library, id),
      library,
      id
    )
  }
  return {
    ...next,
    map: { ...next.map, chainKey: entry.chainKey },
    presentation: { ...draft.presentation, mode: 'all' },
  }
}
