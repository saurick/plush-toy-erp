import { Button, Space, Typography } from 'antd'
import { StatusTag, operationUpdateAction, issueText } from './shared.jsx'
import DevTimestamp from '../../../components/DevTimestamp.jsx'

const { Text } = Typography

export function buildMigrationColumns({ setOperationDetail }) {
  return [
    {
      title: '时间',
      key: 'time',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <DevTimestamp
            value={record.createdAt}
            action="开始于"
            missing="开始时间未证明"
          />
          <DevTimestamp
            value={record.updatedAt}
            action={operationUpdateAction(record)}
            missing="更新时间未证明"
          />
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 112,
      render: (value) => (value === 'migration' ? '数据库升级' : '后端重启'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 126,
      render: (value, record) => (
        <StatusTag status={value} issues={record.issues} />
      ),
    },
    {
      align: 'left',
      title: '结果',
      dataIndex: 'message',
      key: 'message',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{value}</Text>
          {record.issues.length > 0 ? (
            <Text
              type={
                record.issues.some((issue) => issue.severity === 'blocked')
                  ? 'danger'
                  : 'warning'
              }
            >
              {issueText(record.issues)}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      align: 'center',
      width: 96,
      render: (_value, record) => (
        <Button onClick={() => setOperationDetail(record)}>查看</Button>
      ),
    },
  ]
}
