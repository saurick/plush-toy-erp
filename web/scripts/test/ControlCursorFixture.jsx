import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Checkbox, Radio, Switch } from 'antd'
import SlidingTabList from '../../src/common/components/navigation/SlidingTabList'
import FilterChip from '../../src/common/components/navigation/FilterChip'
import AppSelect from '../../src/common/components/select/AppSelect'
import { DateInput } from '../../src/erp/components/business-list/BusinessDateInputs'
import 'antd/dist/reset.css'
import '../../src/tailwind.css'
import '../../src/erp/styles/app.css'
import '../../src/erp/styles/app/business-statistics.css'
import '../../src/erp/styles/app/progress-board.css'
import '../../src/erp/components/business-visualizations/businessProgressSummary.css'
import '../../src/erp/components/workflow/workflowTaskImagePreview.css'

function CursorFixture() {
  const [disabled, setDisabled] = useState(true)
  const [calls, setCalls] = useState(0)
  return (
    <main id="cursor-controls" className="erp-business-page-layout" style={{ display: 'grid', gap: 12, padding: 20 }}>
      <Button onClick={() => setDisabled(!disabled)}>{disabled ? '恢复操作' : '禁用操作'}</Button>
      <Button disabled={disabled} onClick={() => setCalls(calls + 1)}>暂不可用</Button>
      <Button>可用操作</Button>
      <Button loading>正在保存</Button>
      <button type="button" disabled>原生禁用按钮</button>
      <AppSelect className="erp-business-filter-control" aria-label="禁用供应商" disabled showSearch value="supplier" options={[{ value: 'supplier', label: '样式供应商' }]} />
      <DateInput className="erp-business-date-input" aria-label="禁用日期" disabled />
      <Checkbox disabled>禁用复选</Checkbox>
      <Radio disabled>禁用单选</Radio>
      <Switch disabled aria-label="禁用开关" />
      <SlidingTabList value="enabled" options={[
        { value: 'enabled', label: '可用页签' },
        { value: 'disabled', label: '禁用页签', disabled: true },
      ]} />
      <SlidingTabList className="erp-navigation-tabs">
        <button type="button" role="tab" aria-selected="false" aria-disabled="true">语义禁用页签</button>
      </SlidingTabList>
      <div className="mobile-filter-panel"><FilterChip disabled>禁用筛选</FilterChip></div>
      <div className="erp-statistics-metrics"><FilterChip disabled>统计筛选</FilterChip></div>
      <button type="button" className="erp-management-glance__item" disabled>业务总览</button>
      <button type="button" className="erp-progress-metric" disabled>进度指标</button>
      <button type="button" className="erp-progress-stage-detail" disabled>查看进度</button>
      <button type="button" className="erp-material-contract-batch-link" disabled>合同记录</button>
      <div className="erp-print-shell__record-panel"><button type="button" disabled>打印记录</button></div>
      <div className="erp-task-image-preview"><button type="button" disabled>缩小图片</button></div>
      <output role="status">已执行 {calls} 次</output>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<CursorFixture />)
