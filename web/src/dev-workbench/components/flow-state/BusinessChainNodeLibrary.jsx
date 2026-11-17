import React, { useId, useRef, useState } from 'react'
import { Button, Checkbox, Input, Popover, Tag } from 'antd'
import { FilterOutlined } from '@ant-design/icons'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import { diagramDomainStyle } from '@/common/components/diagram/diagramSemantics.mjs'
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
const emptyFacets = { domain: '', type: '', role: '', chain: '' }

export default function BusinessChainNodeLibrary({
  id: libraryId,
  hidden = false,
  library,
  present,
  connecting,
  onAdd,
  onInspect,
  onToggle,
  filters,
  setFilters,
  chainKey,
  nodeScope,
  setNodeScope,
  listRef,
}) {
  const [nextOnly, setNextOnly] = useState(true)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const trigger = useRef(null)
  const panel = useRef(null)
  const id = useId()
  const change = (value) => {
    if (value.chain) setNodeScope('all')
    setFilters((previous) => ({ ...previous, ...value }))
  }
  const effectiveFilters = { ...filters, chain: filters.chain || (nodeScope === 'current' && chainKey !== 'all' ? chainKey : '') }
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
  const selected = fields.filter((field) => filters[field.key])
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
        draggable={!present.has(node.id)}
        onDragStart={(event) => {
          event.dataTransfer.setData('application/x-plush-chain-node', node.id)
          event.dataTransfer.effectAllowed = 'copy'
        }}
      >
        <div className="erp-chain-design__library-row">
          <Button
            type="text"
            className="erp-chain-design__library-action"
            aria-label={`查看：${node.label}${variant ? `（${node.variantLabel || node.chainLabel}）` : ''}`}
            onClick={() => onInspect(node.id)}
          >
            <strong>{variant ? node.variantLabel || node.chainLabel : node.label}</strong>
          </Button>
          {!present.has(node.id) ? <Button aria-label={`加入：${node.label}${variant ? `（${node.variantLabel || node.chainLabel}）` : ''}`} onClick={() => onAdd(node.id)}>加入</Button> : null}
        </div>
        <small className="erp-chain-design__node-type">
          <DiagramNodeIcon type={node.type} />
          <span>{CHAIN_DESIGN_DOMAINS[node.domain]} · {CHAIN_DESIGN_TYPES[node.type]}</span>
        </small>
        {!variant && (chainKey === 'all' || nodeScope === 'all') && <small>{node.chainLabel}</small>}
        {node.catalogKind === 'group' && (
          <small>分组入口 · 点开查看独立步骤</small>
        )}
        {status && (
          <small>
            {
              {
                known: '有接入规则',
                blocked: '不能直连',
                unknown: '接点待核对',
              }[status]
            }
          </small>
        )}
      </div>
    )
  }
  return (
    <aside id={libraryId} hidden={hidden} className="erp-chain-design__library" aria-label="业务节点库">
      <div className="erp-chain-design__library-heading">
        <Button type="text" aria-label="收起节点库面板" onClick={onToggle}><strong>节点库</strong></Button>
        <span>{library.chains.length} 条链路</span>
      </div>
      <Input
        aria-label="搜索业务节点"
        placeholder="搜索步骤、单据或岗位"
        value={filters.search}
        onChange={(event) => change({ search: event.target.value })}
        allowClear
      />
      <FilterChipGroup
        aria-label="节点库范围"
        value={chainKey === 'all' ? 'all' : nodeScope}
        options={[{ value: 'current', label: '当前链', disabled: chainKey === 'all' }, { value: 'all', label: '全库' }]}
        onChange={setNodeScope}
      />
      <FilterChipGroup
        className="erp-chain-design__perspectives"
        aria-label="常用视角"
        value={filters.view}
        options={CHAIN_NODE_VIEWS}
        onChange={(view) => change({ view, type: '' })}
      />
      <div className="erp-chain-design__filter-bar">
        <span role="status" aria-label="节点筛选结果">
          {entries.length} / {library.entries.length} 项
        </span>
        <Popover
          trigger="click"
          open={open}
          onOpenChange={setOpen}
          placement="right"
          autoAdjustOverflow={{ shiftX: true, shiftY: true }}
          arrow={false}
          getPopupContainer={(element) =>
            element.closest('.erp-chain-design-shell') || element.parentElement
          }
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
                {fields.map((field) => (
                  <section key={field.key} aria-label={field.label}>
                    <strong>{field.label}</strong>
                    {field.key === 'chain' ? (
                      <FilterSelect
                        aria-label="按来源链路筛选"
                        placeholder="全部链路"
                        value={filters.chain}
                        options={library.chains}
                        onChange={(chain) => change({ chain })}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                      />
                    ) : (
                      <FilterChipGroup
                        aria-label={`按${field.label}筛选`}
                        value={filters[field.key]}
                        options={businessChainFacetOptions(
                          library,
                          effectiveFilters,
                          field.key,
                          [{ value: '', label: '全部' }, ...field.options],
                          allowed
                        )}
                        onChange={(value) => change({ [field.key]: value })}
                      />
                    )}
                  </section>
                ))}
              </div>
              <footer>
                <Button
                  onClick={() => change(emptyFacets)}
                  disabled={!selected.length}
                >
                  重置筛选
                </Button>
                <Button onClick={close}>收起</Button>
              </footer>
            </section>
          }
        >
          <Button
            ref={trigger}
            icon={<FilterOutlined />}
            aria-label="筛选业务节点"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onKeyDown={closeOnEscape}
          >
            筛选{selected.length ? ` · ${selected.length}` : ''}
          </Button>
        </Popover>
      </div>
      {selected.length > 0 && (
        <div
          className="erp-chain-design__selected-filters"
          aria-label="已选节点筛选"
        >
          {selected.map((field) => (
            <Tag
              key={field.key}
              closable
              onClose={(event) => {
                event.preventDefault()
                change({ [field.key]: '' })
              }}
            >
              {field.label}：
              {
                field.options.find((item) => item.value === filters[field.key])
                  ?.label
              }
            </Tag>
          ))}
        </div>
      )}
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
              <Button
                type="text"
                className="erp-chain-design__library-action"
                aria-expanded={expanded === entry.key}
                aria-label={`选择分支：${entry.label}`}
                onClick={() =>
                  setExpanded(expanded === entry.key ? null : entry.key)
                }
              >
                <strong>{entry.label}</strong>
                <span className="erp-chain-design__library-command">{entry.nodes.length} 个分支</span>
              </Button>
              <small className="erp-chain-design__node-type">
                <DiagramNodeIcon type={entry.nodes[0].type} />
                <span>{CHAIN_DESIGN_TYPES[entry.nodes[0].type]}</span>
              </small>
              <small>展开后按业务来源选择</small>
              {expanded === entry.key &&
                entry.nodes.map((node) => card(node, true))}
            </div>
          )
        )}
        {!entries.length && (
          <div className="erp-chain-design__empty-results">
            <p>没有匹配节点。</p>
            <Button
              onClick={() =>
                { setNodeScope('all'); setFilters({ view: 'all', search: '', ...emptyFacets }) }
              }
            >
              查看全部节点
            </Button>
          </div>
        )}
      </div>
    </aside>
  )
}
