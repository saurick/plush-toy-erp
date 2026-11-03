import React, { useId, useState } from 'react'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
import { Button, ConfigProvider, Form, Input, Radio, Space } from 'antd'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import TableScrollRegion from '@/common/components/table/TableScrollRegion.jsx'
import BusinessTextArea from '../business-list/BusinessTextArea.jsx'
import BusinessLineItemsFooter, {
  BusinessLineItemsHeader,
} from '../business-list/BusinessLineItemsFooter.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import {
  optionalContactEmailRule,
  optionalContactPhoneRule,
} from '../../utils/contactValidation.mjs'
import { withPrimaryContact } from './contactFormRows.mjs'
import './contactFormList.css'
import '../business-list/businessLineItemGroups.css'
import BusinessLineEditor, { BusinessLineEditorInlineActions, BusinessLineEditorRowControls, useBusinessLineEditor } from '../business-list/BusinessLineEditor.jsx'

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
  const editor = useBusinessLineEditor()
  const [noteOpen, setNoteOpen] = useState(false)
  const noteID = useId()
  const showNote = editor?.compact || noteOpen
  const columns = (multiple ? 7 : 6) + Number(Boolean(editor?.compact))
  const actions = (
    <Space size={0}>
      <Button type="text" size="small" icon={<CopyOutlined />} aria-label={`复制联系人条目 ${index + 1}`} onClick={onCopy}>复制行</Button>
      <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`移除联系人条目 ${index + 1}`} disabled={disabled || !multiple} onClick={onRemove}>移除行</Button>
    </Space>
  )

  return (
    <tbody
      className="erp-master-contact-list__row erp-editable-line-group"
      aria-label={`第 ${index + 1} 位联系人`}
      ref={registerRow}
    >
      <tr className="erp-contact-editor__fields">
        <td
          className="erp-contact-editor__sequence erp-editable-line-group__sequence"
          rowSpan={showNote ? 2 : 1}
          aria-label={`第 ${index + 1} 位`}
        >
          <BusinessLineEditorRowControls index={index} identity={row?.name} actions={actions}>
            {!editor?.compact ? <Button type="text" className="erp-line-editor__details-toggle" disabled={false} aria-expanded={noteOpen} aria-controls={noteID} aria-label={`${noteOpen ? '收起' : '展开'}第 ${index + 1} 行备注`} onClick={() => setNoteOpen((open) => !open)}><span aria-hidden="true">{noteOpen ? '⌄' : '›'}</span><span className="erp-editable-line-group__number">{index + 1}</span></Button> : <span className="erp-editable-line-group__number">{index + 1}</span>}
          </BusinessLineEditorRowControls>
        </td>
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
        <BusinessLineEditorInlineActions><td className="erp-contact-editor__actions">{actions}</td></BusinessLineEditorInlineActions>
      </tr>
      <tr id={noteID} className="erp-contact-editor__note-editor" hidden={!showNote}>
        <td colSpan={columns - 1}>
          <Form.Item label="备注" name={[field.name, 'note']}>
            <BusinessTextArea
              allowClear
              showCount
              maxLength={BusinessTextPolicy.noteMaxCharacters}
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
  const appendContact = (add, index) => {
    add({ is_primary: index === 0 })
    requestLineItemScroll(index)
  }
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
        <BusinessLineEditor className="erp-master-contact-list erp-contact-editor" compactThreshold={820} data-table-scroll-scope>
          <BusinessLineItemsHeader title="联系人" scrollControls />
          <TableScrollRegion className="erp-master-contact-list__items" useToolbar stickyHeader>
            <table
              className="erp-contact-editor__table"
              data-table-lines="fixed"
              aria-label={`${entityLabel}联系人`}
            >
              <colgroup>
                <col className="erp-contact-editor__sequence-column" />
                <col />
                <col />
                <col className="erp-contact-editor__phone-column" />
                <col className="erp-contact-editor__phone-column" />
                <col />
                {fields.length > 1 ? (
                  <col className="erp-contact-editor__primary-column" />
                ) : null}
                <BusinessLineEditorInlineActions><col className="erp-contact-editor__actions-column" /></BusinessLineEditorInlineActions>
              </colgroup>
              <thead>
                <tr>
                  <th className="erp-contact-editor__sequence" scope="col">
                    序号
                  </th>
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
                  <BusinessLineEditorInlineActions><th scope="col">操作</th></BusinessLineEditorInlineActions>
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
          </TableScrollRegion>
          <BusinessLineItemsFooter
            addLabel="添加联系人"
            addDisabled={componentDisabled}
            onAdd={() => appendContact(add, fields.length)}
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
        </BusinessLineEditor>
      )}
    </Form.List>
  )
}
