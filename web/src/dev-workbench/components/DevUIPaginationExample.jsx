import React, { useState } from 'react'
import { Button } from 'antd'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import AppPagination from '@/common/components/pagination/AppPagination'
import AppTable from '@/common/components/table/AppTable'

const RECORDS = Array.from({ length: 123 }, (_, index) => ({
  id: index + 1,
  name: `演示记录 ${String(index + 1).padStart(3, '0')}`,
  category: index % 3 === 0 ? '重点关注' : '常规记录',
}))
const COLUMNS = [
  { title: '序号', dataIndex: 'id', width: 72 },
  { title: '记录名称', dataIndex: 'name' },
  { title: '分类', dataIndex: 'category', width: 112 },
]

export default function DevUIPaginationExample() {
  const [placement, setPlacement] = useState('table')
  const [scope, setScope] = useState('all')
  const [state, setState] = useState('ready')
  const [current, setCurrent] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const records = scope === 'empty' ? [] : scope === 'few' ? RECORDS.slice(0, 7) : RECORDS
  const rows = records.slice((current - 1) * pageSize, current * pageSize)
  const loading = state === 'loading'
  const pagination = {
    current,
    pageSize,
    total: records.length,
    pageSizeOptions: [10, 20, 50],
    showSizeChanger: { 'aria-label': '每页示例条数', showSearch: false },
    disabled: loading,
    onChange: (page, nextPageSize) => {
      setCurrent(nextPageSize === pageSize ? page : 1)
      setPageSize(nextPageSize)
      setState('ready')
    },
  }

  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-example-row">
        <span>呈现方式</span>
        <SlidingSegmented
          aria-label="分页呈现方式"
          value={placement}
          onChange={setPlacement}
          options={[
            { value: 'table', label: '表格内分页' },
            { value: 'standalone', label: '独立分页' },
          ]}
        />
      </div>
      <div className="erp-control-example-row">
        <span>样例数据</span>
        <SlidingSegmented
          aria-label="分页示例数据"
          value={scope}
          disabled={loading}
          onChange={(value) => {
            setScope(value)
            setCurrent(1)
            setState('ready')
          }}
          options={[
            { value: 'all', label: '多页' },
            { value: 'few', label: '单页' },
            { value: 'empty', label: '空列表' },
          ]}
        />
      </div>
      <div className="erp-control-example-row">
        <span>读取状态</span>
        <SlidingSegmented
          aria-label="分页读取状态"
          value={state}
          onChange={setState}
          options={[
            { value: 'ready', label: '正常' },
            { value: 'loading', label: '加载中' },
            { value: 'error', label: '加载失败' },
          ]}
        />
      </div>
      {state === 'error' && (
        <div className="erp-control-example-row" role="alert">
          <span>读取失败，已保留当前页内容。</span>
          <Button onClick={() => setState('ready')}>重试</Button>
        </div>
      )}
      <div aria-label="分页示例列表" aria-busy={loading}>
        <AppTable
          rowKey="id"
          columns={COLUMNS}
          dataSource={rows}
          loading={loading}
          scroll={{ y: 240 }}
          locale={{ emptyText: '没有符合条件的记录' }}
          pagination={placement === 'table' ? pagination : false}
        />
        {placement === 'standalone' && (
          <AppPagination {...pagination} aria-label="示例独立分页" />
        )}
      </div>
      <div className="erp-control-example-row">
        <output aria-label="分页示例结果">
          {loading ? '正在读取，保留当前内容' : rows.length ? `当前页首项：${rows[0].name}` : '当前没有记录'}
        </output>
        <Button
          onClick={() => {
            setPlacement('table')
            setScope('all')
            setState('ready')
            setCurrent(1)
            setPageSize(10)
          }}
        >
          恢复初始内容
        </Button>
      </div>
    </div>
  )
}
