import React, { useState } from 'react'
import { Alert, Button, Form, Input, InputNumber } from 'antd'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import BusinessFormPage from '@/erp/components/business-list/BusinessFormPage.jsx'
import BusinessFormSection from '@/erp/components/business-list/BusinessFormSection.jsx'
import BusinessLineItemsSection from '@/erp/components/business-list/BusinessLineItemsSection.jsx'
import { BusinessLineItemRow } from '@/erp/components/business-list/BusinessLineItemsTable.jsx'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'
import { DateInput } from '@/erp/components/business-list/BusinessDateInputs.jsx'
import SourceImportPickerModal from '@/erp/components/business-list/SourceImportPickerModal.jsx'

const LINE_COLUMNS = [
  { label: '材料名称', width: 200, flexible: true, required: true },
  { label: '数量', width: 120, required: true },
]
const MATERIALS = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  code: `MAT-DEMO-${String(index + 1).padStart(2, '0')}`,
  name: index === 0 ? '短毛绒' : `演示材料 ${index + 1}`,
  active: index !== 2,
}))
const MATERIAL_COLUMNS = [
  { title: '材料编号', dataIndex: 'code', width: 180 },
  { title: '材料名称', dataIndex: 'name' },
]

function BusinessFormExample() {
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [fail, setFail] = useState(false)
  const [failure, setFailure] = useState(false)
  const [result, setResult] = useState('尚未保存演示草稿')

  const start = () => {
    form.resetFields()
    setFailure(false)
    setOpen(true)
  }
  const save = async () => {
    const values = await form.validateFields()
    if (fail && !failure) {
      setFailure(true)
      return
    }
    setResult(
      `演示草稿已保存：${values.subject}，${values.items.length} 条明细`
    )
    setOpen(false)
  }

  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-example-row">
        <Segmented
          aria-label="表单保存结果"
          value={fail ? 'failure' : 'success'}
          onChange={(value) => setFail(value === 'failure')}
          disabled={open}
          options={[
            { value: 'success', label: '保存成功' },
            { value: 'failure', label: '首次失败后重试' },
          ]}
        />
        <Button onClick={start} disabled={open}>
          编辑演示草稿
        </Button>
      </div>
      <output aria-label="业务表单示例结果">{result}</output>
      <div className="erp-control-business-editor" hidden={!open}>
        <BusinessFormPage
          open={open}
          form={form}
          title="演示采购草稿"
          onCancel={() => setOpen(false)}
          onOk={save}
        >
          <Form
            form={form}
            layout="vertical"
            className="erp-business-action-form"
            initialValues={{
              subject: '毛绒材料采购',
              date: '2026-10-24',
              items: [{ name: '短毛绒', quantity: 10, note: '' }],
            }}
          >
            {failure && (
              <Alert
                type="error"
                showIcon
                role="alert"
                message="演示保存失败，输入已保留。再次保存可重试。"
              />
            )}
            <BusinessFormSection title="基本信息">
              <Form.Item
                name="subject"
                label="草稿名称"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: '请填写草稿名称',
                  },
                ]}
              >
                <Input allowClear />
              </Form.Item>
              <Form.Item name="date" label="下单日期">
                <DateInput />
              </Form.Item>
            </BusinessFormSection>
            <BusinessFormSection
              title="材料明细"
              layout="stack"
              showHeading={false}
            >
              <BusinessLineItemsSection
                title="材料明细"
                columns={LINE_COLUMNS}
                emptyDescription="暂无演示明细，可添加一条继续操作"
                footerProps={({ add, fields }) => ({
                  onAdd: () => add({ name: '', quantity: 1, note: '' }),
                  stats: [
                    {
                      key: 'count',
                      label: '明细',
                      value: fields.length,
                      suffix: ' 条',
                    },
                  ],
                })}
                renderRow={({ field, index, remove }) => (
                  <BusinessLineItemRow
                    key={field.key}
                    index={index}
                    cells={[
                      <Form.Item
                        key="name"
                        name={[field.name, 'name']}
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            message: '请填写材料名称',
                          },
                        ]}
                      >
                        <BusinessTextArea
                          aria-label={`第 ${index + 1} 条材料名称`}
                        />
                      </Form.Item>,
                      <Form.Item
                        key="quantity"
                        name={[field.name, 'quantity']}
                        rules={[
                          {
                            required: true,
                            type: 'number',
                            min: 0.01,
                            message: '数量须大于零',
                          },
                        ]}
                      >
                        <InputNumber
                          aria-label={`第 ${index + 1} 条数量`}
                          min={0.01}
                        />
                      </Form.Item>,
                    ]}
                    actions={
                      <Button
                        onClick={() => remove(field.name)}
                        aria-label={`移除第 ${index + 1} 条明细`}
                      >
                        移除
                      </Button>
                    }
                    summaryFields={[{ key: 'note', label: '备注' }]}
                  >
                    <Form.Item name={[field.name, 'note']} label="明细备注">
                      <BusinessTextArea aria-label={`第 ${index + 1} 条备注`} />
                    </Form.Item>
                  </BusinessLineItemRow>
                )}
              />
            </BusinessFormSection>
          </Form>
        </BusinessFormPage>
      </div>
    </div>
  )
}

function SourcePickerExample() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState('ready')
  const [selected, setSelected] = useState([])

  return (
    <div className="erp-control-example-stack">
      <Segmented
        aria-label="来源清单状态"
        value={state}
        disabled={open}
        onChange={setState}
        options={[
          { value: 'ready', label: '正常' },
          { value: 'loading', label: '加载中' },
          { value: 'empty', label: '空列表' },
          { value: 'error', label: '读取失败' },
        ]}
      />
      <div className="erp-control-example-row">
        <Button onClick={() => setOpen(true)}>选择演示材料</Button>
        <Button onClick={() => setSelected([])} disabled={!selected.length}>
          清空演示结果
        </Button>
      </div>
      <output aria-label="来源选择示例结果">
        {selected.length
          ? `已添加 ${selected.length} 条：${selected.map((row) => row.name).join('、')}`
          : '尚未添加材料'}
      </output>
      <SourceImportPickerModal
        open={open}
        title="从演示材料库添加"
        description={
          state === 'error' ? (
            <span role="alert">
              演示读取失败，保留上次清单；点击重新加载恢复。
            </span>
          ) : (
            '本地虚构清单；选择结果只保留在本示例中。'
          )
        }
        rows={state === 'empty' ? [] : MATERIALS}
        columns={MATERIAL_COLUMNS}
        pageSize={5}
        loading={state === 'loading'}
        importDisabled={state === 'error'}
        importText="添加到演示结果"
        searchPlaceholder="搜索演示材料"
        getSelectedLabel={(row) => row.name}
        isRowDisabled={(row) => !row.active}
        getRowDisabledReason={(row) => (row.active ? '' : '演示材料已停用')}
        emptyDescription="暂无可选演示材料"
        onReload={() => setState('ready')}
        onCancel={() => setOpen(false)}
        onImport={(rows) => {
          setSelected(rows)
          setOpen(false)
        }}
      />
    </div>
  )
}

export default function DevUIBusinessExamples({ type }) {
  return type === 'business-form' ? (
    <BusinessFormExample />
  ) : (
    <SourcePickerExample />
  )
}
