import './delivery/delivery-workflow.css'
import {
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { Alert, Button, Space, Tooltip, Typography } from 'antd'
import { CurrentDeliveryOperations } from './delivery/version/CurrentDeliveryOperations.jsx'
import { useVersionCenter } from './delivery/version/useVersionCenter.jsx'
import { ExecutionModal } from './delivery/version/ExecutionModal.jsx'
import { OperationDrawer } from './delivery/version/OperationDrawer.jsx'
import { ReleaseModal } from './delivery/version/ReleaseModal.jsx'
import {
  issueDescription,
} from './delivery/version/shared.jsx'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import Tabs from '@/common/components/navigation/SlidingTabs'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevStaticGuidance from '../components/DevStaticGuidance.jsx'
import { buildDevCustomerScopedRoute } from '../config/devCustomerScope.mjs'
import { DEV_VERSION_GUIDE_ROUTE } from '../config/devRoutes.mjs'
import {
  DEV_DELIVERY_SOURCE_PATH,
  DEV_DELIVERY_TARGETS,
} from '../config/devDelivery.mjs'

const { Paragraph, Text, Title } = Typography

export default function DevVersionCenterPage() {
  const {
    actionKey,
    activeView,
    canDispatch,
    clearOperationDetailFocusRestoreTimer,
    closeOperationDetail,
    confirmOperation,
    confirmationText,
    customerReady,
    customerScope,
    deliveryProviderName,
    dispatchExplanation,
    isMutationRunning,
    loadError,
    openOperations,
    openOperationDetail,
    unprovenOperations,
    operationCachePresentation,
    operationDetail,
    operationDetailIdempotency,
    operationDetailLoading,
    operationDetailNeedsRetryCard,
    operationDetailView,
    operationPollError,
    operationReleaseMetricItems,
    operationServerDigest,
    operationTargetMetricItems,
    operationWebDigest,
    performAction,
    refresh,
    refreshBusy,
    refreshStatusText,
    releaseModalOpen,
    releaseVersion,
    renderOperationActions,
    repository,
    restoreOperationDetailTriggerFocus,
    selectView,
    selectedTargetDefinition,
    selectedTargetKey,
    setConfirmOperation,
    setConfirmationText,
    setReleaseModalOpen,
    setSelectedTargetKey,
    submitRelease,
    summary,
    summaryFresh,
    buildWorkspaceItems,
    workspaceRef,
  } = useVersionCenter()

  const notices = (
    <div className="erp-dev-version-notices">
      {loadError ? (
        <Alert
          className="erp-dev-version-evidence-alert"
          type={summary ? 'warning' : 'error'}
          showIcon
          message={summary ? '最新状态核对失败' : '版本中心不可用'}
          description={
            summary
              ? `${loadError}；当前保留上次结果，写操作已停用。`
              : loadError
          }
        />
      ) : null}
      {summary?.issues?.length > 0 ? (
        <Alert
          className="erp-dev-version-evidence-alert"
          type="warning"
          showIcon
          message="状态核对不完整，相关写操作按已证明范围停用"
          description={issueDescription(summary.issues)}
        />
      ) : null}
      {operationPollError ? (
        <Alert
          className="erp-dev-version-evidence-alert"
          type="warning"
          showIcon
          message="操作状态刷新暂时中断"
          description={`${operationPollError}；页面会继续有界重试，也可手动刷新状态。`}
        />
      ) : null}
      {unprovenOperations.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={`有 ${unprovenOperations.length} 条操作结果未证明，请先核对目标与原始回执`}
          action={<Button onClick={(event) => openOperationDetail(unprovenOperations[0], event.currentTarget)}>核对结果</Button>}
        />
      ) : null}
      <CurrentDeliveryOperations
        operations={openOperations}
        compact={activeView !== 'versions'}
        openOperationDetail={openOperationDetail}
        renderOperationActions={renderOperationActions}
      />

    </div>
  )
  const workspaceItems = buildWorkspaceItems(notices)

  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-tool-page erp-dev-version-page erp-dev-delivery-workspace">
      <DevPageNav sourcePath={DEV_DELIVERY_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <DeploymentUnitOutlined aria-hidden="true" />
          </span>
          <Title level={1} className="erp-dev-hub-title">
            版本发布
          </Title>
        </div>
        <section
          className="erp-dev-workbench-header-context erp-dev-version-context"
          aria-label="版本发布范围"
        >
          <DevCustomerScopeSelector
            compact
            label="客户"
            note=""
            scope={customerScope}
            onChange={customerScope.selectCustomer}
            disabled={isMutationRunning}
            invalidDescription="当前甲方没有登记发布目标；版本、部署、回滚与目标状态读取均已停止。"
          />

          <div className="erp-dev-version-target-context">
            <Text strong>部署目标</Text>
            <Segmented
              aria-label="切换当前操作目标"
              value={selectedTargetKey}
              disabled={isMutationRunning}
              options={DEV_DELIVERY_TARGETS.map((item) => ({
                label: item.label,
                value: item.key,
              }))}
              onChange={setSelectedTargetKey}
            />
            <details className="erp-dev-disclosure erp-dev-target-data-boundary">
              <summary>数据保留方式</summary>
              <Text type="secondary">
                {selectedTargetDefinition.dataBoundary}
              </Text>
            </details>
          </div>
        </section>
        <div className="erp-dev-version-header-actions">
          <Space wrap>
            {['versions', 'overview'].includes(activeView) ? (
              <Tooltip title={canDispatch ? '' : dispatchExplanation}>
                <Button
                  type={activeView === 'overview' ? 'primary' : 'default'}
                  icon={<CloudUploadOutlined aria-hidden="true" />}
                  disabled={!canDispatch}
                  onClick={() => setReleaseModalOpen(true)}
                >
                  生成发布制品
                </Button>
              </Tooltip>
            ) : null}
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={refreshBusy}
              disabled={!customerReady}
              onClick={refresh}
            >
              刷新状态
            </Button>
            <Button
              icon={<ToolOutlined aria-hidden="true" />}
              href={
                customerReady
                  ? buildDevCustomerScopedRoute(
                      DEV_VERSION_GUIDE_ROUTE,
                      customerScope.customerKey
                    )
                  : DEV_VERSION_GUIDE_ROUTE
              }
            >
              操作指引
            </Button>
          </Space>
          <Text type="secondary" role="status" aria-live="polite">
            {refreshStatusText}
          </Text>
        </div>
      </header>

      <main className="erp-dev-hub-shell erp-dev-version-shell">

        <section
          ref={workspaceRef}
          className="erp-dev-version-workspace"
          aria-label="版本发布工作区"
        >
          <Tabs
            activeKey={activeView}
            items={workspaceItems}
            onChange={selectView}
          />
        </section>
        <DevStaticGuidance title="证据与运行边界" hint="发布职责与安全限制">
          <Paragraph>
            <strong>CI/CD 证据分两处查看：</strong>
            发布与部署耗时汇总 GitLab 的 CI
            检查、构建和制品发布耗时；操作记录看工作台发起的发布、目标部署、回滚和数据重建结果。
          </Paragraph>
          GitLab 负责代码真源、CI 与不可变制品；GitHub 仅接收单向审查镜像；本地
          Bridge 只接受固定动作；已登记目标
          均不构建、不接受浏览器传入的命令、目录、仓库或 SSH
          目标。各目标使用同一不可变版本，但数据库、附件、运行资源、备份与回滚点相互隔离。
        </DevStaticGuidance>
      </main>

      <ReleaseModal
        actionKey={actionKey}
        deliveryProviderName={deliveryProviderName}
        releaseModalOpen={releaseModalOpen}
        releaseVersion={releaseVersion}
        repository={repository}
        setReleaseModalOpen={setReleaseModalOpen}
        submitRelease={submitRelease}
        summaryFresh={summaryFresh}
      />

      <OperationDrawer
        renderOperationActions={renderOperationActions}
        clearOperationDetailFocusRestoreTimer={
          clearOperationDetailFocusRestoreTimer
        }
        closeOperationDetail={closeOperationDetail}
        operationCachePresentation={operationCachePresentation}
        operationDetail={operationDetail}
        operationDetailIdempotency={operationDetailIdempotency}
        operationDetailLoading={operationDetailLoading}
        operationDetailNeedsRetryCard={operationDetailNeedsRetryCard}
        operationDetailView={operationDetailView}
        operationReleaseMetricItems={operationReleaseMetricItems}
        operationServerDigest={operationServerDigest}
        operationTargetMetricItems={operationTargetMetricItems}
        operationWebDigest={operationWebDigest}
        restoreOperationDetailTriggerFocus={restoreOperationDetailTriggerFocus}
      />

      <ExecutionModal
        actionKey={actionKey}
        confirmOperation={confirmOperation}
        confirmationText={confirmationText}
        performAction={performAction}
        setConfirmOperation={setConfirmOperation}
        setConfirmationText={setConfirmationText}
        summaryFresh={summaryFresh}
      />
    </div>
  )
}
