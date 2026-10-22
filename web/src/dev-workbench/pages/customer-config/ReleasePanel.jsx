import { Alert, Button, Typography } from 'antd'
import { CopyOutlined, ArrowRightOutlined } from '@ant-design/icons'
import Select from '@/common/components/select/AppSelect'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { ReleaseApplySummary } from './ReleaseApplySummary.jsx'
import { CommandList, FormalGateItem, copyText } from './presentation.jsx'

const { Text, Title } = Typography

export function ReleasePanel({
  importSummary,
  releaseState,
  releaseBatchesState,
  releaseBatch,
  onReleaseBatchChange,
  onCheckReleaseReadiness,
  onRetryRead,
  deploymentHref,
  disabled,
}) {
  const passed = releaseState.status === 'success'
  const batches = releaseBatchesState.batches || []
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="发布交接"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-action-panel">
        <Title level={2}>正式配置发布检查</Title>
        <Text type="secondary">
          选择证据批次，检查正式配置是否就绪；通过后交接执行器。
        </Text>
        {batches.length > 0 ? (
          <div className="erp-dev-customer-release-input">
            <label htmlFor="customer-config-release-batch">发布证据批次</label>
            <Select
              id="customer-config-release-batch"
              aria-label="选择发布证据批次"
              disabled={disabled || batches.length === 0}
              value={releaseBatch || undefined}
              placeholder={batches.length ? '选择已登记批次' : '暂无可选批次'}
              loading={releaseBatchesState.status === 'loading'}
              options={batches.map((value) => ({ value, label: value }))}
              onChange={onReleaseBatchChange}
            />
            <Button
              type="primary"
              loading={releaseState.status === 'checking'}
              disabled={
                disabled ||
                !importSummary.canCheckReleaseReadiness ||
                !releaseBatch
              }
              onClick={onCheckReleaseReadiness}
            >
              {releaseState.status === 'idle'
                ? '检查发布条件'
                : '重新检查发布条件'}
            </Button>
          </div>
        ) : null}
        {releaseBatchesState.status === 'loading' ? <Text role="status">正在读取发布证据批次</Text> : null}
        {releaseBatchesState.status === 'error' ? (
          <Alert
            type="error"
            showIcon
            message="发布批次读取失败"
            description={releaseBatchesState.error}
            action={<Button onClick={onRetryRead}>重试读取</Button>}
          />
        ) : null}
        {releaseBatchesState.status === 'success' && batches.length === 0 ? (
          <div className="erp-dev-customer-empty-batches" role="status">
            <strong>还没有登记发布证据批次</strong>
            <span>先按客户配置发布流程生成证据，再刷新本页。</span>
            <Button onClick={onRetryRead}>刷新批次</Button>
          </div>
        ) : null}
        <ReleaseApplySummary
          releaseState={releaseState}
          releaseBatch={releaseBatch}
        />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <Title level={3}>检查后的两个交接</Title>
        <div className="erp-dev-customer-handoff-grid">
          <div>
            <strong>客户配置生效</strong>
            <p>由受控执行器确认目标环境、应用正式配置并读回结果。</p>
            {passed ? (
              <Button
                icon={<CopyOutlined aria-hidden="true" />}
                disabled={disabled}
                onClick={() => copyText(importSummary.releaseApply.command)}
              >
                复制配置执行器模板
              </Button>
            ) : (
              <small>本次发布检查通过后可复制执行器模板</small>
            )}
          </div>
          <div>
            <strong>服务器版本部署</strong>
            <p>进入版本发布中心，选择固定版本，检查后部署到测试服或正式服。</p>
            <Button
              href={deploymentHref}
              disabled={disabled}
              icon={<ArrowRightOutlined aria-hidden="true" />}
            >
              进入版本发布
            </Button>
          </div>
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <DevStaticGuidance title="发布依据与执行要求">
          <div className="erp-dev-customer-formal-gates">
            {importSummary.formalGates.map((item) => (
              <FormalGateItem item={item} key={item.key} />
            ))}
          </div>
          <p>
            就绪检查不直接发布或激活正式配置。执行器继续校验目标端点、管理员身份、确认短语、审计报告及生效读回。
          </p>
        </DevStaticGuidance>
        <DevStaticGuidance title="配置回滚与业务数据边界">
          <p>
            配置回滚只恢复配置版本，并保留审计。库存、出货、财务与业务单据按对应业务规则处理；真实客户数据导入另行办理。
          </p>
        </DevStaticGuidance>
        <DevStaticGuidance title="备用命令与输入模板">
          <CommandList
            commands={(importSummary.tools || []).map((tool) => ({
              ...tool,
              label: tool.title,
            }))}
          />
        </DevStaticGuidance>
      </section>
    </div>
  )
}
