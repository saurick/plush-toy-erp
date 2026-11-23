import React, { useId, useRef, useState } from 'react'
import { Button, Checkbox } from 'antd'
import { CheckOutlined, MenuFoldOutlined } from '@ant-design/icons'
import AnchoredControlPopover, { FilterPopoverButton } from '@/common/components/overlay/AnchoredControlPopover.jsx'
import FilterPopoverPanel from '@/common/components/overlay/FilterPopoverPanel.jsx'
import SearchInput from '@/common/components/SearchInput.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import { diagramDomainStyle } from '@/common/components/diagram/diagramSemantics.mjs'
import AppEmpty from '@/common/components/empty/AppEmpty.jsx'
import Directory, { DirectoryBranch, DirectoryItem } from '@/common/components/navigation/Directory.jsx'
import useDirectoryExpansion from '@/common/components/navigation/useDirectoryExpansion.js'
import {
  CHAIN_CONNECTION_LABELS,
  CHAIN_DESIGN_DOMAINS,
  CHAIN_DESIGN_TYPES,
  assessBusinessChainConnection,
} from '../../config/devBusinessChainDesign.mjs'
import {
  CHAIN_NODE_VIEWS,
  filterBusinessChainEntries,
  businessChainFacetOptions,
} from '../../config/devBusinessChainNodeCatalog.mjs'

const options = (items) =>
  Object.entries(items).map(([value, label]) => ({ value, label }))
function filtersWithinScope(filters, nodeScope, chainKey) {
  const currentChain = nodeScope === 'current' && chainKey !== 'all' ? chainKey : ''
  return { ...filters, chain: filters.chain || currentChain }
}

const emptyFacets = { domain: '', type: '', role: '', chain: '' }

export default function BusinessChainNodeLibrary({
  id: libraryId,
  hidden = false,
  library,
  present,
  selectedNodeId,
  connecting,
  onAdd,
  onInspect,
  onOpenChain,
  onToggle,
  onShowResults,
  children,
  filters,
  setFilters,
  chainKey,
  nodeScope,
  setNodeScope,
  listRef,
}) {
  const [searchReset, setSearchReset] = useState(0)
  const [nextOnly, setNextOnly] = useState(true)
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const panel = useRef(null)
  const id = useId()
  const change = (value, nextScope) => {
    if (nextScope) setNodeScope(nextScope)
    setFilters((previous) => ({ ...previous, ...value }))
    onShowResults()
  }
  const effectiveFilters = filtersWithinScope(filters, nodeScope, chainKey)
  const allowed =
    connecting && nextOnly
      ? new Set(
          library.nodes
            .filter(
              (node) =>
                assessBusinessChainConnection(library, connecting, node.id)
                  .status === 'known'
            )
            .map((node) => node.representedBy || node.id)
        )
      : null
  const entries = filterBusinessChainEntries(library, effectiveFilters, allowed)
  const branchKeys = entries.filter(({ nodes }) => nodes.length > 1).map(({ key }) => key)
  const expansion = useDirectoryExpansion(branchKeys)
  const term = filters.search.trim()
  const matchingChains = term && !connecting ? library.chains.filter(({ label }) => label.includes(term)) : []
  const fields = [
    {
      key: 'domain',
      label: '业务领域',
      options: options(CHAIN_DESIGN_DOMAINS),
    },
    { key: 'type', label: '节点类型', options: options(CHAIN_DESIGN_TYPES) },
    { key: 'role', label: '参与岗位', options: library.roles },
    { key: 'chain', label: '来源链路', options: library.chains },
  ]
  const activeFields = fields.filter(({ key }) => filters[key])
  const viewLabel = CHAIN_NODE_VIEWS.find((view) => view.value === filters.view).label
  const filterSummary = [
    viewLabel,
    ...activeFields.map(({ key, label, options: fieldOptions }) =>
      `${label}：${fieldOptions.find(({ value }) => value === filters[key])?.label}`
    ),
  ].join(' · ')
  const quickViews = CHAIN_NODE_VIEWS.filter(({ value }) => ['steps', 'tasks', 'exceptions'].includes(value))
  const expandedScope = nodeScope === 'all' && chainKey !== 'all'
  const count = activeFields.length + Number(expandedScope) + Number(!quickViews.some(({ value }) => value === filters.view))
  const close = () => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
  }
  const card = (node, variant = false) => {
    const status = connecting
      ? assessBusinessChainConnection(library, connecting, node.id).status
      : null
    const title = variant ? node.variantLabel || node.chainLabel : node.label
    const actionLabel = variant ? `${node.label}（${title}）` : title
    const descriptionId = `${id}-node-${node.id}`
    const canAdd = !present.has(node.id)
    return (
      <div
        key={node.id}
        className={
          variant
            ? 'erp-chain-design__library-variant'
            : 'erp-chain-design__library-item'
        }
        data-domain={node.domain}
        style={diagramDomainStyle(node.domain)}
        data-candidate={status}
        draggable={canAdd}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-plush-chain-node', node.id)
          event.dataTransfer.effectAllowed = 'copy'
        }}
      >
        <DirectoryItem
          aria-label={`查看：${actionLabel}`}
          aria-describedby={descriptionId}
          aria-current={selectedNodeId === node.id ? 'true' : undefined}
          onClick={(event) => onInspect(node.id, event.currentTarget)}
        >
          <span className="erp-chain-design__library-icon"><DiagramNodeIcon type={node.type} /></span>
          <span className="erp-chain-design__library-copy">
            <strong>{title}</strong>
            <small id={descriptionId}>
              <span>{CHAIN_DESIGN_DOMAINS[node.domain]} · {CHAIN_DESIGN_TYPES[node.type]}</span>
              {!variant && (chainKey === 'all' || nodeScope === 'all') && <span>{node.chainLabel}</span>}
              {node.catalogKind === 'group' && <span>含独立步骤</span>}
              {status && <span>{CHAIN_CONNECTION_LABELS[status]}</span>}
            </small>
          </span>
        </DirectoryItem>
        {canAdd && (
          <Button size="small" aria-label={`加入：${actionLabel}`} onClick={() => onAdd(node.id)}>加入</Button>
        )}
      </div>
    )
  }
  const searchTools = (
    <div className="erp-chain-design__search-tools" role="group" aria-label="查找节点">
      <SearchInput
        aria-label="搜索链路或业务节点"
        placeholder="查找链路、步骤、单据或岗位"
        resetKey={`${chainKey}:${searchReset}`}
        value={filters.search}
        onSearch={(search) => change({ search })}
        onSubmitted={onShowResults}
        allowClear
      />

      <FilterChipGroup
        aria-label="节点快捷筛选"
        value={filters.view}
        options={quickViews}
        onChange={(view) => change({ view, type: '' })}
      />
      <AnchoredControlPopover
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomLeft"
        getPopupContainer={(element) => element.closest('.erp-chain-design-shell') || element.parentElement}
        classNames={{ root: 'erp-chain-node-filter-popover' }}
        afterOpenChange={(visible) => {
          if (visible) panel.current?.focus({ preventScroll: true })
        }}
        content={
          <section
            ref={panel}
            id={id}
            tabIndex={-1}
            role="dialog"
            aria-label="筛选业务节点"
            className="erp-chain-node-filters"
            onKeyDownCapture={closeOnEscape}
          >
            <FilterPopoverPanel
              panelRef={panel}
              fieldsClassName="erp-chain-node-filters__fields"
              onClear={() => change(emptyFacets, 'current')}
              clearDisabled={!activeFields.length && !expandedScope}
              onDismiss={close}
            >
              <section aria-label="来源链路">
                <FilterField
                  label={
                    <span className="erp-chain-node-filters__source-heading">
                      <span>来源链路</span>
                      <Button
                        size="small"
                        type="text"
                        disabled={!filters.chain}
                        onClick={() => change({ chain: '' })}
                      >
                        清空来源链路
                      </Button>
                    </span>
                  }
                >
                  {library.chainOptionGroups.length > 0 ? (
                    <div className="erp-chain-node-filters__source-groups">
                      {library.chainOptionGroups.map(({ key, label, options }) => (
                        <FilterChipGroup
                          key={key}
                          label={label}
                          value={filters.chain}
                          options={options}
                          selectedIndicator={<CheckOutlined aria-hidden="true" />}
                          onChange={(chain) => change({ chain }, 'all')}
                        />
                      ))}
                    </div>
                  ) : (
                    <AppEmpty variant="inline" description="暂无来源链路" />
                  )}
                </FilterField>
              </section>
              <FilterChipGroup
                label="搜索范围"
                aria-label="节点库范围"
                value={chainKey === 'all' ? 'all' : nodeScope}
                options={[
                  { value: 'current', label: '当前链', disabled: chainKey === 'all' },
                  { value: 'all', label: '全库' },
                ]}
                onChange={(scope) => change(scope === 'current' ? { chain: '' } : {}, scope)}
              />
              <FilterChipGroup
                label="常用视角"
                value={filters.view}
                options={CHAIN_NODE_VIEWS}
                onChange={(view) => change({ view, type: '' })}
              />
              {fields.filter(({ key }) => key !== 'chain').map((field) => (
                <section key={field.key} aria-label={field.label}>
                  <FilterChipGroup
                    label={field.label}
                    aria-label={`按${field.label}筛选`}
                    value={filters[field.key]}
                    options={businessChainFacetOptions(
                      library,
                      effectiveFilters,
                      field.key,
                      [{ value: '', label: '全部' }, ...field.options],
                      allowed,
                    )}
                    onChange={(value) => change({ [field.key]: value })}
                  />
                </section>
              ))}
            </FilterPopoverPanel>
          </section>
        }
      >
        <FilterPopoverButton
          ref={trigger}
          count={count}
          aria-label={`筛选业务节点 · ${filterSummary}`}
          title={filterSummary}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onKeyDown={closeOnEscape}
        />
      </AnchoredControlPopover>
    </div>
  )
  const resultsPanel = (
    <Directory
      as="aside"
      id={libraryId}
      hidden={hidden}
      className="erp-chain-design__library"
      aria-label="业务节点库"
      headerClassName="erp-chain-design__library-heading"
      title={(
        <>
          <h2>节点库</h2>
          <span role="status" aria-label="节点筛选结果" title={`全库 ${library.chains.length} 条链路`}>
            <strong>{entries.length} 项匹配</strong> / 全库 {library.entries.length} 项
          </span>
        </>
      )}
      allExpanded={expansion.allExpanded}
      onToggleAll={branchKeys.length ? expansion.toggleAll : undefined}
      actions={<Button type="text" icon={<MenuFoldOutlined />} aria-label="收起节点库面板" title="收起节点库" onClick={onToggle} />}
    >
      <small className="erp-chain-design__library-summary">{chainKey === 'all' || nodeScope === 'all' ? '全库' : '当前链'} · {filterSummary}{filters.search ? ` · “${filters.search}”` : ''}</small>
      {matchingChains.length > 0 && (
        <div className="erp-chain-design__chain-results" role="group" aria-label="匹配链路">
          <span>匹配链路</span>
          {matchingChains.map(({ value, label }) => <Button key={value} size="small" onClick={() => onOpenChain(value)}>{label}</Button>)}
        </div>
      )}
      {connecting && (
        <Checkbox
          checked={nextOnly}
          onChange={(event) => setNextOnly(event.target.checked)}
        >
          只看已登记衔接规则的下一步
        </Checkbox>
      )}
      <div ref={listRef} className="erp-chain-design__library-list erp-directory-list" aria-label="可加入的节点">
        {entries.map((entry) => {
          if (entry.nodes.length === 1) return card(entry.nodes[0])
          const expanded = expansion.isExpanded(entry.key)
          const branchId = `${id}-${entry.key}-branches`
          return (
            <div
              className="erp-chain-design__library-item"
              data-domain={entry.nodes[0].domain}
              style={diagramDomainStyle(entry.nodes[0].domain)}
              key={entry.key}
            >
              <DirectoryItem
                expanded={expanded}
                aria-controls={expanded ? branchId : undefined}
                aria-current={!expanded && entry.nodes.some((node) => node.id === selectedNodeId) ? 'location' : undefined}
                aria-label={`选择分支：${entry.label}`}
                aria-describedby={`${id}-entry-${entry.key}`}
                onClick={() => expansion.toggle(entry.key)}
              >
                <span className="erp-chain-design__library-icon"><DiagramNodeIcon type={entry.nodes[0].type} /></span>
                <span className="erp-chain-design__library-copy">
                  <strong>{entry.label}</strong>
                  <small id={`${id}-entry-${entry.key}`}>{CHAIN_DESIGN_TYPES[entry.nodes[0].type]} · {entry.nodes.length} 个分支</small>
                </span>
              </DirectoryItem>
              {expanded && (
                <DirectoryBranch id={branchId}>
                  {entry.nodes.map((node) => card(node, true))}
                </DirectoryBranch>
              )}
            </div>
          )
        })}
        {!entries.length && !matchingChains.length && (
          <AppEmpty variant="compact" description="没有匹配节点。">
            <Button
              onClick={() => {
                setNodeScope('all')
                setSearchReset((previous) => previous + 1)
                setFilters({ view: 'all', search: '', ...emptyFacets })
              }}
            >
              查看全部节点
            </Button>
          </AppEmpty>
        )}
      </div>
    </Directory>
  )
  return children(searchTools, resultsPanel)
}
