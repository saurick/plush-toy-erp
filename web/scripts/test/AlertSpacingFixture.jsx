import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { Alert, App, Button, ConfigProvider, Descriptions, Form, Input, Space, Spin } from 'antd'
import { ERPThemeProvider, useERPTheme } from '../../src/common/theme/erpTheme'
import { createERPAntdTheme } from '../../src/common/theme/erpAntdTheme.mjs'
import BusinessModal from '../../src/erp/components/business-list/BusinessModal.jsx'
import BusinessForm from '../../src/erp/components/business-list/BusinessForm.jsx'
import PurchaseReceiptExceptionModal from '../../src/erp/components/purchase-receipts/PurchaseReceiptExceptionModal.jsx'
import 'antd/dist/reset.css'
import '../../src/erp/styles/app.css'

const receipt = {
  id: 601,
  receipt_no: 'PR-SPACING-EXAMPLE',
  items: [{ id: 602, posted: true, material_id: 1, unit_id: 1, quantity: '10', source_line_no: '1' }],
}

function Fixture() {
  const { isDark, accent, appearance } = useERPTheme()
  const [opened, setOpened] = useState('')
  const [notices, setNotices] = useState(true)
  const [form] = Form.useForm()
  const fields = (
    <BusinessForm form={form} layout="vertical" className="erp-business-action-form">
      <Form.Item name="note" label="办理说明"><Input placeholder="填写后关闭提示，输入应保留" /></Form.Item>
    </BusinessForm>
  )
  const content = (
    <>
      <Descriptions column={1} size="small" items={[{ key: 'source', label: '来源单据', children: receipt.receipt_no }]} />
      {notices ? <Alert type="info" showIcon message="请核对当前来源单据。" /> : null}
      {notices ? <Alert type="warning" showIcon message="操作会更新相应批次的库存，请先确认数量。" /> : null}
      {notices ? <Alert type="error" showIcon closable message="部分资料未能读取，请重新读取后继续。" description={'材料名称、规格和批次需要完整核对，读取失败时保留当前办理说明。'.repeat(3)} /> : null}
      {notices ? <Alert type="success" showIcon message="资料已核对，可继续办理。" /> : null}
      {fields}
    </>
  )
  return (
    <ConfigProvider theme={createERPAntdTheme({ isDark, accent, density: appearance.density })}>
      <App>
        <main style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12, minHeight: '100dvh' }}>
          <Space wrap>
            <Button onClick={() => setOpened('purchase')}>采购退货</Button>
            <Button onClick={() => { setNotices(true); setOpened('modal') }}>业务弹窗</Button>
            <Button onClick={() => { setNotices(true); setOpened('spin') }}>加载容器弹窗</Button>
          </Space>
          <Space id="alert-spacing-owned-stack" direction="vertical" size={16} style={{ width: '100%' }}>
            <span>既有纵向布局</span>
            <Alert type="info" message="父容器已经提供间距。" />
            <span>后续内容</span>
          </Space>
          <PurchaseReceiptExceptionModal
            open={opened === 'purchase'} mode="return" receipt={receipt}
            materialOptions={[{ value: 1, label: '模拟绒布' }]}
            onCancel={() => setOpened('')} onSubmit={() => {}}
          />
          <BusinessModal
            open={opened === 'modal' || opened === 'spin'} title="提示间距验证" className="erp-business-action-modal"
            onCancel={() => setOpened('')} destroyOnHidden
            footer={<Space><Button onClick={() => setNotices(!notices)}>{notices ? '隐藏提示' : '显示提示'}</Button><Button onClick={() => setOpened('')}>关闭</Button></Space>}
          >
            {opened === 'spin' ? <Spin spinning={false}>{content}</Spin> : content}
          </BusinessModal>
        </main>
      </App>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <MemoryRouter><ERPThemeProvider><Fixture /></ERPThemeProvider></MemoryRouter>
)
