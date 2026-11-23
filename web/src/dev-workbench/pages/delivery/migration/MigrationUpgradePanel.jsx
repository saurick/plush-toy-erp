import { Alert, Button, Card, Typography } from 'antd'
import DevDatabaseMigrationFlow from '../../../components/DevDatabaseMigrationFlow.jsx'
import DevStaticGuidance from '../../../components/DevStaticGuidance.jsx'
import { StatusTag } from './shared.jsx'
import DevTimestamp from '../../../components/DevTimestamp.jsx'

const { Text, Title } = Typography

export function MigrationUpgradePanel({
  actionKey,
  activeOperation,
  activeView,
  canPrepare,
  isLatest,
  migrationFlow,
  onViewRuntime,
  pathOperation,
  readOnly,
  readyOperation,
  setConfirmationOperation,
  setConfirmationText,
  summary,
  summaryFresh,
  upgradeState,
}) {
  const currentPath = pathOperation && pathOperation === activeOperation
  const pathTitle = currentPath ? '当前升级步骤' : '最近一次升级路径'
  const latestEvent = currentPath && !readyOperation && summaryFresh ? pathOperation.events?.at(-1) : null

  return (
    <section
      hidden={activeView !== 'migration'}
      id="dev-migration-panel-migration"
      role="tabpanel"
      aria-labelledby="dev-migration-tab-migration"
    >
      {summary && ['warning', 'error'].includes(upgradeState.type) ? (
        <Alert
          type={summaryFresh ? upgradeState.type : 'info'}
          showIcon
          message={upgradeState.label}
          description={canPrepare && !pathOperation ? '选择“检查并准备”，先在隔离库验证候选版本。' : upgradeState.description}
        />
      ) : summary && !readyOperation ? (
        <div className="erp-dev-delivery-decision" role="status">
          <div>
            <Title level={2}>{upgradeState.label}</Title>
            {!isLatest ? <Text type="secondary">{upgradeState.description}</Text> : null}
          </div>
          {isLatest ? <Button onClick={onViewRuntime}>查看运行检查</Button> : null}
        </div>
      ) : null}

      {pathOperation?.status === 'passed' && !activeOperation ? (
        <DevStaticGuidance defaultOpen title="最近一次升级" hint="已完成 · 查看步骤与恢复证据">
          <DevTimestamp value={pathOperation.updatedAt} action="记录更新于" missing="记录更新时间未证明" />
          {migrationFlow}
        </DevStaticGuidance>
      ) : (
        <Card
          size="small"
          title={pathOperation ? pathTitle : '升级步骤（示意）'}
          extra={pathOperation && !currentPath ? (
            <>
              <StatusTag status={pathOperation.status} issues={pathOperation.issues} />
              <DevTimestamp value={pathOperation.updatedAt} action="记录更新于" missing="记录更新时间未证明" />
            </>
          ) : null}
        >
          {latestEvent?.message && <p role="status">最近记录 · {latestEvent.message}</p>}
          {migrationFlow}
          {readyOperation ? (
            <div className="erp-dev-database-migration-ready">
              <Alert
                type="warning"
                showIcon
                message="升级计划已准备，等待确认"
                description={`将从 ${readyOperation.target?.currentVersion} 升级到 ${readyOperation.target?.latestVersion}；备份 ${readyOperation.backup?.id} 已在隔离 PostgreSQL 中恢复并验证。`}
                action={
                  <Button
                    type="primary"
                    danger
                    disabled={readOnly || !summaryFresh || Boolean(actionKey)}
                    onClick={() => {
                      setConfirmationOperation(readyOperation)
                      setConfirmationText('')
                    }}
                  >
                    确认升级并重启
                  </Button>
                }
              />
            </div>
          ) : null}
        </Card>
      )}
      <DevDatabaseMigrationFlow />
    </section>
  )
}
