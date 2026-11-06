import React, { useState } from 'react'
import { Alert, Button, Form, Input } from 'antd'
import Modal from '@/common/components/modal/AppModal'
import SupplementalHelp from '@/common/components/help/SupplementalHelp'
import ERPAppearanceHelp from '@/common/components/theme/ERPAppearanceHelp'
import { BusinessHelpLabel, BusinessPageHelpTrigger } from '@/erp/components/help/BusinessContextHelp'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'

export default function DevSupplementalHelpExample() {
  const [draft, setDraft] = useState('保留这段演示草稿')
  const [open, setOpen] = useState(false)
  return (
    <div className="erp-supplemental-help-example">
      <Form layout="vertical" className="erp-business-action-form erp-supplemental-help-example__fields">
        <Form.Item label="参考编号"><Input aria-label="演示参考编号" placeholder="例如 PO-01" /></Form.Item>
        <Form.Item label={<BusinessHelpLabel label="备注" description="备注补充本次操作的背景，说明的展开和收起不会改变输入。" />}>
          <BusinessTextArea aria-label="演示备注" value={draft} onChange={(event) => setDraft(event.target.value)} />
        </Form.Item>
      </Form>
      <div className="erp-supplemental-help-example__examples">
        <span>表格密度 <ERPAppearanceHelp kind="density" /></span>
        <span>说明内可操作 <SupplementalHelp label="演示内容" title="演示内容" renderContent={(close) => <div><p>说明可保留相关链接与关闭按钮。</p><Button onClick={() => close()}>收起说明</Button></div>} /></span>
        <Button onClick={() => setOpen(true)}>在弹窗中查看</Button>
      </div>
      <div className="erp-supplemental-help-example__examples">
        <span>完整页面帮助 <BusinessPageHelpTrigger pageKey="accessories-purchase" /></span>
      </div>
      <Alert type="warning" showIcon message="演示警告：请先补齐必填内容。" />
      <Modal
        title="弹窗内的补充说明"
        open={open}
        onCancel={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>关闭弹窗</Button>}
      >
        <p>备注 <SupplementalHelp label="弹窗备注" content="这是一段可悬停、聚焦和点按查看的说明。Esc 先收起说明，保留当前弹窗与草稿。" /></p>
        <BusinessTextArea aria-label="弹窗演示备注" value={draft} onChange={(event) => setDraft(event.target.value)} />
      </Modal>
    </div>
  )
}
