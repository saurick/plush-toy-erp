import { Fragment, useId, useState } from 'react'
import { Button, Typography } from 'antd'
import FilterSelect from '@/common/components/select/FilterSelect'
import { customerPackageFieldGuide } from '../../../../../config/schemas/customerPackageFieldGuide.mjs'
import { WorkbenchToolbar } from '../../components/WorkbenchPattern.jsx'
import { CustomerConfigTrace } from './CustomerConfigTrace.jsx'

const { Text } = Typography
const groups = customerPackageFieldGuide.map(({ key, label }) => ({ value: key, label }))

export function CustomerConfigFieldGuide({ packageSourcePath, menuSourcePath }) {
  const [groupKey, setGroupKey] = useState(groups[0].value)
  const [selectedPath, setSelectedPath] = useState('')
  const traceId = useId()
  const group = customerPackageFieldGuide.find(({ key }) => key === groupKey)
  const example = group.example ? JSON.stringify(group.example) : ''
  const sourcePath = group.source === 'frontend' ? menuSourcePath : packageSourcePath

  return (
    <section className="erp-dev-customer-field-guide" aria-label="配置字段说明">
      <WorkbenchToolbar>
        <Text strong>字段分类</Text>
        <FilterSelect
          aria-label="配置字段分类"
          allowClear={false /* 不可清空：字段说明始终对应一个类别，没有无类别的视图。 */}
          virtual={false}
          value={groupKey}
          options={groups}
          onChange={(key) => { setGroupKey(key); setSelectedPath('') }}
        />
      </WorkbenchToolbar>
      <Text type="secondary">{group.description}</Text>
      <div className="erp-dev-tool-table-wrap">
        <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label={group.label}>
          <thead>
            <tr>
              <th scope="col">字段</th>
              <th scope="col">类型与要求</th>
              <th scope="col">用途、缺值和限制</th>
            </tr>
          </thead>
          <tbody>
            {group.fields.map((field) => {
              const expanded = selectedPath === field.path
              return (
                <Fragment key={field.path}>
                  <tr>
                    <th scope="row">
                      <Text strong>{field.label}</Text><br />
                      <Text code>{field.path}</Text>
                    </th>
                    <td>{field.type}{field.required ? ' · 必填' : ''}</td>
                    <td>
                      {field.description}
                      <Button
                        type="link"
                        size="small"
                        aria-label={`${field.label}的来源与清单`}
                        aria-expanded={expanded}
                        aria-controls={expanded ? traceId : undefined}
                        onClick={() => setSelectedPath(expanded ? '' : field.path)}
                      >
                        {expanded ? '收起追溯' : '追溯'}
                      </Button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr id={traceId}>
                      <td colSpan={3}>
                        <CustomerConfigTrace sourcePath={sourcePath} fieldPath={field.path} trace={field.trace} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {example ? (
        <div>
          <Text type="secondary">JSON 示例（非当前值）</Text><br />
          <Text code copyable={{ text: example, tooltips: ['复制示例', '已复制'] }}>{example}</Text>
        </div>
      ) : null}
    </section>
  )
}
