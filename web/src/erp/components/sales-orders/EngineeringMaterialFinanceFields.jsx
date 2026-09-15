import React, { useEffect, useRef } from 'react'
import { Form, Input } from 'antd'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import { formatMaterialQuantity as quantity } from '../../utils/engineeringMaterialSummary.mjs'
import {
  numeric20Scale6Units,
  multiplyNumeric20Scale6Values,
} from '../../utils/numeric20Scale6.mjs'

const validNumber = (_, value) =>
  numeric20Scale6Units(value) !== null
    ? Promise.resolve()
    : Promise.reject(new Error('请输入非负数，最多六位小数'))

export default function EngineeringMaterialFinanceFields({
  request,
  form,
  saving,
  financeIssue,
}) {
  const host = useRef(null)
  const values = Form.useWatch('items', { form, preserve: true })
  useEffect(() => {
    if (!financeIssue) return undefined
    const frame = requestAnimationFrame(() => {
      const input = [
        ...(host.current?.querySelectorAll('input, textarea') || []),
      ].find(
        (element) =>
          element.getAttribute('aria-label') ===
          `${financeIssue.label} ${financeIssue.index + 1}`
      )
      input?.focus({ preventScroll: true })
      input?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [financeIssue])

  return (
    <section
      ref={host}
      className="erp-material-finance-fields"
      aria-label="采购核价录入"
    >
      {request.items.map((item, index) => {
        const amount = multiplyNumeric20Scale6Values(
          values?.[index]?.purchase_quantity,
          values?.[index]?.unit_price,
          6
        )
        return (
          <article key={item.id} className="erp-material-finance-fields__item">
            <h3>
              <span className="erp-material-sequence">{index + 1}</span>
              {item.material_name}
            </h3>
            <p>
              {[
                item.supplier_item_no,
                item.supplier_name,
                item.spec,
                item.color,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p>
              需求数量：
              <span title={item.required_quantity}>
                {quantity(item.required_quantity)} {item.unit_name}
              </span>
            </p>
            <div className="erp-material-finance-fields__grid">
              <Form.Item
                name={['items', index, 'purchase_quantity']}
                label={`实购数量（${item.unit_name}）`}
                rules={[{ validator: validNumber }]}
              >
                <Input
                  aria-label={`实购数量 ${index + 1}`}
                  inputMode="decimal"
                  disabled={saving}
                />
              </Form.Item>
              <Form.Item
                name={['items', index, 'unit_price']}
                label="单价（元）"
                rules={[{ validator: validNumber }]}
              >
                <Input
                  aria-label={`单价 ${index + 1}`}
                  inputMode="decimal"
                  placeholder="待核价"
                  disabled={saving}
                />
              </Form.Item>
              <Form.Item
                name={['items', index, 'expected_arrival_date']}
                label="到货日期"
                rules={[{ required: true, message: '请填写到货日期' }]}
              >
                <Input
                  aria-label={`到货日期 ${index + 1}`}
                  type="date"
                  disabled={saving}
                />
              </Form.Item>
              <div className="erp-material-finance-fields__amount">
                <span>金额（元）</span>
                <strong title={amount ?? undefined}>
                  {amount ? quantity(amount) : '待核价'}
                </strong>
              </div>
              <Form.Item
                className="erp-material-finance-fields__reason"
                name={['items', index, 'note']}
                label="采购调整原因"
                dependencies={[['items', index, 'purchase_quantity']]}
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, value) => {
                      const actual = numeric20Scale6Units(
                        getFieldValue(['items', index, 'purchase_quantity'])
                      )
                      return actual !== null &&
                        actual !==
                          numeric20Scale6Units(item.required_quantity) &&
                        !String(value || '').trim()
                        ? Promise.reject(new Error('调整数量请填写原因'))
                        : Promise.resolve()
                    },
                  }),
                ]}
              >
                <BusinessTextArea
                  aria-label={`调整原因 ${index + 1}`}
                  maxLength={255}
                  minRows={1}
                  placeholder="实购不同于需求数量时必填"
                  disabled={saving}
                />
              </Form.Item>
            </div>
          </article>
        )
      })}
    </section>
  )
}
