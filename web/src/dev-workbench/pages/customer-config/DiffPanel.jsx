import { useMemo } from 'react'
import { Button, Checkbox, Space, Typography } from 'antd'
import SupplementalHelp from '@/common/components/help/SupplementalHelp'
import { WorkbenchToolbar } from '../../components/WorkbenchPattern.jsx'
import { buildCustomerConfigFieldRows, CONFIG_FILE_LOCATION_LABEL, DEFAULT_VALUE_COLUMN, PREVIEW_VALUE_COLUMN } from './customerConfigFieldRows.mjs'
import { useCustomerConfigCompactTable } from './useCustomerConfigCompactTable.mjs'

const { Text } = Typography

function FieldValue({ label, value }) {
  return (
    <>
      {label ? <span>{label}</span> : null}
      {value !== undefined ? (
        <code className="erp-dev-customer-field-value">
          {typeof value === 'string' && value.trim() ? value : JSON.stringify(value)}
        </code>
      ) : !label ? <Text type="secondary">未声明</Text> : null}
    </>
  )
}

export function DiffPanel({ overview, disabled, onlyOverrides = true, onOnlyOverridesChange, onOpenPreview }) {
  const compact = useCustomerConfigCompactTable()
  const rows = useMemo(() => buildCustomerConfigFieldRows(overview), [overview])
  const overrideCount = rows.filter((item) => item.overridden).length
  const filterActive = onlyOverrides && overrideCount > 0
  const visibleRows = filterActive ? rows.filter((item) => item.overridden) : rows
  const locationHelp = (
    <SupplementalHelp
      label={CONFIG_FILE_LOCATION_LABEL}
      title="怎么在配置文件里找到这项设置"
      placement="bottomLeft"
      content={(
        <p>
          <code>moduleStates[].state</code> 里的 <code>[]</code> 表示模块清单中的一条记录。
          按记录条件 <code>moduleKey = production_orders</code> 找到「生产订单」那一条，再查看它的 <code>state</code> 状态字段。
        </p>
      )}
    >
      {compact ? CONFIG_FILE_LOCATION_LABEL : null}
    </SupplementalHelp>
  )
  const valueHelp = (
    <SupplementalHelp
      label="字段取值"
      title="怎么看这两列取值"
      placement="bottomLeft"
      content={<p>这里显示当前工作区的客户包取值。客户没单独设置时，沿用系统默认值。服务器实际生效的值需到目标环境核对。</p>}
    />
  )
  return (
    <section aria-label="配置字段对照">
      <WorkbenchToolbar
        tools={(
          <>
            {overrideCount > 0 ? (
              <Space size={4}>
                <Checkbox checked={filterActive} disabled={disabled} onChange={(event) => onOnlyOverridesChange(event.target.checked)}>
                  只看客户单独设置
                </Checkbox>
                <SupplementalHelp
                  label="客户单独设置"
                  placement="bottomRight"
                  content={<p>勾选后只显示为客户明确设置过的字段，值和系统默认一样也会显示。取消勾选可查看全部字段，包括沿用系统默认的项。</p>}
                />
              </Space>
            ) : null}
            <Button onClick={onOpenPreview} disabled={disabled}>界面预览</Button>
          </>
        )}
      >
        <Space size={4} wrap>
          <Text type="secondary" role="status">
            {filterActive ? `客户单独设置 ${overrideCount} 项` : `共 ${visibleRows.length} 项 · 客户单独设置 ${overrideCount} 项`}
          </Text>
          {compact ? valueHelp : null}
          {compact ? locationHelp : null}
        </Space>
      </WorkbenchToolbar>
      <div className="erp-dev-tool-table-wrap">
        <table
          role="table"
          className="erp-dev-tool-table erp-dev-customer-review-table erp-dev-customer-fields"
          data-table-lines="appearance"
          data-layout={compact ? 'compact' : undefined}
          aria-label="配置字段及影响"
        >
          <thead>
            <tr role="row">
              <th role="columnheader" scope="col">配置字段</th>
              <th role="columnheader" scope="col" aria-label={CONFIG_FILE_LOCATION_LABEL}>
                <Space size={4}>
                  <span>{CONFIG_FILE_LOCATION_LABEL}</span>
                  {compact ? null : locationHelp}
                </Space>
              </th>
              <th role="columnheader" scope="col">{DEFAULT_VALUE_COLUMN}</th>
              <th role="columnheader" scope="col" aria-label={PREVIEW_VALUE_COLUMN}>
                <Space size={4}>
                  <span>{PREVIEW_VALUE_COLUMN}</span>
                  {compact ? null : valueHelp}
                </Space>
              </th>
              <th role="columnheader" scope="col">用途与影响</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr role="row" key={row.key}>
                <th role="rowheader" scope="row">{row.label}</th>
                <td className="erp-dev-customer-field-location" data-customer-value-label={CONFIG_FILE_LOCATION_LABEL}>
                  <code>{row.path}</code>
                  {row.conditions?.length > 0 ? (
                    <div className="erp-dev-customer-field-ref">
                      <span>记录条件</span>
                      <span>
                        {row.conditions.map(([name, value], index) => (
                          <span key={name}>
                            {index > 0 ? ' · ' : null}<code>{name}</code> 为 <code>{value}</code>
                          </span>
                        ))}
                      </span>
                    </div>
                  ) : null}
                </td>
                <td data-customer-value-label={DEFAULT_VALUE_COLUMN}><FieldValue label={row.defaultLabel} value={row.defaultValue} /></td>
                <td data-customer-value-label={PREVIEW_VALUE_COLUMN}><FieldValue label={row.overridden ? row.valueLabel : '沿用系统默认'} value={row.value} /></td>
                <td>
                  {row.description}
                  {row.reason ? <div><Text type="secondary">设置原因 {row.reason}</Text></div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
