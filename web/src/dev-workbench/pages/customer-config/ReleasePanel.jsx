import { Alert, Button, Typography } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Select from '@/common/components/select/AppSelect'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { WorkbenchNotice, WorkbenchSection } from '../../components/WorkbenchPattern.jsx'
import { CustomerConfigPath } from './CustomerConfigPath.jsx'
import { ReleaseApplySummary } from './ReleaseApplySummary.jsx'
import { CommandList, FormalGateItem, copyText } from './presentation.jsx'

const { Text } = Typography

export function ReleasePanel({
  importSummary,
  releaseState,
  releaseBatchesState,
  releaseBatch,
  onReleaseBatchChange,
  onCheckReleaseReadiness,
  onRetryRead,
  disabled,
}) {
  const passed = releaseState.status === 'success'
  const batches = releaseBatchesState.batches || []
  const checkStatus = {
    idle: '待检查',
    historical: '历史检查，待复核',
    checking: '正在检查',
    blocked: '条件未通过',
    error: '检查失败',
    success: '本次检查通过',
  }[releaseState.status]
  const path = [
    { title: '证据批次', detail: releaseBatch ? '已选择' : '待选择' },
    { title: '发布检查', detail: checkStatus },
    { title: '执行器交接', detail: passed ? '可以交接' : '待通过本次检查' },
  ]
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="发布交接"
    >
      <WorkbenchSection
        flat
        title="正式配置发布检查"
        description="当前页核对证据并交接执行器。"
        className="erp-dev-customer-panel erp-dev-customer-panel--wide"
      >
        {batches.length > 0 ? (
          <CustomerConfigPath label="发布检查与交接路径" items={path} />
        ) : null}
        {batches.length > 0 ? (
          <div className="erp-dev-customer-release-input">
            <label htmlFor="customer-config-release-batch">发布证据批次</label>
            <Select
              id="customer-config-release-batch"
              aria-label="选择发布证据批次"
              disabled={disabled}
              value={releaseBatch || undefined}
              placeholder="选择已登记批次"
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
          <Empty description="还没有登记发布证据批次" detail="先按客户配置发布流程生成证据，再刷新本页。">
            <Button onClick={onRetryRead}>刷新批次</Button>
          </Empty>
        ) : null}
        {batches.length > 0 && !importSummary.canCheckReleaseReadiness ? (
          <WorkbenchNotice tone="warning" title="当前客户包未开放发布检查" />
        ) : null}
        <ReleaseApplySummary
          releaseState={releaseState}
          releaseBatch={releaseBatch}
        />
        <div className="erp-dev-customer-handoff-grid" role="group" aria-label="检查后的两个交接">
          <div>
            <strong>客户配置生效</strong>
            <p>由受控执行器应用正式配置；以交付回执中的目标、版本和读回时间核对生效。</p>
            {passed ? (
              <Button
                icon={<CopyOutlined aria-hidden="true" />}
                disabled={disabled}
                onClick={() => copyText(importSummary.releaseApply.command)}
              >
                复制配置执行器模板
              </Button>
            ) : null}
          </div>
          <div>
            <strong>服务器版本部署</strong>
            <p>固定版本通过检查后，再部署到测试服或正式服。</p>
          </div>
        </div>
        <DevStaticGuidance title="发布依据与执行要求">
          <div className="erp-dev-customer-formal-gates">
            {importSummary.formalGates.map((item) => (
              <FormalGateItem item={item} key={item.key} />
            ))}
          </div>
          <p>
            就绪检查不直接发布或激活正式配置。执行器继续校验目标端点、管理员身份、确认短语、审计报告及生效读回。
          </p>
          <p>
            配置回滚只恢复配置版本，并保留审计。库存、出货、财务与业务单据按对应业务规则处理；真实客户数据导入另行办理。
          </p>
          <Text strong>备用命令与输入模板</Text>
          <CommandList
            commands={(importSummary.tools || []).map((tool) => ({
              ...tool,
              label: tool.title,
            }))}
          />
        </DevStaticGuidance>
      </WorkbenchSection>
    </div>
  )
}
