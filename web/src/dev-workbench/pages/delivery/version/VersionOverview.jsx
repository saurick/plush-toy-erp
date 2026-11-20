import { Card, Space, Tag, Typography } from 'antd'
import DevTimestamp from '../../../components/DevTimestamp.jsx'
import DevStaticGuidance from '../../../components/DevStaticGuidance.jsx'
import {
  formatDeliveryBytes,
  shortGitSha,
} from '../../../config/devDelivery.mjs'
import { formatQualityGateDuration } from '../../../config/devQualityGates.mjs'

const { Link, Paragraph, Text, Title } = Typography

export function VersionOverview({
  currentTargetSha,
  deliveryProviderName,
  initializationPreflight,
  initializationReady,
  publicEntry,
  qualityGateIdentityCurrent,
  releaseDecision,
  repository,
  selectedTargetDefinition,
  strictProof,
  strictSummaryLabel,
  target,
  targetPassed,
  versions,
}) {
  const capacitySummary = (
    <Text type="secondary">
      可用空间{' '}
      {formatDeliveryBytes(
        target?.remote?.capacity?.availableBytes ??
          initializationPreflight?.remote?.capacity?.availableBytes
      )}
      {' / '}最低要求{' '}
      {formatDeliveryBytes(
        target?.remote?.capacity?.minimumAvailableBytes ??
          initializationPreflight?.remote?.capacity?.minimumAvailableBytes
      )}
    </Text>
  )
  const publicCheckSummary = (
    <Text type="secondary">
      页面健康{' '}
      {publicEntry?.health === 'passed' ? '通过' : '未通过'}
      {' · '}短信 Provider{' '}
      {publicEntry?.provider === 'passed' ? '通过' : '未通过'}
    </Text>
  )
  return (
    <Card className="erp-dev-version-overview">
      <div className="erp-dev-version-overview__main">
        <div className="erp-dev-version-facts-wrap">
          <table className="erp-dev-version-facts" data-table-lines="appearance" aria-label="发布状态摘要">
            <thead>
              <tr>
                <th scope="col">核对项</th>
                <th scope="col">当前值与证据</th>
              </tr>
            </thead>
            <tbody>
              <tr className="erp-dev-version-fact" data-kind="local">
                <th scope="row">本地候选</th>
                <td>
                  <div className="erp-dev-version-fact__primary">
                    <Text code>{shortGitSha(repository?.commit)}</Text>
                    {repository ? (
                      <Tag color={repository.dirty ? 'warning' : 'success'}>
                        {repository.dirty ? '工作树有改动' : '工作树干净'}
                      </Tag>
                    ) : (
                      <Tag color="error">身份未证明</Tag>
                    )}
                  </div>
                </td>
              </tr>
              <tr className="erp-dev-version-fact" data-kind="release">
                <th scope="row">{deliveryProviderName}不可变版本</th>
                <td>
                  <div className="erp-dev-version-fact__primary">
                    <Text strong>{versions[0]?.version || '尚无可用版本'}</Text>
                    <Text code>{shortGitSha(versions[0]?.gitSha)}</Text>
                  </div>
                  {!versions[0]?.completeAssets || !versions[0]?.promotionEligible ? (
                    <Text type="secondary">
                      {versions[0]?.completeAssets ? '仅可回滚或演练证据待补齐' : '完整制品未证明'}
                    </Text>
                  ) : null}
                </td>
              </tr>
              <tr className="erp-dev-version-fact" data-kind="target">
                <th scope="row">
                  {selectedTargetDefinition.shortLabel}运行状态
                </th>
                <td>
                  <div className="erp-dev-version-fact__primary">
                    <Text code>{shortGitSha(currentTargetSha)}</Text>
                    <Tag
                      color={
                        targetPassed
                          ? 'success'
                          : initializationReady
                            ? 'processing'
                            : 'warning'
                      }
                    >
                      {targetPassed
                        ? '运行态只读预检通过'
                        : initializationReady
                          ? '首次部署预检通过'
                          : '目标预检阻断'}
                    </Tag>
                  </div>
                  {!targetPassed ? capacitySummary : null}
                </td>
              </tr>
              <tr className="erp-dev-version-fact" data-kind="public-entry">
                <th scope="row">公网入口</th>
                <td>
                  <div className="erp-dev-version-fact__primary">
                    <Text code>{shortGitSha(publicEntry?.gitSha)}</Text>
                    <Tag
                      color={
                        publicEntry?.status === 'passed' ? 'success' : 'warning'
                      }
                    >
                      {publicEntry?.status === 'passed'
                        ? `入口与${selectedTargetDefinition.shortLabel}版本一致`
                        : '入口未完成证明'}
                    </Tag>
                  </div>
                  {publicEntry?.status !== 'passed' ? publicCheckSummary : null}
                  <Link
                    href={
                      publicEntry?.endpoint || selectedTargetDefinition.endpoint
                    }
                    rel="noreferrer"
                  >
                    打开公网页面
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <DevStaticGuidance title="版本与目标详情">
          <Text strong>不可变制品</Text>
          <DevTimestamp
            value={versions[0]?.publishedAt}
            action="发布于"
            missing="发布时间未证明"
            className="erp-dev-latest-version-published-at"
          />
          <Text type="secondary">
            {versions[0]?.completeAssets
              ? versions[0]?.promotionEligible
                ? 'v2 七资产齐全，演练回执已绑定'
                : versions[0]?.assets.includes('release-rehearsal.json')
                  ? 'v2 七资产存在，但演练证据未闭合'
                  : 'v1 六资产齐全，仅保留读取与旧版回滚'
              : '等待完整 release assets'}
          </Text>
          {targetPassed ? (
            <>
              <Text strong>目标容量</Text>
              {capacitySummary}
            </>
          ) : null}
          {publicEntry?.status === 'passed' ? (
            <>
              <Text strong>公网检查</Text>
              {publicCheckSummary}
            </>
          ) : null}
        </DevStaticGuidance>
      </div>

      <aside
        className="erp-dev-version-next"
        data-decision={releaseDecision.color}
        aria-label="当前发布结论与下一步"
      >
        <Title level={3}>{releaseDecision.title}</Title>
        <Paragraph>{releaseDecision.description}</Paragraph>

        <section
          className="erp-dev-version-quality-gate-summary"
          aria-label="当前发布 SHA 严格门禁摘要"
        >
          <Space wrap size={6}>
            <Text strong>当前发布 SHA 严格门禁</Text>
            <Tag
              color={
                strictProof?.releaseEligible && qualityGateIdentityCurrent
                  ? 'success'
                  : 'warning'
              }
            >
              {strictSummaryLabel}
            </Tag>
          </Space>
          <details className="erp-dev-disclosure erp-dev-delivery-inline-details">
            <summary>时间与耗时</summary>
            <Text type="secondary">
              实际耗时{' '}
              {formatQualityGateDuration(strictProof?.receipt?.durationMs)}
              {' · '}
              {strictProof?.reused ? '可信复用' : '本地新执行或尚未执行'}
            </Text>
            <DevTimestamp
              value={strictProof?.receipt?.finishedAt}
              action="完成于"
              missing="完成时间未证明"
              className="erp-dev-quality-gate-finished-at"
            />
          </details>

        </section>
      </aside>
    </Card>
  )
}
