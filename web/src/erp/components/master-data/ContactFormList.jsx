import React, { useId, useState } from 'react'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
import { Button, ConfigProvider, Form, Input, Radio, Space } from 'antd'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessLineItemsFooter from '../business-list/BusinessLineItemsFooter.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  optionalContactEmailRule,
  optionalContactPhoneRule,
} from '../../utils/contactValidation.mjs'
import { withPrimaryContact } from './contactFormRows.mjs'
import './contactFormList.css'

const contactFields = [
  {
    name: 'name',
    label: '联系人',
    rules: [{ required: true, message: '请填写联系人' }],
  },
  { name: 'title', label: '职位' },
  {
    name: 'mobile',
    label: '手机',
    rules: [optionalContactPhoneRule('请输入有效手机或联系电话')],
  },
  { name: 'phone', label: '电话', rules: [optionalContactPhoneRule()] },
  { name: 'email', label: '邮箱', rules: [optionalContactEmailRule()] },
]

function ContactRow({
  field,
  index,
  row,
  multiple,
  disabled,
  primaryGroup,
  registerRow,
  onPrimary,
  onCopy,
  onRemove,
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const noteID = useId()
  const columns = multiple ? 7 : 6
  const note = String(row?.note || '')

  return (
    <tbody className="erp-master-contact-list__row" ref={registerRow}>
      <tr className="erp-contact-editor__fields">
        {contactFields.map(({ name, label, rules }) => (
          <td key={name} className={`erp-contact-editor__${name}`}>
            {name === 'name' ? (
              <>
                <Form.Item name={[field.name, 'id']} hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'is_primary']}
                  valuePropName="checked"
                  hidden
                >
                  <input type="checkbox" />
                </Form.Item>
              </>
            ) : null}
            <Form.Item label={label} name={[field.name, name]} rules={rules}>
              <Input allowClear autoComplete="off" />
            </Form.Item>
          </td>
        ))}
        {multiple ? (
          <td className="erp-contact-editor__primary">
            <span className="erp-contact-editor__mobile-label">主联系人</span>
            <Radio
              name={primaryGroup}
              checked={Boolean(row?.is_primary)}
              aria-label={`设为主联系人 ${index + 1}`}
              onChange={onPrimary}
            />
          </td>
        ) : null}
        <td className="erp-contact-editor__actions">
          <Space size={0}>
            <Button
              type="text"
              size="small"
              aria-label={`${noteOpen ? '收起' : '展开'}联系人备注 ${index + 1}`}
              aria-expanded={noteOpen}
              aria-controls={noteID}
              onClick={() => setNoteOpen((open) => !open)}
            >
              {noteOpen ? '收起' : '备注'}
            </Button>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              aria-label={`复制联系人条目 ${index + 1}`}
              onClick={onCopy}
            />
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              aria-label={`移除联系人条目 ${index + 1}`}
              disabled={disabled || !multiple}
              onClick={onRemove}
            />
          </Space>
        </td>
      </tr>
      {note && !noteOpen ? (
        <tr className="erp-contact-editor__note-summary">
          <td colSpan={columns}>
            <button
              type="button"
              aria-label={`查看联系人备注 ${index + 1}`}
              onClick={() => setNoteOpen(true)}
            >
              <span>备注：</span>
              {note}
            </button>
          </td>
        </tr>
      ) : null}
      <tr
        className="erp-contact-editor__note-editor"
        hidden={!noteOpen}
        id={noteID}
      >
        <td colSpan={columns}>
          <Form.Item label="备注" name={[field.name, 'note']}>
            <BusinessTextArea
              allowClear
              showCount
              maxLength={200}
              minRows={2}
            />
          </Form.Item>
        </td>
      </tr>
    </tbody>
  )
}

export default function ContactFormList({ form, entityLabel }) {
  const { componentDisabled } = ConfigProvider.useConfig()
  const rows = Form.useWatch('contacts', form) || []
  const primaryGroup = useId()
  const { registerLineItemRow, requestLineItemScroll } =
    useLineItemAppendScroll()
  return (
    <Form.List
      name="contacts"
      rules={[
        {
          validator: async (_, values) => {
            if (!Array.isArray(values) || values.length === 0) {
              throw new Error(`请至少维护一个${entityLabel}联系人`)
            }
            if (!values.some((row) => String(row?.name ?? '').trim())) {
              throw new Error(`请填写${entityLabel}联系人`)
            }
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <div className="erp-master-contact-list erp-contact-editor">
          <div className="erp-master-contact-list__head">
            <strong>联系人</strong>
          </div>
          <div className="erp-master-contact-list__items">
            <table
              className="erp-contact-editor__table"
              aria-label={`${entityLabel}联系人`}
            >
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col className="erp-contact-editor__email-column" />
                {fields.length > 1 ? (
                  <col className="erp-contact-editor__primary-column" />
                ) : null}
                <col className="erp-contact-editor__actions-column" />
              </colgroup>
              <thead>
                <tr>
                  {contactFields.map(({ name, label, rules }) => (
                    <th key={name} scope="col">
                      {rules?.some((rule) => rule.required) ? (
                        <span
                          className="erp-contact-editor__required"
                          aria-hidden="true"
                        >
                          *
                        </span>
                      ) : null}
                      {label}
                    </th>
                  ))}
                  {fields.length > 1 ? <th scope="col">主联系人</th> : null}
                  <th scope="col">操作</th>
                </tr>
              </thead>
              {fields.map((field, index) => (
                <ContactRow
                  key={field.key}
                  field={field}
                  index={index}
                  row={rows[field.name]}
                  multiple={fields.length > 1}
                  disabled={componentDisabled}
                  primaryGroup={primaryGroup}
                  registerRow={(node) => registerLineItemRow(index, node)}
                  onPrimary={() =>
                    form.setFieldsValue({
                      contacts: withPrimaryContact(
                        form.getFieldValue('contacts') || [],
                        field.name
                      ),
                    })
                  }
                  onCopy={() => {
                    const currentRow =
                      form.getFieldValue(['contacts', field.name]) || {}
                    add(
                      { ...currentRow, id: undefined, is_primary: false },
                      index + 1
                    )
                    requestLineItemScroll(index + 1)
                  }}
                  onRemove={() => {
                    const next = (form.getFieldValue('contacts') || []).filter(
                      (_, i) => i !== field.name
                    )
                    remove(field.name)
                    form.setFieldsValue({ contacts: withPrimaryContact(next) })
                  }}
                />
              ))}
            </table>
          </div>
          <BusinessLineItemsFooter
            addLabel="添加联系人"
            addDisabled={componentDisabled}
            onAdd={() => {
              add({ is_primary: fields.length === 0 })
              requestLineItemScroll(fields.length)
            }}
            stats={[
              {
                key: 'count',
                label: '已录入',
                value: fields.length,
                suffix: '人',
              },
            ]}
          />
          <Form.ErrorList errors={errors} />
        </div>
      )}
    </Form.List>
  )
}
