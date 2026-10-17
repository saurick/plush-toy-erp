import { Link } from 'react-router-dom'
import { buildDevCustomerScopedRoute } from '../../config/devCustomerScope.mjs'
import { DEV_DELIVERY_TARGETS } from '../../config/devDelivery.mjs'
import { DEV_TESTING_ROUTE } from '../../config/devRoutes.mjs'
import { DeliveryTaskPath } from './DeliveryTaskPath.jsx'

const tasks = {
  'customer-config': {
    title: '准备客户配置',
    scope: '工作区候选包',
    description: '检查差异、预览页面，验证后交接正式配置。',
    action: '检查客户配置',
  },
  'database-migration': {
    title: '维护开发数据库',
    scope: '本地共享开发库',
    description: '准备迁移与恢复演练，确认后升级开发库并验证运行。',
    action: '检查数据库升级',
  },
  'version-center': {
    title: '发布与部署版本',
    scope: DEV_DELIVERY_TARGETS.map((item) => item.shortLabel).join(' / '),
    description: '选择不可变版本，核对目标计划，确认后部署并读回。',
    action: '管理版本与部署',
  },
  'drill-recovery': {
    title: '核对安全与恢复',
    scope: '只读核验与演练指引',
    description: '核对安全缺口、恢复证据和故障时的处置步骤。',
    action: '核对安全与恢复',
  },
}
const path = [
  {
    title: '准备配置与制品',
    description: '核对客户配置，通过 GitLab 生成固定版本。',
  },
  { title: '检查部署计划', description: '核对目标、迁移、备份和可用回滚点。' },
  {
    title: '确认执行并读回',
    description: '核对运行版本、公网入口和业务验证结果。',
  },
]

export function DeliveryWorkspace({ items, scope }) {
  return (
    <div className="erp-dev-delivery-home">
      <DeliveryTaskPath title="发布上线的顺序" items={path} />
      {scope.status === 'ready' ? (
        <section className="erp-dev-delivery-jobs" aria-label="交付运行任务">
          {items.map((item) => {
            const task = tasks[item.key]
            return (
              <article key={item.key}>
                <div>
                  <h2>{task.title}</h2>
                  <span className="erp-dev-delivery-job-scope">
                    {task.scope}
                  </span>
                </div>
                <p>{task.description}</p>
                <Link
                  className="erp-dev-delivery-job-link"
                  to={buildDevCustomerScopedRoute(
                    item.route,
                    scope.customerKey
                  )}
                >
                  {task.action}
                  <span aria-hidden="true"> →</span>
                </Link>
              </article>
            )
          })}
        </section>
      ) : null}
      <div className="erp-dev-delivery-home-footer">
        <span>开发库维护与安全核验按需办理，各页显示各自的实际证据。</span>
        <Link to={`${DEV_TESTING_ROUTE}?view=closeout`}>核对 Git 收口</Link>
      </div>
    </div>
  )
}
