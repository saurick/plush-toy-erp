import React, { useId, useRef, useState } from 'react'
import { Button, Checkbox, Tag } from 'antd'
import { DownOutlined, MenuFoldOutlined, RightOutlined } from '@ant-design/icons'
import AnchoredControlPopover, { FilterPopoverButton } from '@/common/components/overlay/AnchoredControlPopover.jsx'
import SearchInput from '@/common/components/SearchInput.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import { diagramDomainStyle } from '@/common/components/diagram/diagramSemantics.mjs'
import AppEmpty from '@/common/components/empty/AppEmpty.jsx'
import {
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
  const [pendingFilters, setDraft] = useState(null)
  const open = pendingFilters !== null
  const draft = pendingFilters || { ...filters, nodeScope }
  const [expanded, setExpanded] = useState(null)
  const trigger = useRef(null)
  const panel = useRef(null)
  const id = useId()
  const change = (value) => {
    if (value.chain) setNodeScope('all')
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
  const selections = (values) => fields.filter((field) => values[field.key]).map((field) => ({
    key: field.key,
    label: `${field.label}：${field.options.find((option) => option.value === values[field.key])?.label}`,
  }))
  const selected = selections(filters)
  const viewLabel = CHAIN_NODE_VIEWS.find((view) => view.value === filters.view).label
  const filterSummary = [viewLabel, ...selected.map((field) => field.label)].join(' · ')
  const quickViews = CHAIN_NODE_VIEWS.filter(({ value }) => ['steps', 'tasks', 'exceptions'].includes(value))
  const count = selected.length + Number(nodeScope === 'all' && chainKey !== 'all') + Number(!quickViews.some(({ value }) => value === filters.view))
  const edit = (values) => setDraft((previous) => ({ ...previous, ...values }))
  const setOpen = (visible) => setDraft(visible ? { ...filters, nodeScope } : null)
  const close = () => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  const draftSelected = selections(draft)
  const apply = () => {
    const { nodeScope: range, view, domain, type, role, chain } = draft
    setNodeScope(range)
    change({ view, domain, type, role, chain })
    close()
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
        <button
          type="button"
          className="erp-dev-directory-item"
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
              {status && <span>{{ known: '有接入规则', blocked: '不能直连', unknown: '接点待核对' }[status]}</span>}
            </small>
          </span>
        </button>
        {canAdd && (
          <Button size="small" aria-label={`加入：${actionLabel}`} onClick={() => onAdd(node.id)}>加入</Button>
        )}
      </div>
    )
  }
  const searchTools = (
    <div className="erp-chain-design__search-tools" role="group" aria-label="查找节点">
      <SearchInput
        aria-label="搜索业务节点"
        placeholder="搜节点库：步骤、单据或岗位"
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
            <div className="erp-chain-node-filters__fields">
              <FilterChipGroup
                label="搜索范围"
                aria-label="节点库范围"
                value={chainKey === 'all' ? 'all' : draft.nodeScope}
                options={[
                  { value: 'current', label: '当前链', disabled: chainKey === 'all' },
                  { value: 'all', label: '全库' },
                ]}
                onChange={(scope) => edit({ nodeScope: scope, chain: scope === 'current' ? '' : draft.chain })}
              />
              <FilterChipGroup
                label="常用视角"
                value={draft.view}
                options={CHAIN_NODE_VIEWS}
                onChange={(view) => edit({ view, type: '' })}
              />
              {draftSelected.length > 0 && (
                <div className="erp-chain-design__selected-filters" aria-label="已选节点筛选">
                  {draftSelected.map((field) => (
                    <Tag
                      key={field.key}
                      closable
                      onClose={(event) => {
                        event.preventDefault()
                        edit({ [field.key]: '' })
                      }}
                    >
                      {field.label}
                    </Tag>
                  ))}
                </div>
              )}
              {fields.map((field) => (
                <section key={field.key} aria-label={field.label}>
                  {field.key === 'chain' ? (
                    <FilterSelect
                      label={field.label}
                      labelPlacement="stacked"
                      aria-label="按来源链路筛选"
                      placeholder={`全部 ${library.chains.length} 条链路`}
                      value={draft.chain}
                      options={library.chains}
                      onChange={(chain) => edit({ chain, nodeScope: chain ? 'all' : draft.nodeScope })}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                    />
                  ) : (
                    <FilterChipGroup
                      label={field.label}
                      aria-label={`按${field.label}筛选`}
                      value={draft[field.key]}
                      options={businessChainFacetOptions(
                        library,
                        filtersWithinScope(draft, draft.nodeScope, chainKey),
                        field.key,
                        [{ value: '', label: '全部' }, ...field.options],
                        allowed,
                      )}
                      onChange={(value) => edit({ [field.key]: value })}
                    />
                  )}
                </section>
              ))}
            </div>
            <footer>
              <Button
                onClick={() => edit({ ...emptyFacets, nodeScope: 'current' })}
                disabled={!draftSelected.length && draft.nodeScope === 'current'}
              >
                重置筛选
              </Button>
              <Button onClick={close}>取消</Button>
              <Button type="primary" onClick={apply}>
                应用筛选
              </Button>
            </footer>
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
    <aside id={libraryId} hidden={hidden} className="erp-chain-design__library" aria-label="业务节点库">
      <header className="erp-chain-design__library-heading">
        <h2>节点库</h2>
        <span role="status" aria-label="节点筛选结果" title={`全库 ${library.chains.length} 条链路`}>
          <strong>{entries.length} 项匹配</strong> / 全库 {library.entries.length} 项
        </span>
        <Button type="text" icon={<MenuFoldOutlined />} aria-label="收起节点库面板" title="收起节点库" onClick={onToggle} />
      </header>
      <small className="erp-chain-design__library-summary">{chainKey === 'all' || nodeScope === 'all' ? '全库' : '当前链'} · {filterSummary}{filters.search ? ` · “${filters.search}”` : ''}</small>
      {connecting && (
        <Checkbox
          checked={nextOnly}
          onChange={(event) => setNextOnly(event.target.checked)}
        >
          只看有接入规则的下一步
        </Checkbox>
      )}
      <div ref={listRef} className="erp-chain-design__library-list" aria-label="可加入的节点">
        {entries.map((entry) =>
          entry.nodes.length === 1 ? (
            card(entry.nodes[0])
          ) : (
            <div
              className="erp-chain-design__library-item"
              data-domain={entry.nodes[0].domain}
              style={diagramDomainStyle(entry.nodes[0].domain)}
              key={entry.key}
            >
              <button
                type="button"
                className="erp-dev-directory-item"
                aria-expanded={expanded === entry.key}
                aria-controls={expanded === entry.key ? `${id}-branches` : undefined}
                aria-label={`选择分支：${entry.label}`}
                aria-describedby={`${id}-entry-${entry.key}`}
                onClick={() =>
                  setExpanded(expanded === entry.key ? null : entry.key)
                }
              >
                <span className="erp-chain-design__library-icon"><DiagramNodeIcon type={entry.nodes[0].type} /></span>
                <span className="erp-chain-design__library-copy">
                  <strong>{entry.label}</strong>
                  <small id={`${id}-entry-${entry.key}`}>{CHAIN_DESIGN_TYPES[entry.nodes[0].type]} · {entry.nodes.length} 个分支</small>
                </span>
                {expanded === entry.key ? <DownOutlined aria-hidden="true" /> : <RightOutlined aria-hidden="true" />}
              </button>
              {expanded === entry.key && (
                <div className="erp-chain-design__library-branches" id={`${id}-branches`}>
                  {entry.nodes.map((node) => card(node, true))}
                </div>
              )}
            </div>
          )
        )}
        {!entries.length && (
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
    </aside>
  )
  return children(searchTools, resultsPanel)
}
