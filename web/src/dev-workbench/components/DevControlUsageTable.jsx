import React from 'react'
import { Button } from 'antd'

const REQUIREMENT_LABELS = {
  required: '必需',
  default: '默认',
  optional: '可选',
  conditional: '有条件',
}

function locateFromRow(event) {
  if (event.defaultPrevented || event.target.closest('button, a[href], input, label, select, summary, textarea, [contenteditable]')) return
  const row = event.currentTarget
  const selection = row.ownerDocument.getSelection()
  if (selection && !selection.isCollapsed && selection.containsNode(row, true)) return

  row.querySelector('.erp-control-usage-locate')?.click()
}

export default function DevControlUsageTable({
  rows,
  id,
  title = '用法要求',
  label = title,
  hint,
  activeTarget,
  onLocate,
  dialogTargets,
  children,
}) {
  return (
    <section className="erp-control-usage" aria-label={label} id={id} tabIndex={id ? -1 : undefined}>
      <div className="erp-control-usage-heading">
        <h3 className="erp-control-usage-title">{title}</h3>
        {hint && <span>{hint}</span>}
      </div>
      <div className="erp-control-table-scroll">
        <table className="erp-control-table erp-control-usage-table" data-table-lines="fixed">
          <thead>
            <tr>
              <th scope="col" className="erp-control-usage-item">项目</th>
              <th scope="col">要求</th>
              <th scope="col">使用规则</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([item, requirement, description, target]) => {
              const canLocate = Boolean(target && onLocate)
              const selected = Boolean(target && activeTarget === target)
              const opensDialog = dialogTargets?.includes(target)
              return (
                <tr
                  key={item}
                  data-row-action={canLocate ? true : undefined}
                  data-usage-selected={selected ? '' : undefined}
                  onClick={canLocate ? locateFromRow : undefined}
                >
                  <th scope="row" className="erp-control-usage-row-heading">
                    {canLocate ? (
                      <Button
                        type="link"
                        size="small"
                        className="erp-control-usage-locate"
                        aria-haspopup={opensDialog ? 'dialog' : undefined}
                        aria-current={opensDialog && selected ? 'true' : undefined}
                        aria-pressed={opensDialog ? undefined : selected}
                        onClick={(event) => {
                          event.currentTarget.focus({ preventScroll: true })
                          onLocate(target, event.currentTarget)
                        }}
                      >
                        {item}
                      </Button>
                    ) : item}
                  </th>
                  <td>
                    <span className="erp-control-usage-kind" data-requirement={requirement}>
                      {REQUIREMENT_LABELS[requirement]}
                    </span>
                  </td>
                  <td>{description}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {children}
    </section>
  )
}
