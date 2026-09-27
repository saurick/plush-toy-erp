import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, ConfigProvider, Form, theme } from 'antd'
import DeliveryAddressFields from '../../src/erp/components/business-list/DeliveryAddressFields.jsx'
import { buildMasterDataParams } from '../../src/erp/utils/masterDataParams.mjs'
import {
  buildDeliverySnapshot,
  buildSalesOrderCustomerSourceValues,
  deliverySnapshotFormValues,
} from '../../src/erp/utils/sourcePartySnapshots.mjs'
import 'antd/dist/reset.css'
import '../../src/erp/styles/app.css'

function Fixture() {
  const [form] = Form.useForm()
  const [disabled, setDisabled] = useState(false)
  const [customer, setCustomer] = useState(true)
  const [saved, setSaved] = useState(null)
  const dark =
    new URLSearchParams(window.location.search).get('theme') === 'dark'
  return (
    <ConfigProvider
      theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm }}
    >
      <main style={{ padding: 24, maxWidth: 1100, margin: 'auto' }}>
        <h1>收货地址表单验证</h1>
        <Form
          form={form}
          layout="vertical"
          disabled={disabled}
          className="erp-business-form erp-business-action-form"
          onFinish={(values) =>
            setSaved(
              customer
                ? buildMasterDataParams(values)
                : buildDeliverySnapshot(values)
            )
          }
        >
          <DeliveryAddressFields form={form} customer={customer} />
          <Button htmlType="submit">保存收货信息</Button>
        </Form>
        <div
          style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}
        >
          <Button onClick={() => form.resetFields()}>清空表单</Button>
          <Button
            onClick={() =>
              form.setFieldsValue(
                customer ? saved : deliverySnapshotFormValues(saved)
              )
            }
          >
            重新读回
          </Button>
          <Button
            onClick={() => {
              setCustomer(false)
              form.setFieldsValue(
                buildSalesOrderCustomerSourceValues({ id: 1, ...saved })
              )
            }}
          >
            带入销售订单
          </Button>
          <Button
            onClick={() =>
              form.setFieldsValue(
                buildSalesOrderCustomerSourceValues({ id: 2 })
              )
            }
          >
            切换为空地址客户
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
