import React from 'react'
import { Tag } from 'antd'

import { applyBusinessColumnSorters } from '../../utils/moduleTableColumns.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'

export const SUPPLIER_TYPE_OPTIONS = Object.freeze([
  { label: '原辅料供应商', value: 'material' },
  { label: '委外加工厂', value: 'outsourcing' },
  { label: '服务供应商', value: 'service' },
  { label: '综合供应商', value: 'mixed' },
])

const SUPPLIER_TYPE_LABELS = Object.freeze(
  Object.fromEntries(
    SUPPLIER_TYPE_OPTIONS.map((item) => [item.value, item.label])
  )
)

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function compareBoolean(a, b) {
  return Number(Boolean(a)) - Number(Boolean(b))
}

function activeTag(active) {
  return active === false ? (
    <Tag color="red">停用</Tag>
  ) : (
    <Tag color="green">启用</Tag>
  )
}

function statusColumn() {
  return {
    title: '状态',
    exportTitle: '状态',
    dataIndex: 'is_active',
    width: 90,
    sorter: (a, b) => compareBoolean(a?.is_active, b?.is_active),
    exportValue: (record) => (record?.is_active === false ? '停用' : '启用'),
    render: activeTag,
  }
}

function unitColumn(unitDisplay) {
  return {
    title: '默认单位',
    exportTitle: '默认单位',
    dataIndex: 'default_unit_id',
    width: 130,
    sorter: (a, b) =>
      compareText(
        unitDisplay(a?.default_unit_id),
        unitDisplay(b?.default_unit_id)
      ),
    render: (value) => unitDisplay(value),
    exportValue: (record) => unitDisplay(record?.default_unit_id),
  }
}

function productColumns({ unitDisplay }) {
  return [
    {
      title: '产品编号',
      exportTitle: '产品编号',
      dataIndex: 'code',
      width: 150,
      sorter: (a, b) => compareText(a?.code, b?.code),
    },
    {
      title: '产品名称',
      exportTitle: '产品名称',
      dataIndex: 'name',
      width: 220,
      sorter: (a, b) => compareText(a?.name, b?.name),
    },
    {
      title: '内部款号',
      exportTitle: '内部款号',
      dataIndex: 'style_no',
      width: 160,
      sorter: (a, b) => compareText(a?.style_no, b?.style_no),
      render: (value) => value || '-',
    },
    {
      title: '客户款号',
      exportTitle: '客户款号',
      dataIndex: 'customer_style_no',
      width: 160,
      sorter: (a, b) => compareText(a?.customer_style_no, b?.customer_style_no),
      render: (value) => value || '-',
    },
    unitColumn(unitDisplay),
    statusColumn(),
  ]
}

function productSKUColumns({ productOptions, unitDisplay }) {
  return [
    {
      title: '产品',
      exportTitle: '产品',
      dataIndex: 'product_id',
      width: 180,
      sorter: (a, b) => Number(a?.product_id || 0) - Number(b?.product_id || 0),
      render: (value) => referenceLabel(productOptions, value, '产品'),
      exportValue: (record) =>
        referenceLabel(productOptions, record?.product_id, '产品'),
    },
    {
      title: 'SKU 编号',
      exportTitle: 'SKU 编号',
      dataIndex: 'sku_code',
      width: 160,
      sorter: (a, b) => compareText(a?.sku_code, b?.sku_code),
    },
    {
      title: 'SKU 名称',
      exportTitle: 'SKU 名称',
      dataIndex: 'sku_name',
      width: 200,
      sorter: (a, b) => compareText(a?.sku_name, b?.sku_name),
      render: (value) => value || '-',
    },
    {
      title: '条码',
      exportTitle: '条码',
      dataIndex: 'barcode',
      width: 160,
      sorter: (a, b) => compareText(a?.barcode, b?.barcode),
      render: (value) => value || '-',
    },
    {
      title: '客户 SKU',
      exportTitle: '客户 SKU',
      dataIndex: 'customer_sku',
      width: 160,
      sorter: (a, b) => compareText(a?.customer_sku, b?.customer_sku),
      render: (value) => value || '-',
    },
    {
      title: '颜色',
      exportTitle: '颜色',
      dataIndex: 'color',
      width: 120,
      sorter: (a, b) => compareText(a?.color, b?.color),
      render: (value) => value || '-',
    },
    {
      title: '色号',
      exportTitle: '色号',
      dataIndex: 'color_no',
      width: 120,
      sorter: (a, b) => compareText(a?.color_no, b?.color_no),
      render: (value) => value || '-',
    },
    {
      title: '尺码',
      exportTitle: '尺码',
      dataIndex: 'size',
      width: 110,
      sorter: (a, b) => compareText(a?.size, b?.size),
      render: (value) => value || '-',
    },
    {
      title: '包装版本',
      exportTitle: '包装版本',
      dataIndex: 'packaging_version',
      width: 140,
      sorter: (a, b) => compareText(a?.packaging_version, b?.packaging_version),
      render: (value) => value || '-',
    },
    unitColumn(unitDisplay),
    statusColumn(),
  ]
}

function processColumns() {
  return [
    {
      title: '环节编号',
      exportTitle: '环节编号',
      dataIndex: 'code',
      width: 150,
      sorter: (a, b) => compareText(a?.code, b?.code),
    },
    {
      title: '环节名称',
      exportTitle: '环节名称',
      dataIndex: 'name',
      width: 180,
      sorter: (a, b) => compareText(a?.name, b?.name),
    },
    {
      title: '环节类别',
      exportTitle: '环节类别',
      dataIndex: 'category',
      width: 150,
      sorter: (a, b) => compareText(a?.category, b?.category),
      render: (value) => value || '-',
    },
    {
      title: '可委外',
      exportTitle: '可委外',
      dataIndex: 'outsourcing_enabled',
      width: 100,
      sorter: (a, b) =>
        compareBoolean(a?.outsourcing_enabled, b?.outsourcing_enabled),
      exportValue: (record) =>
        record?.outsourcing_enabled === true ? '是' : '否',
      render: (value) =>
        value === true ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '可内制',
      exportTitle: '可内制',
      dataIndex: 'inhouse_enabled',
      width: 100,
      sorter: (a, b) => compareBoolean(a?.inhouse_enabled, b?.inhouse_enabled),
      exportValue: (record) => (record?.inhouse_enabled === true ? '是' : '否'),
      render: (value) =>
        value === true ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '需质检',
      exportTitle: '需质检',
      dataIndex: 'quality_required',
      width: 100,
      sorter: (a, b) =>
        compareBoolean(a?.quality_required, b?.quality_required),
      exportValue: (record) =>
        record?.quality_required === true ? '是' : '否',
      render: (value) =>
        value === true ? <Tag color="orange">是</Tag> : <Tag>否</Tag>,
    },
    statusColumn(),
  ]
}

function baseColumns({ type, unitDisplay }) {
  return [
    {
      title: '编号',
      exportTitle: '编号',
      dataIndex: 'code',
      effectiveFieldKey:
        type === 'customers'
          ? 'customer_code'
          : type === 'suppliers'
            ? 'supplier_code'
            : undefined,
      width: 140,
      sorter: (a, b) => compareText(a?.code, b?.code),
    },
    {
      title: '名称',
      exportTitle: '名称',
      dataIndex: 'name',
      width: 220,
      sorter: (a, b) => compareText(a?.name, b?.name),
    },
    ...(type === 'materials'
      ? []
      : [
          {
            title: '简称',
            exportTitle: '简称',
            dataIndex: 'short_name',
            effectiveFieldKey:
              type === 'customers' ? 'display_name' : undefined,
            width: 160,
            sorter: (a, b) => compareText(a?.short_name, b?.short_name),
            render: (value) => value || '-',
          },
        ]),
    ...(type === 'customers'
      ? [
          {
            title: '付款条件',
            exportTitle: '付款条件',
            dataIndex: 'default_payment_method',
            width: 180,
            sorter: (a, b) =>
              compareText(a?.default_payment_method, b?.default_payment_method),
            render: (value, record) => {
              const termDays = record?.default_payment_term_days
              if (value && termDays != null) return `${value} / ${termDays}天`
              if (value) return value
              if (termDays != null) return `${termDays}天`
              return '-'
            },
            exportValue: (record) => {
              const method = record?.default_payment_method
              const termDays = record?.default_payment_term_days
              if (method && termDays != null) return `${method} / ${termDays}天`
              return method || (termDays != null ? `${termDays}天` : '')
            },
          },
        ]
      : []),
    ...(type === 'materials'
      ? [
          {
            title: '分类',
            exportTitle: '分类',
            dataIndex: 'category',
            width: 140,
            sorter: (a, b) => compareText(a?.category, b?.category),
            render: (value) => value || '-',
          },
          {
            title: '规格',
            exportTitle: '规格',
            dataIndex: 'spec',
            width: 180,
            sorter: (a, b) => compareText(a?.spec, b?.spec),
            render: (value) => value || '-',
          },
          {
            title: '颜色',
            exportTitle: '颜色',
            dataIndex: 'color',
            width: 120,
            sorter: (a, b) => compareText(a?.color, b?.color),
            render: (value) => value || '-',
          },
          unitColumn(unitDisplay),
        ]
      : []),
    ...(type === 'suppliers'
      ? [
          {
            title: '类型',
            exportTitle: '类型',
            dataIndex: 'supplier_type',
            effectiveFieldKey: 'supplier_type',
            width: 140,
            sorter: (a, b) => compareText(a?.supplier_type, b?.supplier_type),
            render: (value) =>
              SUPPLIER_TYPE_LABELS[value] || (value ? '供应商类型' : '-'),
            exportValue: (record) =>
              SUPPLIER_TYPE_LABELS[record?.supplier_type] ||
              (record?.supplier_type ? '供应商类型' : ''),
          },
        ]
      : []),
    ...(type === 'materials'
      ? []
      : [
          {
            title: '税号',
            exportTitle: '税号',
            dataIndex: 'tax_no',
            width: 180,
            sorter: (a, b) => compareText(a?.tax_no, b?.tax_no),
            render: (value) => value || '-',
          },
        ]),
    statusColumn(),
  ]
}

export function buildMasterDataRecordColumns({
  type,
  productOptions,
  unitDisplay,
}) {
  if (type === 'products') {
    return applyBusinessColumnSorters(productColumns({ unitDisplay }))
  }
  if (type === 'product_skus') {
    return applyBusinessColumnSorters(
      productSKUColumns({ productOptions, unitDisplay })
    )
  }
  if (type === 'processes') {
    return applyBusinessColumnSorters(processColumns())
  }
  return applyBusinessColumnSorters(baseColumns({ type, unitDisplay }))
}
