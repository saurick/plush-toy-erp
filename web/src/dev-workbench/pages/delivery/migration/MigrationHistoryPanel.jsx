import { HistoryOutlined } from '@ant-design/icons'
import { Card, Empty } from 'antd'
import Table from '@/common/components/table/AppTable'
import { DEV_PAGINATION } from '../../../config/devPagination.mjs'

export function MigrationHistoryPanel({
  activeView,
  columns,
  initialLoading,
  operations,
}) {
  return (
    <section
      hidden={activeView !== 'history'}
      id="dev-migration-panel-history"
      role="tabpanel"
      aria-labelledby="dev-migration-tab-history"
    >
      <Card title="历史操作记录" extra={<HistoryOutlined aria-hidden="true" />}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={operations}
          loading={initialLoading}
          pagination={{ ...DEV_PAGINATION, pageSize: 8, hideOnSinglePage: true }}
          locale={{
            emptyText: <Empty description="尚无数据库迁移操作" />,
          }}
          scroll={{ x: 760 }}
        />
      </Card>
    </section>
  )
}
