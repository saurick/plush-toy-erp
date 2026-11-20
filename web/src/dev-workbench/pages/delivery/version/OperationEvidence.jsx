import { Card, Descriptions, Space, Tag, Typography } from 'antd'
import DevTimestamp from '../../../components/DevTimestamp.jsx'

const { Text, Link } = Typography
const CHECK_LABELS = {
  releaseIdentity: '版本身份',
  health: '存活检查',
  ready: '就绪检查',
  basicSmoke: '基础冒烟',
  publicEntry: '公网入口',
  backupRestore: '备份恢复',
  staticConfig: '静态配置',
  dataEnvironment: '数据环境',
  migrationUnchanged: '迁移保持不变',
  customerConfigUnchanged: '客户配置保持不变',
  freshDatabase: '新数据库',
  emptyBusinessBaseline: '空业务基线',
  webHealth: 'Web 检查',
}

export function OperationEvidence({ operation, loading }) {
  const { evidence, trace, gitlabRecord } = operation
  return (
    <Card size="small" title="检查结果与追溯" loading={loading}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {trace ? (
          <Space wrap>
            <Link href={trace.commitUrl} target="_blank" rel="noopener noreferrer">
              源码提交
            </Link>
            <Link href={trace.pipelinesUrl} target="_blank" rel="noopener noreferrer">
              该提交的 CI / CD
            </Link>
            <Link href={trace.releaseUrl} target="_blank" rel="noopener noreferrer">
              版本与制品
            </Link>
            {trace.pipelineUrl ? (
              <Link href={trace.pipelineUrl} target="_blank" rel="noopener noreferrer">
                本次发布流水线
              </Link>
            ) : null}
          </Space>
        ) : null}
        {gitlabRecord ? (
          <Space direction="vertical" size={4}>
            <Space wrap>
              {gitlabRecord.environmentUrl ? <Link href={gitlabRecord.environmentUrl} target="_blank" rel="noopener noreferrer">GitLab 环境部署列表</Link> : null}
              {gitlabRecord.evidenceUrl ? <Link href={gitlabRecord.evidenceUrl} target="_blank" rel="noopener noreferrer">GitLab 本次回执归档</Link> : null}
              {gitlabRecord.deploymentId ? <Text type="secondary">登记编号 #{gitlabRecord.deploymentId}</Text> : null}
              <Tag color={gitlabRecord.status === 'recorded' ? 'success' : 'warning'}>{gitlabRecord.status === 'recorded' ? '已登记 GitLab' : 'GitLab 登记待核对'}</Tag>
            </Space>
            {gitlabRecord.mode === 'historical' ? <Text type="secondary">历史补录：本页保留实际执行时间，GitLab 中的创建时间是登记时间。</Text> : null}
            {gitlabRecord.status !== 'recorded' ? <Text type="secondary">原始执行结果和回执仍保留；补录登记不会再次部署。</Text> : null}
          </Space>
        ) : null}
        {evidence ? (
          <>
            <DevTimestamp value={evidence.finishedAt} action="目标回执" />
            <Space wrap size={[4, 8]}>
              {Object.entries(evidence.checks).map(([key, passed]) => (
                <Tag key={key} color={passed ? 'success' : 'warning'}>
                  {CHECK_LABELS[key] || key}：
                  {passed ? '通过' : '未通过或未完成'}
                </Tag>
              ))}
            </Space>
            <Descriptions
              size="small"
              column={1}
              items={[
                ...(evidence.beforeGitSha
                  ? [
                      {
                        key: 'before',
                        label: '部署前提交',
                        children: (
                          <Text code copyable>
                            {evidence.beforeGitSha}
                          </Text>
                        ),
                      },
                    ]
                  : []),
                {
                  key: 'migration',
                  label: '数据库迁移',
                  children: (
                    <Space direction="vertical" size={0}>
                      {evidence.migration.required ? (
                        <Text>发布要求：{evidence.migration.required}</Text>
                      ) : null}
                      <Text>
                        实际版本：
                        {evidence.migration.readback || '此回执未记录版本号'}
                      </Text>
                      {evidence.migration.readbackStatus ? (
                        <Text>
                          迁移后检查：
                          {evidence.migration.readbackStatus === 'passed'
                            ? '通过'
                            : '未通过'}
                        </Text>
                      ) : null}
                    </Space>
                  ),
                },
                ...(evidence.backup
                  ? [
                      {
                        key: 'backup',
                        label: '数据库备份恢复',
                        children: evidence.backup.restoreChecked
                          ? '已用本次备份完成隔离恢复检查'
                          : '此回执未证明恢复检查通过',
                      },
                    ]
                  : []),
              ]}
            />
            <Text type="secondary">
              基础运行检查不等于岗位验收；数据库恢复检查不包含附件恢复。
            </Text>
          </>
        ) : operation.action !== 'release' ? (
          <Text type="secondary">
            此记录未归档目标执行回执。已记录的步骤、状态事件和制品身份仍可查看。
          </Text>
        ) : (
          <Text type="secondary">
            测试步骤、作业日志和制品记录在关联的 GitLab 流水线中查看。
          </Text>
        )}
      </Space>
    </Card>
  )
}
