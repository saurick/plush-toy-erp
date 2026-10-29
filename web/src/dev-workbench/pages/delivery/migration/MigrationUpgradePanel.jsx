import { Alert, Button, Card, Space, Typography } from 'antd'
import { StatusTag } from './shared.jsx'
import DevStaticGuidance from '../../../components/DevStaticGuidance.jsx'
import DevTimestamp from '../../../components/DevTimestamp.jsx'

const { Paragraph, Text, Title } = Typography

export function MigrationUpgradePanel({
  actionKey,
  activeOperation,
  activeView,
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
          description={upgradeState.description}
        />
      ) : summary ? (
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
          title={
          pathOperation && !activeOperation
            ? '最近一次升级路径'
            : '本次升级路径'
        }
          extra={
          pathOperation ? (
            <Space size={8} wrap>
              <Text type="secondary">
                {activeOperation?.kind === 'migration'
                  ? '当前升级'
                  : '最近一次升级'}
                {pathOperation.target?.latestVersion
                  ? ` · 目标 ${pathOperation.target.latestVersion}`
                  : ''}
              </Text>
              <StatusTag
                status={pathOperation.status}
                issues={pathOperation.issues}
              />
            </Space>
          ) : (
            <Text type="secondary">流程示意</Text>
          )
        }
        >
          {pathOperation ? (
          migrationFlow
        ) : (
          <div className="erp-dev-migration-start">
            <Paragraph type="secondary">
              {isLatest
                ? '当前没有待执行迁移。进入运行检查核对后端健康与开发工具。'
                : '先检查候选版本、备份恢复和业务验证，生成计划后再确认升级。'}
            </Paragraph>
            <DevStaticGuidance defaultOpen title="查看升级步骤" hint="准备、确认与事务边界">
              {migrationFlow}
            </DevStaticGuidance>
          </div>
        )}
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
    </section>
  )
}
