import React, { useMemo, useRef, useState } from 'react'
import { Button, Form, Space, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  TableOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import Table from '@/common/components/table/AppTable'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import WorkflowTaskProductImage from '../workflow/WorkflowTaskProductImage.jsx'
import { bomLossRateToPercent } from '../../utils/bomMaterialGroups.mjs'
import { multiplyNumeric20Scale6Values } from '../../utils/numeric20Scale6.mjs'
import {
  formatMaterialQuantity as quantity,
  materialRowKey,
  materialStockQuantity,
  materialSummaryProducts,
  materialSummaryRows,
  materialSummaryTotals,
} from '../../utils/engineeringMaterialSummary.mjs'

function MaterialParts({ parts }) {
  return (
    <Table
      className="erp-material-parts"
      size="small"
      rowKey={(part) => `${part.sales_order_item_id}:${part.bom_item_id}`}
      dataSource={parts}
      pagination={false}
      scroll={{ x: 1050 }}
      columns={[
        {
          align: 'left',
          title: '产品 / 订单行',
          width: 150,
          render: (_, part) =>
            `${part.product_name || '—'} · 第 ${part.line_no} 行`,
        },
        { title: 'BOM', dataIndex: 'bom_version', width: 75 },
        { align: 'left', title: '部位', dataIndex: 'position', width: 110 },
        { title: '片数', dataIndex: 'piece_count', width: 65 },
        {
          title: '单位用量',
          dataIndex: 'unit_usage',
          width: 110,
          align: 'right',
          render: (value) => quantity(value, true),
        },
        {
          title: '损耗 %',
          dataIndex: 'loss_rate',
          width: 85,
          align: 'right',
          render: bomLossRateToPercent,
        },
        {
          title: '生产数量',
          dataIndex: 'production_quantity',
          width: 100,
          align: 'right',
          render: (value) => quantity(value, true),
        },
        {
          title: '含损耗用量',
          dataIndex: 'total_usage',
          width: 115,
          align: 'right',
          render: (value) => quantity(value, true),
        },
        {
          align: 'left',
          title: '加工 / 备注',
          width: 230,
          render: (_, part) =>
            [part.process_base, part.process_method, part.material_note]
              .filter(Boolean)
              .join(' · ') || '—',
        },
      ]}
    />
  )
}

const renderMaterialParts = (item) => <MaterialParts parts={item.parts} />

export function EngineeringMaterialAmountSummary({
  request,
  form,
  canFinance,
}) {
  const values = Form.useWatch('items', { form, preserve: true })
  const totals = materialSummaryTotals(
    request.items,
    canFinance ? values : request.items
  )
  return (
    <div className="erp-material-amount-summary" aria-label="采购金额合计">
      <span>
        {totals.priced === request.items.length && totals.priced > 0
          ? '采购金额合计'
          : '已核价小计'}
      </span>
      <strong
        title={totals.priced ? `精确金额：${totals.amount} 元` : undefined}
      >
        {totals.priced ? `¥ ${quantity(totals.amount)}` : '待核价'}
      </strong>
      <small>
        {totals.priced} / {request.items.length} 项
      </small>
    </div>
  )
}

function MaterialNotes({ notes, compact = false }) {
  if (!notes.length) return '—'
  if (!compact || (notes.length === 1 && notes[0].length <= 50)) {
    return notes.map((note) => <div key={note}>{note}</div>)
  }
  return (
    <details className="erp-material-notes">
      <summary>
        <span className="erp-material-notes__preview">{notes[0]}</span>
        <span className="erp-material-notes__closed">
          查看完整备注{notes.length > 1 ? `（${notes.length} 条）` : ''}
        </span>
        <span className="erp-material-notes__opened">收起备注</span>
      </summary>
      <div>
        {notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </details>
  )
}

export default function EngineeringMaterialSummarySheet({
  request,
  saving,
  mobile,
  commercialRead,
  onReload,
}) {
  const [mobileView, setMobileView] = useState('cards')
  const [expanded, setExpanded] = useState([])
  const tableHost = useRef(null)
  const rows = useMemo(() => materialSummaryRows(request), [request])
  const products = useMemo(
    () => materialSummaryProducts(request.sources),
    [request.sources]
  )
  const totals = materialSummaryTotals(request.items, request.items)
  const inventory = request.inventory_reference
  const showMoney = commercialRead
  const displayQuantity = (value) => (
    <span
      className="erp-material-number"
      title={value == null ? undefined : String(value)}
    >
      {quantity(value)}
    </span>
  )
  const toggle = (key) =>
    setExpanded((previous) =>
      previous.includes(key)
        ? previous.filter((value) => value !== key)
        : [...previous, key]
    )

  const stock = (item) => {
    if (inventory?.status === 'FORBIDDEN') {
      return <span className="erp-material-summary-hint">未开放查看</span>
    }
    if (inventory?.status !== 'AVAILABLE') {
      return <span className="erp-material-summary-hint">暂不可用</span>
    }
    const value = materialStockQuantity(inventory, item)
    return value === null ? '单位待核对' : displayQuantity(value)
  }
  const notes = (item, compact = false) => (
    <MaterialNotes notes={item.material_notes} compact={compact} />
  )
  const purchasing = [
    {
      title: '实际采购数量',
      key: 'purchase',
      width: 132,
      align: 'right',
      render: (_, item) => displayQuantity(item.purchase_quantity),
    },
    {
      title: '补采数量',
      key: 'supplement',
      width: 90,
      align: 'right',
      render: () => <Tooltip title="本表暂不汇总补采数量">—</Tooltip>,
    },
    ...(showMoney
      ? [
          {
            title: '单价（元）',
            key: 'price',
            width: 120,
            align: 'right',
            render: (_, item) => displayQuantity(item.unit_price),
          },
          {
            title: '金额（元）',
            key: 'amount',
            width: 120,
            align: 'right',
            render: (_, item) => {
              const line = item
              const amount = multiplyNumeric20Scale6Values(
                line?.purchase_quantity,
                line?.unit_price,
                6
              )
              return amount ? (
                displayQuantity(amount)
              ) : (
                <span className="erp-material-summary-hint">待核价</span>
              )
            },
          },
        ]
      : []),
    {
      title: '预计到货',
      key: 'arrival',
      width: 150,
      render: (_, item) => item.expected_arrival_date?.slice(0, 10) || '—',
    },
    {
      align: 'left',
      title: '采购调整原因',
      key: 'adjustment',
      width: 200,
      render: (_, item) => item.note || '—',
    },
  ]
  const columns = [
    {
      title: '序号',
      key: 'sequence',
      fixed: 'left',
      width: mobile ? 50 : 56,
      render: (_, item) => item.index + 1,
    },
    {
      align: 'left',
      title: '材料品名',
      key: 'material',
      fixed: 'left',
      width: mobile ? 140 : 185,
      render: (_, item) => (
        <div className="erp-material-name">
          <strong>{item.material_name}</strong>
          {item.color ? <small>{item.color}</small> : null}
        </div>
      ),
    },
    {
      align: 'left',
      title: '厂商料号 / 厂商',
      key: 'supplier',
      width: 200,
      render: (_, item) => (
        <div>
          <div>{item.supplier_item_no || '—'}</div>
          <small className="erp-material-summary-hint">
            {item.supplier_name || '待补厂商'}
          </small>
        </div>
      ),
    },
    {
      title: '规格',
      dataIndex: 'spec',
      width: 110,
      render: (value) => value || '—',
    },
    { title: '单位', dataIndex: 'unit_name', width: 65 },
    {
      title: '总用数量',
      key: 'required',
      width: 125,
      align: 'right',
      render: (_, item) => (
        <strong>{displayQuantity(item.required_quantity)}</strong>
      ),
    },
    {
      title: '当前库存',
      key: 'stock',
      width: 125,
      align: 'right',
      render: (_, item) => stock(item),
    },
    ...purchasing,
    {
      align: 'left',
      title: '材料备注',
      key: 'material_note',
      width: 280,
      render: (_, item) => notes(item, true),
    },
  ]
  const scrollToSide = (right) => {
    const scroller = tableHost.current?.querySelector('.ant-table-body')
    scroller?.scrollTo({
      left: right ? scroller.scrollWidth : 0,
      behavior: 'smooth',
    })
  }

  return (
    <section className="erp-material-sheet" aria-label="材料汇总明细">
      {mobile ? (
        <p className="erp-material-sheet__order">订单号：{request.order_no}</p>
      ) : null}
      <div className="erp-material-sheet__products">
        {products.map((product) => (
          <article
            key={product.sales_order_item_id}
            className="erp-material-product"
          >
            <WorkflowTaskProductImage
              item={{
                kind: 'product',
                productID: product.product_id,
                imageAttachmentID: product.sample_image_attachment_id,
                name: product.product_name,
              }}
            />
            <div className="erp-material-product__identity">
              <h3>{product.product_name || '产品名称未记录'}</h3>
              <div>
                产品编号：
                {product.customer_product_no ||
                  product.product_code ||
                  '未记录'}
                {products.length > 1 ? ` · 订单第 ${product.line_no} 行` : ''}
              </div>
              <div className="erp-material-summary-hint">
                订单日期：{product.order_date || '未记录'} · BOM：
                {product.bom_version || '—'}
              </div>
            </div>
            <div className="erp-material-product__quantity">
              <span>产品总数量</span>
              <strong>
                {quantity(product.production_quantity, true)}{' '}
                <small>{product.product_unit_name || ''}</small>
              </strong>
              {Number(product.pre_shipment_sample_quantity) > 0 ? (
                <small>
                  订单 {quantity(product.ordered_quantity, true)} · 船头样{' '}
                  {quantity(product.pre_shipment_sample_quantity, true)}
                </small>
              ) : null}
            </div>
            {product.process_requirement ? (
              mobile ? (
                <details className="erp-material-product__note">
                  <summary>订单说明</summary>
                  <p>{product.process_requirement}</p>
                </details>
              ) : (
                <p className="erp-material-product__note">
                  {product.process_requirement}
                </p>
              )
            ) : null}
          </article>
        ))}
      </div>
      <div className="erp-material-sheet__toolbar">
        <span>{request.items.length} 种材料</span>
        {mobile ? (
          <Button
            type="text"
            aria-label="重新读取"
            icon={<ReloadOutlined aria-hidden />}
            disabled={saving}
            onClick={onReload}
          />
        ) : null}
        {mobile ? (
          <Segmented
            className="erp-material-view-switch"
            block
            aria-label="汇总查看方式"
            value={mobileView}
            onChange={setMobileView}
            options={[
              {
                label: '逐项查看',
                value: 'cards',
                icon: <UnorderedListOutlined aria-hidden />,
              },
              {
                label: '整表对照',
                value: 'table',
                icon: <TableOutlined aria-hidden />,
              },
            ]}
          />
        ) : (
          <Space size={4}>
            <Button
              icon={<ArrowLeftOutlined aria-hidden />}
              onClick={() => scrollToSide(false)}
            >
              材料
            </Button>
            <Button
              icon={<ArrowRightOutlined aria-hidden />}
              onClick={() => scrollToSide(true)}
            >
              采购 / 备注
            </Button>
          </Space>
        )}
      </div>
      {mobile && mobileView === 'cards' ? (
        <div className="erp-material-cards">
          {!rows.length ? (
            <p>暂无材料明细，请先补齐订单工程资料与 BOM</p>
          ) : null}
          {rows.map((item) => (
            <article key={materialRowKey(item)} className="erp-material-card">
              <h3>
                <span className="erp-material-sequence">{item.index + 1}</span>
                {item.material_name}
              </h3>
              <p>
                {item.supplier_item_no || '料号未填'} ·{' '}
                {item.supplier_name || '待补厂商'}
              </p>
              <p className="erp-material-summary-hint">
                {[item.spec, item.color].filter(Boolean).join(' · ') ||
                  '规格未填'}{' '}
                · 单位：{item.unit_name}
              </p>
              <dl>
                <div>
                  <dt>总用数量</dt>
                  <dd>{displayQuantity(item.required_quantity)}</dd>
                </div>
                <div>
                  <dt>当前库存</dt>
                  <dd>{stock(item)}</dd>
                </div>
                {purchasing.map((column) => (
                  <div
                    key={column.key}
                    className={
                      column.key === 'adjustment' || column.key === 'arrival'
                        ? 'erp-material-card__wide'
                        : undefined
                    }
                  >
                    <dt>{column.title}</dt>
                    <dd>{column.render(null, item)}</dd>
                  </div>
                ))}
              </dl>
              {item.material_notes.length ? (
                <div className="erp-material-card__notes">
                  <strong>材料备注</strong>
                  {notes(item)}
                </div>
              ) : null}
              <Button type="link" onClick={() => toggle(materialRowKey(item))}>
                {expanded.includes(materialRowKey(item)) ? '收起' : '查看'}
                部位用量（{item.parts.length}）
              </Button>
              {expanded.includes(materialRowKey(item)) ? (
                <MaterialParts parts={item.parts} />
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div ref={tableHost} className="erp-material-sheet__table">
          <Table
            size="small"
            bordered
            rowKey={materialRowKey}
            columns={columns}
            dataSource={rows}
            pagination={false}
            locale={{
              emptyText: '暂无材料明细，请先补齐订单工程资料与 BOM',
            }}
            scroll={{
              x: columns.reduce((sum, column) => sum + column.width, 48),
              y: mobile ? '58dvh' : '52dvh',
            }}
            expandable={{
              fixed: 'left',
              columnTitle: '明细',
              columnWidth: 48,
              expandedRowKeys: expanded,
              onExpandedRowsChange: setExpanded,
              expandedRowRender: renderMaterialParts,
            }}
          />
        </div>
      )}
      <div className="erp-material-sheet__totals" aria-label="全部材料合计">
        <div>
          <strong>全部材料用量</strong>
          <Space wrap>
            {totals.units.map((unit) => (
              <span key={unit.id}>
                {quantity(unit.quantity)} {unit.name}
              </span>
            ))}
          </Space>
        </div>
      </div>
      <details className="erp-material-sheet__help">
        <summary>
          数量与采购口径
          {inventory?.status === 'UNAVAILABLE'
            ? ' · 库存读取失败，可重新读取'
            : ''}
        </summary>
        <p>
          总用数量按生产数量和 BOM
          部位损耗计算，包含船头样。片数已包含在单位用量中，不再重复相乘。不同单位分开合计；汇总数量保留两位小数，计算与部位单位用量保留原有精度。
        </p>
        <p>
          {inventory?.status === 'AVAILABLE'
            ? `当前库存为${inventory.scope === 'ALL' ? '全部仓库' : '有权查看的仓库'}账面结存，读取于 ${new Date(inventory.as_of).toLocaleString('zh-CN', { hour12: false })}。`
            : inventory?.status === 'FORBIDDEN'
              ? '当前岗位未开放库存查看。'
              : '当前库存暂不可用，可重新读取。'}
          库存仅作参考，不代表已为此订单预留，不自动抵扣实购数量。
        </p>
        <p>
          实际采购数量由财务确认；单价及金额以人民币计，未核价显示“待核价”。本表暂不汇总补采数量。财务批准后按厂商生成采购订单。
        </p>
      </details>
    </section>
  )
}
