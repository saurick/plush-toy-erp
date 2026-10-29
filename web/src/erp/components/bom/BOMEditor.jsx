import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, Popconfirm, Space } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { applyBusinessFormReadback } from '../../utils/businessFormReadback.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import { BusinessEditorPaneContext } from '../business-list/BusinessFormPageContext.js'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import { useLineItemAppendScroll } from '../business-list/useLineItemAppendScroll.mjs'
import { ReferenceRecordsProvider } from '../RemoteReferenceSelect.jsx'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { canReadReference, loadReferenceIDs, mergeReferenceRecords } from '../../utils/remoteReferences.mjs'
import { getBOMVersion, saveBOMWithItems, copyBOMVersion, activateBOMVersion, listAllBOMVersions } from '../../api/bomApi.mjs'
import { listAllProducts, listAllMaterials, listAllUnits } from '../../api/masterDataOrderApi.mjs'
import { productOption, materialOption, unitOption, uniqueReferenceOptions } from '../../utils/referenceSelectOptions.mjs'
import { businessFormSnapshot } from '../../utils/businessFormSnapshot.mjs'
import { suggestNextBOMVersion } from '../../utils/bomVersionSuggestion.mjs'
import { invalidateBOMUsageSnapshots } from '../../utils/bomMaterialGroups.mjs'
import { MAX_BOM_XLSX_FILE_BYTES, parseBOMXlsx, buildBOMImportDraft, getBOMImportDraftIssues, describeBOMImportIssues, mergeBOMImportedValues } from '../../utils/bomXlsxImport.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { message } from '@/common/utils/antdApp'
import { BOMHeaderFormFields, buildHeaderParams, buildItemParams, unixToDateInputValue } from './BOMVersionForms.jsx'
import BOMMaterialGroupsForm from './BOMMaterialGroupsForm.jsx'
import BOMExcelImportPreview, { BOMImportUndoAction, bomImportItemsSnapshot } from './BOMExcelImportPreview.jsx'
import BOMExcelImportFormat from './BOMExcelImportFormat.jsx'
import BOMImportReviewSummary from './BOMImportReviewSummary.jsx'
import BOMRevisionAction from './BOMRevisionAction.jsx'
import { canEditBOM } from './bomLifecycle.mjs'
import { bomStatusText } from './BOMVersionColumns.jsx'

function formValues(record = {}) {
  return {
    ...record,
    product_id: record.product_id || undefined,
    version: record.version || '',
    source_order_no: record.source_order_no || '',
    quantity_text: record.quantity_text || '',
    spare_text: record.spare_text || '',
    designer: record.designer || '',
    maker: record.maker || '',
    auditor: record.auditor || '',
    hair_direction: record.hair_direction || '',
    note: record.note || '',
    effective_from: unixToDateInputValue(record.effective_from),
    effective_to: unixToDateInputValue(record.effective_to),
    print_date: unixToDateInputValue(record.print_date),
    items: (record.items || []).map((item) => ({ ...item, material_id: item.material_id || undefined, unit_id: item.unit_id || undefined, quantity: item.quantity ?? '', loss_rate: item.loss_rate ?? '0' })),
  }
}

// The business list and engineering task use this complete editor and write path.
export default function BOMEditor({ open, mode = 'view', record, initialValues, importDraft, onSaved, onComplete, onClose, continuous = false, actions, readOnly = false, renderProductActions }) {
  const context = useBusinessPageContext()
  const profile = context?.adminProfile || {}
  const taskReadOnly = readOnly || context?.taskBusiness?.readOnly === true
  const [form] = Form.useForm()
  const formID = useId()
  const inWorkspace = Boolean(React.useContext(BusinessEditorPaneContext))
  const [detail, setDetail] = useState(null)
  const [editorMode, setEditorMode] = useState(mode)
  const [reading, setLoading] = useState(false)
  const [readyScope, setReadyScope] = useState('')
  const [editorRevision, setEditorRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingResult, setPendingResult] = useState(null)
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [units, setUnits] = useState([])
  const [referencesReady, setReferencesReady] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [review, setReview] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)
  const [undo, setUndo] = useState(null)
  const [importing, setImporting] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const attachment = useRef(null)
  const importInput = useRef(null)
  const savedSnapshot = useRef(null)
  const active = useRef(false)
  const busy = useRef(false)
  const importingRef = useRef(null)
  const { registerLineItemRow, requestLineItemScroll } = useLineItemAppendScroll()
  const canRead = hasActionPermission(profile, PermissionCode.BOM_READ)
  const canReadProducts = canReadReference(profile, 'products')
  const canReadMaterials = canReadReference(profile, 'materials')
  const canCreate = !taskReadOnly && hasActionPermission(profile, PermissionCode.BOM_CREATE)
  const canUpdate = !taskReadOnly && hasActionPermission(profile, PermissionCode.BOM_UPDATE)
  const writable = editorMode !== 'view' && !taskReadOnly && (editorMode === 'edit' ? canUpdate && canEditBOM(detail) : canCreate)
  const canActivate = !taskReadOnly && hasActionPermission(profile, PermissionCode.BOM_ACTIVATE)
  const productID = Form.useWatch('product_id', { form, preserve: true })
  const productOptions = useMemo(() => uniqueReferenceOptions(products, productOption), [products])
  const materialOptions = useMemo(() => uniqueReferenceOptions(materials, materialOption), [materials])
  const unitOptions = useMemo(() => uniqueReferenceOptions(units, unitOption), [units])
  const materialByID = useMemo(() => new Map(materials.map((item) => [item.id, item])), [materials])
  const suggestion = suggestNextBOMVersion(candidates, productID)
  const initial = useRef(initialValues)
  initial.current = initialValues
  const imported = useRef(importDraft)
  imported.current = importDraft
  const recordID = record?.id
  const readScope = `${profile.id}:${recordID || ''}:${mode}:${retry}`
  const loading = reading || Boolean(open && readyScope !== readScope)
  useEffect(() => {
    active.current = open
    const controller = new AbortController()
    if (!open) { setReadyScope(''); return () => controller.abort() }
    setLoading(true)
    setError('')
    setPendingResult(null)
    setReferencesReady(false)
    setPendingImport(null)
    setUndo(null)
    savedSnapshot.current = null
    attachment.current?.clearPendingAttachments()
    const read = async () => {
      if (!canRead) throw new Error('当前账号没有查看 BOM 的权限')
      const next = recordID ? await getBOMVersion({ id: recordID }, { signal: controller.signal }) : null
      if (recordID && (!next || !Array.isArray(next.items))) throw new Error('BOM 材料明细未完整读取，请重新读取后再编辑')
      const values = next
        ? formValues(next)
        : { ...formValues(initial.current || {}), ...imported.current?.values }
      if (mode === 'copy') Object.assign(values, { version: '', effective_from: '', effective_to: '', note: '', items: [] })
      const [unitData, productData, materialData] = await Promise.all([
        listAllUnits({}, { signal: controller.signal }),
        canReadProducts ? loadReferenceIDs('products', [values.product_id].filter(Boolean), { signal: controller.signal }) : { products: [] },
        canReadMaterials ? loadReferenceIDs('materials', (values.items || []).map((item) => item.material_id).filter(Boolean), { signal: controller.signal }) : { materials: [] },
      ])
      if (controller.signal.aborted) return
      setProducts(productData.products || [])
      setMaterials(materialData.materials || [])
      setUnits(unitData.units || [])
      setDetail(next)
      setEditorMode(mode === 'edit' && !canEditBOM(next) ? 'view' : mode)
      setReview(imported.current?.review || null)
      applyBusinessFormReadback(form, values)
      setReferencesReady(true)
      setReadyScope(readScope)
    }
    read().catch((err) => { if (!controller.signal.aborted) { setError(getActionErrorMessage(err, '读取 BOM 编辑资料')); setReadyScope(readScope) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { active.current = false; controller.abort(); importingRef.current?.abort() }
  }, [open, recordID, mode, profile.id, canRead, canReadProducts, canReadMaterials, form, retry, readScope])
  useEffect(() => {
    const controller = new AbortController()
    if (open && productID && !['edit', 'view'].includes(editorMode)) {
      listAllBOMVersions({ product_id: productID }, { signal: controller.signal }).then((data) => {
        if (controller.signal.aborted) return
        setCandidates(data.bom_versions || [])
        if (editorMode === 'copy' && !String(form.getFieldValue('version') || '').trim()) applyBusinessFormReadback(form, { version: suggestNextBOMVersion(data.bom_versions || [], productID) })
      }).catch((err) => { if (!controller.signal.aborted && !isRpcAbortError(err)) message.warning(getActionErrorMessage(err, '读取 BOM 版本建议')) })
    }
    return () => controller.abort()
  }, [open, productID, editorMode, form])

  const save = async ({ completing = false } = {}) => {
    if (!writable || loading || busy.current || importing || pendingImport) return false
    const issues = review ? getBOMImportDraftIssues(form.getFieldsValue(true)) : []
    if (issues.length) {
      form.setFields(issues.map((issue) => ({ name: issue.scope === 'item' ? ['items', issue.itemIndex, issue.field] : [issue.field], errors: [issue.message] })))
      message.warning(`暂未保存：请先${describeBOMImportIssues(issues)}`)
      return false
    }
    const values = await form.validateFields()
    busy.current = true
    setSaving(true)
    setError('')
    try {
      const snapshot = businessFormSnapshot(values)
      let saved = detail
      if (savedSnapshot.current !== snapshot || !saved?.id) {
        saved = editorMode === 'copy'
          ? await copyBOMVersion(buildHeaderParams(values, { source_id: detail?.id }))
          : await saveBOMWithItems({
            ...buildHeaderParams(values, detail?.id && editorMode === 'edit' ? { id: detail.id, product_id: detail.product_id, expected_version: detail.edit_version } : {}),
            items: (values.items || []).map((item) => ({ ...buildItemParams(item), ...(editorMode === 'edit' && item.id ? { id: item.id } : {}) })),
          })
        saved = await getBOMVersion({ id: saved.id })
        if (!active.current) return false
        setDetail(saved)
        setEditorMode('edit')
        if (businessFormSnapshot((values.items || []).map((item) => item.source_snapshot || null)) !== businessFormSnapshot((saved.items || []).map((item) => item.source_snapshot || null))) {
          savedSnapshot.current = null
          setError('草稿已保存，但原表数据尚未完整读回，请保留当前内容并重试。')
          return false
        }
        savedSnapshot.current = snapshot
      }
      const attachmentsSaved = (await attachment.current?.flushPendingAttachments(saved.id)) !== false
      if (!attachmentsSaved) {
        setError('BOM 草稿已保存，部分附件尚未上传，请保留当前内容重试。')
        return false
      }
      attachment.current?.clearPendingAttachments()
      setReview(null)
      setUndo(null)
      applyBusinessFormReadback(form, formValues(saved))
      savedSnapshot.current = businessFormSnapshot(form.getFieldsValue(true))
      setEditorRevision((value) => value + 1)
      const result = { record: saved, meta: { action: 'save', mode, attachmentsSaved: true } }
      setPendingResult(result)
      await onSaved?.(result.record, result.meta)
      setPendingResult(null)
      if (!continuous) onClose?.()
      if (!completing) message.success('BOM 草稿已保存，尚未启用')
      return saved
    } catch (err) {
      if (active.current) setError(getActionErrorMessage(err, '保存 BOM 草稿'))
      return false
    } finally { busy.current = false; if (active.current) setSaving(false) }
  }
  const complete = async () => {
    if (!onComplete || !canActivate || loading || busy.current || importing || pendingImport) return
    const saved = writable ? await save({ completing: true }) : detail
    if (!saved) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await onComplete(saved)
      const fresh = await getBOMVersion({ id: saved.id })
      if (!active.current) return
      setDetail(fresh)
      setEditorMode('view')
      applyBusinessFormReadback(form, formValues(fresh))
      savedSnapshot.current = businessFormSnapshot(form.getFieldsValue(true))
      setEditorRevision((value) => value + 1)
    } catch (err) {
      if (active.current) setError(getActionErrorMessage(err, '完成工程资料'))
    } finally { busy.current = false; if (active.current) setSaving(false) }
  }
  const activate = async () => {
    if (!canActivate || !detail?.id || !canEditBOM(detail) || busy.current) return
    if (writable && businessFormSnapshot(form.getFieldsValue(true)) !== savedSnapshot.current && !(await save())) return
    busy.current = true
    setSaving(true)
    try {
      const next = await activateBOMVersion({ id: detail.id })
      const fresh = await getBOMVersion({ id: next.id })
      if (!active.current) return
      setDetail(fresh)
      setEditorMode('view')
      applyBusinessFormReadback(form, formValues(fresh))
      savedSnapshot.current = businessFormSnapshot(form.getFieldsValue(true))
      setEditorRevision((value) => value + 1)
      const result = { record: fresh, meta: { action: 'activate' } }
      setPendingResult(result)
      await onSaved?.(result.record, result.meta)
      setPendingResult(null)
    } catch (err) { if (active.current) setError(getActionErrorMessage(err, '启用 BOM 版本')) }
    finally { busy.current = false; if (active.current) setSaving(false) }
  }
  const retrySavedResult = async () => {
    if (!pendingResult || busy.current) return
    busy.current = true
    setSaving(true)
    try {
      await onSaved?.(pendingResult.record, pendingResult.meta)
      if (active.current) { setPendingResult(null); setError('') }
    } catch (err) {
      if (active.current) setError(getActionErrorMessage(err, '确认 BOM 保存结果'))
    } finally { busy.current = false; if (active.current) setSaving(false) }
  }
  const importFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !writable || busy.current) return
    if (!/\.xlsx$/iu.test(file.name) || file.size > MAX_BOM_XLSX_FILE_BYTES) { message.warning(`请选择不超过 ${MAX_BOM_XLSX_FILE_BYTES / 1024 / 1024}MB 的 .xlsx 文件`); return }
    importingRef.current?.abort()
    const controller = new AbortController()
    importingRef.current = controller
    setImporting(true)
    try {
      const parsed = await parseBOMXlsx(await file.arrayBuffer(), { fileName: file.name })
      const [productData, materialData] = await Promise.all([listAllProducts({ active_only: false }, { signal: controller.signal }), listAllMaterials({ active_only: false }, { signal: controller.signal })])
      if (controller.signal.aborted || !active.current) return
      setProducts(productData.products || [])
      setMaterials(materialData.materials || [])
      setPendingImport(buildBOMImportDraft(parsed, { products: productData.products, materials: materialData.materials, units }))
    } catch (err) { if (!controller.signal.aborted && active.current) message.error(getActionErrorMessage(err, '解析 BOM Excel')) }
    finally { if (!controller.signal.aborted && active.current) setImporting(false) }
  }
  const applyImport = (kind) => {
    if (!pendingImport || !writable || busy.current) return
    const current = form.getFieldsValue(true)
    const values = mergeBOMImportedValues(current, pendingImport, kind)
    setUndo({ values: { items: structuredClone(current.items || []), quantity_text: current.quantity_text ?? '' }, review, appliedSnapshot: bomImportItemsSnapshot({ ...current, ...values }) })
    form.setFieldsValue(values)
    setReview({ ...pendingImport.review, detailsOnly: true })
    setPendingImport(null)
  }
  const changeValues = (changed) => {
    if (!changed.items && !Object.hasOwn(changed, 'quantity_text')) return
    setUndo(null)
    // Material/unit changes are handled for every grouped part by their own controls.
    if (!Object.hasOwn(changed, 'quantity_text') && !(changed.items || []).some((item) => item && (Object.hasOwn(item, 'quantity') || Object.hasOwn(item, 'loss_rate')))) return
    const items = form.getFieldValue('items') || []
    invalidateBOMUsageSnapshots(items, changed).forEach((item, index) => { if (item.total_usage_snapshot !== items[index].total_usage_snapshot) form.setFieldValue(['items', index, 'total_usage_snapshot'], item.total_usage_snapshot) })
  }
  const title = editorMode === 'view' || (!writable && !loading) ? `查看 BOM 版本 · ${bomStatusText(detail?.status)} · 只读` : editorMode === 'edit' ? '编辑 BOM 草稿 · 未生效' : editorMode === 'copy' ? '复制 BOM 新版本' : mode === 'import' ? '检查并保存导入草稿' : '新建 BOM 草稿'
  const importActions = writable && editorMode !== 'copy' ? (
    <Space wrap>
      <BOMImportUndoAction form={form} undo={undo} disabled={saving || importing} onUndo={() => { if (undo && bomImportItemsSnapshot(form.getFieldsValue(true)) === undo.appliedSnapshot) { form.setFieldsValue(undo.values); setReview(undo.review); setUndo(null) } }} />
      <Button aria-label="从 Excel 导入" icon={<UploadOutlined aria-hidden="true" />} disabled={saving || !referencesReady} loading={importing} onClick={() => importInput.current?.click()}>从 Excel 导入</Button>
      <Button type="link" size="small" disabled={saving} onClick={() => setFormatOpen(true)}>查看 Excel 格式</Button>
    </Space>
  ) : null
  return (
    <ReferenceRecordsProvider component={React.Fragment} adminProfile={profile} handlers={{ products: (rows) => setProducts((current) => mergeReferenceRecords(current, rows)), materials: (rows) => setMaterials((current) => mergeReferenceRecords(current, rows)) }}>
      <BusinessFormPage open={open} form={form} baselineKey={`${readyScope}:${editorRevision}`} className="erp-bom-editor" title={title} readOnly={!writable} initialDirty={mode === 'import'} hasChanges={Boolean(pendingResult)} loading={loading} confirmLoading={saving} processing={importing} onOk={onComplete && canActivate ? complete : save} okText={onComplete && canActivate ? '完成工程资料' : '保存草稿'} okButtonProps={{ disabled: Boolean(pendingImport) || !referencesReady }} onCancel={onClose} headerActions={<Space wrap>{actions}{editorMode === 'view' && canUpdate ? <BOMRevisionAction record={detail} canCreate={canCreate} disabled={saving} onEdit={(next) => { setDetail(next); setEditorMode('edit'); applyBusinessFormReadback(form, formValues(next)); savedSnapshot.current = null; setEditorRevision((value) => value + 1) }} /> : null}</Space>} secondaryAction={onComplete ? (writable && canActivate ? <Button disabled={saving || importing || Boolean(pendingImport) || !referencesReady} onClick={() => save()}>保存草稿</Button> : !writable && canActivate ? <Button type="primary" loading={saving} disabled={importing || loading} onClick={complete}>完成工程资料</Button> : null) : !pendingResult && continuous && canActivate && detail?.status === 'DRAFT' ? <Popconfirm title="确认启用此 BOM 版本？" onConfirm={activate} disabled={saving}><Button disabled={saving || importing}>启用 BOM</Button></Popconfirm> : null}>
        {error ? <Alert type="warning" showIcon message={error} action={pendingResult ? <Button loading={saving} onClick={retrySavedResult}>重试保存</Button> : !referencesReady ? <Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button> : undefined} /> : null}
        <Form name={inWorkspace ? `bom-${formID}` : undefined} form={form} layout="vertical" className="erp-business-action-form" disabled={!writable || saving} onValuesChange={changeValues}>
          <BOMHeaderFormFields form={form} disabled={!writable} productDisabled={editorMode === 'edit' || (inWorkspace && Boolean(initialValues?.product_id))} productActions={writable && editorMode !== 'edit' ? renderProductActions?.({ onSelect: (product) => { setProducts((current) => mergeReferenceRecords(current, [product])); form.setFieldValue('product_id', product.id) } }) : null} productOptions={productOptions} versionSuggestion={suggestion} onUseVersionSuggestion={() => form.setFieldValue('version', suggestion)} attachmentPanel={<BusinessAttachmentPanel ref={attachment} ownerType="bom_header" ownerId={detail?.id} title="BOM 附件" description="色卡、工艺图、作业说明和原始材料清单" canUpload={writable} canWithdraw={writable && canUpdate} variant="inline" compact />}>
            {review ? <BOMImportReviewSummary form={form} review={review} productOptions={productOptions} /> : null}
            <BusinessFormSection title="材料分析明细表" showHeading={false}>
              {editorMode === 'copy' ? <p>保存后会复制原版本的全部材料和部位，可在新草稿继续编辑。</p> : (
                <BOMMaterialGroupsForm
                  form={form}
                  canEdit={writable && editorMode !== 'copy'}
                  materialByID={materialByID}
                  materialOptions={materialOptions}
                  unitOptions={unitOptions}
                  canCreateMaterial={writable && hasActionPermission(profile, PermissionCode.MATERIAL_CREATE)}
                  onMaterialCreated={(item) => setMaterials((current) => [item, ...current])}
                  onItemsChange={() => setUndo(null)}
                  registerLineItemRow={registerLineItemRow}
                  requestLineItemScroll={requestLineItemScroll}
                  selectedVersionID={detail?.id}
                  actions={importActions}
                />
            )}
            </BusinessFormSection>
          </BOMHeaderFormFields>
        </Form>
      </BusinessFormPage>
      <input ref={importInput} hidden type="file" aria-label="选择 BOM Excel 文件" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importFile} />
      <BOMExcelImportPreview pending={pendingImport ? { draft: pendingImport, target: 'items' } : null} currentQuantity={open && pendingImport ? form.getFieldValue('quantity_text') : undefined} existingCount={open && pendingImport ? (form.getFieldValue('items') || []).length : 0} materialOptions={materialOptions} unitOptions={unitOptions} onCancel={() => setPendingImport(null)} onConfirm={applyImport} />
      <BOMExcelImportFormat open={formatOpen} onClose={() => setFormatOpen(false)} />
    </ReferenceRecordsProvider>
  )
}
