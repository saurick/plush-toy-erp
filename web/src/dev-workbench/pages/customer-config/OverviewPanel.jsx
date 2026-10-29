import { Button, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'

const { Text, Title } = Typography

export function OverviewPanel({
  overview,
  dryRunState,
  applyState,
  onNavigate,
}) {
  const checked = overview.packageConsoleSummary.primaryStatus !== 'BLOCKED'
  const sampleStatus = {
    idle: '本次未运行',
    running: '生成中',
    error: '需要重试',
    success: dryRunState.historical ? '有历史报告' : '报告已生成',
  }[dryRunState.status]
  const applyStatus = {
    idle: '本次未核验',
    running: '应用中',
    error: '需要处理',
    success: '本次已应用',
  }[applyState.status]
  return (
    <div className="erp-dev-customer-overview" data-dev-customer-view="总览">
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-start">
        <div>
          <div className="erp-dev-customer-panel__head">
            <Title level={2}>
              {checked ? '配置包可以继续验证' : '先处理配置包问题'}
            </Title>
          </div>
          <Text type="secondary">
            当前为工作区配置；服务器生效状态请到版本发布核对。
          </Text>
        </div>
        <Button
          type="primary"
          icon={<ArrowRightOutlined aria-hidden="true" />}
          onClick={() => onNavigate('preflight')}
        >
          开始检查配置
        </Button>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <dl className="erp-dev-customer-status-facts" aria-label="配置验证状态">
          <div>
            <dt>工作区配置</dt>
            <dd>
              {overview.customerPackageSummary.status === 'draft'
                ? '草案包'
                : '已登记配置包'}
            </dd>
          </div>
          <div>
            <dt>结构与边界</dt>
            <dd>{checked ? '检查通过' : '存在阻塞'}</dd>
          </div>
          <div>
            <dt>样本试跑</dt>
            <dd>{sampleStatus}</dd>
          </div>
          <div>
            <dt>本地配置应用</dt>
            <dd>{applyStatus}</dd>
          </div>
        </dl>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <DevStaticGuidance title="配置如何上线">
          <Text type="secondary">配置来源：{overview.sourceLabel}</Text>
          <ol
            className="erp-dev-customer-delivery-flow"
            aria-label="配置与部署的关系"
          >
            <li>
              <strong>本页准备配置</strong>
              <span>检查、预览、本地验证与发布就绪检查</span>
              <small>当前工作区</small>
            </li>
            <li>
              <strong>执行正式配置</strong>
              <span>由受控执行器确认目标、应用配置并读回</span>
              <small>通过检查后交接</small>
            </li>
            <li>
              <strong>发布与部署版本</strong>
              <span>由版本发布中心和 GitLab 流水线完成</span>
            </li>
          </ol>
        </DevStaticGuidance>
      </section>
    </div>
  )
}
