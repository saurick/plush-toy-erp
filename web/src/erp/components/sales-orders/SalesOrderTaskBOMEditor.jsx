import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import Select from '@/common/components/select/AppSelect'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import useWorkflowTaskBusinessResult from '../../hooks/useWorkflowTaskBusinessResult.js'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { salesOrderProductionQuantity, salesOrderRequirementName } from '../../utils/salesOrderRequirements.mjs'
import { engineeringMaterialLocked, readTaskBOMOrder, saveTaskBOMOrderLink, completeTaskEngineering } from '../../utils/taskBOMOrderLink.mjs'
import { useBusinessEditorGroup } from '../business-list/BusinessEditorGroup.jsx'
import BusinessEditorWorkspace, { BusinessEditorPane } from '../business-list/BusinessEditorWorkspace.jsx'
import BOMEditor from '../bom/BOMEditor.jsx'
import ProductRecordEditor from '../master-data/ProductRecordEditor.jsx'
import { createTaskMutationAttemptStore } from '../../utils/workflowTaskMutation.mjs'

// Only task context lives here. The original BOM editor owns every business
// field, validation, attachment, import and draft save. Completion is the order action.
export default function SalesOrderTaskBOMEditor({ orderID, onCancel }) {
  const outlet = useBusinessPageContext()
  const profile = outlet?.adminProfile
  const editors = useBusinessEditorGroup()
  const reportResult = useWorkflowTaskBusinessResult()
  const [context, setContext] = useState(null)
  const [source, setSource] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [pane, setPane] = useState('bom')
  const [productEditor, setProductEditor] = useState(false)
  const completionAttempts = useRef(createTaskMutationAttemptStore())
  const selectProduct = useRef(null)
  const active = useRef(false)
  const readOnly = outlet?.taskBusiness?.readOnly === true || !hasActionPermission(profile, PermissionCode.SALES_ORDER_ENGINEERING_UPDATE) || engineeringMaterialLocked(context?.order)
  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    setContext(null)
    setSource(null)
    setError('')
    readTaskBOMOrder(orderID, { signal: controller.signal }).then((next) => {
      if (controller.signal.aborted) return
      setContext(next)
      setSource(next.items[0] || null)
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(getActionErrorMessage(reason, '读取本单产品'))
    })
    return () => { active.current = false; controller.abort() }
  }, [orderID, retry])

  if (error) return <Alert type="warning" showIcon message={error} action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} />
  if (!context) return <Spin />
  if (!source) return <p>本单已没有待办理的产品。</p>
  const canCreateProduct = !readOnly && !source.product_id && hasActionPermission(profile, PermissionCode.PRODUCT_CREATE)
  // Keep the editor's source stable after saving. Read-only changes must not
  // reload the initial empty draft when automatic review locks a newly saved BOM.
  const mode = source.bom_id
    ? hasActionPermission(profile, PermissionCode.BOM_UPDATE) ? 'edit' : 'view'
    : 'create'

  return (
    <BusinessEditorWorkspace
      open
      toolbar={
        <>
          {pane === 'product' ? <Button disabled={editors.busy} onClick={() => setPane('bom')}>返回 BOM</Button> : null}
          <div className="erp-engineering-workspace__products" aria-label="本次产品">
            {context.items.length > 1 ? (
              <label>
                <span>本单产品</span>
                <Select
                  aria-label="本单产品"
                  value={source.id}
                  allowClear={false /* 不可清空：本次办理必须选定一条订单明细。 */}
                  disabled={editors.busy}
                  options={context.items.map((item) => ({ value: item.id, label: `第 ${item.line_no} 行 · ${salesOrderRequirementName(item)}` }))}
                  onChange={async (id) => {
                    if (!(await editors.confirmLeave({ intent: 'object' }))) return
                    setSource(context.items.find((item) => item.id === id))
                    setPane('bom')
                    setProductEditor(false)
                  }}
                />
              </label>
            ) : <span>{salesOrderRequirementName(source)}</span>}
            <span className="erp-business-editor-workspace__source">{context.order.order_no}</span>
            {engineeringMaterialLocked(context.order) ? <span>用料已自动送审</span> : null}
          </div>
        </>
      }
    >
      <BusinessEditorPane value="bom" label="BOM" active={pane === 'bom'}>
        <BOMEditor
          key={source.id}
          open
          continuous
          mode={mode}
          record={source.bom_id ? { id: source.bom_id } : null}
          readOnly={readOnly}
          initialValues={{ product_id: source.product_id || undefined, source_order_no: context.order.order_no, quantity_text: salesOrderProductionQuantity(source) }}
          onClose={onCancel}
          renderProductActions={canCreateProduct ? ({ onSelect }) => <Button type="link" size="small" disabled={editors.busy} onClick={() => { selectProduct.current = onSelect; setProductEditor(true); setPane('product') }}>新建产品</Button> : null}
          onSaved={async (bom) => {
            const saved = await saveTaskBOMOrderLink({ orderID, source: context.items.find((item) => item.id === source.id), bom })
            if (!active.current) return
            setContext(saved)
            // Keep the mounted editor and its saved identity through retries.
            reportResult('BOM 草稿已保存', bom)
          }}
          onComplete={async (bom) => {
            const saved = await completeTaskEngineering({ orderID, sources: context.items.map((item) => item.id === source.id ? { ...item, product_id: bom.product_id, bom_id: bom.id, product_sku_id: item.product_id === bom.product_id ? item.product_sku_id : null } : item), taskID: outlet?.taskBusiness?.taskID, attempts: completionAttempts.current })
            if (!active.current) return
            setContext(saved)
            await reportResult(engineeringMaterialLocked(saved.order) ? '工程资料已完成，用料已自动送审' : '工程资料已完成，订单生效后自动送审用料', saved.order)
          }}
        />
      </BusinessEditorPane>
      {productEditor ? (
        <BusinessEditorPane value="product" label="产品资料" active={pane === 'product'}>
          <ProductRecordEditor
            key={source.id}
            open
            continuous
            initialValues={{ name: salesOrderRequirementName(source), customer_style_no: source.customer_product_no || '' }}
            onClose={() => setPane('bom')}
            onSaved={(product) => { selectProduct.current?.(product); setPane('bom') }}
          />
        </BusinessEditorPane>
      ) : null}

    </BusinessEditorWorkspace>
  )
}
