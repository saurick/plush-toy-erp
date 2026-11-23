import { useState } from 'react'
import { Button, Typography } from 'antd'
import AppModal from '@/common/components/modal/AppModal'
import { customerPackageTraceForItem } from '../../../../../config/schemas/customerPackageFieldTrace.mjs'
import { WorkbenchEmpty, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { CustomerConfigTrace } from './CustomerConfigTrace.jsx'
import { StatusTag } from './presentation.jsx'

const { Text } = Typography

export function CustomerExtensionRegistry({ summary, disabled = false }) {
  const [selectedIndex, select] = useState(null)
  const { extensionRegistryChecks } = summary
  const current = extensionRegistryChecks[selectedIndex]
  const empty = extensionRegistryChecks[0]?.status === 'controlled_empty'
  return (
    <WorkbenchSection
      flat
      className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      title="本包扩展登记"
    >
      {empty ? (
        <WorkbenchEmpty
          title="暂无扩展登记"
          description={<><code>extensionPoints: []</code><p>{extensionRegistryChecks[0].note}</p></>}
        />
      ) : (
        <div className="erp-dev-tool-table-wrap">
          <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="客户包扩展登记">
            <thead><tr><th scope="col">扩展候选</th><th scope="col">声明与用途</th><th scope="col">操作</th></tr></thead>
            <tbody>
              {extensionRegistryChecks.map((item, index) => (
                <tr key={`${item.key}:${index}`}>
                  <th scope="row">
                    {item.label}
                    <div className="erp-dev-customer-field-ref">扩展标识 <code>{item.key}</code></div>
                  </th>
                  <td>
                    <StatusTag status={item.status} />
                    <div className="erp-dev-customer-field-ref">
                      状态 <code>{item.declaration?.status}</code> · 运行时 <code>{JSON.stringify(item.declaration?.runtimeEnabled) ?? '未声明'}</code>
                    </div>
                    <Text>{item.note}</Text>
                  </td>
                  <td>
                    <Button size="small" disabled={disabled} onClick={() => select(index)}>查看来源</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AppModal
        title={current?.label}
        open={Boolean(current)}
        onCancel={() => select(null)}
        footer={null}
        rootClassName="erp-dev-customer-dialog"
        destroyOnHidden
      >
        {current ? (
          <CustomerConfigTrace
            sourcePath={summary.sourcePath}
            fieldPath={`extensionPoints[${selectedIndex}]`}
            trace={customerPackageTraceForItem('extensionPoints', selectedIndex)}
            declaration={current.declaration}
          />
        ) : null}
      </AppModal>
    </WorkbenchSection>
  )
}
