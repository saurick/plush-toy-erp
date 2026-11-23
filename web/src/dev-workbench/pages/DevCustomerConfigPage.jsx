import React, { useEffect, useState } from 'react'
import { SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Space, Tag, Typography } from 'antd'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import { canCreateLocalCustomerDraft, DEV_CUSTOMER_CONFIG_ROUTE } from '../config/devCustomerConfig.mjs'
import { CustomerDraftDialog } from './customer-config/CustomerDraftDialog.jsx'
import { CustomerConfigReview } from './customer-config/CustomerConfigReview.jsx'
import { ReleasePanel } from './customer-config/ReleasePanel.jsx'
import { ValidationPanel } from './customer-config/ValidationPanel.jsx'
import {
  CustomerPackageSelector,
  MissingCustomerPanel,
} from './customer-config/presentation.jsx'
import { CUSTOMER_CONFIG_TASKS, RELEASE_TASK, VALIDATION_TASK } from './customer-config/navigation.mjs'
import { useCustomerConfigOperations } from './customer-config/useCustomerConfigOperations.mjs'
import { useCustomerConfigRoute } from './customer-config/useCustomerConfigRoute.mjs'
import './customer-config/customer-config-workflow.css'

const { Title } = Typography

function CustomerConfigTaskContent({ route, operations }) {
  const [onlyOverrides, setOnlyOverrides] = useState(true)
  const { overview, activeTask, focusTestApply } = route
  const { isMutationRunning } = operations

  if (overview.status !== 'ready') return <MissingCustomerPanel overview={overview} />

  if (activeTask === VALIDATION_TASK) {
    return (
      <ValidationPanel
        importSummary={overview.importSummary}
        dryRunState={operations.dryRunState}
        applyState={operations.applyState}
        focusApply={focusTestApply}
        onRunDryRun={operations.handleRunDryRun}
        onApplyTestConfig={operations.requestApplyTestConfig}
        disabled={isMutationRunning}
      />
    )
  }

  if (activeTask === RELEASE_TASK) {
    return (
      <ReleasePanel
        importSummary={overview.importSummary}
        releaseState={operations.releaseState}
        releaseBatchesState={operations.releaseBatchesState}
        releaseBatch={operations.releaseBatch}
        onReleaseBatchChange={(batch) => {
          if (!isMutationRunning) {
            operations.resetRelease()
            route.selectReleaseBatch(batch)
          }
        }}
        onCheckReleaseReadiness={operations.handleCheckReleaseReadiness}
        onRetryRead={operations.retryRead}
        disabled={isMutationRunning}
      />
    )
  }

  return (
    <CustomerConfigReview
      route={route}
      disabled={isMutationRunning}
      onlyOverrides={onlyOverrides}
      onOnlyOverridesChange={setOnlyOverrides}
    />
  )
}

export default function DevCustomerConfigPage() {
  const [draftOpen, setDraftOpen] = useState(false)
  const route = useCustomerConfigRoute()
  const { overview, activeTask } = route
  const operations = useCustomerConfigOperations({
    overview,
    requestedReleaseBatch: route.requestedReleaseBatch,
  })
  const { isMutationRunning, releaseBatch, releaseBatchesState } = operations
  const isMissingCustomer = overview.status !== 'ready'
  const canCreateDraft = canCreateLocalCustomerDraft(globalThis.location?.hostname)

  useEffect(() => {
    if (
      releaseBatchesState.status === 'success' &&
      route.requestedReleaseBatch &&
      !releaseBatch
    ) {
      route.selectReleaseBatch('', { replace: true })
    }
  }, [releaseBatch, releaseBatchesState.status, route])

  return (
    <main className="erp-dev-customer-page erp-dev-workspace-page erp-dev-tool-page erp-dev-delivery-workspace">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-customer-header"
        title={
          <div className="erp-dev-customer-header__copy">
            <Space align="center" size={10}>
              <SettingOutlined className="erp-dev-customer-header__icon" />
              <Title className="erp-dev-customer-title" level={1}>
                客户配置
              </Title>
            </Space>
          </div>
        }
        navigation={
          !isMissingCustomer ? (
            <DevTaskNav
              compact
              level="primary"
              idPrefix="dev-customer"
              className="erp-dev-customer-journey"
              ariaLabel="客户配置工作任务"
              items={CUSTOMER_CONFIG_TASKS}
              value={activeTask}
              onChange={(task) => {
                if (!isMutationRunning) route.navigate(task)
              }}
              disabled={isMutationRunning}
            />
          ) : null
        }
      >
        <section
          className="erp-dev-workbench-header-context erp-dev-customer-context"
          aria-label="客户配置范围"
        >
          <CustomerPackageSelector
            overview={overview}
            onChange={(key) => {
              if (!isMutationRunning) route.selectCustomer(key)
            }}
            disabled={isMutationRunning}
          />
          {!isMissingCustomer ? (
            <Tag>{overview.customerPackageSummary.status === 'draft' ? '工作区草案' : '工作区候选'}</Tag>
          ) : null}
          {canCreateDraft ? (
            <Button disabled={isMutationRunning} onClick={() => setDraftOpen(true)}>
              从模板新建草稿
            </Button>
          ) : null}
        </section>
      </DevPageHeader>

      {canCreateDraft ? (
        <CustomerDraftDialog
          open={draftOpen}
          busy={operations.draftCreating}
          onClose={() => setDraftOpen(false)}
          onCreate={operations.requestCreateDraft}
          onCreated={(customerKey) => {
            const query = new URLSearchParams({ customer: customerKey })
            window.location.assign(`${DEV_CUSTOMER_CONFIG_ROUTE}?${query}`)
          }}
        />
      ) : null}

      {operations.historyState.status === 'error' ? (
        <Alert
          type="warning"
          showIcon
          message="操作历史暂不可读"
          description={operations.historyState.error}
          action={
            <Button disabled={isMutationRunning} onClick={operations.retryRead}>
              重试读取
            </Button>
          }
        />
      ) : null}
      <section
        className="erp-dev-customer-workspace"
        id={isMissingCustomer ? undefined : `dev-customer-panel-${activeTask}`}
        role={isMissingCustomer ? undefined : 'tabpanel'}
        aria-labelledby={
          isMissingCustomer ? undefined : `dev-customer-tab-${activeTask}`
        }
      >
        <CustomerConfigTaskContent
          key={overview.customerKey}
          route={route}
          operations={operations}
        />
      </section>
    </main>
  )
}
