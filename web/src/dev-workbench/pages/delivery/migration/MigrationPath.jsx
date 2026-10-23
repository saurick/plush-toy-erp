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
            status: pathOperation ? pathStatuses[0] : undefined,
          },
          {
            title: '恢复演练',
            status: pathOperation ? pathStatuses[1] : undefined,
          },
          {
            title: '停写与恢复点',
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
            status: pathOperation ? pathStatuses[4] : undefined,
          },
          {
            title: '切换日常版本',
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
      <details className="erp-dev-disclosure erp-dev-migration-flow-details">
        <summary>查看事务与恢复边界</summary>
        <p>
          仅点亮已有完成证据的节点。数据库事务只覆盖原库迁移；恢复演练、业务验证和版本切换分别核对。
        </p>
        <DevDatabaseMigrationFlow />
      </details>
    </div>
  )
}
