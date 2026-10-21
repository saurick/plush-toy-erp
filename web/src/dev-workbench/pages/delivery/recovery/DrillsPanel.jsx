import { Card, Tag, Typography } from 'antd'
import { DrillAction, DrillRow } from './shared.jsx'

const { Paragraph, Text, Title } = Typography

export function DrillsPanel({
  activeView,
  customerReady,
  drillTriggerRef,
  loading,
  navigateWithinCustomerScope,
  overview,
  refresh,
  refreshing,
  setSelectedDrillKey,
}) {
  return (
    <section
      hidden={activeView !== 'drills'}
      id="dev-recovery-panel-drills"
      role="tabpanel"
      aria-labelledby="dev-recovery-tab-drills"
    >
      <div className="erp-dev-recovery-recommendation">
        <Tag>{overview.next?.priority || 'P0'}</Tag>
        <Text type="secondary">下一步建议</Text>
        <Title level={3}>{overview.next?.title || '先刷新目标核验'}</Title>
        <Paragraph>
          {overview.next?.cadence || '取得最新证据后再判断'}
        </Paragraph>
        {overview.next ? (
          <DrillAction
            action={overview.next.action}
            refreshing={loading || refreshing}
            disabled={!customerReady}
            onRefresh={refresh}
            onNavigate={navigateWithinCustomerScope}
          />
        ) : null}
      </div>
      <Card
        title="演练清单"
        extra={<Text type="secondary">选择一项查看证据与边界</Text>}
        className="erp-dev-recovery-catalog"
      >
        <div className="erp-dev-tool-table-wrap">
          <table
            className="erp-dev-tool-table erp-dev-recovery-table"
            data-table-lines="appearance"
            aria-label="演练清单"
          >
            <thead>
              <tr>
                <th scope="col">优先级</th>
                <th scope="col">演练</th>
                <th scope="col">状态与风险</th>
                <th scope="col">建议频率</th>
                <th scope="col">操作</th>
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
    </section>
  )
}
