import { Typography } from 'antd'
import { DeliveryTaskPath } from '../DeliveryTaskPath.jsx'
import DevDatabaseMigrationFlow from '../../../components/DevDatabaseMigrationFlow.jsx'
import {
  databaseMigrationDataScopeText,
  databaseMigrationExecutionText,
} from '../../../config/devDatabaseMigration.mjs'

const { Text } = Typography

export function MigrationPath({ pathOperation, pathStatuses }) {
  return (
    <div className="erp-dev-database-migration-flow">
      <DeliveryTaskPath
        ariaLabel="数据库升级步骤"
        items={[
          {
            title: '固定候选版本',
            description: '核对目标，固定代码、配置与迁移计划',
            status: pathOperation ? pathStatuses[0] : undefined,
          },
          {
            title: '恢复演练',
            description: '临时库升级、附件恢复与候选业务验证',
            status: pathOperation ? pathStatuses[1] : undefined,
          },
          {
            title: '停写与恢复点',
            description: '确认后暂停写入，验证最新成套备份',
            status: pathOperation ? pathStatuses[2] : undefined,
          },
          {
            title: '原库迁移事务',
            description:
              pathOperation?.target?.pendingFiles === 0
                ? '本次无待执行迁移，跳过此步'
                : 'BEGIN → 迁移 SQL → COMMIT',
            status: pathOperation ? pathStatuses[3] : undefined,
          },
          {
            title: '业务验证',
            description: '读回原库，验证新后端、登录与业务',
            status: pathOperation ? pathStatuses[4] : undefined,
          },
          {
            title: '切换日常版本',
            description: '验证通过后更新固定运行版本',
            status: pathOperation ? pathStatuses[5] : undefined,
          },
        ]}
      />
      {pathOperation ? (
        <Text>{databaseMigrationExecutionText(pathOperation)}</Text>
      ) : null}
      {pathOperation?.backup ? (
        <Text type="secondary">
          演练范围（{pathOperation.backup.migrationBefore} →{' '}
          {pathOperation.backup.migrationAfter}）：
          {databaseMigrationDataScopeText(pathOperation.backup)}
        </Text>
      ) : null}
      <details className="erp-dev-migration-flow-details">
        <summary>查看事务与恢复边界</summary>
        <p>
          仅点亮已有完成证据的节点。数据库事务只覆盖原库迁移；恢复演练、业务验证和版本切换分别核对。
        </p>
        <DevDatabaseMigrationFlow />
      </details>
    </div>
  )
}
