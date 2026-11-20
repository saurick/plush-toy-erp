import { Button } from 'antd'
import DevTaskNav from '../../components/DevTaskNav.jsx'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { WorkbenchNotice, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { CustomerConfigPath } from './CustomerConfigPath.jsx'
import { IMPORT_ACTION_OPTIONS, IMPORT_ACTION_DRY_RUN } from './navigation.mjs'
import { DryRunSummary } from './DryRunSummary.jsx'
import { TestApplySummary } from './TestApplySummary.jsx'

const samplePath = [
  { title: '固定样本' },
  { title: '匹配与校验' },
  { title: '本机评审报告' },
]
const applyPath = [
  { title: '编译候选清单' },
  { title: '写入登记的本地开发库' },
  { title: '读回有效配置' },
]

export function ValidationPanel({
  importSummary,
  dryRunState,
  applyState,
  activeAction,
  onActionChange,
  onRunDryRun,
  onApplyTestConfig,
  disabled,
}) {
  const sample = activeAction === IMPORT_ACTION_DRY_RUN
  return (
    <div className="erp-dev-customer-panel-grid" data-dev-customer-view="测试验证">
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-section-nav">
        <DevTaskNav
          compact
          ariaLabel="配置验证方式"
          items={IMPORT_ACTION_OPTIONS}
          value={activeAction}
          onChange={onActionChange}
          disabled={disabled}
        />
      </section>
      <WorkbenchSection
        flat
        title={sample ? '样本导入试跑' : '应用本地测试配置'}
        description={sample
          ? '只生成本机评审报告，不写数据库。'
          : '写入配置与审计记录；仅限登记的本地开发库。'}
        className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      >
        <CustomerConfigPath label={sample ? '样本试跑路径' : '本地配置应用路径'} items={sample ? samplePath : applyPath} />
        <div>
          {sample ? (
            <Button
              type="primary"
              loading={dryRunState.status === 'running'}
              disabled={disabled || !importSummary.canRunUiDryRun}
              onClick={onRunDryRun}
            >
              {dryRunState.status === 'success' ? '重新运行样本试跑' : '运行样本试跑'}
            </Button>
          ) : (
            <Button
              type="primary"
              loading={applyState.status === 'running'}
              disabled={disabled || !importSummary.canApplyTestConfig}
              onClick={onApplyTestConfig}
            >
              {applyState.status === 'success' ? '重新应用本地配置' : '应用本地配置'}
            </Button>
          )}
        </div>
        {sample ? (
          <>
            {!importSummary.canRunUiDryRun ? (
              <WorkbenchNotice tone="warning" title="当前客户包未开放样本试跑" />
            ) : null}
            <DryRunSummary dryRunState={dryRunState} />
          </>
        ) : (
          <>
            <TestApplySummary
              applyState={applyState}
              canApplyTestConfig={importSummary.canApplyTestConfig}
              unavailableReason={importSummary.testApply.note}
            />
            <DevStaticGuidance title="写入范围与限制">
              <p>{importSummary.testApply.writesLabel}</p>
              <p>{importSummary.testApply.note}</p>
            </DevStaticGuidance>
          </>
        )}
      </WorkbenchSection>
    </div>
  )
}
