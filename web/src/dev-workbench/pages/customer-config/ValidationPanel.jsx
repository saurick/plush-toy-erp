import { Button, Typography } from 'antd'
import DevTaskNav from '../../components/DevTaskNav.jsx'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { IMPORT_ACTION_OPTIONS, IMPORT_ACTION_DRY_RUN } from './navigation.mjs'
import { DryRunSummary } from './DryRunSummary.jsx'
import { TestApplySummary } from './TestApplySummary.jsx'

const { Text, Title } = Typography

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
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="测试验证"
    >
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
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-action-panel">
        <Title level={2}>{sample ? '样本导入试跑' : '应用本地测试配置'}</Title>
        <Text type="secondary">
          {sample
            ? '用固定样本检查导入匹配与阻塞，生成本地评审报告。'
            : '将客户配置写入并激活到登记的本地开发库，验证页面、角色与责任池。'}
        </Text>
        <dl className="erp-dev-customer-action-scope">
          <div>
            <dt>目标</dt>
            <dd>{sample ? '本机报告目录' : '登记的本地开发库'}</dd>
          </div>
          <div>
            <dt>写入</dt>
            <dd>{sample ? '只生成报告，不写数据库' : '客户配置与审计记录'}</dd>
          </div>
          <div>
            <dt>环境影响</dt>
            <dd>不修改测试服或正式服</dd>
          </div>
        </dl>
        {sample ? (
          <>
            <Button
              type="primary"
              loading={dryRunState.status === 'running'}
              disabled={disabled || !importSummary.canRunUiDryRun}
              onClick={onRunDryRun}
            >
              {dryRunState.status === 'success'
                ? '重新运行样本试跑'
                : '运行样本试跑'}
            </Button>
            <DryRunSummary dryRunState={dryRunState} />
          </>
        ) : (
          <>
            <Button
              type="primary"
              loading={applyState.status === 'running'}
              disabled={disabled || !importSummary.canApplyTestConfig}
              onClick={onApplyTestConfig}
            >
              {applyState.status === 'success'
                ? '重新应用本地配置'
                : '应用本地配置'}
            </Button>
            <TestApplySummary
              applyState={applyState}
              canApplyTestConfig={importSummary.canApplyTestConfig}
              unavailableReason={importSummary.testApply.note}
            />
          </>
        )}
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <DevStaticGuidance
          title={sample ? '试跑结果用于什么' : '写入范围与限制'}
        >
          {sample ? (
            <p>
              报告用于评审样本匹配，不证明配置已经生效，也不授权真实客户数据导入。配置是否可用，需要单独验证本地配置应用。
            </p>
          ) : (
            <>
              <p>{importSummary.testApply.writesLabel}</p>
              <p>{importSummary.testApply.note}</p>
              <p>
                当前只可预览和试跑，不会发布或激活的配置包会停用应用入口。正式环境使用独立发布检查与执行器。
              </p>
            </>
          )}
        </DevStaticGuidance>
      </section>
    </div>
  )
}
