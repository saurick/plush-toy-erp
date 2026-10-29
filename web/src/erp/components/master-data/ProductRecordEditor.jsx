import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form } from 'antd'
import { applyBusinessFormReadback } from '../../utils/businessFormReadback.mjs'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import { BusinessEditorPaneContext } from '../business-list/BusinessFormPageContext.js'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import ProductImageSlots from './ProductImageSlots.jsx'
import { MasterDataFormFields } from './MasterDataForm.jsx'
import { MASTER_DATA_PAGE_CONFIG } from './masterDataPageConfig.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { listAllUnits } from '../../api/masterDataOrderApi.mjs'
import { buildProductParams, buildProductSKUParams } from '../../utils/masterDataParams.mjs'
import { buildSequentialDraftCode, buildUnitSelectOptions, hasActionPermission, inferProductDefaultUnitID } from '../../utils/masterDataOrderView.mjs'
import { productOption, uniqueReferenceOptions } from '../../utils/referenceSelectOptions.mjs'
import { businessFormSnapshot } from '../../utils/businessFormSnapshot.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

export default function ProductRecordEditor({ type = 'products', open, record, form: providedForm, initialValues, products = [], records = [], onSaved, onClose, continuous = false, lockProduct = false }) {
  const context = useBusinessPageContext()
  const profile = context?.adminProfile || {}
  const config = MASTER_DATA_PAGE_CONFIG[type]
  const [form] = Form.useForm(providedForm)
  const formID = useId()
  const inWorkspace = Boolean(React.useContext(BusinessEditorPaneContext))
  const initialized = useRef('')
  const [current, setCurrent] = useState(record || null)
  const [units, setUnits] = useState([])
  const [reading, setLoading] = useState(false)
  const [readyScope, setReadyScope] = useState('')
  const [referencesReady, setReferencesReady] = useState(false)
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const images = useRef(null)
  const attachment = useRef(null)
  const busy = useRef(false)
  const savedSnapshot = useRef(null)
  const persisted = useRef(null)
  const active = useRef(false)
  const initial = useRef(initialValues)
  initial.current = initialValues
  const source = useRef({ records, record })
  source.current = { records, record }
  const recordID = record?.id
  const readScope = `${profile.id}:${type}:${recordID || ''}:${retry}`
  const loading = reading || Boolean(open && readyScope !== readScope)
  const canRead = hasActionPermission(profile, config.permissions.read)
  const writable = !context?.taskBusiness?.readOnly && canRead && hasActionPermission(profile, (current?.id || persisted.current?.id) ? config.permissions.update : config.permissions.create)
  const canUploadImages = writable && (current?.id ? hasActionPermission(profile, config.permissions.update) : hasActionPermission(profile, config.permissions.create))
  const unitOptions = useMemo(() => buildUnitSelectOptions(units), [units])
  const productOptions = useMemo(() => uniqueReferenceOptions(products, productOption), [products])
  useEffect(() => {
    const controller = new AbortController()
    active.current = open
    if (!open) { setReadyScope(''); initialized.current = ''; return () => controller.abort() }
    setCurrent(source.current.record || null)
    setError('')
    setReferencesReady(false)
    savedSnapshot.current = null
    persisted.current = source.current.record || null
    const identity = `${profile.id}:${type}:${recordID || ''}`
    if (!providedForm && initialized.current !== identity) {
      attachment.current?.clearPendingAttachments()
      form.setFieldsValue(source.current.record || {
        [config.draftCodeField || 'code']: buildSequentialDraftCode(source.current.records, { prefix: config.draftCodePrefix, field: config.draftCodeField || 'code' }),
        ...initial.current,
      })
      initialized.current = identity
    }
    setLoading(true)
    listAllUnits({}, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      const rows = data.units || []
      setUnits(rows)
      if (!providedForm && !form.getFieldValue('default_unit_id') && !form.isFieldTouched('default_unit_id')) {
        form.setFieldValue('default_unit_id', inferProductDefaultUnitID(source.current.records, buildUnitSelectOptions(rows)))
      }
      setReferencesReady(true)
      setReadyScope(readScope)
    }).catch((err) => { if (!controller.signal.aborted) { setError(getActionErrorMessage(err, '读取产品计量资料')); setReadyScope(readScope) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { active.current = false; controller.abort() }
  }, [open, type, recordID, profile.id, config, form, providedForm, readScope])
  const save = async () => {
    if (!writable || loading || !referencesReady || busy.current) return false
    const values = await form.validateFields()
    if (lockProduct && Number(values.product_id) !== Number(initial.current?.product_id || record?.product_id)) {
      setError('本次规格必须归属当前办理产品')
      return false
    }
    busy.current = true
    setSaving(true)
    setError('')
    try {
      const snapshot = businessFormSnapshot(values)
      let saved = persisted.current || current
      if (!saved?.id || savedSnapshot.current !== snapshot) {
        const params = type === 'products' ? buildProductParams(values, saved?.id ? { id: saved.id } : {}) : buildProductSKUParams(values, saved?.id ? { id: saved.id } : {})
        saved = saved?.id ? await config.update(params) : await config.create(params)
        if (!active.current) return false
        persisted.current = saved
        savedSnapshot.current = snapshot
      }
      if (type === 'products') {
        const result = await images.current?.flushChanges(saved.id)
        if (result?.mutationsApplied !== true || result?.reloaded !== true) {
          setError(result?.mutationsApplied ? '产品和产品图片已保存，图片状态尚未确认，请保留当前内容重试读取。' : '产品已保存，图片尚未全部确认，请保留当前内容重试。')
          return false
        }
      } else if ((await attachment.current?.flushPendingAttachments(saved.id)) === false) {
        setError('规格已保存，附件尚未全部上传，请保留当前内容重试。')
        return false
      }
      setCurrent(saved)
      applyBusinessFormReadback(form, saved)
      savedSnapshot.current = businessFormSnapshot(form.getFieldsValue(true))
      setRevision((value) => value + 1)
      await onSaved?.(saved)
      message.success(`${config.entityLabel}已保存`)
      if (!continuous) onClose?.()
      return saved
    } catch (err) { if (active.current) setError(getActionErrorMessage(err, `保存${config.entityLabel}`)); return false }
    finally { busy.current = false; if (active.current) setSaving(false) }
  }
  const changeValues = (changed) => {
    if ((Object.hasOwn(changed, 'default_unit_id') || (type === 'product_skus' && Object.hasOwn(changed, 'product_id'))) && form.getFieldValue('unit_net_weight_g') != null && form.getFieldValue('unit_net_weight_g') !== '') {
      form.setFieldValue('unit_net_weight_g', undefined)
      message.info('计量依据已变更，请重新确认单重')
    }
  }
  return (
    <BusinessFormPage open={open} form={form} baselineKey={revision} title={`${!writable ? '查看' : current?.id ? '编辑' : '新建'}${config.entityLabel}`} okText={`保存${config.entityLabel}`} okButtonProps={{ disabled: !referencesReady }} readOnly={!writable} loading={loading} confirmLoading={saving} onOk={save} onCancel={onClose}>
      {error ? <Alert type="warning" message={error} showIcon action={referencesReady ? <Button onClick={save} disabled={!writable || saving}>重试保存</Button> : <Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} /> : null}
      <Form name={inWorkspace ? `master-${formID}` : undefined} form={form} layout="vertical" className="erp-business-action-form" disabled={!writable || saving} onValuesChange={changeValues}>
        <MasterDataFormFields form={form} type={type} isEditing={Boolean(current?.id) || lockProduct} products={products} productOptions={productOptions} unitOptions={unitOptions} unitLoading={loading} />
        {type === 'products' ? <BusinessFormSection title="产品图片" layout="content"><ProductImageSlots ref={images} productId={current?.id} open={open} canEdit={canUploadImages} /></BusinessFormSection> : <BusinessFormSection title="附件"><BusinessAttachmentPanel compact ref={attachment} ownerType="product_sku" ownerId={current?.id} title="产品规格附件" canUpload={writable} canWithdraw={writable && Boolean(current?.id)} variant="inline" /></BusinessFormSection>}
      </Form>
    </BusinessFormPage>
  )
}
