import { Fragment } from 'react'
import { customerPackageObjectTrace, customerPackageTraceForItem } from '../../../../../config/schemas/customerPackageFieldTrace.mjs'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { WorkbenchEmpty, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { CustomerConfigTrace } from './CustomerConfigTrace.jsx'
import { RegistryCheckItem } from './presentation.jsx'

export function CustomerExtensionRegistry({ summary }) {
  return (
    <WorkbenchSection
      flat
      className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      title="本包扩展登记"
    >
      {summary.extensionRegistryChecks.map((item, index) => {
        const empty = item.status === 'controlled_empty'
        return (
          <Fragment key={item.key}>
            {empty ? <WorkbenchEmpty title="暂无扩展登记" description={item.note} /> : <RegistryCheckItem item={item} />}
            <DevStaticGuidance title={empty ? '扩展登记的来源与清单' : `${item.label}的来源与清单`}>
              <CustomerConfigTrace
                sourcePath={summary.sourcePath}
                fieldPath={empty ? 'extensionPoints' : `extensionPoints[${index}]`}
                trace={empty ? customerPackageObjectTrace.extensionPoints : customerPackageTraceForItem('extensionPoints', index)}
                declaration={empty ? [] : item.declaration}
              />
            </DevStaticGuidance>
          </Fragment>
        )
      })}
    </WorkbenchSection>
  )
}
