import React, { useEffect } from 'react'
import { SettingOutlined } from '@ant-design/icons'
import { Alert, Button, Space, Tag, Typography } from 'antd'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import { AssetsPanel } from './customer-config/AssetsPanel.jsx'
import { DiffPanel } from './customer-config/DiffPanel.jsx'
import { OverviewPanel } from './customer-config/OverviewPanel.jsx'
import { PreflightPanel } from './customer-config/PreflightPanel.jsx'
import { ReleasePanel } from './customer-config/ReleasePanel.jsx'
import { ValidationPanel } from './customer-config/ValidationPanel.jsx'
import {
  CustomerPackageSelector,
  MissingCustomerPanel,
} from './customer-config/presentation.jsx'
import { CUSTOMER_CONFIG_STEPS } from './customer-config/navigation.mjs'
import { useCustomerConfigOperations } from './customer-config/useCustomerConfigOperations.mjs'
import { useCustomerConfigRoute } from './customer-config/useCustomerConfigRoute.mjs'
import './customer-config/customer-config-workflow.css'

const { Title } = Typography
const steps = CUSTOMER_CONFIG_STEPS.map((step) => ({
  ...step,
  label: (
    <span className="erp-dev-customer-step-label">
      {step.number ? (
        <span className="erp-dev-customer-step-number" aria-hidden="true">
          {step.number}
        </span>
      ) : null}
      <span>{step.label}</span>
    </span>
  ),
}))

export default function DevCustomerConfigPage() {
  const route = useCustomerConfigRoute()
  const { overview, activeStep } = route
  const operations = useCustomerConfigOperations({
    overview,
    requestedReleaseBatch: route.requestedReleaseBatch,
  })
  const { isMutationRunning, releaseBatch, releaseBatchesState } = operations
  const isMissingCustomer = overview.status !== 'ready'
  const selectStep = (step) => {
    if (!isMutationRunning) route.navigate(step)
  }

  useEffect(() => {
    if (
      releaseBatchesState.status === 'success' &&
      route.requestedReleaseBatch &&
      !releaseBatch
    ) {
      route.selectReleaseBatch('', { replace: true })
    }
  }, [releaseBatch, releaseBatchesState.status, route])

  const panel = {
    overview: (
      <OverviewPanel
        overview={overview}
        dryRunState={operations.dryRunState}
        applyState={operations.applyState}
        onNavigate={selectStep}
      />
    ),
    preflight: (
      <PreflightPanel
        consoleSummary={overview.packageConsoleSummary}
        customerPackageSummary={overview.customerPackageSummary}
        activeSection={route.activePreflightSection}
        onSectionChange={(section) => {
          if (!isMutationRunning) route.selectSection(section)
        }}
      />
    ),
    diff: <DiffPanel consoleSummary={overview.packageConsoleSummary} />,
    assets: (
      <AssetsPanel
        menuSummary={overview.menuSummary}
        fieldNumberingSummary={overview.fieldNumberingSummary}
        printTemplateSummary={overview.printTemplateSummary}
      />
    ),
    import: (
      <ValidationPanel
        importSummary={overview.importSummary}
        dryRunState={operations.dryRunState}
        applyState={operations.applyState}
        activeAction={route.activeImportAction}
        onActionChange={(action) => {
          if (!isMutationRunning) route.selectAction(action)
        }}
        onRunDryRun={operations.handleRunDryRun}
        onApplyTestConfig={operations.requestApplyTestConfig}
        disabled={isMutationRunning}
      />
    ),
    release: (
      <ReleasePanel
        importSummary={overview.importSummary}
        releaseState={operations.releaseState}
        releaseBatchesState={releaseBatchesState}
        releaseBatch={releaseBatch}
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
    ),
  }[activeStep]

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
              className="erp-dev-customer-journey erp-dev-customer-stagebar"
              ariaLabel="客户配置工作任务"
              items={steps}
              value={activeStep}
              onChange={selectStep}
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
          {!isMissingCustomer ? <Tag>工作区配置源</Tag> : null}
        </section>
      </DevPageHeader>

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
        id={isMissingCustomer ? undefined : `dev-customer-panel-${activeStep}`}
        role={isMissingCustomer ? undefined : 'tabpanel'}
        aria-labelledby={
          isMissingCustomer ? undefined : `dev-customer-tab-${activeStep}`
        }
      >
        {isMissingCustomer ? (
          <MissingCustomerPanel overview={overview} />
        ) : (
          panel
        )}
      </section>
    </main>
  )
}
