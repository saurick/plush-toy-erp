import React, { useRef, useState } from 'react'
import { Button, Form, Input, InputNumber } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Select from '@/common/components/select/AppSelect'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import BusinessFormSection from '@/erp/components/business-list/BusinessFormSection.jsx'
import { BusinessLineItemsEmpty } from '@/erp/components/business-list/BusinessCompactFieldTable.jsx'
import BusinessLineItemsFooter, {
  BusinessLineItemsHeader,
} from '@/erp/components/business-list/BusinessLineItemsFooter.jsx'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'
import './devUIEmptyExamples.css'

const RECORDS = [
  { id: 1, number: 'SO-DEMO-1103', customer: '样例客户甲', status: '草稿' },
  { id: 2, number: 'SO-DEMO-1102', customer: '样例客户乙', status: '已提交' },
]
const COLUMNS = [
  { title: '订单编号', dataIndex: 'number' },
  { title: '客户', dataIndex: 'customer' },
  { title: '状态', dataIndex: 'status', width: 90 },
]
const MATERIALS = [
  { value: 'plush', label: '短毛绒 · 粉色 5mm' },
  { value: 'cotton', label: '填充棉 · 15D' },
  { value: 'ribbon', label: '缎带 · 20mm' },
]
const STATES = [
  { value: 'empty', label: '暂无数据' },
  { value: 'filtered', label: '筛选无结果' },
  { value: 'loading', label: '正在读取' },
  { value: 'error', label: '读取失败' },
  { value: 'denied', label: '无查看权限' },
  { value: 'data', label: '有数据' },
]

export default function DevUIEmptyExamples() {
  const [form] = Form.useForm()
  const [scene, setScene] = useState('form')
  const [states, setStates] = useState({
    form: 'empty',
    list: 'empty',
    select: 'empty',
  })
  const [items, setItems] = useState([])
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState()
  const [open, setOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState('尚未修改')
  const nextID = useRef(1)
  const updateState = (key, value) =>
    setStates((current) => ({ ...current, [key]: value }))
  const changeState = (value) => {
    updateState(scene, value)
    if (scene === 'form') {
      if (value === 'empty') setItems([])
      if (value === 'data' && !items.length) {
        setItems([{ id: nextID.current++, name: '样例产品', quantity: 100 }])
      }
    }
    if (scene === 'list' && value === 'filtered') setKeyword('未匹配的订单')
    if (scene === 'list' && ['empty', 'data'].includes(value)) setKeyword('')
    if (scene === 'select') {
      if (value === 'filtered') setSearch('未匹配的材料')
      if (['empty', 'data'].includes(value)) setSearch('')
      if (['empty', 'data', 'filtered'].includes(value)) setSelected(undefined)
      setOpen(true)
    }
  }
  const feedback = (key, variant = 'default') => {
    const state = states[key]
    const noun = { form: '订货明细', list: '订单', select: '材料' }[key]
    if (state === 'loading') {
      return (
        <Empty
          variant={variant}
          state="loading"
          description={`正在读取${noun}…`}
        />
      )
    }
    if (state === 'error') {
      return (
        <Empty
          variant={variant}
          state="error"
          description={`${noun}读取失败`}
          detail="当前输入与条件已保留。"
        >
          <Button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              updateState(
                key,
                key === 'form' && !items.length ? 'empty' : 'data'
              )
            }
          >
            重新加载
          </Button>
        </Empty>
      )
    }
    if (state === 'denied') {
      return (
        <Empty
          variant={variant}
          state="denied"
          description={`当前账号无权查看${noun}`}
          detail="请联系管理员核对权限。"
        />
      )
    }
    if (state === 'filtered') {
      return (
        <Empty variant={variant} description={`没有符合条件的${noun}`}>
          <Button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (key === 'list') setKeyword('')
              if (key === 'select') setSearch('')
              updateState(key, 'data')
            }}
          >
            清除{key === 'select' ? '搜索' : '条件'}
          </Button>
        </Empty>
      )
    }
    return <Empty variant={variant} description={`暂无可选${noun}`} />
  }
  const listRows =
    states.list === 'data'
      ? RECORDS.filter((row) =>
          `${row.number} ${row.customer}`.includes(keyword)
        )
      : []
  const addLine = () => {
    setItems((current) => [
      ...current,
      { id: nextID.current++, name: '', quantity: 1 },
    ])
    updateState('form', 'data')
    setSaveStatus('有未保存修改')
  }

  return (
    <div className="erp-ui-empty-examples">
      <div className="erp-ui-empty-examples__toolbar">
        <SlidingSegmented
          aria-label="空提示位置"
          value={scene}
          onChange={(value) => {
            setScene(value)
            setOpen(value === 'select')
          }}
          options={[
            { value: 'form', label: '表单明细' },
            { value: 'list', label: '列表区域' },
            { value: 'select', label: '下拉候选' },
          ]}
        />
        <Select
          aria-label="空提示状态"
          label="预览状态"
          value={states[scene]}
          allowClear={false /* 不可清空：样例必须指定一种预览状态 */}
          onChange={changeState}
          options={STATES.filter(
            (item) => scene !== 'form' || item.value !== 'filtered'
          )}
        />
      </div>
      <div hidden={scene !== 'form'} data-empty-demo="form">
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setSaveStatus('有未保存修改')}
        >
          <BusinessFormSection
            title="订货明细"
            showHeading={false}
            layout="content"
          >
            <BusinessLineItemsHeader title="订货明细" />
            {['loading', 'error', 'denied'].includes(states.form) ? (
              feedback('form')
            ) : items.length ? (
              <div className="erp-ui-empty-examples__lines">
                {items.map((item, index) => (
                  <div className="erp-ui-empty-examples__line" key={item.id}>
                    <Form.Item label="订货产品">
                      <Input
                        aria-label={`样例第 ${index + 1} 行产品`}
                        value={item.name}
                        onChange={(event) => {
                          setItems((current) =>
                            current.map((row) =>
                              row.id === item.id
                                ? { ...row, name: event.target.value }
                                : row
                            )
                          )
                          setSaveStatus('有未保存修改')
                        }}
                      />
                    </Form.Item>
                    <Form.Item label="订单数量">
                      <InputNumber
                        aria-label={`样例第 ${index + 1} 行数量`}
                        min={1}
                        value={item.quantity}
                        onChange={(value) => {
                          setItems((current) =>
                            current.map((row) =>
                              row.id === item.id
                                ? { ...row, quantity: value }
                                : row
                            )
                          )
                          setSaveStatus('有未保存修改')
                        }}
                      />
                    </Form.Item>
                    <Button
                      aria-label={`移除样例第 ${index + 1} 行`}
                      onClick={() => {
                        const remaining = items.filter(
                          (row) => row.id !== item.id
                        )
                        setItems(remaining)
                        updateState('form', remaining.length ? 'data' : 'empty')
                        setSaveStatus('有未保存修改')
                      }}
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <BusinessLineItemsEmpty>
                暂无订货明细，可先保存订单草稿
              </BusinessLineItemsEmpty>
            )}
            {!['loading', 'error', 'denied'].includes(states.form) ? (
              <BusinessLineItemsFooter
                addLabel="添加订货明细"
                onAdd={addLine}
                stats={[
                  {
                    key: 'items',
                    label: '已录入',
                    value: items.length,
                    suffix: '条',
                  },
                ]}
              />
            ) : null}
          </BusinessFormSection>
          <Form.Item name="note" label="订单备注">
            <BusinessTextArea
              aria-label="空提示样例备注"
              placeholder="填写演示草稿"
              maxLength={2000}
            />
          </Form.Item>
          <div className="erp-ui-empty-examples__actions">
            <span role="status">{saveStatus}</span>
            <Button
              type="primary"
              disabled={['loading', 'error', 'denied'].includes(states.form)}
              onClick={() => setSaveStatus('演示草稿已保存')}
            >
              保存演示草稿
            </Button>
          </div>
        </Form>
      </div>
      <div hidden={scene !== 'list'} data-empty-demo="list">
        <div className="erp-ui-empty-examples__toolbar">
          <SearchInput
            aria-label="空提示样例订单搜索"
            value={keyword}
            placeholder="搜索样例订单"
            disabled={states.list === 'denied'}
            onSearch={(value) => {
              setKeyword(value)
              updateState(
                'list',
                value &&
                  !RECORDS.some((row) =>
                    `${row.number} ${row.customer}`.includes(value)
                  )
                  ? 'filtered'
                  : 'data'
              )
            }}
          />
          <Button
            type="primary"
            hidden={states.list === 'denied'}
            onClick={() => setScene('form')}
          >
            新建订单
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={COLUMNS}
          dataSource={listRows}
          pagination={false}
          locale={{
            emptyText:
              states.list === 'empty' ? (
                <Empty description="暂无销售订单" />
              ) : (
                feedback('list')
              ),
          }}
        />
      </div>
      <div hidden={scene !== 'select'} data-empty-demo="select">
        <Form layout="vertical">
          <Form.Item label="材料">
            <Select
              aria-label="空提示样例材料"
              value={selected}
              searchValue={search}
              open={open}
              onOpenChange={setOpen}
              showSearch
              options={states.select === 'data' ? MATERIALS : []}
              loading={states.select === 'loading'}
              onSearch={(value) => {
                if (states.select === 'denied') return
                setSearch(value)
                updateState(
                  'select',
                  MATERIALS.some((item) => item.label.includes(value))
                    ? 'data'
                    : 'filtered'
                )
              }}
              onChange={(value) => {
                setSelected(value)
                setSearch('')
                setOpen(false)
              }}
              notFoundContent={feedback('select', 'compact')}
            />
          </Form.Item>
        </Form>
        <p role="status">
          {selected
            ? `已选择：${MATERIALS.find((item) => item.value === selected)?.label}`
            : '尚未选择材料'}
        </p>
      </div>
    </div>
  )
}
