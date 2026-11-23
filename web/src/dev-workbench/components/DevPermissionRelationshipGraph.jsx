import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Button, Space, Tag } from 'antd'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import FilterSelect from '@/common/components/select/FilterSelect'
import { MermaidDiagram } from '@/common/components/diagram/MermaidDiagram.jsx'
import { WorkbenchEmpty } from './WorkbenchPattern.jsx'
import { groupPermissionModuleSelectOptions } from '../config/devCatalogSelectOptions.mjs'
import { PERMISSION_RELATIONSHIP_ALL_MODULES } from '../config/devPermissionRelationshipGraph.mjs'

function PermissionModuleSelect({ value, options, onChange }) {
  const selectRef = useRef(null)
  const popupRef = useRef(null)
  const [lastGroupKey, setLastGroupKey] = useState(null)
  const groups = useMemo(() => options.slice(1), [options])
  const groupedOptions = useMemo(() => options.map((option) => option.value === PERMISSION_RELATIONSHIP_ALL_MODULES
    ? { ...option, className: 'app-select__pinned-option' }
    : option), [options])
  const showShortcuts = groups.length > 1

  const jumpToGroup = useCallback((key) => {
    const pinned = popupRef.current?.querySelector('.app-select__pinned-option')
    selectRef.current?.scrollTo({ key, align: 'top', offset: pinned?.offsetHeight ?? 0 })
    setLastGroupKey(key)
  }, [])

  const onInputKeyDown = (event) => {
    if (!showShortcuts || event.currentTarget.getAttribute('aria-expanded') !== 'true' || !event.altKey) return
    const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!offset) return
    event.preventDefault()
    event.stopPropagation()
    const previous = groups.findIndex(({ key }) => key === lastGroupKey)
    const current = previous === -1 ? 0 : previous
    const next = Math.max(0, Math.min(groups.length - 1, current + offset))
    jumpToGroup(groups[next].key)
  }

  const renderPopup = useCallback((menu) => (
    <div ref={popupRef}>
      {showShortcuts && (
        <nav className="app-select__group-shortcuts" aria-label="跳转到功能分组">
          {groups.map(({ key, title }) => (
            <Button
              type="text"
              key={key}
              className="app-select__group-shortcut"
              tabIndex={-1}
              aria-current={key === lastGroupKey ? 'location' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => jumpToGroup(key)}
            >
              {title}
            </Button>
          ))}
        </nav>
      )}
      {menu}
    </div>
  ), [groups, jumpToGroup, lastGroupKey, showShortcuts])

  return (
    <FilterSelect
      ref={selectRef}
      emptyValue=""
      label="功能范围"
      placeholder="选择功能范围"
      aria-label="选择关系图功能范围"
      aria-keyshortcuts={groups.length > 1 ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      value={value}
      options={groupedOptions}
      virtual={false}
      listHeight={360}
      onInputKeyDown={onInputKeyDown}
      onOpenChange={(open) => {
        if (!open) setLastGroupKey(null)
      }}
      popupRender={renderPopup}
      onChange={onChange}
    />
  )
}

export default function DevPermissionRelationshipGraph({
  model,
  moduleKey,
  moduleOptions,
  targetLabel,
  onChangeModule,
}) {
  const emptyModule =
    Boolean(moduleKey) &&
    moduleKey !== PERMISSION_RELATIONSHIP_ALL_MODULES &&
    model.summary.permissions === 0
  const moduleLabel =
    moduleOptions.find((item) => item.value === moduleKey)?.label || '所选模块'
  const selectOptions = useMemo(() => groupPermissionModuleSelectOptions(moduleOptions), [moduleOptions])

  return (
    <div className="erp-permission-relationship__tab-panel">
      <div className="erp-permission-relationship__tab-toolbar">
        <PermissionModuleSelect value={moduleKey} options={selectOptions} onChange={onChangeModule} />
        <Space wrap size={[6, 6]} aria-label="权限关系图例">
          <Tag icon={<DiagramNodeIcon type="account" />}>账号</Tag>
          <Tag icon={<DiagramNodeIcon type="role" />}>岗位</Tag>
          <Tag color="green">最终可用</Tag>
          <Tag color="orange">岗位已选但受限</Tag>
          <Tag icon={<DiagramNodeIcon type="scope" />}>数据范围</Tag>
          <Tag icon={<DiagramNodeIcon type="task" />}>审批责任</Tag>
        </Space>
      </div>
      <section
        className="erp-permission-relationship__graph"
        aria-label="权限生效关系图"
      >
        {!moduleKey ? (
          <WorkbenchEmpty title="请选择功能范围" />
        ) : emptyModule ? (
          <WorkbenchEmpty
            title={`${targetLabel}未授予“${moduleLabel}”模块权限`}
            action={
              <Button
                onClick={() =>
                  onChangeModule(PERMISSION_RELATIONSHIP_ALL_MODULES)
                }
              >
                查看权限总览
              </Button>
            }
          />
        ) : (
          <MermaidDiagram
            chart={model.chart}
            label="权限生效关系图"
            showSourceOnError={false}
          />
        )}
      </section>
    </div>
  )
}
