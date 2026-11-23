import { useRef, useState } from 'react'
import { Alert, Form, Input, Typography } from 'antd'
import AppModal from '@/common/components/modal/AppModal'
import { CUSTOMER_KEY_PATTERN } from '../../../../../config/customers/index.mjs'
import templateSource from '../../../../../config/customers/reference-customer/customer-draft.template.json?raw'
import { customerPackageSchema } from '../../../../../config/schemas/customerPackageSchema.mjs'

const keyLimit = customerPackageSchema.draftCustomerKeyMaxLength
const nameLimit = customerPackageSchema.draftCustomerNameMaxLength
const templateUrl = `data:application/json;charset=utf-8,${encodeURIComponent(templateSource)}`
const draftErrors = {
  draft_workspace_busy: '工作区正在处理客户配置操作，请稍后再试。',
  draft_registry_changed: '客户包登记发生变化。请核对工作区后重试。',
  draft_template_invalid: '标准 JSON 模板未通过检查。请修正模板文件后重试。',
}

export function CustomerDraftDialog({ open, busy, onClose, onCreate, onCreated }) {
  const [form] = Form.useForm()
  const keyInput = useRef(null)
  const [error, setError] = useState('')

  const submit = async ({ customerKey, customerName }) => {
    if (busy) return
    setError('')
    try {
      const createdCustomer = await onCreate({
        customerKey: customerKey.trim(),
        customerName: customerName.trim(),
      })
      onCreated(createdCustomer)
    } catch (failure) {
      if (failure?.name === 'AbortError') return
      const code = failure?.draftCode
      if (code === 'customer_key_taken' || code === 'invalid_customer_key') {
        form.setFields([{
          name: 'customerKey',
          errors: [code === 'customer_key_taken' ? '客户标识已使用，请填写其他标识。' : '请填写有效的客户标识。'],
        }])
        keyInput.current?.focus()
        return
      }
      if (code === 'invalid_customer_name') {
        form.setFields([{ name: 'customerName', errors: ['请填写有效的客户名称。'] }])
        return
      }
      setError(draftErrors[code] || '草稿创建结果未确认。可以用相同的标识和名称重试。')
    }
  }

  return (
    <AppModal
      open={open}
      title="从模板新建草稿"
      width={440}
      okText="创建并检查"
      cancelText="取消"
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      closable={!busy}
      keyboard={!busy}
      maskClosable={false}
      destroyOnHidden
      onCancel={() => {
        setError('')
        onClose()
      }}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (visible) keyInput.current?.focus()
      }}
    >
      <Typography.Paragraph type="secondary">
        填写客户标识和名称。其余配置取自标准 JSON 模板。{' '}
        <Typography.Link href={templateUrl} download="customer-draft.template.json">
          下载 JSON 模板
        </Typography.Link>
      </Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false} disabled={busy} onFinish={submit}>
        <Form.Item
          name="customerKey"
          label="客户标识"
          rules={[
            { required: true, whitespace: true, message: '请填写客户标识。' },
            { pattern: CUSTOMER_KEY_PATTERN, transform: (value) => value?.trim(), message: '请使用小写字母、数字和连字符。' },
          ]}
        >
          <Input ref={keyInput} maxLength={keyLimit} placeholder="例如 acme-toys" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="customerName"
          label="客户名称"
          rules={[{ required: true, whitespace: true, message: '请填写客户名称。' }]}
        >
          <Input maxLength={nameLimit} placeholder="填写客户的显示名称" autoComplete="off" />
        </Form.Item>
      </Form>
      {error && <Alert type="error" message={error} showIcon />}
    </AppModal>
  )
}
