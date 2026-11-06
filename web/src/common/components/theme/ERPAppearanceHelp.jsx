import React from 'react'
import SupplementalHelp from '../help/SupplementalHelp'
import './erpAppearanceHelp.css'

const helpText = {
  density: {
    label: '表格密度',
    note: '紧凑减少行高和留白，同屏可显示更多记录。',
  },
  lines: {
    label: '表格线条',
    note: '简洁弱化分隔线；网格突出行列边界，方便逐格核对。',
  },
  display: {
    label: '编辑页显示',
    note: '适用于长编辑页：目录整页展示并定位分区；页签按分区切换。',
  },
}

function TableExample({ caption, compact = false, grid = false }) {
  return (
    <figure className="erp-appearance-help-example">
      <figcaption>{caption}</figcaption>
      <table
        data-table-lines="fixed"
        className={`erp-appearance-help-table${compact ? ' erp-appearance-help-table--compact' : ''}${grid ? ' erp-appearance-help-table--grid' : ''}`}
        aria-label={`${caption}效果示意`}
      >
        <thead><tr><th>单号</th><th>状态</th></tr></thead>
        <tbody>
          <tr><td>PO-01</td><td>待收货</td></tr>
          <tr><td>PO-02</td><td>待收货</td></tr>
          <tr><td>PO-03</td><td>已完成</td></tr>
        </tbody>
      </table>
    </figure>
  )
}

function FormExample({ tabs = false }) {
  return (
    <figure className="erp-appearance-help-example">
      <figcaption>{tabs ? '页签' : '目录'}</figcaption>
      <div
        className={`erp-appearance-help-editor${tabs ? '' : ' erp-appearance-help-editor--directory'}`}
        role="img"
        aria-label={tabs ? '顶部页签切换，一次展示一个分区' : '左侧目录定位，右侧展示全部分区'}
      >
        {tabs ? (
          <div className="erp-appearance-help-tabs"><span>基本</span><b>明细</b><span>交付</span></div>
        ) : (
          <aside><span>基本</span><span>明细</span><span>交付</span></aside>
        )}
        <div className="erp-appearance-help-sections">
          {(tabs ? ['采购明细'] : ['基本信息', '采购明细', '交付信息']).map((label) => (
            <div key={label}>
              {label}
              <div className="erp-appearance-help-placeholder" />
              {tabs ? <><div className="erp-appearance-help-placeholder" /><div className="erp-appearance-help-placeholder" /></> : null}
            </div>
          ))}
        </div>
      </div>
    </figure>
  )
}

export function ERPAppearanceHelpContent({ kind }) {
  return (
    <>
      <div className="erp-appearance-help-compare">
        {kind === 'display' ? <><FormExample /><FormExample tabs /></> : (
          <>
            <TableExample caption={kind === 'density' ? '标准' : '简洁'} />
            <TableExample caption={kind === 'density' ? '紧凑' : '网格'} compact={kind === 'density'} grid={kind === 'lines'} />
          </>
        )}
      </div>
      <p className="erp-appearance-help-note">{helpText[kind].note}</p>
    </>
  )
}

export default function ERPAppearanceHelp({ kind, open, onOpenChange }) {
  const { label } = helpText[kind]
  return (
    <SupplementalHelp
      label={label}
      title={label}
      width={380}
      open={open}
      onOpenChange={onOpenChange}
      placement="rightTop"
      className="erp-appearance-help-trigger"
      popoverClassName="erp-appearance-help-popover"
      contentClassName="erp-appearance-help-content"
      content={<ERPAppearanceHelpContent kind={kind} />}
    />
  )
}
