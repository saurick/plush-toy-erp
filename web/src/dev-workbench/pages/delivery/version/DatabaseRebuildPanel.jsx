import { ToolOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Space, Tag, Tooltip, Typography } from 'antd'
import {
  createDeliveryIdempotencyKey,
  shortGitSha,
} from '../../../config/devDelivery.mjs'

const { Text } = Typography

export function DatabaseRebuildPanel({
  actionKey,
  currentTargetRelease,
  currentTargetSha,
  customerTestRebuildEligible,
  customerTestRebuildExplanation,
  performAction,
  selectedTargetKey,
}) {
  return selectedTargetKey === 'customer-test-133' ? (
    <Card
      className="erp-dev-version-table-card"
      title="test 数据方式"
      extra={<Tag color="blue">与版本部署分开</Tag>}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="普通部署默认保留现有数据"
          description="发布和部署新版本只做备份、向前迁移、版本切换与运行核验，不会自动清空 test。没有新版本时，也可以单独清空并重建当前 exact SHA 的测试数据。"
        />
        <Space wrap>
          <Tooltip
            title={
              customerTestRebuildEligible
                ? '先做只读资格检查，不会立即清空数据'
                : customerTestRebuildExplanation
            }
          >
            <Button
              danger
              icon={<ToolOutlined aria-hidden="true" />}
              disabled={!customerTestRebuildEligible}
              loading={actionKey === 'prepare:customer-test-rebuild'}
              onClick={() =>
                performAction(
                  'prepare:customer-test-rebuild',
                  'prepare-database-rebuild',
                  {
                    gitSha: currentTargetRelease.gitSha,
                    version: currentTargetRelease.version,
                    target: 'customer-test-133',
                    idempotencyKey:
                      createDeliveryIdempotencyKey('rebuild-database'),
                  }
                )
              }
            >
              清空并重建测试数据
            </Button>
          </Tooltip>
          <Text type="secondary">
            固定当前运行版本 {shortGitSha(currentTargetSha)}
            ；资格通过后仍需二次确认。
          </Text>
        </Space>
      </Space>
    </Card>
  ) : null
}
