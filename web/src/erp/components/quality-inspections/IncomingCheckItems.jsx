import React from 'react'
import { Form, Input, Space, Typography } from 'antd'
import BusinessLineItemActionButton from '../business-list/BusinessLineItemActionButton.jsx'

import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessLineEditor from '../business-list/BusinessLineEditor.jsx'
import Select from '@/common/components/select/AppSelect'
import BusinessCompactFieldTable, {
  BusinessCompactFieldRow,
} from '../business-list/BusinessCompactFieldTable.jsx'
import BusinessLineItemsFooter, {
  BusinessLineItemsHeader,
} from '../business-list/BusinessLineItemsFooter.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import { CHECK_RESULT_LABELS } from '../../utils/incomingAcceptance.mjs'

export function IncomingCheckItemsForm() {
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
  const appendCheckItem = (add, index) => {
    add({ result: 'NOT_CHECKED' })
    requestLineItemScroll(index)
  }
  return (
    <BusinessLineEditor data-table-scroll-scope style={{ gridColumn: '1 / -1', minWidth: 0 }}>
      <Form.List name="check_items">
        {(fields, { add, remove }) => (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <BusinessCompactFieldTable
              header={<BusinessLineItemsHeader
                title="检查项目"
                scrollControls
                description="全检与抽检分别记录，未检不视为合格。"
              />}
              label="质检检查项"
              scrollControlsInToolbar
              showSequence
              columns={[
                { label: '检查项目', required: true },
                { label: '检查结果', width: 120 },
                { label: '要求 / 依据' },
                { label: '实际情况' },
                { label: '检查范围', width: 104 },
                { label: '说明 / 抽检范围' },
                { actions: true, label: '操作', width: 52 },
              ]}
            >
              {fields.map(({ key, name, ...rest }, index) => (
                <BusinessCompactFieldRow
                  key={key}
                  label={`检查项目 ${name + 1}`}
                  rowRef={(node) => registerLineItemRow(index, node)}
                  sequence={index + 1}
                  cells={[
                    <Form.Item
                      {...rest}
                      name={[name, 'name']}
                      label={`检查项目 ${name + 1}`}
                      rules={[{ required: true, message: '请填写检查项目' }]}
                    >
                      <Input
                        maxLength={80}
                        placeholder="如色差、克重"
                      />
                    </Form.Item>,
                    <Form.Item
                      {...rest}
                      name={[name, 'result']}
                      label="检查结果"
                    >
                      <Select
                        placeholder="请选择检查结果"
                        options={Object.entries(CHECK_RESULT_LABELS).map(
                          ([value, label]) => ({ value, label })
                        )}
                      />
                    </Form.Item>,
                    <Form.Item
                      {...rest}
                      name={[name, 'requirement']}
                      label="要求 / 依据"
                    >
                      <Input
                        maxLength={255}
                        placeholder="填写检查依据"
                      />
                    </Form.Item>,
                    <Form.Item
                      {...rest}
                      name={[name, 'observation']}
                      label="实际情况"
                    >
                      <Input maxLength={255} placeholder="观察或测量" />
                    </Form.Item>,
                    <Form.Item
                      {...rest}
                      name={[name, 'scope']}
                      label="检查范围"
                    >
                      <Select
                        allowClear
                        placeholder="选择"
                        options={[
                          { value: 'FULL', label: '全检' },
                          { value: 'SAMPLE', label: '抽检' },
                        ]}
                      />
                    </Form.Item>,
                    <Form.Item
                      {...rest}
                      name={[name, 'note']}
                      label="说明 / 抽检范围"
                    >
                      <BusinessTextArea
                        maxLength={BusinessTextPolicy.noteMaxCharacters}
                        placeholder="填写检查说明"
                      />
                    </Form.Item>,
                  ]}
                  actions={
                    <BusinessLineItemActionButton
                      action="remove"
                      aria-label={`移除此检查项 ${name + 1}`}
                      onClick={() => remove(name)}
                    >
                      移除行
                    </BusinessLineItemActionButton>
                  }
                />
              ))}
            </BusinessCompactFieldTable>
            <BusinessLineItemsFooter
              addLabel="添加检查项"
              addDisabled={fields.length >= 50}
              onAdd={() => appendCheckItem(add, fields.length)}
              stats={[
                {
                  key: 'count',
                  label: '已录入',
                  value: fields.length,
                  suffix: '项',
                },
              ]}
            />
          </Space>
        )}
      </Form.List>
    </BusinessLineEditor>
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
