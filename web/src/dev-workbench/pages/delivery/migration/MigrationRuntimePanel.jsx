import { SyncOutlined } from '@ant-design/icons'
import { Button, List, Space, Tag, Typography } from 'antd'
import { createDatabaseMigrationIdempotencyKey } from '../../../config/devDatabaseMigration.mjs'

const { Text } = Typography

export function MigrationRuntimePanel({
  actionKey,
  activeView,
  canRestart,
  isLatest,
  pendingFiles,
  performAction,
  recoveryActive,
  runtime,
  runtimeState,
  summaryFresh,
  target,
  toolState,
  tools,
}) {
  return (
    <section
      hidden={activeView !== 'runtime'}
      id="dev-migration-panel-runtime"
      role="tabpanel"
      aria-labelledby="dev-migration-tab-runtime"
    >
      <section
        className="erp-dev-migration-overview"
        aria-label="数据库迁移状态摘要"
      >
        <div className="erp-dev-tool-table-wrap">
          <table className="erp-dev-tool-table">
            <thead>
              <tr>
                <th scope="col">核对项</th>
                <th scope="col">当前状态</th>
                <th scope="col">证据与处理</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">共享开发库</th>
                <td>
                  <Tag color={isLatest ? 'success' : 'warning'}>
                    {Number.isSafeInteger(pendingFiles)
                      ? isLatest
                        ? '已是最新版本'
                        : `${pendingFiles} 条待执行`
                      : '状态未证明'}
                  </Tag>
                </td>
                <td>
                  <Text code>{target?.safeTarget || '目标未证明'}</Text>
                  <p>
                    当前 {target?.currentVersion || '未证明'} · 最新{' '}
                    {target?.latestVersion || '未证明'}
                  </p>
                </td>
              </tr>
              <tr>
                <th scope="row">日常运行</th>
                <td>
                  <Text strong>
                    {!summaryFresh
                      ? '状态待刷新核对'
                      : runtime?.available
                        ? '本地服务可用'
                        : '本地服务未恢复'}
                  </Text>
                  <div>
                    <Tag color={runtimeState.color}>{runtimeState.label}</Tag>
                  </div>
                </td>
                <td>
                  <p>
                    health {runtime?.health?.httpCode || '—'} · ready{' '}
                    {runtime?.ready?.httpCode || '—'}
                    {runtime?.activeVersion
                      ? ` · 迁移版本 ${runtime.activeVersion}`
                      : ''}
                  </p>
                  {runtime?.bundleId ? (
                    <p>运行制品：{runtime.bundleId}</p>
                  ) : null}
                  <Space wrap>
                    {summaryFresh &&
                    runtime?.available &&
                    (!recoveryActive || isLatest) ? (
                      <Button href="/erp">进入业务系统</Button>
                    ) : null}
                    <Button
                      icon={<SyncOutlined aria-hidden="true" />}
                      disabled={!canRestart}
                      loading={actionKey === 'restart'}
                      onClick={() =>
                        performAction('restart', {
                          action: 'restart',
                          idempotencyKey:
                            createDatabaseMigrationIdempotencyKey('restart'),
                        })
                      }
                    >
                      恢复已验证后端
                    </Button>
                  </Space>
                </td>
              </tr>
              <tr>
                <th scope="row">迁移准备环境</th>
                <td>
                  <Tag color={toolState.color}>{toolState.label}</Tag>
                </td>
                <td>
                  <List
                    size="small"
                    dataSource={tools?.checks || []}
                    locale={{ emptyText: '工具状态未证明' }}
                    renderItem={(check) => (
                      <List.Item>
                        <div>
                          <Text>{check.label}</Text>{' '}
                          <Tag
                            color={
                              check.status === 'passed' ? 'success' : 'error'
                            }
                          >
                            {check.status === 'passed' ? '已就绪' : '需处理'}
                          </Tag>
                          {check.status === 'blocked' ? (
                            <p>{check.message}</p>
                          ) : null}
                        </div>
                      </List.Item>
                    )}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
