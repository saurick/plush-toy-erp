import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  FileDoneOutlined,
  LinkOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
} from 'antd'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  cancelQualityInspection,
  createQualityInspectionDraft,
  listQualityInspections,
  passQualityInspection,
  rejectQualityInspection,
  submitQualityInspection,
} from '../api/qualityApi.mjs'
import {
  BusinessOperationPanel,
  BusinessPageLayout,
  DateInput,
  PageHeaderCard,
  SearchInput,
  SelectFilter,
  SelectionActionBar,
  ToolbarButton,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  compactParams,
  formatUnixDate,
  formatUnixDateTime,
  hasActionPermission,
  trimOptional,
  V1_ROUTE_PATHS,
} from '../utils/masterDataOrderView.mjs'
import {
  createBusinessTablePagination,
  getBusinessPaginationParams,
  resetBusinessPaginationCurrent,
} from '../utils/businessPagination.mjs'

const BUSINESS_FORM_MODAL_WIDTH = 'min(900px, calc(100vw - 96px))'

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已提交', value: 'SUBMITTED' },
  { label: '合格', value: 'PASSED' },
  { label: '不合格', value: 'REJECTED' },
  { label: '已取消', value: 'CANCELLED' },
]

const RESULT_FILTER_OPTIONS = [
  { label: '全部结果', value: '' },
  { label: '合格', value: 'PASS' },
  { label: '让步接收', value: 'CONCESSION' },
  { label: '不合格', value: 'REJECT' },
]

const RESULT_DECISION_OPTIONS = [
  { label: '合格', value: 'PASS' },
  { label: '让步接收', value: 'CONCESSION' },
]

const STATUS_LABELS = Object.freeze({
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  PASSED: '合格',
  REJECTED: '不合格',
  CANCELLED: '已取消',
})

const STATUS_COLORS = Object.freeze({
  DRAFT: 'default',
  SUBMITTED: 'gold',
  PASSED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
})

const RESULT_LABELS = Object.freeze({
  PASS: '合格',
  CONCESSION: '让步接收',
  REJECT: '不合格',
})

const RESULT_COLORS = Object.freeze({
  PASS: 'green',
  CONCESSION: 'blue',
  REJECT: 'red',
})

function statusTag(status) {
  const key = String(status || '').trim()
  return (
    <Tag color={STATUS_COLORS[key] || 'default'}>
      {STATUS_LABELS[key] || key || '-'}
    </Tag>
  )
}

function resultTag(result) {
  const key = String(result || '').trim()
  if (!key) return '-'
  return (
    <Tag color={RESULT_COLORS[key] || 'default'}>
      {RESULT_LABELS[key] || key}
    </Tag>
  )
}

function hasPermission(adminProfile, permission) {
  return (
    adminProfile?.is_super_admin === true ||
    hasActionPermission(adminProfile, permission)
  )
}

function positiveInt(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0
    ? Math.trunc(numeric)
    : undefined
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function buildInspectionParams(values = {}) {
  return compactParams({
    inspection_no: trimOptional(values.inspection_no),
    purchase_receipt_id: positiveInt(values.purchase_receipt_id),
    purchase_receipt_item_id: positiveInt(values.purchase_receipt_item_id),
    inventory_lot_id: positiveInt(values.inventory_lot_id),
    material_id: positiveInt(values.material_id),
    warehouse_id: positiveInt(values.warehouse_id),
    inspector_id: positiveInt(values.inspector_id),
    decision_note: trimOptional(values.decision_note),
  })
}

function buildDecisionParams(inspectionID, values = {}, result = '') {
  return compactParams({
    id: positiveInt(inspectionID),
    result: result || trimOptional(values.result),
    inspected_at: trimOptional(values.inspected_at),
    inspector_id: positiveInt(values.inspector_id),
    decision_note: trimOptional(values.decision_note),
  })
}

export default function V1QualityInspectionsPage() {
  const outletContext = useOutletContext()
  const navigate = useNavigate()
  const adminProfile = outletContext?.adminProfile || {}
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [inspectionModal, setInspectionModal] = useState(null)
  const [inspectionForm] = Form.useForm()
  const [decisionForm] = Form.useForm()

  const canCreate = hasPermission(adminProfile, 'quality.inspection.create')
  const canUpdate = hasPermission(adminProfile, 'quality.inspection.update')
  const relatedMenuItems = [
    { key: 'purchase-receipts', label: '采购入库' },
    { key: 'inventory', label: '库存台账' },
  ]

  const openRelatedTable = ({ key }) => {
    if (!selectedRow) return
    const pathByKey = {
      'purchase-receipts': V1_ROUTE_PATHS.purchaseReceipts,
      inventory: V1_ROUTE_PATHS.inventory,
    }
    const targetPath = pathByKey[key]
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listQualityInspections(
        compactParams({
          status: statusFilter,
          result: resultFilter,
          keyword: trimOptional(keyword),
          ...getBusinessPaginationParams(pagination),
        })
      )
      const nextRows = Array.isArray(data?.quality_inspections)
        ? data.quality_inspections
        : []
      setRows(nextRows)
      setSelectedRow((current) =>
        current?.id
          ? nextRows.find((item) => item.id === current.id) || current
          : null
      )
      setTotal(Number(data?.total || 0))
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载来料质检单'))
    } finally {
      setLoading(false)
    }
  }, [keyword, pagination, resultFilter, statusFilter])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(loadRows)
  }, [loadRows, outletContext])

  useEffect(() => {
    if (inspectionModal?.mode === 'create') {
      inspectionForm.setFieldsValue({
        inspection_no: '',
        purchase_receipt_id: undefined,
        purchase_receipt_item_id: undefined,
        inventory_lot_id: undefined,
        material_id: undefined,
        warehouse_id: undefined,
        inspector_id: undefined,
        decision_note: '',
      })
    }
    if (['pass', 'reject', 'cancel'].includes(inspectionModal?.mode)) {
      decisionForm.setFieldsValue({
        result: inspectionModal?.mode === 'pass' ? 'PASS' : undefined,
        inspected_at:
          inspectionModal?.mode === 'cancel' ? undefined : todayInputValue(),
        inspector_id: undefined,
        decision_note: '',
      })
    }
  }, [decisionForm, inspectionForm, inspectionModal?.mode])

  const openCreate = useCallback(() => {
    setInspectionModal({ mode: 'create' })
  }, [])

  const openDecision = useCallback((mode, inspection) => {
    setInspectionModal({ mode, inspection })
  }, [])

  const closeModal = useCallback(() => {
    setInspectionModal(null)
  }, [])

  const handleCreateInspection = useCallback(async () => {
    const values = await inspectionForm.validateFields()
    setSaving(true)
    try {
      const inspection = await createQualityInspectionDraft(
        buildInspectionParams(values)
      )
      message.success('来料质检草稿已创建')
      setSelectedRow(inspection)
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '创建来料质检草稿'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, inspectionForm, loadRows])

  const runInspectionAction = useCallback(
    async (inspection, action, successText) => {
      if (!inspection?.id) return
      setSaving(true)
      try {
        const nextInspection = await action({ id: inspection.id })
        setSelectedRow(nextInspection || inspection)
        message.success(successText)
        await loadRows()
      } catch (error) {
        message.error(getActionErrorMessage(error, successText))
      } finally {
        setSaving(false)
      }
    },
    [loadRows]
  )

  const handleDecision = useCallback(async () => {
    const inspection = inspectionModal?.inspection
    if (!inspection?.id) return
    const values = await decisionForm.validateFields()
    setSaving(true)
    try {
      let action = passQualityInspection
      let params = buildDecisionParams(inspection.id, values)
      let successText = '来料质检已判定合格'
      if (inspectionModal?.mode === 'reject') {
        action = rejectQualityInspection
        params = buildDecisionParams(inspection.id, values, 'REJECT')
        successText = '来料质检已判定不合格'
      } else if (inspectionModal?.mode === 'cancel') {
        action = cancelQualityInspection
        params = buildDecisionParams(inspection.id, values)
        successText = '来料质检已取消'
      }
      const nextInspection = await action(params)
      setSelectedRow(nextInspection || inspection)
      message.success(successText)
      closeModal()
      await loadRows()
    } catch (error) {
      message.error(getActionErrorMessage(error, '处理来料质检'))
    } finally {
      setSaving(false)
    }
  }, [closeModal, decisionForm, inspectionModal, loadRows])

  const selectedRowLabel = selectedRow
    ? `${selectedRow.inspection_no || selectedRow.id} / 批次 ${
        selectedRow.inventory_lot_id || '-'
      }`
    : '请先选择一张来料质检单'

  const modalTitle = {
    create: '新建来料质检单',
    pass: '判定合格',
    reject: '判定不合格',
    cancel: '取消质检',
  }[inspectionModal?.mode || 'create']

  const modalOkText = {
    create: '创建草稿',
    pass: '确认合格',
    reject: '确认不合格',
    cancel: '确认取消',
  }[inspectionModal?.mode || 'create']

  const columns = useMemo(
    () => [
      { title: '质检单号', dataIndex: 'inspection_no', width: 170 },
      {
        title: '状态',
        dataIndex: 'status',
        width: 110,
        render: statusTag,
      },
      {
        title: '判定',
        dataIndex: 'result',
        width: 120,
        render: resultTag,
      },
      { title: '采购入库单', dataIndex: 'purchase_receipt_id', width: 120 },
      {
        title: '入库行',
        dataIndex: 'purchase_receipt_item_id',
        width: 110,
        render: (value) => value || '-',
      },
      { title: '材料 ID', dataIndex: 'material_id', width: 100 },
      { title: '仓库 ID', dataIndex: 'warehouse_id', width: 100 },
      { title: '批次 ID', dataIndex: 'inventory_lot_id', width: 100 },
      {
        title: '原批次状态',
        dataIndex: 'original_lot_status',
        width: 120,
        render: (value) => value || '-',
      },
      {
        title: '检验时间',
        dataIndex: 'inspected_at',
        width: 150,
        render: formatUnixDate,
      },
      {
        title: '检验员',
        dataIndex: 'inspector_id',
        width: 100,
        render: (value) => value || '-',
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        width: 170,
        render: formatUnixDateTime,
      },
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        width: 170,
        render: formatUnixDateTime,
      },
      { title: '判定备注', dataIndex: 'decision_note', ellipsis: true },
    ],
    []
  )

  return (
    <BusinessPageLayout className="erp-v1-quality-inspections-page">
      <PageHeaderCard
        compact
        title="来料质检"
        description="来料质检当前接入 quality_inspections；提交质检会把材料批次置为 HOLD，合格 / 让步接收放回 ACTIVE，不合格置为 REJECTED。质检状态变化不写库存流水，不合格退供应商仍走采购退货。"
        tags={[
          <Tag color="gold" key="hold">
            SUBMITTED：批次 HOLD
          </Tag>,
          <Tag color="green" key="pass">
            PASSED：批次 ACTIVE
          </Tag>,
          <Tag color="red" key="reject">
            REJECTED：批次 REJECTED
          </Tag>,
        ]}
        stats={[
          { key: 'total', label: '总质检单', value: total },
          { key: 'current', label: '当前结果', value: rows.length },
          {
            key: 'submitted',
            label: '已提交',
            value: rows.filter((item) => item.status === 'SUBMITTED').length,
          },
          {
            key: 'rejected',
            label: '不合格',
            value: rows.filter((item) => item.status === 'REJECTED').length,
          },
        ]}
      />

      <BusinessOperationPanel
        compact
        filters={
          <>
            <SearchInput
              value={keyword}
              placeholder="搜索质检单号 / 入库单 / 批次 ID"
              onChange={(event) => {
                setKeyword(event.target.value)
                resetBusinessPaginationCurrent(setPagination)
              }}
              onPressEnter={loadRows}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(nextStatus) => {
                setStatusFilter(nextStatus)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
            <SelectFilter
              className="erp-business-filter-control--status"
              value={resultFilter}
              options={RESULT_FILTER_OPTIONS}
              onChange={(nextResult) => {
                setResultFilter(nextResult)
                resetBusinessPaginationCurrent(setPagination)
              }}
            />
          </>
        }
        primaryAction={
          <ToolbarButton
            type="primary"
            className="erp-business-list-toolbar__primary-action"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={openCreate}
          >
            新建质检单
          </ToolbarButton>
        }
      >
        <SelectionActionBar
          embedded
          selectedCount={selectedRow ? 1 : 0}
          selectedLabel={selectedRowLabel}
          boundaryText="提交 / 判定 / 取消只调用后端 QualityUsecase；前端不本地改批次状态，不写库存流水。"
        >
          <Button
            type="link"
            size="small"
            disabled={!selectedRow}
            onClick={() => setSelectedRow(null)}
          >
            清空已选
          </Button>
          <Dropdown
            trigger={['click']}
            destroyOnHidden
            disabled={!selectedRow}
            menu={{
              items: relatedMenuItems,
              onClick: openRelatedTable,
            }}
          >
            <Button
              size="small"
              icon={<LinkOutlined />}
              disabled={!selectedRow}
            >
              关联 <DownOutlined />
            </Button>
          </Dropdown>
          <Popconfirm
            title="确认提交质检并将批次置为 HOLD？"
            onConfirm={() =>
              runInspectionAction(
                selectedRow,
                submitQualityInspection,
                '来料质检已提交'
              )
            }
            okText="确认"
            cancelText="取消"
          >
            <Button
              size="small"
              icon={<FileDoneOutlined />}
              disabled={
                !selectedRow ||
                selectedRow.status !== 'DRAFT' ||
                !canUpdate ||
                saving
              }
            >
              提交质检
            </Button>
          </Popconfirm>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'SUBMITTED' ||
              !canUpdate ||
              saving
            }
            onClick={() => openDecision('pass', selectedRow)}
          >
            判定合格
          </Button>
          <Button
            size="small"
            danger
            icon={<StopOutlined />}
            disabled={
              !selectedRow ||
              selectedRow.status !== 'SUBMITTED' ||
              !canUpdate ||
              saving
            }
            onClick={() => openDecision('reject', selectedRow)}
          >
            判定不合格
          </Button>
          <Button
            size="small"
            icon={<CloseCircleOutlined />}
            disabled={
              !selectedRow ||
              !['DRAFT', 'SUBMITTED'].includes(selectedRow.status) ||
              !canUpdate ||
              saving
            }
            onClick={() => openDecision('cancel', selectedRow)}
          >
            取消质检
          </Button>
        </SelectionActionBar>
      </BusinessOperationPanel>

      <Card className="erp-business-data-table-card erp-business-module-table-card">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={createBusinessTablePagination({
            pagination,
            total,
            onChange: (current, pageSize) =>
              setPagination({ current, pageSize }),
          })}
          scroll={{ x: 1460 }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedRow ? [selectedRow.id] : [],
            onChange: (_keys, selectedRows) =>
              setSelectedRow(selectedRows[0] || null),
          }}
          rowClassName={(record) =>
            record.id === selectedRow?.id ? 'ant-table-row-selected' : ''
          }
          onRow={(record) => ({
            onClick: () => setSelectedRow(record),
          })}
          locale={{
            emptyText: <Empty description="暂无来料质检单" />,
          }}
        />
      </Card>

      <Modal
        className="erp-business-action-modal erp-business-action-modal--form"
        title={modalTitle}
        open={Boolean(inspectionModal)}
        onCancel={closeModal}
        onOk={
          inspectionModal?.mode === 'create'
            ? handleCreateInspection
            : handleDecision
        }
        confirmLoading={saving}
        maskClosable={false}
        centered
        destroyOnHidden
        width={BUSINESS_FORM_MODAL_WIDTH}
        okText={modalOkText}
        cancelText="关闭"
      >
        {inspectionModal?.mode === 'create' ? (
          <Form
            form={inspectionForm}
            layout="vertical"
            className="erp-business-action-form erp-business-action-form--grid"
          >
            <Form.Item
              className="erp-business-action-form__field"
              label="质检单号"
              name="inspection_no"
              rules={[{ required: true, message: '请填写质检单号' }]}
            >
              <Input allowClear autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="采购入库单 ID"
              name="purchase_receipt_id"
              rules={[{ required: true, message: '请填写采购入库单 ID' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="采购入库行 ID"
              name="purchase_receipt_item_id"
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="批次 ID"
              name="inventory_lot_id"
              rules={[{ required: true, message: '请填写批次 ID' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="材料 ID"
              name="material_id"
              rules={[{ required: true, message: '请填写材料 ID' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="仓库 ID"
              name="warehouse_id"
              rules={[{ required: true, message: '请填写仓库 ID' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field"
              label="检验员 ID"
              name="inspector_id"
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              className="erp-business-action-form__field erp-business-action-form__field--wide"
              label="备注"
              name="decision_note"
            >
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
            </Form.Item>
          </Form>
        ) : (
          <Form
            form={decisionForm}
            layout="vertical"
            className="erp-business-action-form erp-business-action-form--grid"
          >
            {inspectionModal?.mode === 'pass' ? (
              <Form.Item
                className="erp-business-action-form__field"
                label="判定结果"
                name="result"
                rules={[{ required: true, message: '请选择判定结果' }]}
              >
                <Select options={RESULT_DECISION_OPTIONS} />
              </Form.Item>
            ) : null}
            {inspectionModal?.mode !== 'cancel' ? (
              <>
                <Form.Item
                  className="erp-business-action-form__field"
                  label="检验日期"
                  name="inspected_at"
                >
                  <DateInput />
                </Form.Item>
                <Form.Item
                  className="erp-business-action-form__field"
                  label="检验员 ID"
                  name="inspector_id"
                >
                  <InputNumber
                    min={1}
                    precision={0}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </>
            ) : null}
            <Form.Item
              className="erp-business-action-form__field erp-business-action-form__field--wide"
              label="判定备注"
              name="decision_note"
            >
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </BusinessPageLayout>
  )
}
