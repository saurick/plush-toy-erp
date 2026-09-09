import React, { useEffect, useState } from 'react'
import { Form } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import BusinessFormModal from '../business-list/BusinessFormModal.jsx'
import { MasterDataFormFields } from '../master-data/MasterDataForm.jsx'
import { createMaterial } from '../../api/masterDataOrderApi.mjs'
import { buildMaterialDraftCode } from '../../utils/masterDataOrderView.mjs'
import { buildMasterDataParams } from '../../utils/masterDataParams.mjs'

export default function BOMMaterialCreateModal({
  open,
  materials,
  unitOptions,
  onCancel,
  onCreated,
}) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({ code: buildMaterialDraftCode(materials) })
  }, [open, form, materials])
  const save = async () => {
    if (saving) return
    let values
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setSaving(true)
    try {
      const material = await createMaterial(buildMasterDataParams(values))
      if (!material?.id) throw new Error('Material creation returned no record')
      onCreated(material)
      message.success('物料已建档，以后可直接选择使用')
    } catch (error) {
      message.error(getActionErrorMessage(error, '建立物料档案'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <BusinessFormModal
      open={open}
      title="新建物料并使用"
      description="厂商、料号、色号、规格和单位在这里维护一次，部位和用量在材料明细表填写。"
      onOk={save}
      onCancel={saving ? undefined : onCancel}
      confirmLoading={saving}
    >
      <Form
        form={form}
        layout="vertical"
        disabled={saving}
        className="erp-business-action-form"
      >
        <MasterDataFormFields
          form={form}
          type="materials"
          unitOptions={unitOptions}
        />
      </Form>
    </BusinessFormModal>
  )
}
