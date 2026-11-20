import './delivery/delivery-workflow.css'
import {
  DatabaseOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Alert, Button, Space, Tag, Tooltip, Typography } from 'antd'
import { useDatabaseMigration } from './delivery/migration/useDatabaseMigration.jsx'
import { MigrationOperationDrawer } from './delivery/migration/MigrationOperationDrawer.jsx'
import { MigrationConfirmation } from './delivery/migration/MigrationConfirmation.jsx'
import { MigrationHistoryPanel } from './delivery/migration/MigrationHistoryPanel.jsx'
import { MigrationRuntimePanel } from './delivery/migration/MigrationRuntimePanel.jsx'
import { MigrationUpgradePanel } from './delivery/migration/MigrationUpgradePanel.jsx'
import {
  MIGRATION_VIEW_ITEMS,
  StatusTag,
  issueText,
} from './delivery/migration/shared.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevStaticGuidance from '../components/DevStaticGuidance.jsx'
import DevVerificationEvidence from '../components/DevVerificationEvidence.jsx'
import {
  createDatabaseMigrationIdempotencyKey,
  databaseMigrationRecoveryComplete,
} from '../config/devDatabaseMigration.mjs'

const { Text, Title } = Typography

export default function DevDatabaseMigrationPage() {
  if (import.meta.env.PLUSH_STANDALONE_WORKBENCH) {
    return (
      <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-tool-page">
        <DevPageNav />
        <DevPageHeader
          className="erp-dev-hub-header"
          title={<Title level={1}>数据库迁移</Title>}
        />
        <p>133 各环境的迁移随固定版本发布执行，下面保留实际版本、恢复核验与完整回执。本机开发库的迁移准备请在本机工作台办理。</p>
        <DevVerificationEvidence />
      </div>
    )
  }
  return <LocalDatabaseMigrationPage />
}

function LocalDatabaseMigrationPage() {
  const {
    actionKey,
    activeOperation,
    activeView,
    canPrepare,
    canRestart,
    columns,
    confirmationOperation,
    confirmationText,
    hasRunningOperation,
    initialLoading,
    isLatest,
    loadError,
    migrationFlow,
    operationDetail,
    operations,
    pathOperation,
    pendingFiles,
    performAction,
    readOnly,
    readyOperation,
    recoveryActive,
    refresh,
    refreshBusy,
    refreshStatusText,
    runtime,
    runtimeState,
    selectView,
    setConfirmationOperation,
    setConfirmationText,
    setOperationDetail,
    summary,
    summaryFresh,
    target,
    toolState,
    tools,
    upgradeState,
  } = useDatabaseMigration()

  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-tool-page erp-dev-database-migration-page erp-dev-delivery-workspace">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-hub-header"
        title={
          <div className="erp-dev-hub-header__copy">
            <span className="erp-dev-hub-header__icon">
              <DatabaseOutlined aria-hidden="true" />
            </span>
            <Title level={1} className="erp-dev-hub-title">
              数据库迁移
            </Title>
          </div>
        }
        navigation={
          <DevTaskNav
            compact
            idPrefix="dev-migration"
            ariaLabel="数据库迁移视图"
            className="erp-dev-delivery-taskbar"
            items={MIGRATION_VIEW_ITEMS}
            value={activeView}
            onChange={selectView}
          />
        }
        tools={
          <Space className="erp-dev-workbench-tools" direction="vertical" size={4}>
            <Space wrap>
              <Button
                icon={<ReloadOutlined aria-hidden="true" />}
                loading={refreshBusy}
                onClick={refresh}
              >
                刷新状态
              </Button>
            </Space>
            <Text type="secondary" role="status" aria-live="polite">
              {refreshStatusText}
            </Text>
          </Space>
        }
      >
        {activeView === 'migration' && !(summaryFresh && isLatest) ? (
          <Tooltip
            title={
              canPrepare
                ? ''
                : !summaryFresh
                  ? '正在核对最新状态；上次结果只供查看'
                  : isLatest
                    ? '没有待执行迁移；如需重新核对，请使用“刷新状态”'
                    : readOnly
                      ? '局域网入口只读，请在运行开发服务的本机准备迁移'
                      : tools?.status !== 'ready'
                        ? '迁移准备环境未就绪，请按下方检查项处理后刷新'
                        : hasRunningOperation
                          ? '已有操作正在执行'
                          : '当前目标或 migration 状态未通过检查'
            }
          >
            <Button
              type="primary"
              icon={<SafetyCertificateOutlined aria-hidden="true" />}
              disabled={!canPrepare}
              loading={actionKey === 'prepare'}
              onClick={() =>
                performAction('prepare', {
                  action: 'prepare',
                  idempotencyKey: createDatabaseMigrationIdempotencyKey('prepare'),
                })
              }
            >
              {summaryFresh && isLatest
                ? '无需迁移'
                : readyOperation
                  ? '重新检查并准备'
                  : '检查并准备'}
            </Button>
          </Tooltip>
        ) : null}
      </DevPageHeader>

      <main className="erp-dev-hub-shell erp-dev-database-migration-shell">
        {recoveryActive ? (
          summaryFresh && databaseMigrationRecoveryComplete(summary) ? (
            <Alert
              type="success"
              showIcon
              message="数据库与本地后端已经恢复"
              description="业务页面与工作台操作已恢复。"
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="当前处于数据库迁移恢复模式"
              description="可切换左侧菜单查阅文档、设计和其他本地资料。业务请求及其他工作台接口暂不可用；请按下方提示恢复服务并刷新状态。"
            />
          )
        ) : null}
        {readOnly ? (
          <Alert
            type="info"
            showIcon
            message="局域网只读查看"
            description="可刷新状态和查看操作记录；准备迁移、升级与重启须在运行开发服务的本机执行。"
          />
        ) : null}
        {loadError ? (
          <Alert
            type={summary ? 'warning' : 'error'}
            showIcon
            message={summary ? '最新状态核对失败' : '数据库迁移页不可用'}
            description={
              summary
                ? `${loadError}；当前保留上次结果，写操作已停用。`
                : loadError
            }
          />
        ) : null}
        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="候选版本检查未通过"
            description={issueText(summary.issues)}
          />
        ) : null}
        {tools?.status === 'blocked' && !isLatest ? (
          <Alert
            type="warning"
            showIcon
            message="迁移准备环境未就绪"
            description={`未就绪项目：${tools.checks
              .filter((check) => check.status === 'blocked')
              .map((check) => check.label)
              .join('、')}；请在运行检查处理后刷新。`}
            action={
              activeView !== 'runtime' ? (
                <Button
                  onClick={() => selectView('runtime')}
                >
                  查看运行检查
                </Button>
              ) : null
            }
          />
        ) : null}
        <section
          className="erp-dev-workbench-toolbar"
          aria-label="数据库迁移范围"
        >

          <dl className="erp-dev-delivery-facts erp-dev-workbench-toolbar__facts">
            <div>
              <dt>目标</dt>
              <dd>
                <Text strong>共享开发库</Text>
              </dd>
            </div>
            <div>
              <dt>当前版本</dt>
              <dd>
                <Text code>{target?.currentVersion || '未证明'}</Text>
              </dd>
            </div>
            <div>
              <dt>候选版本</dt>
              <dd>
                <Text code>{target?.latestVersion || '未证明'}</Text>
              </dd>
            </div>
            <div>
              <dt>待执行迁移</dt>
              <dd>
                <Tag color={isLatest ? 'success' : 'warning'}>
                  {Number.isSafeInteger(pendingFiles)
                    ? `${pendingFiles} 条`
                    : '未证明'}
                </Tag>
              </dd>
            </div>
          </dl>
        </section>

        {activeOperation ? (
          <div className="erp-dev-migration-pending" role="status">
            <Text strong>
              {activeOperation.kind === 'migration'
                ? '当前数据库升级'
                : '当前后端恢复'}
            </Text>
            <StatusTag
              status={activeOperation.status}
              issues={activeOperation.issues}
            />
            {activeView !== 'migration' ? (
              <Button onClick={() => selectView('migration')}>
                查看当前操作
              </Button>
            ) : null}
          </div>
        ) : null}

        <MigrationUpgradePanel
          actionKey={actionKey}
          activeOperation={activeOperation}
          activeView={activeView}
          isLatest={isLatest}
          migrationFlow={migrationFlow}
          onViewRuntime={() => selectView('runtime')}
          pathOperation={pathOperation}
          readOnly={readOnly}
          readyOperation={readyOperation}
          setConfirmationOperation={setConfirmationOperation}
          setConfirmationText={setConfirmationText}
          summary={summary}
          summaryFresh={summaryFresh}
          upgradeState={upgradeState}
        />
        <MigrationRuntimePanel
          actionKey={actionKey}
          activeView={activeView}
          canRestart={canRestart}
          isLatest={isLatest}
          pendingFiles={pendingFiles}
          performAction={performAction}
          recoveryActive={recoveryActive}
          runtime={runtime}
          runtimeState={runtimeState}
          summaryFresh={summaryFresh}
          target={target}
          toolState={toolState}
          tools={tools}
        />
        <MigrationHistoryPanel
          activeView={activeView}
          columns={columns}
          initialLoading={initialLoading}
          operations={operations}
        />

        <DevStaticGuidance title="固定安全边界" hint="数据库目标与执行限制">
          仅允许开发服务的本机或内网 DEV 页面和登记的
          shared-dev；浏览器不能提交数据库地址、账号、SQL、命令、路径或生产目标。准备与执行分开，中断后只记录结果待核对，禁止自动重试。
        </DevStaticGuidance>
      </main>

      <MigrationConfirmation
        actionKey={actionKey}
        confirmationOperation={confirmationOperation}
        confirmationText={confirmationText}
        performAction={performAction}
        readOnly={readOnly}
        setConfirmationOperation={setConfirmationOperation}
        setConfirmationText={setConfirmationText}
        summaryFresh={summaryFresh}
      />

      <MigrationOperationDrawer
        operationDetail={operationDetail}
        setOperationDetail={setOperationDetail}
      />
    </div>
  )
}
