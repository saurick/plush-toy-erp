import React, { useState } from 'react'
import { Button, Radio, Space } from 'antd'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { BusinessActionTooltip } from '../business-list/BusinessListLayout.jsx'
import { getEngineeringBOMAction } from '../../utils/bomPreparationNavigation.mjs'

export default function EngineeringBOMAction({ productID, bomID, boms, permissions, disabled, onOpen }) {
  const [choosing, setChoosing] = useState(false)
  const [choice, setChoice] = useState(null)
  const action = getEngineeringBOMAction({ productID, bomID, boms, ...permissions })
  if (!action) return null
  const drafts = boms.filter((bom) => bom.product_id === productID && bom.status === 'DRAFT')
  const open = () => {
    if (action.mode === 'create' && drafts.length) {
      setChoice(drafts.length === 1 && permissions.canUpdate ? drafts[0].id : null)
      setChoosing(true)
    } else if (action.mode !== 'create' || permissions.canCreate) {
      onOpen({ mode: action.mode, bomID: bomID || null })
    }
  }
  const reason = action.disabledReason ||
    (action.mode === 'create' && !permissions.canCreate && !drafts.length ? '当前产品没有可继续编制的草稿，请有新建权限的同事先建立 BOM' : '')
  return (
    <>
      <BusinessActionTooltip disabled={disabled || Boolean(reason)} disabledReason={reason || '当前资料处理完成后可操作'}>
        <Button size="small" data-business-action-key="prepare-bom" disabled={disabled || Boolean(reason)} onClick={open}>
          {action.label}
        </Button>
      </BusinessActionTooltip>
      <BusinessModal
        title="选择要编制的 BOM"
        open={choosing}
        destroyOnHidden
        onCancel={() => setChoosing(false)}
        okText={choice === 'new' ? '新建 BOM' : '继续编制'}
        okButtonProps={{ disabled: !choice || disabled }}
        onOk={() => {
          setChoosing(false)
          onOpen({ mode: choice === 'new' ? 'create' : 'edit', bomID: choice === 'new' ? null : choice })
        }}
      >
        <p>此产品已有草稿，请核对版本后继续编制；需要独立版本时再新建。</p>
        <Radio.Group value={choice} onChange={(event) => setChoice(event.target.value)}>
          <Space direction="vertical">
            {drafts.map((bom) => <Radio key={bom.id} value={bom.id} disabled={!permissions.canUpdate}>{bom.version} · 草稿{bom.source_order_no ? ` · ${bom.source_order_no}` : ''}</Radio>)}
            {permissions.canCreate ? <Radio value="new">新建独立 BOM 草稿</Radio> : null}
          </Space>
        </Radio.Group>
      </BusinessModal>
    </>
  )
}
