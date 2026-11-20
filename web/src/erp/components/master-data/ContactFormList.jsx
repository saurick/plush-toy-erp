import React, { useId } from 'react'
import { ConfigProvider, Form, Input, Radio, Space } from 'antd'
import { BusinessTextPolicy } from '../../../common/consts/policies.generated.mjs'
import BusinessLineTable, { useBusinessLineTable } from '../business-list/BusinessLineTable.jsx'
import BusinessLineItemDetailsToggle, { useBusinessLineItemDetails } from '../business-list/BusinessLineItemDetails.jsx'
import BusinessLineItemActionButton from '../business-list/BusinessLineItemActionButton.jsx'
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
import BusinessLineEditor, { BusinessLineEditorInlineActions, BusinessLineEditorRowControls, useBusinessLineEditor, useBusinessLineEditorRow } from '../business-list/BusinessLineEditor.jsx'

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

function ContactTable({ multiple, label, children }) {
  const editor = useBusinessLineEditor()
  const columns = [
    { key: 'sequence', label: '序号', colClassName: 'erp-contact-editor__sequence-column', className: 'erp-contact-editor__sequence' },
    ...contactFields.map(({ name, label: fieldLabel, rules }) => ({
      key: name,
      label: fieldLabel,
      required: rules?.some((rule) => rule.required),
      colClassName: ['mobile', 'phone'].includes(name) ? 'erp-contact-editor__phone-column' : undefined,
    })),
    ...(multiple ? [{ key: 'primary', label: '主联系人', colClassName: 'erp-contact-editor__primary-column' }] : []),
    ...(editor?.compact ? [{ key: 'actions', label: '操作', colClassName: 'erp-contact-editor__actions-column' }] : []),
  ]
  return (
    <BusinessLineTable className="erp-master-contact-list__items" tableClassName="erp-contact-editor__table" label={label} columns={columns} expandableDetails={!editor?.compact} header={<BusinessLineItemsHeader title="联系人" scrollControls />} scrollControlsInToolbar>
      {children}
    </BusinessLineTable>
  )
}

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
  const table = useBusinessLineTable()
  const details = useBusinessLineItemDetails({ index, collapsible: !editor?.compact })
  const showNote = details.visible
  const actions = (
    <Space size={0}>
      <BusinessLineItemActionButton action="copy" aria-label={`复制联系人条目 ${index + 1}`} onClick={onCopy} />
      <BusinessLineItemActionButton action="remove" aria-label={`移除联系人条目 ${index + 1}`} disabled={disabled || !multiple} onClick={onRemove} />
    </Space>
  )
  const selection = useBusinessLineEditorRow({ actions, rowRef: registerRow })

  return (
    <tbody
      className="erp-master-contact-list__row erp-editable-line-group"
      aria-label={`第 ${index + 1} 位联系人`}
      {...selection.rowProps}
    >
      <tr className="erp-contact-editor__fields">
        {table?.expandableDetails ? (
          <td className="erp-line-item-table__disclosure" rowSpan={showNote ? 2 : 1}>
            <BusinessLineItemDetailsToggle index={index} label="备注" details={details} />
          </td>
        ) : null}
        <td
          className="erp-contact-editor__sequence erp-editable-line-group__sequence"
          rowSpan={showNote ? 2 : 1}
          aria-label={`第 ${index + 1} 位`}
        >
          <BusinessLineEditorRowControls selection={selection} index={index} identity={row?.name} actions={actions}>
            <span className="erp-editable-line-group__number">{index + 1}</span>
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
      <tr id={details.id} className="erp-contact-editor__note-editor" hidden={!showNote}>
        <td colSpan={table.columnCount - 1 - Number(table.expandableDetails)}>
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
          <ContactTable multiple={fields.length > 1} label={`${entityLabel}联系人`}>
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
          </ContactTable>
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
