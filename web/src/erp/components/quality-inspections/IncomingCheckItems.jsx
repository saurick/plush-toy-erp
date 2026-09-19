import React from 'react'
import { Button, Form, Input, Select, Space, Typography } from 'antd'
import { CHECK_RESULT_LABELS } from '../../utils/incomingAcceptance.mjs'

export function IncomingCheckItemsForm() {
  return (
    <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
      <Typography.Paragraph type="secondary">
        按实际来料保留、移除或补充检查项。全检与抽检分别记录，未检不会视为合格；照片可在下方质检附件中上传。
      </Typography.Paragraph>
      <Form.List name="check_items">
        {(fields, { add, remove }) => (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {fields.map(({ key, name, ...rest }) => (
              <div
                key={key}
                className="erp-business-action-form erp-business-action-form--grid"
                style={{
                  border: '1px solid var(--ant-color-border, #d9d9d9)',
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <Form.Item
                  {...rest}
                  name={[name, 'name']}
                  label={`检查项目 ${name + 1}`}
                  rules={[{ required: true, message: '请填写检查项目' }]}
                >
                  <Input
                    maxLength={80}
                    placeholder="如色差、克重、异味，或其他检查项"
                  />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'result']} label="检查结果">
                  <Select
                    options={Object.entries(CHECK_RESULT_LABELS).map(
                      ([value, label]) => ({ value, label })
                    )}
                  />
                </Form.Item>
                <Form.Item
                  {...rest}
                  name={[name, 'requirement']}
                  label="要求 / 依据"
                >
                  <Input
                    maxLength={255}
                    placeholder="采购约定、确认样或具体要求"
                  />
                </Form.Item>
                <Form.Item
                  {...rest}
                  name={[name, 'observation']}
                  label="实际情况"
                >
                  <Input maxLength={255} placeholder="填写观察或测量结果" />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'scope']} label="检查范围">
                  <Select
                    allowClear
                    placeholder="请选择"
                    options={[
                      { value: 'FULL', label: '全检' },
                      { value: 'SAMPLE', label: '抽检' },
                    ]}
                  />
                </Form.Item>
                <Form.Item
                  {...rest}
                  name={[name, 'note']}
                  label="说明 / 抽检范围"
                >
                  <Input
                    maxLength={500}
                    placeholder="抽检数量、位置、不适用原因等"
                  />
                </Form.Item>
                <Button
                  size="small"
                  style={{ gridColumn: '1 / -1', justifySelf: 'start' }}
                  onClick={() => remove(name)}
                >
                  移除此检查项
                </Button>
              </div>
            ))}
            <Button
              disabled={fields.length >= 50}
              onClick={() => add({ result: 'NOT_CHECKED' })}
            >
              添加检查项
            </Button>
          </Space>
        )}
      </Form.List>
    </div>
  )
}

export function IncomingCheckItemsDetails({ items }) {
  if (!items?.length) return null
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text strong>逐项验收记录</Typography.Text>
      {items.map((item, index) => (
        <div key={`${index}-${item.name}`}>
          <Typography.Text strong>
            {item.name} · {CHECK_RESULT_LABELS[item.result] || '未检'}
          </Typography.Text>
          <div>
            要求：{item.requirement || '未填写'}；实际：
            {item.observation || '未填写'}
          </div>
          <Typography.Text type="secondary">
            {item.scope === 'FULL'
              ? '全检'
              : item.scope === 'SAMPLE'
                ? '抽检'
                : ''}
            {item.note ? ` · ${item.note}` : ''}
          </Typography.Text>
        </div>
      ))}
    </Space>
  )
}
