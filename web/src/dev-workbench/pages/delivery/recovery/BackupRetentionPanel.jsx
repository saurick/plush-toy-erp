import { useState } from 'react'
import { Alert, Card, Space, Tag, Typography } from 'antd'
import Table from '@/common/components/table/AppTable'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import DevTimestamp from '../../../components/DevTimestamp.jsx'
import { formatDeliveryBytes } from '../../../config/devDelivery.mjs'
import {
  RETENTION_STATES,
  retainedBackupRows,
} from '../../../config/devRetention.mjs'

const { Text } = Typography
export default function BackupRetentionPanel({ retention }) {
  const [environment, setEnvironment] = useState('demo')
  const [page, setPage] = useState(1)
  const rows = retainedBackupRows(retention, environment)
  return (
    <Card
      title="备份保留记录"
      extra={<Text type="secondary">最近 7 份 · 恢复点额外保护</Text>}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Segmented
          aria-label="备份环境"
          options={[
            'demo',
            'test',
            'erp',
            { label: 'GitLab', value: 'gitlab' },
          ]}
          value={environment}
          onChange={(value) => {
            setEnvironment(value)
            setPage(1)
          }}
        />
        {!retention ||
        retention.status !== 'passed' ||
        Date.now() - Date.parse(retention.generatedAt) > 3 * 3600_000 ? (
          <Alert
            type="warning"
            showIcon
            message="最新轮换状态暂未确认，以下为已有记录"
          />
        ) : null}
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{
            current: page,
            pageSize: 7,
            hideOnSinglePage: true,
            onChange: setPage,
          }}
          scroll={{ x: 760 }}
          columns={[
            {
              title: '备份',
              key: 'backup',
              render: (_, row) => (
                <div>
                  <Text>{row.location}</Text>
                  <details className="erp-dev-disclosure erp-dev-delivery-inline-details">
                    <summary>备份详情</summary>
                    <Text code>{row.name}</Text>
                    <Text>{formatDeliveryBytes(row.sizeBytes)}</Text>
                    {row.reasons.map((reason) => (
                      <Text key={reason}>{reason}</Text>
                    ))}
                    {row.cleanedAt ? (
                      <DevTimestamp value={row.cleanedAt} action="清理于" />
                    ) : null}
                  </details>
                </div>
              ),
            },
            {
              title: '生成时间',
              dataIndex: 'createdAt',
              render: (value) => <DevTimestamp value={value} action="生成于" />,
            },
            {
              title: '保留状态',
              dataIndex: 'state',
              render: (value, row) => (
                <Space direction="vertical" size={0}>
                  <Tag color={RETENTION_STATES[value]?.color}>
                    {RETENTION_STATES[value]?.label ?? '待核对'}
                  </Tag>
                  {row.state === 'protected' ? (
                    <Text type="secondary">{row.reasons.join('；')}</Text>
                  ) : null}
                  {row.state === 'cleaned' ? (
                    <Text type="secondary">文件已清理，记录保留</Text>
                  ) : null}
                </Space>
              ),
            },
          ]}
          locale={{
            emptyText: retention
              ? '此环境尚无已登记备份记录'
              : '等待保留记录读取',
          }}
        />
        {retention ? (
          <DevTimestamp value={retention.generatedAt} action="轮换核对于" />
        ) : null}
      </Space>
    </Card>
  )
}
