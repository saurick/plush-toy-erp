import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, ConfigProvider, Form, theme } from 'antd'
import ContactFormList from '../../src/erp/components/master-data/ContactFormList.jsx'
import {
  contactRowsForForm,
  normalizeContactRows,
} from '../../src/erp/components/master-data/contactFormRows.mjs'
import 'antd/dist/reset.css'
import '../../src/erp/styles/app.css'

const initialContacts = [
  {
    id: 41,
    name: '小陈',
    title: '业务联系',
    mobile: '13900000001',
    note: '工作日联系\n请先电话确认',
    is_primary: true,
  },
  {
    id: 42,
    name: '小周',
    title: '收货联系',
    mobile: '13900000002',
    note: '仓库北门收货',
    is_primary: false,
  },
]

function Fixture() {
  const [form] = Form.useForm()
  const [saved, setSaved] = useState(initialContacts)
  const [disabled, setDisabled] = useState(false)
  const dark =
    new URLSearchParams(window.location.search).get('theme') === 'dark'
  return (
    <ConfigProvider
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      <main style={{ padding: 24, maxWidth: 1100, margin: 'auto' }}>
        <h1>联系人填写验证</h1>
        <Form
          form={form}
          layout="vertical"
          disabled={disabled}
          className="erp-business-form erp-business-action-form"
          initialValues={{ contacts: contactRowsForForm(initialContacts) }}
          onFinish={(values) => setSaved(normalizeContactRows(values.contacts))}
        >
          <ContactFormList form={form} entityLabel="客户" />
          <Button htmlType="submit">保存联系人</Button>
        </Form>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginBlock: 20,
          }}
        >
          <Button
            onClick={() => {
              form.resetFields()
              form.setFieldsValue({ contacts: contactRowsForForm(saved) })
            }}
          >
            重新读回
          </Button>
          <Button
            onClick={() => {
              form.resetFields()
              form.setFieldsValue({
                contacts: contactRowsForForm([
                  { id: 99, name: '另一个客户联系人', note: '' },
                ]),
              })
            }}
          >
            切换记录
          </Button>
          <Button onClick={() => setDisabled((value) => !value)}>
            切换只读
          </Button>
        </div>
        <pre
          aria-label="保存结果"
          style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {JSON.stringify(saved)}
        </pre>
      </main>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
