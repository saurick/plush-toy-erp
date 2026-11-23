import React, { useId, useRef, useState } from 'react'
import SearchInput from '@/common/components/SearchInput'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'
import AppTable from '@/common/components/table/AppTable'
import FilterChip from '@/common/components/navigation/FilterChip'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import AnchoredControlPopover, {
  FilterPopoverButton,
} from '@/common/components/overlay/AnchoredControlPopover.jsx'
import FilterPopoverPanel from '@/common/components/overlay/FilterPopoverPanel.jsx'
import DevControlUsageTable from './DevControlUsageTable.jsx'

const MATERIALS = [
  { id: 1, code: 'DEMO-003', name: '浅灰短毛绒', status: 'available' },
  { id: 2, code: 'DEMO-001', name: '白色填充棉', status: 'available' },
  { id: 3, code: 'DEMO-002', name: '深蓝织带', status: 'paused' },
]
const STATUS = [
  { value: 'available', label: '启用' },
  { value: 'paused', label: '停用' },
]
const TASK_ASSIGNEES = ['王小禾', '李小宁', '王小禾', '周小雨']
const ASSIGNEE_OPTIONS = [...new Set(TASK_ASSIGNEES)].map((name) => ({ value: name, label: name }))
const COLUMNS = [
  {
    title: '编码',
    dataIndex: 'code',
    sorter: (left, right) => left.code.localeCompare(right.code),
  },
  { title: '材料', dataIndex: 'name' },
  {
    title: '状态',
    dataIndex: 'status',
    render: (value) => STATUS.find((item) => item.value === value)?.label,
  },
]

export function SearchInputExample() {
  const [query, setQuery] = useState('')
  const rows = MATERIALS.filter(({ code, name }) =>
    `${code} ${name}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div className="erp-control-example-stack">
      <SearchInput
        aria-label="搜索样例材料"
        placeholder="材料名或编码"
        searchHint="可搜索材料名称及 DEMO 编码"
        value={query}
        onSearch={setQuery}
        allowClear
      />
      <output aria-label="材料搜索结果">
        {rows.length
          ? rows.map(({ name }) => name).join('、')
          : '没有匹配的材料'}
      </output>
    </div>
  )
}

export function FilterSelectExample() {
  const [assignee, setAssignee] = useState('')
  const count = TASK_ASSIGNEES.filter((name) => !assignee || name === assignee).length
  return (
    <div className="erp-control-input-field">
      <FilterSelect
        label="办理人"
        labelPlacement="stacked"
        placeholder="输入姓名搜索"
        showSearch
        optionFilterProp="label"
        value={assignee}
        onChange={setAssignee}
        options={ASSIGNEE_OPTIONS}
      />
      <output aria-label="筛选当前结果">
        {assignee || '不限'} · {count} 条任务
      </output>
    </div>
  )
}

export function TableExample() {
  const [keys, setKeys] = useState([])
  return (
    <div className="erp-control-example-stack">
      <AppTable
        rowKey="id"
        columns={COLUMNS}
        dataSource={MATERIALS}
        rowSelection={{ selectedRowKeys: keys, onChange: setKeys }}
        pagination={false}
      />
      <output aria-label="表格已选记录">已选 {keys.length} 条</output>
    </div>
  )
}

export function CountedFilterExample() {
  const [selected, setSelected] = useState(false)
  return (
    <div className="erp-control-example-row erp-control-example-compact">
      <FilterChip
        count={2}
        selected={selected}
        onClick={() => setSelected((current) => !current)}
      >
        待核对
      </FilterChip>
      <FilterChip disabled>已取消</FilterChip>
      <output aria-label="筛选按钮状态">
        {selected ? '仅查看待核对' : '查看全部记录'}
      </output>
    </div>
  )
}

export function FilterPopoverExample({ usageId, usageRules }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [part, setPart] = useState(null)
  const trigger = useRef(null)
  const panel = useRef(null)
  const ruleRef = useRef(null)
  const panelId = useId()
  const close = () => {
    const destination = ruleRef.current ?? trigger.current
    ruleRef.current = null
    setOpen(false)
    destination?.focus({ preventScroll: true })
  }
  const locateUsage = (nextPart, rule) => {
    ruleRef.current = rule
    trigger.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    setPart(nextPart)
    setOpen(true)
    if (open) panel.current?.focus({ preventScroll: true })
  }
  const preview = (
    <div className="erp-control-example-row">
      <AnchoredControlPopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            ruleRef.current = null
          } else {
            setPart(null)
          }
        }}
        afterOpenChange={(next) => {
          if (next && ruleRef.current === document.activeElement) {
            panel.current?.focus({ preventScroll: true })
          }
        }}
        trigger="click"
        placement="bottomLeft"
        content={
          <div
            id={panelId}
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-label="样例筛选条件"
            data-usage-popover-part={part ?? undefined}
            onKeyDownCapture={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                close()
              }
            }}
          >
            <FilterPopoverPanel
              panelRef={panel}
              onClear={() => setStatus('')}
              clearDisabled={!status}
              onDismiss={close}
            >
              <FilterChipGroup
                label="材料状态"
                options={STATUS}
                value={status}
                onChange={setStatus}
              />
            </FilterPopoverPanel>
          </div>
        }
      >
        <FilterPopoverButton
          ref={trigger}
          count={status ? 1 : 0}
          className={part === 'trigger' ? 'erp-control-usage-highlight' : undefined}
          aria-controls={open ? panelId : undefined}
          aria-expanded={open}
        />
      </AnchoredControlPopover>
      <output aria-label="总筛选当前条件">
        {STATUS.find(({ value }) => value === status)?.label ?? '不限状态'}
      </output>
    </div>
  )
  return (
    <>
      {preview}
      {usageRules && (
        <DevControlUsageTable
          id={usageId}
          rows={usageRules}
          hint="点整行可打开浮层并高亮对应部位"
          activeTarget={part}
          dialogTargets={usageRules.map((row) => row[3])}
          onLocate={locateUsage}
        />
      )}
    </>
  )
}
