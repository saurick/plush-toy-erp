import './delivery/delivery-workflow.css'
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Alert, Button, Space, Tag, Typography } from 'antd'
import { useDrillRecovery } from './delivery/recovery/useDrillRecovery.jsx'
import { DrillDrawer } from './delivery/recovery/DrillDrawer.jsx'
import { EmergencyPanel } from './delivery/recovery/EmergencyPanel.jsx'
import { DrillsPanel } from './delivery/recovery/DrillsPanel.jsx'
import BackupRetentionPanel from './delivery/recovery/BackupRetentionPanel.jsx'
import { SecurityPanel } from './delivery/recovery/SecurityPanel.jsx'
import { RECOVERY_VIEWS } from './delivery/recovery/shared.jsx'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevVerificationEvidence from '../components/DevVerificationEvidence.jsx'
import {
  shortGitSha,
} from '../config/devDelivery.mjs'

const { Text, Title } = Typography

export default function DevDrillRecoveryPage() {
  const {
    activeView,
    customerReady,
    customerScope,
    drillTriggerRef,
    loadError,
    loading,
    overview,
    publicHealthy,
    recoveryReady,
    refresh,
    refreshing,
    runtimeProven,
    selectView,
    selectedDrillKey,
    setSelectedDrillKey,
    stale,
    statusText,
    summary,
  } = useDrillRecovery()
  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-tool-page erp-dev-recovery-page erp-dev-delivery-workspace">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-hub-header"
        title={
          <div className="erp-dev-hub-header__copy">
            <span className="erp-dev-hub-header__icon">
              <SafetyCertificateOutlined aria-hidden="true" />
            </span>
            <Title level={1} className="erp-dev-hub-title">
              安全与恢复
            </Title>
          </div>
        }
        navigation={
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
        }
        tools={
          <Space
            className="erp-dev-workbench-tools"
            direction="vertical"
            size={4}
            align="end"
          >
            <Space wrap>
              <Tag>只读核验</Tag>
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
        }
      >
        <section
          className="erp-dev-workbench-header-context"
          aria-label="安全与恢复范围"
        >
          <DevCustomerScopeSelector
            compact
            label="客户"
            note=""
            scope={customerScope}
            onChange={customerScope.selectCustomer}
            invalidDescription="当前甲方没有登记交付目标，暂时无法读取演练状态。"
          />
        </section>
      </DevPageHeader>

      <main className="erp-dev-hub-shell erp-dev-recovery-shell">
        <DevVerificationEvidence compact />
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
            aria-label={stale ? '上次读取的恢复准备度' : '当前恢复准备度'}
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
                  <Tag color={stale ? 'default' : runtimeProven ? 'success' : 'warning'}>
                    {stale ? '上次读取，待核对' : runtimeProven ? '前后端一致' : '身份未证明'}
                  </Tag>
                </dd>
              </div>
              <div>
                <dt>公网入口</dt>
                <dd>
                  <Tag color={stale ? 'default' : publicHealthy ? 'success' : 'warning'}>
                    {stale ? '当前状态待核对' : publicHealthy ? '验证通过' : '证据未完成'}
                  </Tag>
                </dd>
              </div>
            </dl>
            {stale ? (
              <Text type="secondary">以上目标和版本来自上次读取，当前状态尚未核实。</Text>
            ) : !recoveryReady ? (
              <Text type="secondary">先补齐目标、版本或公网入口证据</Text>
            ) : null}
          </section>
        ) : null}

        <SecurityPanel activeView={activeView} overview={overview} stale={stale} />
        <DrillsPanel
          activeView={activeView}
          drillTriggerRef={drillTriggerRef}
          overview={overview}
          setSelectedDrillKey={setSelectedDrillKey}
          stale={stale}
        />
        <section
          hidden={activeView !== 'backups'}
          id="dev-recovery-panel-backups"
          role="tabpanel"
          aria-labelledby="dev-recovery-tab-backups"
        >
          <BackupRetentionPanel retention={summary?.retention} stale={stale} />
        </section>
        <EmergencyPanel
          activeView={activeView}
        />
      </main>
      <DrillDrawer
        customerReady={customerReady}
        drillTriggerRef={drillTriggerRef}
        loading={loading}
        overview={overview}
        refresh={refresh}
        refreshing={refreshing}
        selectedDrillKey={selectedDrillKey}
        setSelectedDrillKey={setSelectedDrillKey}
        stale={stale}
      />
    </div>
  )
}
