import { Card } from 'antd'
import { DrillRow } from './shared.jsx'
import BackupRetentionPanel from './BackupRetentionPanel.jsx'

export function DrillsPanel({
  activeView,
  drillTriggerRef,
  overview,
  retention,
  setSelectedDrillKey,
}) {
  return (
    <section
      hidden={activeView !== 'drills'}
      id="dev-recovery-panel-drills"
      role="tabpanel"
      aria-labelledby="dev-recovery-tab-drills"
    >
      <Card
        title="演练清单"
        className="erp-dev-recovery-catalog"
      >
        <div className="erp-dev-tool-table-wrap">
          <table
            className="erp-dev-tool-table erp-dev-recovery-table"
            data-table-lines="appearance"
            aria-label="演练清单"
          >
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '50%' }} />
              <col style={{ width: '40%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">优先级</th>
                <th scope="col">演练</th>
                <th scope="col">状态与风险</th>
              </tr>
            </thead>
            <tbody>
              {overview.drills.map((drill) => (
                <DrillRow
                  key={drill.key}
                  drill={drill}
                  recommended={drill.key === overview.next?.key}
                  onOpen={(key, trigger) => {
                    drillTriggerRef.current = trigger
                    setSelectedDrillKey(key)
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <BackupRetentionPanel retention={retention} />
    </section>
  )
}
