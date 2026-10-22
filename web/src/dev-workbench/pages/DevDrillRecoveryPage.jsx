import './delivery/delivery-workflow.css'
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Alert, Button, Space, Tag, Typography } from 'antd'
import { useDrillRecovery } from './delivery/recovery/useDrillRecovery.jsx'
import { DrillDrawer } from './delivery/recovery/DrillDrawer.jsx'
import { EmergencyPanel } from './delivery/recovery/EmergencyPanel.jsx'
import { DrillsPanel } from './delivery/recovery/DrillsPanel.jsx'
import { SecurityPanel } from './delivery/recovery/SecurityPanel.jsx'
import { RECOVERY_VIEWS } from './delivery/recovery/shared.jsx'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import {
  DEV_VERSION_CENTER_ROUTE,
  DEV_VERSION_CENTER_VIEW_HISTORY,
  DEV_VERSION_CENTER_VIEW_QUERY_KEY,
  shortGitSha,
} from '../config/devDelivery.mjs'
import { DEV_DRILL_RECOVERY_SOURCE_PATH } from '../config/devRecovery.mjs'

const { Text, Title } = Typography

export default function DevDrillRecoveryPage() {
  const {
    activeView,
    customerReady,
    customerScope,
    drillTriggerRef,
    loadError,
    loading,
    navigateWithinCustomerScope,
    overview,
    publicHealthy,
    recoveryReady,
    refresh,
    refreshing,
    runtimeProven,
    selectView,
    selectedDrillKey,
    setSelectedDrillKey,
    statusText,
    summary,
  } = useDrillRecovery()
  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-tool-page erp-dev-recovery-page erp-dev-delivery-workspace">
      <DevPageNav sourcePath={DEV_DRILL_RECOVERY_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <SafetyCertificateOutlined aria-hidden="true" />
          </span>
          <Title level={1} className="erp-dev-hub-title">
            安全与恢复
          </Title>
        </div>

        <section className="erp-dev-workbench-header-context" aria-label="安全与恢复范围">
          <DevTaskNav
            compact
            level="primary"
            className="erp-dev-delivery-taskbar"
            idPrefix="dev-recovery"
            ariaLabel="安全与恢复任务"
            items={RECOVERY_VIEWS}
            value={activeView}
            onChange={selectView}
          />
          <DevCustomerScopeSelector
            compact
            label="客户"
            note=""
            scope={customerScope}
            onChange={customerScope.selectCustomer}
            invalidDescription="当前甲方没有登记交付目标；演练状态读取与版本中心跳转均已停止。"
          />
        </section>

        <Space direction="vertical" size={4} align="end">
          <Space wrap>
            <Tag>只读核验</Tag>
            <Button
              type="link"
              disabled={!customerReady}
              onClick={() =>
                navigateWithinCustomerScope(
                  `${DEV_VERSION_CENTER_ROUTE}?${DEV_VERSION_CENTER_VIEW_QUERY_KEY}=${DEV_VERSION_CENTER_VIEW_HISTORY}`
                )
              }
            >
              查看交付记录
            </Button>

            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={loading || refreshing}
              disabled={!customerReady}
              onClick={refresh}
            >
              核验目标
            </Button>
          </Space>
          <Text type="secondary" role="status" aria-live="polite">
            {statusText}
          </Text>
        </Space>
      </header>

      <main className="erp-dev-hub-shell erp-dev-recovery-shell">
        {loadError ? (
          <Alert
            type={summary ? 'warning' : 'error'}
            showIcon
            message={summary ? '最新状态核对失败' : '交付证据暂不可用'}
            description={
              summary
                ? `${loadError}；当前只保留上次结果，不据此启动写操作。`
                : loadError
            }
          />
        ) : null}
        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="部分交付证据未能取得"
            description={summary.issues
              .map((issue) => issue.message)
              .join('；')}
          />
        ) : null}

        {summary ? (
          <section
            className="erp-dev-recovery-status"
            aria-label="当前恢复准备度"
          >
            <dl className="erp-dev-delivery-facts">
              <div>
                <dt>环境</dt>
                <dd>
                  <Text strong>{overview.target.label}</Text>
                  <Text code>{overview.target.key}</Text>
                </dd>
              </div>
              <div>
                <dt>运行版本</dt>
                <dd>
                  <Text code>{shortGitSha(overview.currentSha)}</Text>
                  <Tag color={runtimeProven ? 'success' : 'warning'}>
                    {runtimeProven ? '前后端一致' : '身份未证明'}
                  </Tag>
                </dd>
              </div>
              <div>
                <dt>公网入口</dt>
                <dd>
                  <Tag color={publicHealthy ? 'success' : 'warning'}>
                    {publicHealthy ? '验证通过' : '证据未完成'}
                  </Tag>
                </dd>
              </div>
            </dl>
            {!recoveryReady ? (
              <Text type="secondary">先补齐目标、版本或公网入口证据</Text>
            ) : null}
          </section>
        ) : null}

        <SecurityPanel activeView={activeView} overview={overview} />
        <DrillsPanel
          activeView={activeView}
          drillTriggerRef={drillTriggerRef}
          overview={overview}
          setSelectedDrillKey={setSelectedDrillKey}
        />
        <EmergencyPanel
          activeView={activeView}
          customerReady={customerReady}
          navigateWithinCustomerScope={navigateWithinCustomerScope}
        />
      </main>
      <DrillDrawer
        customerReady={customerReady}
        drillTriggerRef={drillTriggerRef}
        loading={loading}
        navigateWithinCustomerScope={navigateWithinCustomerScope}
        overview={overview}
        refresh={refresh}
        refreshing={refreshing}
        selectedDrillKey={selectedDrillKey}
        setSelectedDrillKey={setSelectedDrillKey}
      />
    </div>
  )
}
