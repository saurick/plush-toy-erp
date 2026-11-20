import { Alert, Descriptions, Drawer, List, Space, Typography } from 'antd'
import {
  StatusTag,
  operationUpdateAction,
  shortHash,
  formatBytes,
  issueText,
} from './shared.jsx'
import DevTimestamp from '../../../components/DevTimestamp.jsx'
import {
  databaseMigrationDataScopeText,
  databaseMigrationExecutionText,
} from '../../../config/devDatabaseMigration.mjs'

const { Paragraph, Text } = Typography

export function MigrationOperationDrawer({
  operationDetail,
  setOperationDetail,
}) {
  return (
    <Drawer
      title="数据库迁移 Operation"
      open={Boolean(operationDetail)}
      width={640}
      onClose={() => setOperationDetail(null)}
      destroyOnHidden
    >
      {operationDetail ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <StatusTag
              status={operationDetail.status}
              issues={operationDetail.issues}
            />
            <Text code copyable>
              {operationDetail.id}
            </Text>
          </Space>
          <Space wrap size={[12, 4]}>
            <DevTimestamp
              value={operationDetail.createdAt}
              action="开始于"
              missing="开始时间未证明"
            />
            <DevTimestamp
              value={operationDetail.updatedAt}
              action={operationUpdateAction(operationDetail)}
              missing="更新时间未证明"
            />
          </Space>
          <Paragraph>{operationDetail.message}</Paragraph>
          <Paragraph>
            {databaseMigrationExecutionText(operationDetail)}
          </Paragraph>
          {operationDetail.issues.length > 0 ? (
            <Alert
              type="error"
              showIcon
              message="已记录问题"
              description={issueText(operationDetail.issues)}
            />
          ) : null}
          {operationDetail.plan ? (
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                {
                  key: 'hash',
                  label: '计划哈希',
                  children: (
                    <Text code copyable>
                      {operationDetail.plan.hash}
                    </Text>
                  ),
                },
                {
                  key: 'prepared-at',
                  label: '计划准备',
                  children: (
                    <DevTimestamp
                      value={operationDetail.plan.preparedAt}
                      missing="计划准备时间未证明"
                    />
                  ),
                },
              ]}
            />
          ) : null}
          {operationDetail.backup ? (
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                {
                  key: 'id',
                  label: '备份 ID',
                  children: operationDetail.backup.id,
                },
                {
                  key: 'size',
                  label: '备份大小',
                  children: formatBytes(operationDetail.backup.sizeBytes),
                },
                {
                  key: 'sha256',
                  label: '备份 SHA-256',
                  children: (
                    <Text code copyable>
                      {operationDetail.backup.sha256}
                    </Text>
                  ),
                },
                {
                  key: 'restore',
                  label: '隔离恢复',
                  children: operationDetail.backup.restoreVerified
                    ? `${operationDetail.backup.migrationBefore} → ${operationDetail.backup.migrationAfter}`
                    : '未证明',
                },
                {
                  key: 'data-scope',
                  label: '演练数据范围',
                  children: databaseMigrationDataScopeText(
                    operationDetail.backup
                  ),
                },
                {
                  key: 'verified-at',
                  label: '恢复验证完成',
                  children: (
                    <DevTimestamp
                      value={operationDetail.backup.verifiedAt}
                      missing="恢复验证时间未证明"
                    />
                  ),
                },
              ]}
            />
          ) : null}
          {operationDetail.source ? (
            <Text type="secondary">
              migration 真源 {shortHash(operationDetail.source.fingerprint)}
              {' · '}commit {shortHash(operationDetail.source.commit)}
            </Text>
          ) : null}
          <List
            header="状态事件"
            dataSource={operationDetail.events || []}
            locale={{ emptyText: '暂无状态事件' }}
            renderItem={(event) => (
              <List.Item>
                <Space direction="vertical" size={2}>
                  <Space wrap>
                    <StatusTag status={event.status} />
                    <DevTimestamp value={event.at} missing="事件时间未证明" />
                  </Space>
                  <Text>{event.message}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Space>
      ) : null}
    </Drawer>
  )
}
