import { useEffect, useRef } from 'react'
import { Button } from 'antd'
import { WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { DryRunSummary } from './DryRunSummary.jsx'
import { TestApplySummary } from './TestApplySummary.jsx'

export function ValidationPanel({
  importSummary,
  dryRunState,
  applyState,
  focusApply,
  onRunDryRun,
  onApplyTestConfig,
  disabled,
}) {
  const applyRef = useRef(null)
  useEffect(() => {
    if (!focusApply) return
    const section = applyRef.current
    section?.scrollIntoView({ block: 'start' })
    section?.focus({ preventScroll: true })
  }, [focusApply])

  return (
    <WorkbenchSection
      flat
      title="本地验证"
      className="erp-dev-customer-panel"
      data-dev-customer-view="本地验证"
    >
      <section aria-label="样本试跑" className="erp-dev-customer-validation-item">
        <div className="erp-dev-customer-validation-row">
          <div>
            <h3>样本试跑</h3>
            <p>{importSummary.canRunUiDryRun ? '用固定样本生成本机评审报告。' : '当前客户包未开放样本试跑。'}</p>
          </div>
          <Button
            loading={dryRunState.status === 'running'}
            disabled={disabled || !importSummary.canRunUiDryRun}
            onClick={onRunDryRun}
          >
            {dryRunState.status === 'success' ? '重新运行样本试跑' : '运行样本试跑'}
          </Button>
        </div>
        <DryRunSummary dryRunState={dryRunState} />
      </section>
      <section ref={applyRef} tabIndex={-1} aria-label="应用本地配置" className="erp-dev-customer-validation-item">
        <div className="erp-dev-customer-validation-row">
          <div>
            <h3>应用到本地开发库</h3>
            <p>写入登记的本地开发库并读回有效配置。</p>
          </div>
          <Button
            loading={applyState.status === 'running'}
            disabled={disabled || !importSummary.canApplyTestConfig}
            onClick={onApplyTestConfig}
          >
            {applyState.status === 'success' ? '重新应用本地配置' : '应用本地配置'}
          </Button>
        </div>
        <TestApplySummary
          applyState={applyState}
          canApplyTestConfig={importSummary.canApplyTestConfig}
          unavailableReason={importSummary.testApply.note}
        />
      </section>
    </WorkbenchSection>
  )
}
