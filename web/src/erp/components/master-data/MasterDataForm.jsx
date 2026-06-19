import React, { useState } from 'react'
import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import {
  AutoComplete,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd'

function DefaultUnitSelect({ required = false, unitOptions, unitLoading }) {
  return (
    <Form.Item
      className="erp-business-action-form__field"
      label="默认单位"
      name="default_unit_id"
      rules={
        required ? [{ required: true, message: '请选择默认单位' }] : undefined
      }
    >
      <Select
        allowClear={!required}
        showSearch
        loading={unitLoading}
        options={unitOptions}
        placeholder="请选择默认单位"
        optionFilterProp="label"
      />
    </Form.Item>
  )
}

function TextSuggestionInput({
  className = '',
  options = [],
  placeholder = '',
  value,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  const hasOptions = options.length > 0
  const popupClassName = className ? `${className}__popup` : ''
  return (
    <AutoComplete
      allowClear
      className={className}
      classNames={
        popupClassName
          ? {
              popup: {
                root: popupClassName,
              },
            }
          : undefined
      }
      filterOption={(inputValue, option) =>
        String(option?.value || '')
          .toLowerCase()
          .includes(String(inputValue || '').toLowerCase())
      }
      onBlur={() => setOpen(false)}
      onChange={onChange}
      onFocus={() => setOpen(true)}
      onOpenChange={setOpen}
      open={open && hasOptions}
      options={options}
      placeholder={placeholder}
      value={value}
    />
  )
}

export function mergeTextSuggestionOptions(
  defaultValues = [],
  existingOptions = []
) {
  const seen = new Set()
  return [...defaultValues.map((value) => ({ value })), ...existingOptions]
    .map((option) => ({
      ...option,
      value: String(option?.value || '').trim(),
    }))
    .filter((option) => {
      if (!option.value || seen.has(option.value)) {
        return false
      }
      seen.add(option.value)
      return true
    })
}

export function MasterDataFormFields({
  type,
  productOptions = [],
  unitOptions = [],
  unitLoading = false,
  materialCategoryOptions = [],
  materialColorOptions = [],
  processNameOptions = [],
  processCategoryOptions = [],
  supplierTypeOptions = [],
}) {
  if (type === 'products') {
    return (
      <>
        <Form.Item
          className="erp-business-action-form__field"
          label="产品编号（自动）"
          name="code"
          rules={[{ required: true, message: '请填写或保留自动产品编号' }]}
        >
          <Input
            allowClear
            autoComplete="off"
            placeholder="自动生成，可按需要调整"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="产品名称"
          name="name"
          rules={[{ required: true, message: '请填写产品名称' }]}
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="内部款号"
          name="style_no"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="客户款号"
          name="customer_style_no"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <DefaultUnitSelect
          required
          unitOptions={unitOptions}
          unitLoading={unitLoading}
        />
      </>
    )
  }

  if (type === 'product_skus') {
    return (
      <>
        <Form.Item
          className="erp-business-action-form__field"
          label="产品"
          name="product_id"
          rules={[{ required: true, message: '请选择产品' }]}
        >
          <Select
            allowClear
            optionFilterProp="label"
            options={productOptions}
            placeholder="请选择产品"
            showSearch
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="SKU 编号（自动）"
          name="sku_code"
          rules={[{ required: true, message: '请填写或保留自动 SKU 编号' }]}
        >
          <Input
            allowClear
            autoComplete="off"
            placeholder="自动生成，可按需要调整"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="SKU 名称"
          name="sku_name"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="条码"
          name="barcode"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="客户 SKU"
          name="customer_sku"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="颜色"
          name="color"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="色号"
          name="color_no"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="尺码"
          name="size"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="包装版本"
          name="packaging_version"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
        <DefaultUnitSelect
          unitOptions={unitOptions}
          unitLoading={unitLoading}
        />
      </>
    )
  }

  if (type === 'processes') {
    return (
      <>
        <Form.Item
          className="erp-business-action-form__field"
          label="环节编号（自动）"
          name="code"
          rules={[{ required: true, message: '请填写或保留自动环节编号' }]}
        >
          <Input
            allowClear
            autoComplete="off"
            placeholder="自动生成，可按需要调整"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="环节名称"
          name="name"
          rules={[{ required: true, message: '请填写环节名称' }]}
        >
          <TextSuggestionInput
            className="erp-process-name-suggested-input"
            options={processNameOptions}
            placeholder="如查货、手工、车缝、包装，也可直接输入新环节"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="环节类别"
          name="category"
        >
          <TextSuggestionInput
            className="erp-process-category-suggested-input"
            options={processCategoryOptions}
            placeholder="从行业默认类别选择，或直接输入新类别"
          />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="排序"
          name="sort_order"
        >
          <InputNumber min={0} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="可委外"
          name="outsourcing_enabled"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="可内制"
          name="inhouse_enabled"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field"
          label="需质检"
          name="quality_required"
          extra="只标记该工序后续可能需要质检；合格、不合格、让步、返工等结果仍由质检 / 异常模块记录。"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          className="erp-business-action-form__field erp-business-action-form__field--full"
          label="备注"
          name="note"
        >
          <Input.TextArea allowClear rows={3} showCount maxLength={300} />
        </Form.Item>
      </>
    )
  }

  return (
    <>
      <Form.Item
        className="erp-business-action-form__field"
        label="编号（自动）"
        name="code"
        rules={[{ required: true, message: '请填写或保留自动编号' }]}
      >
        <Input
          allowClear
          autoComplete="off"
          placeholder="自动生成，可按需要调整"
        />
      </Form.Item>
      <Form.Item
        className="erp-business-action-form__field"
        label="名称"
        name="name"
        rules={[{ required: true, message: '请填写名称' }]}
      >
        <Input allowClear autoComplete="off" />
      </Form.Item>
      {type === 'materials' ? null : (
        <Form.Item
          className="erp-business-action-form__field"
          label="简称"
          name="short_name"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
      )}
      {type === 'suppliers' ? (
        <Form.Item
          className="erp-business-action-form__field"
          label="供应商类型"
          name="supplier_type"
        >
          <Select
            allowClear
            options={supplierTypeOptions}
            placeholder="请选择供应商类型"
          />
        </Form.Item>
      ) : null}
      {type === 'materials' ? (
        <>
          <Form.Item
            className="erp-business-action-form__field"
            label="分类"
            name="category"
          >
            <TextSuggestionInput
              className="erp-material-category-suggested-input"
              options={materialCategoryOptions}
              placeholder="从已有分类选择，或直接输入新分类"
            />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="规格"
            name="spec"
          >
            <Input allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            className="erp-business-action-form__field"
            label="颜色"
            name="color"
          >
            <TextSuggestionInput
              className="erp-material-color-suggested-input"
              options={materialColorOptions}
              placeholder="从已有颜色选择，或直接输入新颜色"
            />
          </Form.Item>
          <DefaultUnitSelect
            required
            unitOptions={unitOptions}
            unitLoading={unitLoading}
          />
        </>
      ) : (
        <Form.Item
          className="erp-business-action-form__field"
          label="税号"
          name="tax_no"
        >
          <Input allowClear autoComplete="off" />
        </Form.Item>
      )}
      <Form.Item
        className="erp-business-action-form__field erp-business-action-form__field--full"
        label="备注"
        name="note"
      >
        <Input.TextArea allowClear rows={3} showCount maxLength={300} />
      </Form.Item>
    </>
  )
}

export function createEmptyContactRow() {
  return { is_primary: true }
}

function contactRecordToFormRow(contact = {}) {
  return {
    id: contact.id,
    name: contact.name || '',
    title: contact.title || '',
    mobile: contact.mobile || '',
    phone: contact.phone || '',
    email: contact.email || '',
    note: contact.note || '',
    is_primary: contact.is_primary === true,
  }
}

export function contactRowsForForm(contacts = []) {
  const activeContacts = Array.isArray(contacts)
    ? contacts.filter((contact) => contact?.is_active !== false)
    : []
  const rows = activeContacts.map(contactRecordToFormRow)
  return rows.length > 0 ? rows : [createEmptyContactRow()]
}

function hasContactPayload(row = {}) {
  return ['name', 'title', 'mobile', 'phone', 'email', 'note'].some((key) =>
    String(row?.[key] ?? '').trim()
  )
}

export function normalizeContactRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id || hasContactPayload(row))
    .map((row) => ({
      ...row,
      id: row?.id ? Number(row.id) : undefined,
      name: String(row?.name ?? '').trim(),
      title: String(row?.title ?? '').trim(),
      mobile: String(row?.mobile ?? '').trim(),
      phone: String(row?.phone ?? '').trim(),
      email: String(row?.email ?? '').trim(),
      note: String(row?.note ?? '').trim(),
      is_primary: row?.is_primary === true,
    }))
}

export function ContactFormList({ form, entityLabel }) {
  return (
    <Form.List
      name="contacts"
      rules={[
        {
          validator: async (_, rows) => {
            if (!Array.isArray(rows) || rows.length === 0) {
              throw new Error(`请至少维护一个${entityLabel}联系人`)
            }
            if (!rows.some((row) => String(row?.name ?? '').trim())) {
              throw new Error(`请填写${entityLabel}联系人`)
            }
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <div className="erp-master-contact-list">
          <div className="erp-master-contact-list__head">
            <div>
              <strong>联系人</strong>
              <span>
                联系人随当前{entityLabel}
                维护，不作为独立业务对象，也不生成订单、出货、库存或财务事实。
              </span>
            </div>
          </div>
          <div className="erp-master-contact-list__items">
            {fields.map((field, index) => (
              <div className="erp-master-contact-list__row" key={field.key}>
                <div className="erp-master-contact-list__row-head">
                  <strong>条目 {index + 1}</strong>
                  <Space size={4}>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      aria-label={`复制联系人条目 ${index + 1}`}
                      onClick={() => {
                        const currentRow =
                          form.getFieldValue(['contacts', field.name]) || {}
                        add({
                          ...currentRow,
                          id: undefined,
                          is_primary: false,
                        })
                      }}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除联系人条目 ${index + 1}`}
                      disabled={fields.length <= 1}
                      onClick={() => remove(field.name)}
                    />
                  </Space>
                </div>
                <Form.Item name={[field.name, 'id']} hidden>
                  <Input />
                </Form.Item>
                <div className="erp-master-contact-list__grid">
                  <Form.Item
                    label="联系人"
                    name={[field.name, 'name']}
                    rules={[{ required: true, message: '请填写联系人' }]}
                  >
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="职位" name={[field.name, 'title']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="手机" name={[field.name, 'mobile']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="电话" name={[field.name, 'phone']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item label="邮箱" name={[field.name, 'email']}>
                    <Input allowClear autoComplete="off" />
                  </Form.Item>
                  <Form.Item
                    label="主联系人"
                    name={[field.name, 'is_primary']}
                    valuePropName="checked"
                  >
                    <Switch
                      onChange={(checked) => {
                        const rows = form.getFieldValue('contacts') || []
                        form.setFieldValue(
                          'contacts',
                          rows.map((row, rowIndex) => {
                            if (rowIndex === field.name) {
                              return { ...row, is_primary: checked }
                            }
                            return checked ? { ...row, is_primary: false } : row
                          })
                        )
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    className="erp-master-contact-list__field--full"
                    label="备注"
                    name={[field.name, 'note']}
                  >
                    <Input.TextArea
                      allowClear
                      rows={2}
                      showCount
                      maxLength={200}
                    />
                  </Form.Item>
                </div>
              </div>
            ))}
          </div>
          <div className="erp-line-items-form__footer">
            <div className="erp-line-items-form__footer-actions">
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ is_primary: false })}
              >
                添加条目
              </Button>
            </div>
            <div className="erp-line-items-form__stats">
              <span className="erp-line-items-form__stat">
                已录入
                <strong className="erp-line-items-form__stat-value">
                  {fields.length}
                </strong>
                条
              </span>
            </div>
          </div>
          <Form.ErrorList errors={errors} />
        </div>
      )}
    </Form.List>
  )
}
