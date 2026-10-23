import { Alert, Card, Drawer, List, Space, Tag, Typography } from 'antd'
import {
  StatusTag,
  OperationMetricItem,
  issueDescription,
  operationActionLabel,
  deliveryTargetLabel,
  operationUpdateAction,
} from './shared.jsx'
import DevTimestamp from '../../../components/DevTimestamp.jsx'
import { OperationEvidence } from './OperationEvidence.jsx'
import { DevTimingBars } from '../../../components/DevPipelineTimingPanel.jsx'
import {
  deliveryOperationMessagePresentation,
  deliveryRetryPresentation,
  formatDeliveryDuration,
  shortGitSha,
} from '../../../config/devDelivery.mjs'

const { Text } = Typography

export function OperationDrawer({
  clearOperationDetailFocusRestoreTimer,
  closeOperationDetail,
  operationCachePresentation,
  operationDetail,
  operationDetailIdempotency,
  operationDetailLoading,
  operationDetailNeedsRetryCard,
  operationDetailView,
  operationReleaseMetricItems,
  operationServerDigest,
  operationTargetMetricItems,
  operationWebDigest,
  restoreOperationDetailTriggerFocus,
}) {
  return (
    <Drawer
      title={operationDetailView.title}
      open={Boolean(operationDetail)}
      width={640}
      onClose={closeOperationDetail}
      afterOpenChange={(open) => {
        if (open) return
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (restoreOperationDetailTriggerFocus()) {
              clearOperationDetailFocusRestoreTimer()
            }
          })
        })
      }}
      destroyOnHidden
    >
      {operationDetail ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <StatusTag status={operationDetail.status} />
            <Text strong>
              {operationActionLabel(
                operationDetail.action,
                operationDetail.promotionMode,
                operationDetail.target
              )}{' '}
              · {operationDetail.version}
            </Text>
            <Tag>{deliveryTargetLabel(operationDetail.target)}</Tag>
            <Text code>{shortGitSha(operationDetail.gitSha)}</Text>
          </Space>
          <Space wrap size={[12, 4]}>
            <DevTimestamp
              value={operationDetail.createdAt}
              action="开始于"
              missing="开始时间未证明"
              className="erp-dev-operation-detail-time"
            />
            <DevTimestamp
              value={operationDetail.updatedAt}
              action={operationUpdateAction(operationDetail)}
              missing="更新时间未证明"
              className="erp-dev-operation-detail-time"
            />
          </Space>
          {operationDetailNeedsRetryCard ? (
            <Card size="small" title="执行与重试">
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text strong>{operationDetailIdempotency.label}</Text>
                <Text type="secondary">
                  {deliveryRetryPresentation(operationDetail.retry)}
                </Text>
                {operationDetail.idempotency.retryOfOperationId ? (
                  <Text type="secondary">
                    关联上一次操作：
                    {operationDetail.idempotency.retryOfOperationId.slice(0, 8)}
                  </Text>
                ) : null}
              </Space>
            </Card>
          ) : null}
          <OperationEvidence
            operation={operationDetail}
            loading={operationDetailLoading}
          />
          <Card size="small" title="操作耗时">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text strong>
                {operationDetailView.timingLabel}{' '}
                {formatDeliveryDuration(operationDetail.durationMs)}
              </Text>
              <DevTimingBars
                stages={operationDetail.stages}
                totalDurationMs={operationDetail.durationMs}
                limit={100}
                presentStage={deliveryOperationMessagePresentation}
              />
            </Space>
          </Card>
          {operationDetailView.metricsKind === 'release' ? (
            <Card size="small" title={operationDetailView.metricsTitle}>
              <Text type="secondary" className="erp-dev-operation-scope-note">
                {operationDetailView.scopeNote}
              </Text>
              {operationReleaseMetricItems.length > 0 ? (
                <div className="erp-dev-operation-metrics">
                  {operationReleaseMetricItems.map((item) => (
                    <OperationMetricItem
                      key={item.key}
                      label={item.label}
                      value={item.value}
                    />
                  ))}
                </div>
              ) : (
                <Text type="secondary">制品清单尚未读回</Text>
              )}
            </Card>
          ) : null}
          {operationTargetMetricItems.length > 0 ? (
            <Card size="small" title={operationDetailView.metricsTitle}>
              <div className="erp-dev-operation-metrics">
                {operationTargetMetricItems.map((item) => (
                  <OperationMetricItem
                    key={item.key}
                    label={item.label}
                    value={item.value}
                  />
                ))}
              </div>
              {operationDetail.metrics.targetCacheHit != null ? (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text type="secondary">
                    命中来源：{operationCachePresentation.source}
                  </Text>
                  <Text type="secondary">
                    命中依据：
                    {operationCachePresentation.basis.length > 0
                      ? operationCachePresentation.basis.join('、')
                      : '无（已执行冷路径）'}
                  </Text>
                  <Text type="secondary">
                    缓存命中后仍执行：
                    {operationCachePresentation.stillExecuted.join('、')}
                  </Text>
                </Space>
              ) : null}
            </Card>
          ) : null}
          {operationDetail.issues.length > 0 ? (
            <Alert
              type="error"
              showIcon
              message="已记录问题"
              description={issueDescription(operationDetail.issues)}
            />
          ) : null}
          <details className="erp-dev-disclosure erp-dev-operation-technical-details">
            <summary>技术详情与状态事件</summary>
            <div className="erp-dev-operation-technical-details__content">
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text type="secondary" copyable={{ text: operationDetail.id }}>
                  操作 ID：{operationDetail.id}
                </Text>
                <Text
                  type="secondary"
                  copyable={{ text: operationDetail.gitSha }}
                >
                  提交：{operationDetail.gitSha}
                </Text>
                {operationDetail.evidence ? (
                  <>
                    <Text type="secondary" copyable>
                      回执 SHA256：{operationDetail.evidence.receiptSha256}
                    </Text>
                    {operationDetail.evidence.backup?.sha256 ? (
                      <>
                        <Text type="secondary" copyable>
                          备份标识：{operationDetail.evidence.backup.alias}
                        </Text>
                        <Text type="secondary" copyable>
                          备份 SHA256：{operationDetail.evidence.backup.sha256}
                        </Text>
                      </>
                    ) : null}
                  </>
                ) : null}
                <Text type="secondary">
                  重复请求识别依据：
                  {operationDetailIdempotency.basis.join('、')}
                </Text>
                <Text type="secondary">
                  重试状态：{deliveryRetryPresentation(operationDetail.retry)}
                </Text>
                {operationServerDigest && operationWebDigest ? (
                  <>
                    <Text
                      type="secondary"
                      code
                      copyable={{ text: operationServerDigest }}
                    >
                      Server {operationServerDigest}
                    </Text>
                    <Text
                      type="secondary"
                      code
                      copyable={{ text: operationWebDigest }}
                    >
                      Web {operationWebDigest}
                    </Text>
                  </>
                ) : null}
              </Space>
              <List
                loading={operationDetailLoading}
                header="状态事件（最多 100 条，按需读取）"
                dataSource={operationDetail.events}
                locale={{ emptyText: '暂无状态事件' }}
                renderItem={(event) => (
                  <List.Item>
                    <Space direction="vertical" size={4}>
                      <Space wrap>
                        <StatusTag status={event.status} />
                        <DevTimestamp
                          value={event.at}
                          action=""
                          missing="事件时间未证明"
                          className="erp-dev-operation-event-time"
                        />
                      </Space>
                      <Text
                        title={
                          deliveryOperationMessagePresentation(event.message)
                            .title
                        }
                      >
                        {
                          deliveryOperationMessagePresentation(event.message)
                            .label
                        }
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          </details>
        </Space>
      ) : null}
    </Drawer>
  )
}
