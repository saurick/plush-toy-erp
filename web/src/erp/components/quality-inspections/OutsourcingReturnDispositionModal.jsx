import { RollbackOutlined } from '@ant-design/icons'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Space, Tag } from 'antd'
import { OperationalFactStatus } from '../../../common/consts/statuses.generated.mjs'
import {
  unitQuantityRule,
  unitPrecisionFromOptions,
} from '../../utils/unitQuantity.mjs'
import useQuantityUnits from '../../hooks/useQuantityUnits.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import Table from '@/common/components/table/AppTable'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

import {
  cancelOutsourcingReturnDisposition,
  createOutsourcingReturnDisposition,
  listOutsourcingReturnDispositions,
  postOutsourcingReturnDisposition,
} from '../../api/operationalFactApi.mjs'
import {
  createSourceBusinessActionAttemptStore,
  sourceBusinessActionNo,
  sourceBusinessActionUUID,
} from '../../utils/sourceBusinessAction.mjs'
import BusinessForm from '../business-list/BusinessForm.jsx'

export default function OutsourcingReturnDispositionModal(props) {
  const attempts = useRef(createSourceBusinessActionAttemptStore())
  const { open, inspection, fact } = props
  const sourceKey = open ? `${inspection?.id || 0}:${fact?.id || 0}` : 'closed'
  return <OutsourcingReturnDispositionSource key={sourceKey} {...props} attempts={attempts} />
}

function OutsourcingReturnDispositionSource({
  open,
  inspection,
  fact,
  canCreate,
  canPost,
  canCancel,
  onClose,
  onChanged,
  attempts,
}) {
  const [form] = Form.useForm()
  const quantityUnitOptions = useQuantityUnits(open && !!fact?.unit_id)
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sourceReady, setSourceReady] = useState(false)
  const readOnly = !canCreate && !canPost && !canCancel
  const beginRequest = useLatestRequestCoordinator()
  const sourceFactID = Number(fact?.id || 0)
  const sourceInspectionID = Number(inspection?.id || 0)
  const load = useCallback(async () => {
    if (!sourceInspectionID && !sourceFactID) return
    const request = beginRequest('dispositions')
    setLoading(true)
    setSourceReady(false)
    try {
      const data = await listOutsourcingReturnDispositions({
        ...(sourceInspectionID
          ? { quality_inspection_id: sourceInspectionID }
          : { outsourcing_return_fact_id: sourceFactID }),
        limit: 50,
        offset: 0,
      }, { signal: request.signal })
      if (!request.isCurrent()) return null
      if (!Array.isArray(data?.outsourcing_return_dispositions)) {
        throw Object.assign(new Error('委外处置记录返回不完整'), {
          isInvalidResponse: true,
        })
      }
      setRows(data.outsourcing_return_dispositions)
      setSourceReady(true)
      setSelected(
        (current) =>
          data.outsourcing_return_dispositions.find(
            (item) => item.id === current?.id
          ) ||
          data.outsourcing_return_dispositions[0] ||
          null
      )
      return data.outsourcing_return_dispositions
    } catch (error) {
      if (request.isCurrent()) message.error(getActionErrorMessage(error, '读取委外不合格处置'))
      return null
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }, [beginRequest, sourceFactID, sourceInspectionID])
  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      disposition_no: sourceBusinessActionNo(
        'OUT-DISP',
        inspection?.inspection_no || 'QUALITY',
        sourceBusinessActionUUID()
      ),
      quantity: '',
      reason: '委外回货检验不合格',
      cancel_reason: '',
    })
    load()
  }, [form, inspection?.inspection_no, load, open])

  const create = async () => {
    if (!canCreate || !sourceInspectionID || !sourceReady || loading) return
    const request = beginRequest('mutation')
    let values
    try {
      values = await form.validateFields([
        'disposition_no',
        'quantity',
        'reason',
      ])
    } catch (error) {
      request.finish()
      if (!Array.isArray(error?.errorFields)) throw error
      return
    }
    if (!request.isCurrent()) return
    const payload = {
      disposition_no: values.disposition_no.trim(),
      quality_inspection_id: sourceInspectionID,
      disposition_type: 'RETURN_TO_VENDOR',
      quantity: String(values.quantity).trim(),
      reason: values.reason.trim(),
    }
    const attempt = attempts.current.prepare(
      `outsourcing-disposition:${sourceInspectionID}`,
      payload
    )
    setLoading(true)
    try {
      const next = await createOutsourcingReturnDisposition(attempt.params)
      if (!next?.id || next.status !== OperationalFactStatus.DRAFT) {
        throw Object.assign(new Error('委外处置结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      attempts.current.settle(
        `outsourcing-disposition:${sourceInspectionID}`,
        attempt,
        null
      )
      if (!request.isCurrent()) return
      const fresh = await load()
      if (!request.isCurrent()) return
      if (fresh) setSelected(fresh.find((item) => item.id === next.id) || fresh[0] || null)
      onChanged?.()
      message.success('委外处置草稿已生成')
    } catch (error) {
      const retained = attempts.current.settle(
        `outsourcing-disposition:${sourceInspectionID}`,
        attempt,
        error
      )
      if (!request.isCurrent()) return
      message[retained ? 'warning' : 'error'](
        retained
          ? '结果暂时无法确认，请保持内容不变后重试'
          : getActionErrorMessage(error, '生成委外处置')
      )
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }
  const transition = async (mode) => {
    if (!selected?.id || !sourceReady || loading) return
    const reason = String(form.getFieldValue('cancel_reason') || '').trim()
    if (mode === 'cancel' && !reason) {
      message.warning('请填写取消原因')
      return
    }
    const request = beginRequest('mutation')
    setLoading(true)
    try {
      const next =
        mode === 'post'
          ? await postOutsourcingReturnDisposition({
              id: selected.id,
              expected_version: selected.version,
            })
          : await cancelOutsourcingReturnDisposition({
              id: selected.id,
              expected_version: selected.version,
              reason,
            })
      if (!next?.id || Number(next.version) <= Number(selected.version)) {
        throw Object.assign(new Error('委外处置结果暂时无法确认'), {
          isInvalidResponse: true,
        })
      }
      if (!request.isCurrent()) return
      await load()
      if (!request.isCurrent()) return
      onChanged?.()
      message.success(
        mode === 'post' ? '委外返厂已确认' : '委外处置已取消'
      )
    } catch (error) {
      if (!request.isCurrent()) return
      const refreshed = await load()
      if (!request.isCurrent()) return
      const latest = refreshed?.find(
        (item) => Number(item.id) === Number(selected.id)
      )
      const recovered =
        (mode === 'post' && latest?.status === OperationalFactStatus.POSTED) ||
        (mode === 'cancel' && latest?.status === OperationalFactStatus.CANCELLED)
      if (recovered) {
        onChanged?.()
        message.success('已重新读取委外处置结果')
        return
      }
      message.error(getActionErrorMessage(error, '办理委外处置'))
    } finally {
      if (request.isCurrent()) setLoading(false)
      request.finish()
    }
  }
  return (
    <BusinessModal
      taskInline
      form={form}
      title={readOnly ? '查看委外不合格处置' : '委外不合格返厂'}
      open={open}
      size="recordDetails"
      footer={
        <Space wrap>
          <Button onClick={onClose} disabled={loading}>
            关闭
          </Button>
          {!sourceReady && !loading && (sourceInspectionID || sourceFactID) ? (
            <Button onClick={load}>重试读取</Button>
          ) : null}
          {canCreate && sourceInspectionID ? (
            <Button type="primary" onClick={create} loading={loading} disabled={!sourceReady}>
              生成处置草稿
            </Button>
          ) : null}
          {selected?.status === OperationalFactStatus.DRAFT && selected.disposition_type === 'RETURN_TO_VENDOR' && canPost ? (
            <Button
              type="primary"
              onClick={() => transition('post')}
              loading={loading}
              disabled={!sourceReady}
            >
              确认执行
            </Button>
          ) : null}
          {selected && selected.status !== OperationalFactStatus.CANCELLED && canCancel ? (
            <Button
              icon={<RollbackOutlined aria-hidden="true" />}
              className="erp-action-button"
              danger
              onClick={() => transition('cancel')}
              disabled={loading || !sourceReady}
            >
              取消 / 冲正
            </Button>
          ) : null}
        </Space>
      }
      onCancel={() => !loading && onClose?.()}
      maskClosable={!loading}
    >
      <Alert
        type="warning"
        showIcon
        message="品质登记返厂方案，仓库确认实际退厂后记录出库；取消须按依赖检查冲正。生产返工由业务提出方案，经正式审批后由生产或仓库执行。"
      />
      {!sourceInspectionID && sourceReady && rows.length === 0 ? (
        <Alert
          type="info"
          showIcon
          message="品质尚未生成该委外回货的不合格处置草稿。"
        />
      ) : null}
      <BusinessForm
        form={form}
        name="outsourcing-return-disposition"
        layout="vertical"
        disabled={loading || readOnly}
      >
        {canCreate && sourceInspectionID ? (
          <>
            <Space align="start" wrap>
              <Form.Item
                name="disposition_no"
                label="处置单号"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input maxLength={64} />
              </Form.Item>
              <Form.Item
                name="quantity"
                label="处置数量"
                rules={[
                  unitQuantityRule(
                    inspection?.unit_precision ??
                      unitPrecisionFromOptions(
                        quantityUnitOptions,
                        fact?.unit_id
                      ),
                    { positive: true }
                  ),
                  { required: true },
                ]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
            </Space>
            <Form.Item
              name="reason"
              label="处置原因"
              rules={[{ required: true, whitespace: true }]}
            >
              <Input.TextArea rows={2} maxLength={255} />
            </Form.Item>
          </>
        ) : null}
        <Form.Item name="cancel_reason" label="取消或冲正原因">
          <Input.TextArea rows={2} maxLength={255} />
        </Form.Item>
      </BusinessForm>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={rows}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected?.id ? [selected.id] : [],
          onChange: (_, selectedRows) => setSelected(selectedRows[0] || null),
        }}
        columns={[
          { title: '处置单号', dataIndex: 'disposition_no' },
          {
            title: '方式',
            dataIndex: 'disposition_type',
            render: (value) => (value === 'REWORK' ? '返工' : '返厂'),
          },
          { align: 'right', title: '数量', dataIndex: 'quantity' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) => (
              <Tag>
                {value === 'DRAFT'
                  ? '草稿'
                  : value === 'POSTED'
                    ? '已执行'
                    : '已取消'}
              </Tag>
            ),
          },
        ]}
      />
    </BusinessModal>
  )
}
