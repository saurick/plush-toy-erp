import { Link } from 'react-router-dom'
import { buildDevCustomerScopedRoute } from '../../config/devCustomerScope.mjs'
import { DEV_DELIVERY_TARGETS } from '../../config/devDelivery.mjs'
import { DEV_TESTING_ROUTE } from '../../config/devRoutes.mjs'
import DevStaticGuidance from '../../components/DevStaticGuidance.jsx'
import { DeliveryTaskPath } from './DeliveryTaskPath.jsx'

const tasks = {
  'customer-config': {
    description: '工作区配置检查、预览与发布交接',
    action: '检查客户配置',
  },
  'database-migration': {
    description: '本地共享开发库的迁移与恢复',
    action: '检查数据库升级',
  },
  'version-center': {
    description: DEV_DELIVERY_TARGETS.map((item) => item.shortLabel).join(' / '),
    action: '管理版本与部署',
  },
  'drill-recovery': {
    description: '安全核验、恢复演练与应急指引',
    action: '核对安全与恢复',
  },
}
const taskGroups = [
  { title: '发布上线', keys: ['customer-config', 'version-center'] },
  { title: '日常维护', keys: ['database-migration', 'drill-recovery'] },
]
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
      {scope.status === 'ready' ? (
        <section className="erp-dev-delivery-jobs" aria-label="交付运行任务">
          {taskGroups.map((group) => (
            <div className="erp-dev-delivery-job-group" key={group.title}>
              <h2>{group.title}</h2>
              {group.keys.map((key) => {
                const item = items.find((entry) => entry.key === key)
                if (!item) return null
                const task = tasks[key]
                return (
                  <article key={key}>
                    <Link
                      className="erp-dev-delivery-job-link"
                      to={buildDevCustomerScopedRoute(item.route, scope.customerKey)}
                    >
                      {task.action}<span aria-hidden="true"> →</span>
                    </Link>
                    <p>{task.description}</p>
                  </article>
                )
              })}
            </div>
          ))}
        </section>
      ) : null}
      <div className="erp-dev-delivery-home-footer">
        <DevStaticGuidance title="发布顺序">
          <DeliveryTaskPath title="发布上线的顺序" items={path} />
        </DevStaticGuidance>
        <Link to={`${DEV_TESTING_ROUTE}?view=closeout`}>核对 Git 收口</Link>
      </div>
    </div>
  )
}
