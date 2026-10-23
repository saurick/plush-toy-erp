import { Alert, Button, Card, Empty, Input, Space, Tag, Typography } from 'antd'
import {
  OPEN_OPERATION_STATUSES,
  OPERATION_HISTORY_RESULT_OPTIONS,
  OPERATION_HISTORY_ACTION_OPTIONS,
  OPERATION_HISTORY_TARGET_OPTIONS,
} from './shared.jsx'
import Table from '@/common/components/table/AppTable'
import { DEV_PAGINATION } from '../../../config/devPagination.mjs'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { DeliveryTaskPath } from '../DeliveryTaskPath.jsx'
import DevStaticGuidance from '../../../components/DevStaticGuidance.jsx'
import DevPipelineTimingPanel, {
  DevPipelineStatusStrip,
} from '../../../components/DevPipelineTimingPanel.jsx'
import {
  DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS,
  DEV_VERSION_CENTER_HISTORY_PAGE_SIZE,
  DEV_VERSION_CENTER_VERSION_PAGE_SIZE,
  DEV_VERSION_CENTER_VIEW_HISTORY,
  DEV_VERSION_CENTER_VIEW_OVERVIEW,
  DEV_VERSION_CENTER_VIEW_PIPELINE,
  DEV_VERSION_CENTER_VIEW_VERSIONS,
  deliveryReadOnlyReleasePresentation,
  formatDeliveryDuration,
} from '../../../config/devDelivery.mjs'
import FilterSelect from '@/common/components/select/FilterSelect'
import AppSelect from '@/common/components/select/AppSelect'

const { Text, Link } = Typography

export function buildVersionWorkspace({
  changeTablePage,
  clearOperationHistoryFilters,
  databaseRebuildPanel,
  deliveryProviderName,
  filteredHistoryOperations,
  hasOperationHistoryFilters,
  historyResult,
  historyLoading,
  retryHistory,
  historyPage,
  historyTableRef,
  initialLoading,
  loadError,
  openPipelineDetails,
  operationColumns,
  operationHistoryFilters,
  operationHistoryPresentation,
  operationHistoryState,
  operations,
  setHistoryPage,
  setVersionPage,
  summary,
  updateOperationHistoryFilter,
  versionColumns,
  versionOverview,
  versionPage,
  versionTableRef,
  versions,
}) {
  const historyScope = OPERATION_HISTORY_TARGET_OPTIONS.find(
    (option) => option.value === operationHistoryFilters.target
  )
  const sharedReleaseHistory = operationHistoryFilters.target.endsWith('-release')
  return [
    {
      key: DEV_VERSION_CENTER_VIEW_VERSIONS,
      label: '版本与部署',
      children: (
        <section
          ref={versionTableRef}
          className="erp-dev-version-tab erp-dev-version-tab--versions"
          aria-label="版本与部署"
        >
          <Card
            title="可部署版本"
            className="erp-dev-version-table-card"
            extra={<Text type="secondary">最近 {versions.length} 个版本</Text>}
          >
            <Table
              rowKey="gitSha"
              columns={versionColumns}
              dataSource={versions}
              loading={initialLoading}
              pagination={{
                ...DEV_PAGINATION,
                current: versionPage,
                pageSize: DEV_VERSION_CENTER_VERSION_PAGE_SIZE,
                hideOnSinglePage: true,
                onChange: (nextPage) =>
                  changeTablePage(setVersionPage, versionTableRef, nextPage),
              }}
              locale={{
                emptyText: (
                  <Empty
                    description={
                      loadError && !summary
                        ? '版本读取失败，请刷新重试'
                        : summary?.releaseVersionPolicy
                          ? `尚无完整${deliveryProviderName}不可变发布版本`
                          : deliveryReadOnlyReleasePresentation(summary).title
                    }
                  />
                ),
              }}
              scroll={{ x: 980 }}
            />
          </Card>
          {!operations.some((operation) =>
            OPEN_OPERATION_STATUSES.has(operation.status)
          ) ? (
            <DevStaticGuidance title="部署步骤">
              <DeliveryTaskPath
                items={[
                  { title: '选择版本' },
                  { title: '准备部署计划' },
                  { title: '确认部署并读回' },
                ]}
              />
            </DevStaticGuidance>
          ) : null}
        </section>
      ),
    },
    {
      key: DEV_VERSION_CENTER_VIEW_OVERVIEW,
      label: '发布检查',
      children: (
        <section
          className="erp-dev-version-tab erp-dev-version-tab--overview"
          aria-label="发布检查"
        >
          {versionOverview}
          {databaseRebuildPanel}
        </section>
      ),
    },
    {
      key: DEV_VERSION_CENTER_VIEW_PIPELINE,
      label: '发布与部署耗时',
      children: (
        <section
          className="erp-dev-version-tab erp-dev-version-tab--pipeline"
          aria-label="发布与部署耗时"
        >
          <DevPipelineStatusStrip
            timings={summary?.timings}
            versions={versions}
            operations={operations}
            onOpenDetails={openPipelineDetails}
          />
          <DevPipelineTimingPanel
            timings={summary?.timings}
            versions={versions}
          />
        </section>
      ),
    },
    {
      key: DEV_VERSION_CENTER_VIEW_HISTORY,
      label: '操作记录',
      children: (
        <section
          ref={historyTableRef}
          className="erp-dev-version-tab erp-dev-version-tab--history"
          aria-label="操作记录"
        >
          <Card
            title={`${historyScope?.label || '当前环境'}${sharedReleaseHistory ? '发布' : '部署'}记录（已结束）`}
            className="erp-dev-version-table-card"
            extra={
              <Tag color={operationHistoryPresentation.color}>
                {operationHistoryPresentation.label}
              </Tag>
            }
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Link href={historyResult?.operations?.find((operation) => operation.gitlabRecord?.environmentUrl)?.gitlabRecord.environmentUrl || 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/environments'} rel="noreferrer">GitLab 环境与部署</Link>
              <Link href="https://gitlab.saurick.me/saurick/plush-toy-erp/-/packages" rel="noreferrer">回执归档</Link>
              <Text type="secondary">此处保留项目检查、原始时间和恢复操作。</Text>
            </Space>
            {operationHistoryFilters.target === 'test-133' ? (
              <Alert type="info" showIcon message="原始目标已退役；此处仅保留当时的部署记录，不计入当前 demo、test 或 erp，也不能再次执行。" />
            ) : null}
            {sharedReleaseHistory ? (
              <Alert type="info" showIcon message="制品供各环境部署使用；各环境的部署结果在各自记录中查看。" />
            ) : null}
            {historyResult && (historyResult.integrity.unreadableOperations > 0 || historyResult.integrity.unreadableRequests > 0) ? (
              <Alert
                type="warning"
                showIcon
                message="部分记录未通过完整性校验"
                description={`操作记录 ${historyResult.integrity.unreadableOperations} 条、请求索引 ${historyResult.integrity.unreadableRequests} 条暂不可读；当前列表或统计可能不完整。修复原始记录后可重新读取。`}
              />
            ) : null}
            {operationHistoryState === 'stale' ? (
              <Alert
                type="warning"
                showIcon
                message="当前显示上次成功读回的操作记录"
                description="最新操作记录不可读或仍在重新核对；当前统计对应上次读回结果。"
              />
            ) : null}
            {operationHistoryState === 'failure' ? (
              <Alert
                type="error"
                showIcon
                message="工作台操作记录当前不可读"
                description="请重试读取；读取失败不表示当前环境没有记录。"
              />
            ) : null}
            <div
              className="erp-dev-operation-history-filters"
              role="search"
              aria-label="筛选发布与部署记录"
            >
              <div className="erp-dev-operation-history-filters__controls">
                <div className="erp-dev-operation-history-filter-field erp-dev-operation-history-filter-field--result">
                  <Text type="secondary">结果</Text>
                  <Segmented
                    aria-label="筛选结果"
                    value={operationHistoryFilters.result}
                    options={OPERATION_HISTORY_RESULT_OPTIONS}
                    onChange={(value) =>
                      updateOperationHistoryFilter(
                        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.result,
                        value
                      )
                    }
                  />
                </div>
                <div className="erp-dev-operation-history-filter-field erp-dev-operation-history-filter-field--action">
                  <Text type="secondary">动作</Text>
                  <FilterSelect
                    emptyValue="all"
                    label="动作"
                    placeholder="动作"
                    aria-label="筛选动作"
                    value={operationHistoryFilters.action}
                    options={OPERATION_HISTORY_ACTION_OPTIONS.filter((option) => option.value === 'all' || (sharedReleaseHistory ? option.value === 'release' : option.value !== 'release'))}
                    onChange={(value) =>
                      updateOperationHistoryFilter(
                        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.action,
                        value
                      )
                    }
                  />
                </div>
                <div className="erp-dev-operation-history-filter-field erp-dev-operation-history-filter-field--target">
                  <Text type="secondary">记录归属</Text>
                  <AppSelect
                    allowClear={false /* 不可清空：记录归属绑定具体环境的读取入口，未选择时不能查询跨目标记录。 */}
                    aria-label="记录归属"
                    value={operationHistoryFilters.target}
                    options={OPERATION_HISTORY_TARGET_OPTIONS}
                    onChange={(value) =>
                      updateOperationHistoryFilter(
                        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.target,
                        value
                      )
                    }
                  />
                </div>
                <label
                  className="erp-dev-operation-history-filter-field erp-dev-operation-history-filter-field--keyword"
                  htmlFor="dev-version-history-keyword"
                >
                  <Text type="secondary">版本 / SHA / 操作 ID</Text>
                  <Input
                    id="dev-version-history-keyword"
                    aria-label="搜索版本、SHA 或操作 ID"
                    placeholder="输入完整内容或前几位"
                    value={operationHistoryFilters.keyword}
                    maxLength={128}
                    allowClear
                    onChange={(event) =>
                      updateOperationHistoryFilter(
                        DEV_VERSION_CENTER_HISTORY_FILTER_QUERY_KEYS.keyword,
                        event.target.value,
                        { replace: true }
                      )
                    }
                  />
                </label>
              </div>
              <div className="erp-dev-operation-history-filters__meta">
                <Text type="secondary" aria-live="polite">
                  {!historyResult
                    ? historyLoading
                      ? '正在读取记录'
                      : '记录暂不可读'
                    : hasOperationHistoryFilters
                      ? `匹配 ${String(historyResult?.matched ?? 0)} / 共 ${String(historyResult?.total ?? 0)} 条记录`
                      : `共 ${String(historyResult?.total ?? 0)} 条记录`}
                </Text>
                <Button
                  type="link"
                  onClick={retryHistory}
                  disabled={historyLoading}
                >
                  {['failure', 'stale'].includes(operationHistoryState) ? '重试读取' : '刷新记录'}
                </Button>
                {hasOperationHistoryFilters ? (
                  <Button type="link" onClick={clearOperationHistoryFilters}>
                    清空筛选
                  </Button>
                ) : null}
              </div>
            </div>
            {operationHistoryState === 'failure' ? null : (
              <>
                {historyResult ? (
                  <Space
                    wrap
                    size={[16, 4]}
                    style={{ marginBottom: 12 }}
                    aria-label="当前筛选的操作统计"
                  >
                    <Text>通过 {historyResult.statistics.counts.passed}</Text>
                    <Text>失败 {historyResult.statistics.counts.failed}</Text>
                    <Text>阻断 {historyResult.statistics.counts.blocked}</Text>
                    <Text>
                      未证明 {historyResult.statistics.counts.not_proven}
                    </Text>
                    <Text type="secondary">
                      成功操作耗时中位数{' '}
                      {formatDeliveryDuration(
                        historyResult.statistics.passedDurationMedianMs
                      )}
                      （{historyResult.statistics.passedDurationSamples}{' '}
                      次，含等待）
                    </Text>
                  </Space>
                ) : null}
                <Table
                  rowKey="id"
                  columns={operationColumns}
                  dataSource={filteredHistoryOperations}
                  loading={historyLoading}
                  pagination={{
                    ...DEV_PAGINATION,
                    current: historyResult?.page ?? historyPage,
                    total: historyResult?.matched ?? 0,
                    pageSize: DEV_VERSION_CENTER_HISTORY_PAGE_SIZE,
                    hideOnSinglePage: true,
                    onChange: (nextPage) =>
                      changeTablePage(
                        setHistoryPage,
                        historyTableRef,
                        nextPage
                      ),
                  }}
                  locale={{
                    emptyText: (
                      <Empty
                        description={
                          hasOperationHistoryFilters
                            ? '没有符合筛选条件的记录，请调整或清空上方条件'
                            : sharedReleaseHistory ? '尚无已结束的制品发布记录' : '当前环境尚无已结束的部署、数据清空重建或回滚记录'
                        }
                      />
                    ),
                  }}
                  scroll={{ x: 980 }}
                />
              </>
            )}
          </Card>
        </section>
      ),
    },
  ]
}
